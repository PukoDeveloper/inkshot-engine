import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  BattleCombatant,
  BattleState,
  BattleAction,
  BattleStartParams,
  BattleStartOutput,
  BattleActionParams,
  BattleResolveParams,
  BattleResolveOutput,
  BattleEndParams,
  BattleStateGetParams,
  BattleStateGetOutput,
  BattleStartedParams,
  BattleTurnStartParams,
  BattleActionResolvedParams,
  BattleEndedParams,
  BattleCombatantDefeatedParams,
} from '../../types/battle.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _battleCounter = 0;
function generateBattleId(): string {
  return `battle_${++_battleCounter}`;
}

// ---------------------------------------------------------------------------
// BattleSystem
// ---------------------------------------------------------------------------

/**
 * Plugin that manages **turn-based battle sessions**.
 *
 * Multiple battles can run concurrently (each identified by a `battleId`).
 * The phase flow is:
 * ```
 * acting → resolving → (next turn: acting) → end
 * ```
 *
 * ### EventBus API
 *
 * | Event                    | Params / Output                                |
 * |--------------------------|------------------------------------------------|
 * | `battle/start`           | `BattleStartParams → BattleStartOutput`        |
 * | `battle/action`          | `BattleActionParams`                           |
 * | `battle/resolve`         | `BattleResolveParams → BattleResolveOutput`    |
 * | `battle/end`             | `BattleEndParams`                              |
 * | `battle/state:get`       | `BattleStateGetParams → BattleStateGetOutput`  |
 * | `battle/started`         | `BattleStartedParams` (notification)           |
 * | `battle/turn:start`      | `BattleTurnStartParams` (notification)         |
 * | `battle/action:resolved` | `BattleActionResolvedParams` (notification)    |
 * | `battle/ended`           | `BattleEndedParams` (notification)             |
 * | `battle/combatant:defeated` | `BattleCombatantDefeatedParams` (notification)|
 */
export class BattleSystem implements EnginePlugin {
  readonly namespace = 'battle';
  readonly dependencies = ['stats', 'inventory'] as const;

  private readonly _battles: Map<string, BattleState> = new Map();

  init(core: Core): void {
    core.events.on<BattleStartParams, BattleStartOutput>(this.namespace, 'battle/start', (p, output) => {
      const battleId = p.battleId ?? generateBattleId();
      const party: BattleCombatant[] = p.party.map((c) => ({ ...c, side: 'party', alive: true }));
      const enemies: BattleCombatant[] = p.enemies.map((c) => ({ ...c, side: 'enemy', alive: true }));

      const state: BattleState = {
        battleId,
        phase: 'acting',
        turn: 1,
        party,
        enemies,
        pendingActions: [],
      };

      this._battles.set(battleId, state);
      output.battleId = battleId;
      output.state = state;

      core.events.emitSync<BattleStartedParams>('battle/started', { battleId, state });
      core.events.emitSync<BattleTurnStartParams>('battle/turn:start', { battleId, turn: 1 });
    });

    core.events.on<BattleActionParams>(this.namespace, 'battle/action', (p) => {
      const state = this._battles.get(p.battleId);
      if (!state || state.phase !== 'acting') return;
      state.pendingActions.push(p.action);
    });

    core.events.on<BattleResolveParams, BattleResolveOutput>(this.namespace, 'battle/resolve', (p, output) => {
      const state = this._battles.get(p.battleId);
      if (!state || state.phase !== 'acting') return;

      state.phase = 'resolving';
      const results: BattleResolveOutput['results'] = [];

      // Sort by AGI (faster combatants act first)
      const sorted = [...state.pendingActions].sort((a, b) =>
        this._getStat(core, b.actorId, 'agi') - this._getStat(core, a.actorId, 'agi')
      );

      for (const action of sorted) {
        const result = this._resolveAction(core, state, action);
        results.push(result);
        core.events.emitSync<BattleActionResolvedParams>('battle/action:resolved', {
          battleId: p.battleId,
          action,
          effects: result.effects,
          critical: result.critical,
          defeated: result.defeated,
        });
      }

      output.results = results;
      state.pendingActions = [];

      const allEnemiesDead = state.enemies.every((e) => !e.alive);
      const allPartyDead   = state.party.every((m) => !m.alive);

      if (allEnemiesDead || allPartyDead) {
        const outcome: BattleEndParams['outcome'] = allEnemiesDead ? 'victory' : 'defeat';
        state.phase = 'end';
        this._battles.delete(p.battleId);
        core.events.emitSync<BattleEndedParams>('battle/ended', { battleId: p.battleId, outcome });
      } else {
        state.turn++;
        state.phase = 'acting';
        core.events.emitSync<BattleTurnStartParams>('battle/turn:start', { battleId: p.battleId, turn: state.turn });
      }
    });

    core.events.on<BattleEndParams>(this.namespace, 'battle/end', (p) => {
      const state = this._battles.get(p.battleId);
      if (!state) return;
      state.phase = 'end';
      this._battles.delete(p.battleId);
      core.events.emitSync<BattleEndedParams>('battle/ended', { battleId: p.battleId, outcome: p.outcome });
    });

    core.events.on<BattleStateGetParams, BattleStateGetOutput>(this.namespace, 'battle/state:get', (p, output) => {
      output.state = this._battles.get(p.battleId) ?? null;
    });
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _resolveAction(
    core: Core,
    state: BattleState,
    action: BattleAction,
  ): BattleResolveOutput['results'][number] {
    const effects: Record<string, { delta: number; stat: string }> = {};
    let critical = false;
    let defeated = false;

    const actorAtk = this._getStat(core, action.actorId, 'atk');

    for (const targetId of action.targetIds) {
      const target = [...state.party, ...state.enemies].find((c) => c.id === targetId);
      if (!target || !target.alive) continue;

      let damage = 0;

      switch (action.kind) {
        case 'attack': {
          const targetDef = this._getStat(core, targetId, 'def');
          damage = Math.max(1, actorAtk - targetDef);
          if (Math.random() < 0.1) { damage *= 2; critical = true; }
          break;
        }
        case 'guard':
          core.events.emitSync('stats/modifier:add', {
            actorId: action.actorId,
            source: 'guard:temp',
            modifiers: [{ stat: 'def', value: 2, mode: 'multiply' }],
          });
          break;
        case 'flee':
          break;
        default:
          damage = Math.max(1, actorAtk);
      }

      if (damage > 0) {
        const { output: baseOut } = core.events.emitSync<{ actorId: string }, { base: Record<string, number> }>(
          'stats/base:get', { actorId: targetId }
        );
        const currentHp = (baseOut?.base?.['hp'] as number) ?? 0;
        const newHp = Math.max(0, currentHp - damage);
        core.events.emitSync('stats/base:set', { actorId: targetId, patch: { hp: newHp } });
        effects[targetId] = { delta: -damage, stat: 'hp' };

        if (newHp <= 0 && target.alive) {
          target.alive = false;
          defeated = true;
          core.events.emitSync<BattleCombatantDefeatedParams>('battle/combatant:defeated', {
            battleId: state.battleId,
            combatantId: targetId,
            side: target.side,
          });
        }
      }
    }

    return { action, effects, critical, defeated };
  }

  private _getStat(core: Core, actorId: string, stat: string): number {
    const { output } = core.events.emitSync<{ actorId: string }, { stats: Record<string, number> }>(
      'stats/compute', { actorId }
    );
    return output?.stats?.[stat] ?? 0;
  }
}
