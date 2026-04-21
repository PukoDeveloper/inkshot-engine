import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  ExpCurveDef,
  ExpCurveDefineParams,
  ExpGainParams,
  ExpGainOutput,
  ExpSetParams,
  ExpGetParams,
  ExpGetOutput,
  ExpLevelUpParams,
  ExpGainedParams,
} from '../../types/exp.js';
import type { SaveSlotSaveOutput, SaveSlotLoadOutput } from '../../types/save.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActorExpState {
  curveId: string;
  totalExp: number;
  level: number;
}

// ---------------------------------------------------------------------------
// ExperienceSystem
// ---------------------------------------------------------------------------

/**
 * Plugin that manages **character level progression** via configurable
 * experience curves.
 *
 * ### EventBus API
 *
 * | Event              | Params / Output                          |
 * |--------------------|------------------------------------------|
 * | `exp/curve:define` | `ExpCurveDefineParams`                   |
 * | `exp/gain`         | `ExpGainParams → ExpGainOutput`          |
 * | `exp/set`          | `ExpSetParams`                           |
 * | `exp/get`          | `ExpGetParams → ExpGetOutput`            |
 * | `exp/levelup`      | `ExpLevelUpParams` (notification)        |
 * | `exp/gained`       | `ExpGainedParams` (notification)         |
 */
export class ExperienceSystem implements EnginePlugin {
  readonly namespace = 'exp';
  readonly dependencies = ['stats'] as const;

  private readonly _curves: Map<string, ExpCurveDef> = new Map();
  private readonly _actorExp: Map<string, ActorExpState> = new Map();

  init(core: Core): void {
    core.events.on<ExpCurveDefineParams>(this.namespace, 'exp/curve:define', (p) => {
      this._curves.set(p.curve.id, p.curve);
    });

    core.events.on<ExpGainParams, ExpGainOutput>(this.namespace, 'exp/gain', (p, output) => {
      const curve = this._curves.get(p.curveId);
      if (!curve) return;

      let state = this._actorExp.get(p.actorId);
      if (!state) {
        state = { curveId: p.curveId, totalExp: 0, level: 1 };
        this._actorExp.set(p.actorId, state);
      }

      state.totalExp += p.amount;
      state.curveId = p.curveId;
      const maxLevel = curve.maxLevel ?? 99;

      let leveledUp = false;
      while (state.level < maxLevel) {
        const expForNext = this._expForLevel(curve, state.level + 1);
        if (state.totalExp >= expForNext) {
          const prev = state.level;
          state.level++;
          leveledUp = true;
          core.events.emitSync<ExpLevelUpParams>('exp/levelup', {
            actorId: p.actorId,
            previousLevel: prev,
            newLevel: state.level,
            totalExp: state.totalExp,
          });
          // Hook: let StatsSystem recalculate base stats on level-up
          core.events.emitSync('stats/base:level-changed', {
            actorId: p.actorId,
            level: state.level,
            curveId: p.curveId,
          });
        } else {
          break;
        }
      }

      output.totalExp = state.totalExp;
      output.level = state.level;
      output.leveledUp = leveledUp;

      core.events.emitSync<ExpGainedParams>('exp/gained', {
        actorId: p.actorId,
        amount: p.amount,
        totalExp: state.totalExp,
        level: state.level,
      });
    });

    core.events.on<ExpSetParams>(this.namespace, 'exp/set', (p) => {
      const curve = this._curves.get(p.curveId);
      if (!curve) return;
      const maxLevel = curve.maxLevel ?? 99;
      let level = 1;
      while (level < maxLevel) {
        if (p.totalExp >= this._expForLevel(curve, level + 1)) {
          level++;
        } else {
          break;
        }
      }
      this._actorExp.set(p.actorId, { curveId: p.curveId, totalExp: p.totalExp, level });
    });

    core.events.on<ExpGetParams, ExpGetOutput>(this.namespace, 'exp/get', (p, output) => {
      const state = this._actorExp.get(p.actorId);
      if (!state) {
        output.totalExp = 0;
        output.level = 1;
        output.toNextLevel = 0;
        output.curveId = '';
        return;
      }
      const curve = this._curves.get(state.curveId);
      const maxLevel = curve?.maxLevel ?? 99;
      const toNext = state.level >= maxLevel
        ? 0
        : curve
          ? this._expForLevel(curve, state.level + 1) - state.totalExp
          : 0;
      output.totalExp = state.totalExp;
      output.level = state.level;
      output.toNextLevel = Math.max(0, toNext);
      output.curveId = state.curveId;
    });

    // Persist exp data
    core.events.on<Record<string, never>, SaveSlotSaveOutput>(
      this.namespace, 'save/slot:save',
      (_p, output) => {
        if (!output.data) return;
        output.data.data['_exp'] = [...this._actorExp.entries()].map(([id, s]) => [id, s]);
      },
      { phase: 'after' },
    );

    core.events.on<Record<string, never>, SaveSlotLoadOutput>(
      this.namespace, 'save/slot:load',
      (_p, output) => {
        if (!output.raw?.data['_exp']) return;
        const raw = output.raw.data['_exp'] as Array<[string, ActorExpState]>;
        this._actorExp.clear();
        for (const [id, state] of raw) {
          this._actorExp.set(id, state);
        }
      },
      { phase: 'after' },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns total experience required to *reach* `level`.
   * Level 1 always requires 0 exp.
   */
  private _expForLevel(curve: ExpCurveDef, level: number): number {
    if (level <= 1) return 0;
    if (curve.fn) return curve.fn(level);
    const base = curve.base ?? 30;
    const exp = curve.exp ?? 2;
    const extra = curve.extra ?? 0;
    return Math.floor(base * (level ** exp) + extra * level);
  }
}
