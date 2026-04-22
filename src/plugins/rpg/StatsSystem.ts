import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { CoreUpdateParams } from '../../types/rendering.js';
import type {
  StatMap,
  StatProfileDef,
  StatModifier,
  StatusEffectDef,
  StatsProfileDefineParams,
  StatsModifierAddParams,
  StatsModifierRemoveParams,
  StatsComputeParams,
  StatsComputeOutput,
  StatsBaseSetParams,
  StatsBaseGetParams,
  StatsBaseGetOutput,
  StatsStatusApplyParams,
  StatsStatusRemoveParams,
  StatsStatusListParams,
  StatsStatusListOutput,
  StatsChangedParams,
  StatsStatusAppliedParams,
  StatsStatusExpiredParams,
} from '../../types/stats.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveStatus {
  readonly def: StatusEffectDef;
  /** Remaining duration (ms).  `Infinity` when effect has no expiry. */
  remaining: number;
  /** Accumulated time since last tick (ms). */
  tickAccum: number;
}

// ---------------------------------------------------------------------------
// StatsSystem
// ---------------------------------------------------------------------------

/**
 * Plugin that manages **actor and enemy statistics**.
 *
 * The system maintains per-actor base stats, equipment / buff modifiers, and
 * status effects (poison, haste, etc.).  Fully computed stats are available
 * via `stats/compute`.
 *
 * ### EventBus API
 *
 * | Event                     | Params / Output                                   |
 * |---------------------------|---------------------------------------------------|
 * | `stats/profile:define`    | `StatsProfileDefineParams`                        |
 * | `stats/status:define`     | `{ effect: StatusEffectDef }`                     |
 * | `stats/base:set`          | `StatsBaseSetParams`                              |
 * | `stats/base:get`          | `StatsBaseGetParams → StatsBaseGetOutput`         |
 * | `stats/modifier:add`      | `StatsModifierAddParams`                          |
 * | `stats/modifier:remove`   | `StatsModifierRemoveParams`                       |
 * | `stats/compute`           | `StatsComputeParams → StatsComputeOutput`         |
 * | `stats/status:apply`      | `StatsStatusApplyParams`                          |
 * | `stats/status:remove`     | `StatsStatusRemoveParams`                         |
 * | `stats/status:list`       | `StatsStatusListParams → StatsStatusListOutput`   |
 * | `stats/changed`           | `StatsChangedParams` (notification)               |
 * | `stats/status:applied`    | `StatsStatusAppliedParams` (notification)         |
 * | `stats/status:expired`    | `StatsStatusExpiredParams` (notification)         |
 */
export class StatsSystem implements EnginePlugin {
  readonly namespace = 'stats';
  readonly editorMeta = {
    displayName: 'Stats System',
    icon: 'stats',
    description: 'Manages actor stat profiles, modifiers, and status effects.',
    commands: [
      'stats/profile:define', 'stats/base:set', 'stats/base:get',
      'stats/modifier:add', 'stats/modifier:remove', 'stats/compute',
      'stats/status:define', 'stats/status:apply', 'stats/status:remove', 'stats/status:list',
    ] as const,
  };

  /** Registered stat profile definitions (by id). */
  private readonly _profiles: Map<string, StatProfileDef> = new Map();
  /** Registered status effect definitions (by id). */
  private readonly _effectDefs: Map<string, StatusEffectDef> = new Map();

  /** Per-actor base stats. */
  private readonly _bases: Map<string, StatMap> = new Map();
  /**
   * Per-actor modifier map:  actorId → sourceKey → modifiers[].
   * Tracks equipment and buff sources independently so they can be removed
   * cleanly.
   */
  private readonly _modifiers: Map<string, Map<string, StatModifier[]>> = new Map();
  /** Per-actor active status effects. */
  private readonly _statuses: Map<string, Map<string, ActiveStatus>> = new Map();

