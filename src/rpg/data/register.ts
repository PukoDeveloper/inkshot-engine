import type { Core } from '../../core/Core.js';
import type { RpgGameData } from '../../types/rpgdata.js';
import { loadRpgData } from './loader.js';

// ---------------------------------------------------------------------------
// registerRpgData
// ---------------------------------------------------------------------------

/**
 * **One-shot RPG data registration.**
 *
 * Converts an {@link RpgGameData} object into engine-ready definitions via
 * {@link loadRpgData} and immediately injects every definition into the
 * running engine by emitting the appropriate EventBus events.
 *
 * This replaces the manual loop pattern:
 * ```ts
 * // ❌ Before — verbose, error-prone
 * const data = loadRpgData(gameData);
 * for (const actor  of data.actors)        core.events.emitSync('actor/define',         { def: actor });
 * for (const curve  of data.expCurves)     core.events.emitSync('exp/curve:define',     { curve });
 * for (const p      of data.statProfiles)  core.events.emitSync('stats/profile:define', { profile: p });
 * for (const item   of data.items)         core.events.emitSync('inventory/item:define',{ item });
 * for (const effect of data.statusEffects) core.events.emitSync('stats/status:define',  { effect });
 * for (const script of data.scripts)       core.events.emitSync('script/define',        { script });
 * ```
 *
 * With just a single call instead:
 * ```ts
 * // ✅ After — one call does everything
 * import { registerRpgData } from '@inkshot/engine';
 *
 * registerRpgData(core, {
 *   meta: { title: 'My RPG', locale: 'en', initialGold: 200 },
 *   classes: [
 *     {
 *       id: 'warrior',
 *       expCurve: { base: 30, exp: 2 },
 *       baseStats: { hp: 120, hpMax: 120, atk: 15, def: 10 },
 *     },
 *   ],
 *   actors: [{ id: 'hero', name: 'Hero', classId: 'warrior', initialLevel: 1 }],
 *   items:  [{ id: 'potion', name: 'Potion', category: 'item', price: 50 }],
 *   statusEffects: [
 *     { id: 'poison', name: 'Poison', modifiers: [{ stat: 'atk', value: 0.8, mode: 'multiply' }], duration: 15000 },
 *   ],
 *   scripts: [{ id: 'intro', nodes: [{ cmd: 'say', text: 'Welcome!' }] }],
 * });
 * ```
 *
 * ### What gets registered
 *
 * | Data field        | Engine event emitted          | Target system       |
 * |-------------------|-------------------------------|---------------------|
 * | `classes`         | `stats/profile:define`        | `StatsSystem`       |
 * | `classes`         | `exp/curve:define`            | `ExperienceSystem`  |
 * | `actors`          | `actor/define`                | `ActorManager`      |
 * | `items`           | `inventory/item:define`       | `InventorySystem`   |
 * | `statusEffects`   | `stats/status:define`         | `StatsSystem`       |
 * | `scripts`         | `script/define`               | `ScriptManager`     |
 * | `meta.initialGold`| `store/set` (player.gold)     | `VariableStoreManager` |
 * | `meta.initialVariables` | `store/patch` (game ns) | `VariableStoreManager` |
 *
 * ### Namespace conventions for initial variables
 *
 * `meta.initialVariables` is a flat `Record<string, unknown>`.  Every entry is
 * written to the `'game'` namespace inside `VariableStoreManager`.  Use
 * `store/get({ ns: 'game', key: '...' })` to read them back at runtime.
 *
 * @param core      The initialised engine core (from {@link createEngine} or
 *                  {@link createRpgEngine}).
 * @param gameData  The game data object (hand-crafted or loaded from JSON).
 */
export function registerRpgData(core: Core, gameData: RpgGameData): void {
  const data = loadRpgData(gameData);

  // ── Stat profiles (one per class) ─────────────────────────────────────────
  for (const profile of data.statProfiles) {
    core.events.emitSync('stats/profile:define', { profile });
  }

  // ── Experience curves (one per class) ─────────────────────────────────────
  for (const curve of data.expCurves) {
    core.events.emitSync('exp/curve:define', { curve });
  }

  // ── Actor definitions ──────────────────────────────────────────────────────
  for (const actor of data.actors) {
    core.events.emitSync('actor/define', { def: actor });
  }

  // ── Item definitions ───────────────────────────────────────────────────────
  for (const item of data.items) {
    core.events.emitSync('inventory/item:define', { item });
  }

  // ── Status effect definitions ──────────────────────────────────────────────
  for (const effect of data.statusEffects) {
    core.events.emitSync('stats/status:define', { effect });
  }

  // ── Standalone script definitions ─────────────────────────────────────────
  for (const script of data.scripts) {
    core.events.emitSync('script/define', { script });
  }

  // ── Initial gold (player.gold in the variable store) ──────────────────────
  if (data.initialGold !== 0) {
    core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: data.initialGold });
  }

  // ── Initial variables (game namespace in the variable store) ──────────────
  if (Object.keys(data.initialVariables).length > 0) {
    core.events.emitSync('store/patch', { ns: 'game', patch: data.initialVariables });
  }
}
