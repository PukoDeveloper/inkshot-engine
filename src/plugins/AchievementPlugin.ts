import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  AchievementDef,
  AchievementDefineParams,
  AchievementGetOutput,
  AchievementGetParams,
  AchievementListOutput,
  AchievementProgressParams,
  AchievementResetParams,
  AchievementState,
  AchievementUnlockParams,
  AchievementUnlockedParams,
} from '../types/achievement.js';
import type { SaveSlotSaveOutput, SaveSlotLoadOutput } from '../types/save.js';

// ---------------------------------------------------------------------------
// Internal persistence shape
// ---------------------------------------------------------------------------

interface PersistedAchievements {
  /** Map of achievement id → `{ progress, unlockedAt }`. */
  data: Record<string, { progress: number; unlockedAt: string | null }>;
}

// ---------------------------------------------------------------------------
// AchievementPlugin
// ---------------------------------------------------------------------------

/**
 * Plugin that manages **game achievements**.
 *
 * Achievements are defined with {@link AchievementDef}.  They can be
 * **instant** (unlocked by a single event or `achievement/unlock` call) or
 * **progressive** (requiring a counter to reach a `threshold`).
 *
 * Progress and unlock state are automatically saved / restored via
 * `save/slot:save` and `save/slot:load` lifecycle hooks.
 *
 * ### Quick start
 * ```ts
 * import { createEngine, AchievementPlugin } from 'inkshot-engine';
 *
 * const achievements = new AchievementPlugin();
 * const { core } = await createEngine({ plugins: [achievements] });
 *
 * core.events.emitSync('achievement/define', {
 *   achievement: {
 *     id: 'first_kill',
 *     name: 'First Blood',
 *     description: 'Defeat your first enemy.',
 *     triggerEvent: 'combat/enemy:defeated',
 *   },
 * });
 *
 * // Elsewhere — when an enemy dies:
 * core.events.emitSync('combat/enemy:defeated', { enemyId: 'goblin_1' });
 * // → achievement/unlocked is broadcast automatically.
 * ```
 *
 * ### EventBus API
 *
 * | Event                    | Params / Output                                         |
 * |--------------------------|---------------------------------------------------------|
 * | `achievement/define`     | `AchievementDefineParams`                               |
 * | `achievement/unlock`     | `AchievementUnlockParams`                               |
 * | `achievement/progress`   | `AchievementProgressParams`                             |
 * | `achievement/reset`      | `AchievementResetParams`                                |
 * | `achievement/get`        | `AchievementGetParams → AchievementGetOutput`           |
 * | `achievement/list`       | `{} → AchievementListOutput`                            |
 * | `achievement/unlocked`   | `AchievementUnlockedParams` (notification)              |
 */
export class AchievementPlugin implements EnginePlugin {
  readonly namespace = 'achievement';

  private readonly _definitions: Map<string, AchievementDef> = new Map();
  /** progress counter for each achievement */
  private readonly _progress: Map<string, number> = new Map();
  /** set of unlocked achievement ids */
  private readonly _unlocked: Map<string, string> = new Map(); // id → ISO timestamp

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // ── Public event API ─────────────────────────────────────────────────
    core.events.on('achievement', 'achievement/define', (p: AchievementDefineParams) => {
      const { achievement } = p;
      this._definitions.set(achievement.id, achievement);

      // Subscribe to the trigger event if defined.
      if (achievement.triggerEvent) {
        core.events.on(
          `achievement_trigger_${achievement.id}`,
          achievement.triggerEvent,
          (payload: unknown) => {
            if (achievement.triggerFilter && !achievement.triggerFilter(payload)) return;
            this._incrementProgress(achievement.id, 1, core);
          },
        );
      }
    });

    core.events.on('achievement', 'achievement/unlock', (p: AchievementUnlockParams) => {
      this._unlock(p.id, core);
    });

    core.events.on('achievement', 'achievement/progress', (p: AchievementProgressParams) => {
      this._incrementProgress(p.id, p.amount ?? 1, core);
    });

