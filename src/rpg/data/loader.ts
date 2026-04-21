import type { ActorDef } from '../../types/actor.js';
import type { StatProfileDef } from '../../types/stats.js';
import type { StatModifier } from '../../types/stats.js';
import type { ExpCurveDef } from '../../types/exp.js';
import type { ItemDef } from '../../types/inventory.js';
import type { StatusEffectDef } from '../../types/stats.js';
import type { ScriptDef } from '../../types/script.js';
import type {
  RpgGameData,
  RpgDataOutput,
  RpgActorEntry,
  RpgClassDef,
} from '../../types/rpgdata.js';

// ---------------------------------------------------------------------------
// loadRpgData
// ---------------------------------------------------------------------------

/**
 * **Convert engine-native RPG game data into engine-ready definitions.**
 *
 * Accepts an {@link RpgGameData} object (which you can write by hand or load
 * from plain JSON files) and returns fully typed engine structures that can be
 * fed directly into the running plugin systems.
 *
 * No RPG Maker dependency — all field names and structures are engine-native.
 *
 * ### Quick-start
 * ```ts
 * import { loadRpgData } from '@inkshot/engine';
 *
 * const data = loadRpgData({
 *   meta: { title: 'My RPG', locale: 'en', initialGold: 200 },
 *   classes: [
 *     {
 *       id: 'warrior',
 *       expCurve: { base: 30, exp: 2 },
 *       baseStats: { hp: 120, hpMax: 120, atk: 15, def: 10, agi: 8, luk: 5 },
 *     },
 *   ],
 *   actors: [
 *     { id: 'hero', name: 'Hero', classId: 'warrior', initialLevel: 1 },
 *   ],
 *   items: [
 *     { id: 'potion', name: 'Potion', category: 'item', price: 50 },
 *     { id: 'iron-sword', name: 'Iron Sword', category: 'weapon', price: 200,
 *       equipModifiers: [{ stat: 'atk', value: 10, mode: 'add' }] },
 *   ],
 *   statusEffects: [
 *     { id: 'poison', name: 'Poison', modifiers: [{ stat: 'atk', value: 0.8, mode: 'multiply' }],
 *       duration: 15000, tickDamage: 5, tickMs: 1000 },
 *   ],
 * });
 *
 * // Inject into the engine:
 * for (const actor  of data.actors)        core.events.emitSync('actor/define',           { def: actor });
 * for (const curve  of data.expCurves)     core.events.emitSync('exp/curve:define',        { curve });
 * for (const p      of data.statProfiles)  core.events.emitSync('stats/profile:define',    { profile: p });
 * for (const item   of data.items)         core.events.emitSync('inventory/item:define',   { item });
 * for (const effect of data.statusEffects) core.events.emitSync('stats/status:define',     { effect });
 * for (const script of data.scripts)       core.events.emitSync('script/define',           { script });
 * ```
 *
 * @param gameData  The game data object (or a JSON parse result that conforms
 *                  to {@link RpgGameData}).
 * @returns         Engine-ready definitions grouped by system.
 */
export function loadRpgData(gameData: RpgGameData): RpgDataOutput {
  const meta = gameData.meta ?? {};

  // ── Meta ──────────────────────────────────────────────────────────────────
  const gameTitle         = meta.title           ?? '';
  const version           = meta.version         ?? '';
  const locale            = meta.locale          ?? 'en';
  const initialGold       = meta.initialGold     ?? 0;
  const initialVariables  = { ...(meta.initialVariables ?? {}) };

  // ── Classes → exp curves + stat profiles ─────────────────────────────────
  const expCurves:   ExpCurveDef[]    = [];
  const statProfiles: StatProfileDef[] = [];

  for (const cls of gameData.classes ?? []) {
    expCurves.push(_buildExpCurve(cls));
    statProfiles.push(_buildStatProfile(cls));
  }

  // ── Actors ────────────────────────────────────────────────────────────────
  const actors: ActorDef[] = (gameData.actors ?? []).map(_buildActorDef);

  // ── Items ─────────────────────────────────────────────────────────────────
  const items: ItemDef[] = (gameData.items ?? []).map((entry) => ({ ...entry }));

  // Collect equip-modifier index (useful for tooling / debugging)
  const equipModifiers: Array<{ itemId: string; modifiers: StatModifier[] }> = [];
  for (const item of items) {
    if (item.equipModifiers && item.equipModifiers.length > 0) {
      equipModifiers.push({
        itemId: item.id,
        modifiers: item.equipModifiers.map((m) => ({ ...m })),
      });
    }
  }

  // ── Status effects ────────────────────────────────────────────────────────
  const statusEffects: StatusEffectDef[] = (gameData.statusEffects ?? []).map((e) => ({ ...e }));

  // ── Standalone scripts ────────────────────────────────────────────────────
  const scripts: ScriptDef[] = (gameData.scripts ?? []).map((s) => ({ ...s }));

  return {
    gameTitle,
    version,
    locale,
    initialGold,
    initialVariables,
    actors,
    expCurves,
    statProfiles,
    items,
    statusEffects,
    scripts,
    equipModifiers,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _buildExpCurve(cls: RpgClassDef): ExpCurveDef {
  const curve = cls.expCurve ?? {};
  return {
    id:       cls.id,
    base:     curve.base     ?? 30,
    exp:      curve.exp      ?? 2,
    extra:    curve.extra    ?? 0,
    maxLevel: curve.maxLevel ?? 99,
  };
}

function _buildStatProfile(cls: RpgClassDef): StatProfileDef {
  const base = { ...(cls.baseStats ?? {}) };

  // Ensure canonical hp/hpMax aliases are populated when only one is provided
  if (base['hp'] === undefined && base['hpMax'] !== undefined) {
    base['hp'] = base['hpMax'];
  }
  if (base['hpMax'] === undefined && base['hp'] !== undefined) {
    base['hpMax'] = base['hp'];
  }
  if (base['mp'] === undefined && base['mpMax'] !== undefined) {
    base['mp'] = base['mpMax'];
  }
  if (base['mpMax'] === undefined && base['mp'] !== undefined) {
    base['mpMax'] = base['mp'];
  }

  return { id: cls.id, base };
}

function _buildActorDef(entry: RpgActorEntry): ActorDef {
  const initialState: Record<string, unknown> = {
    ...(entry.initialState ?? {}),
  };
  if (entry.name  !== undefined) initialState['name']    = entry.name;
  if (entry.classId !== undefined) initialState['classId'] = entry.classId;
  initialState['level'] = entry.initialLevel ?? 1;

  const scripts: ScriptDef[] = (entry.scripts ?? []).map((s) => ({ ...s }));

  const triggers = (entry.triggers ?? []).map((t) => ({
    id:       t.id,
    event:    t.event,
    script:   t.script,
    mode:     t.mode     ?? ('blocking' as const),
    priority: t.priority ?? 10,
    onEnd:    t.onEnd    ?? ('nothing' as const),
  }));

  return {
    id:           entry.id,
    scripts,
    triggers,
    initialState,
  };
}