  init(core: Core): void {
    core.events.on<StatsProfileDefineParams>(this.namespace, 'stats/profile:define', (p) => {
      this._profiles.set(p.profile.id, p.profile);
    });

    core.events.on<{ effect: StatusEffectDef }>(this.namespace, 'stats/status:define', (p) => {
      this._effectDefs.set(p.effect.id, p.effect);
    });

    core.events.on<StatsBaseSetParams>(this.namespace, 'stats/base:set', (p) => {
      const existing = this._bases.get(p.actorId) ?? {};
      this._bases.set(p.actorId, { ...existing, ...p.patch });
      this._emitChanged(core, p.actorId);
    });

    core.events.on<StatsBaseGetParams, StatsBaseGetOutput>(this.namespace, 'stats/base:get', (p, output) => {
      output.base = { ...(this._bases.get(p.actorId) ?? {}) };
    });

    core.events.on<StatsModifierAddParams>(this.namespace, 'stats/modifier:add', (p) => {
      if (!this._modifiers.has(p.actorId)) {
        this._modifiers.set(p.actorId, new Map());
      }
      this._modifiers.get(p.actorId)!.set(p.source, [...p.modifiers]);
      this._emitChanged(core, p.actorId);
    });

    core.events.on<StatsModifierRemoveParams>(this.namespace, 'stats/modifier:remove', (p) => {
      this._modifiers.get(p.actorId)?.delete(p.source);
      this._emitChanged(core, p.actorId);
    });

    core.events.on<StatsComputeParams, StatsComputeOutput>(this.namespace, 'stats/compute', (p, output) => {
      output.stats = this._computeStats(p.actorId);
    });

    core.events.on<StatsStatusApplyParams>(this.namespace, 'stats/status:apply', (p) => {
      this._applyStatus(core, p.actorId, p.effectId);
    });

    core.events.on<StatsStatusRemoveParams>(this.namespace, 'stats/status:remove', (p) => {
      this._removeStatus(core, p.actorId, p.effectId);
    });

    core.events.on<StatsStatusListParams, StatsStatusListOutput>(this.namespace, 'stats/status:list', (p, output) => {
      output.effectIds = [...(this._statuses.get(p.actorId)?.keys() ?? [])];
    });

    // Re-broadcast stats/changed when the actor's level changes so that any
    // system that derives values from both level and stats stays in sync.
    core.events.on<{ actorId: string; level: number; curveId: string }>(
      this.namespace,
      'stats/base:level-changed',
      (p) => {
        this._emitChanged(core, p.actorId);
      },
    );

    // Drive status effect timers and tick damage from the update loop.
    core.events.on<CoreUpdateParams>(this.namespace, 'core/update', (p) => {
      this._tickStatuses(core, p.dt);
    });
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _computeStats(actorId: string): StatMap {
    const base: StatMap = { ...(this._bases.get(actorId) ?? {}) };

    // Collect all add-modifiers first, then multiply.
    const adds: StatMap = {};
    const mults: StatMap = {};

    const collectMods = (mods: StatModifier[]) => {
      for (const m of mods) {
        const mode = m.mode ?? 'add';
        if (mode === 'add') {
          adds[m.stat] = (adds[m.stat] ?? 0) + m.value;
        } else {
          mults[m.stat] = (mults[m.stat] ?? 1) * m.value;
        }
      }
    };

    // Equipment / buff modifiers
    for (const srcMap of (this._modifiers.get(actorId) ?? new Map()).values()) {
      collectMods(srcMap);
    }

    // Status effect modifiers
    for (const status of (this._statuses.get(actorId) ?? new Map()).values()) {
      collectMods(status.def.modifiers as StatModifier[]);
    }

    const result: StatMap = { ...base };
    for (const [stat, val] of Object.entries(adds)) {
      result[stat] = (result[stat] ?? 0) + val;
    }
    for (const [stat, mul] of Object.entries(mults)) {
      result[stat] = (result[stat] ?? 0) * mul;
    }
    return result;
  }

  private _emitChanged(core: Core, actorId: string): void {
    const stats = this._computeStats(actorId);
    core.events.emitSync<StatsChangedParams>('stats/changed', { actorId, stats });
  }

  private _applyStatus(core: Core, actorId: string, effectId: string): void {
    const def = this._effectDefs.get(effectId);
    if (!def) return;

    if (!this._statuses.has(actorId)) {
      this._statuses.set(actorId, new Map());
    }

    const remaining = def.duration !== undefined ? def.duration : Infinity;
    this._statuses.get(actorId)!.set(effectId, { def, remaining, tickAccum: 0 });
    this._emitChanged(core, actorId);
    core.events.emitSync<StatsStatusAppliedParams>('stats/status:applied', { actorId, effectId, effect: def });
  }

  private _removeStatus(core: Core, actorId: string, effectId: string): void {
    if (!this._statuses.get(actorId)?.has(effectId)) return;
    this._statuses.get(actorId)!.delete(effectId);
    this._emitChanged(core, actorId);
    core.events.emitSync<StatsStatusExpiredParams>('stats/status:expired', { actorId, effectId });
  }

  private _tickStatuses(core: Core, deltaMs: number): void {
    for (const [actorId, statusMap] of this._statuses) {
      const toRemove: string[] = [];
      for (const [effectId, status] of statusMap) {
        // Tick damage
        if (status.def.tickDamage !== undefined) {
          const tickInterval = status.def.tickMs ?? 1000;
          status.tickAccum += deltaMs;
          while (status.tickAccum >= tickInterval) {
            status.tickAccum -= tickInterval;
            const base = this._bases.get(actorId) ?? {};
            const current = base['hp'] ?? 0;
            const newHp = Math.max(0, (current as number) - status.def.tickDamage);
            this._bases.set(actorId, { ...base, hp: newHp });
            this._emitChanged(core, actorId);
          }
        }
        // Duration countdown
        if (status.remaining !== Infinity) {
          status.remaining -= deltaMs;
          if (status.remaining <= 0) {
            toRemove.push(effectId);
          }
        }
      }
      for (const id of toRemove) {
        this._removeStatus(core, actorId, id);
      }
    }
  }
}