    core.events.on('achievement', 'achievement/reset', (p: AchievementResetParams) => {
      this._progress.set(p.id, 0);
      this._unlocked.delete(p.id);
    });

    core.events.on(
      'achievement',
      'achievement/get',
      (p: AchievementGetParams, output: AchievementGetOutput) => {
        output.achievement = this._buildState(p.id);
      },
    );

    core.events.on(
      'achievement',
      'achievement/list',
      (_p: Record<string, never>, output: AchievementListOutput) => {
        output.achievements = Array.from(this._definitions.keys()).map(
          (id) => this._buildState(id)!,
        );
      },
    );

    // ── Persistence ───────────────────────────────────────────────────────
    // After save: embed achievement state into the slot data.
    core.events.on(
      'achievement',
      'save/slot:save',
      (_p: Record<string, never>, output: SaveSlotSaveOutput) => {
        if (!output.data) return;
        const persisted: PersistedAchievements = { data: {} };
        for (const id of this._definitions.keys()) {
          persisted.data[id] = {
            progress: this._progress.get(id) ?? 0,
            unlockedAt: this._unlocked.get(id) ?? null,
          };
        }
        output.data.data['_achievements'] = persisted;
      },
      { phase: 'after' },
    );

    // After load: restore achievement state from the slot data.
    core.events.on(
      'achievement',
      'save/slot:load',
      (_p: Record<string, never>, output: SaveSlotLoadOutput) => {
        if (!output.loaded || !output.raw) return;
        const raw = output.raw.data['_achievements'] as PersistedAchievements | undefined;
        if (!raw?.data) return;
        for (const [id, entry] of Object.entries(raw.data)) {
          this._progress.set(id, entry.progress);
          if (entry.unlockedAt) {
            this._unlocked.set(id, entry.unlockedAt);
          }
        }
      },
      { phase: 'after' },
    );
  }

  destroy(core: Core): void {
    // Clean up per-achievement trigger listeners.
    for (const id of this._definitions.keys()) {
      core.events.removeNamespace(`achievement_trigger_${id}`);
    }
    this._definitions.clear();
    this._progress.clear();
    this._unlocked.clear();
    core.events.removeNamespace('achievement');
  }

  // ---------------------------------------------------------------------------
  // Direct accessors (pull API)
  // ---------------------------------------------------------------------------

  getState(id: string): AchievementState | null {
    return this._buildState(id);
  }

  listStates(): AchievementState[] {
    return Array.from(this._definitions.keys()).map((id) => this._buildState(id)!);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _incrementProgress(id: string, amount: number, core: Core): void {
    const def = this._definitions.get(id);
    if (!def) return;
    if (this._unlocked.has(id)) return; // already unlocked

    const prev = this._progress.get(id) ?? 0;
    const next = prev + amount;
    this._progress.set(id, next);

    const threshold = def.threshold ?? 1;
    if (next >= threshold) {
      this._unlock(id, core);
    }
  }

  private _unlock(id: string, core: Core): void {
    if (this._unlocked.has(id)) return;
    const def = this._definitions.get(id);
    if (!def) return;

    const ts = new Date().toISOString();
    this._unlocked.set(id, ts);
    // Ensure progress is at least threshold so the state is coherent.
    const threshold = def.threshold ?? 1;
    if ((this._progress.get(id) ?? 0) < threshold) {
      this._progress.set(id, threshold);
    }

    core.events.emitSync('achievement/unlocked', {
      id,
      name: def.name,
      description: def.description,
      icon: def.icon,
    } as AchievementUnlockedParams);
  }

  private _buildState(id: string): AchievementState | null {
    const def = this._definitions.get(id);
    if (!def) return null;
    return {
      id,
      progress: this._progress.get(id) ?? 0,
      threshold: def.threshold ?? 1,
      unlocked: this._unlocked.has(id),
      unlockedAt: this._unlocked.get(id) ?? null,
    };
  }
}
