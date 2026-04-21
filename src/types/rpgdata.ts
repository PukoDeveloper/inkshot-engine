import type { StatMap } from './stats.js';
import type { StatModifier, StatusEffectDef } from './stats.js';
import type { ItemDef } from './inventory.js';
import type { ScriptDef } from './script.js';
import type { ActorDef } from './actor.js';
import type { StatProfileDef } from './stats.js';
import type { ExpCurveDef } from './exp.js';

// ---------------------------------------------------------------------------
// Engine-native RPG data format
// ---------------------------------------------------------------------------
// This format is entirely independent of RPG Maker.  Developers write their
// game data in these structures (or in plain JSON files that conform to them)
// and call `loadRpgData()` to obtain engine-ready definitions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

/** Top-level game metadata. */
export interface RpgGameMeta {
  /** Human-readable game title. */
  title?: string;
  /** Arbitrary version string, e.g. `'1.0.0'`. */
  version?: string;
  /** Default locale code, e.g. `'en'`, `'ja'`. */
  locale?: string;
  /** Starting gold amount for new games. */
  initialGold?: number;
  /**
   * Initial values for the variable store.
   * All entries are injected into the `VariableStoreManager` on startup.
   */
  initialVariables?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/**
 * A character class (archetype) definition.
 *
 * Describes the experience curve and base stats for actors that belong to
 * this class.
 */
export interface RpgClassDef {
  /** Unique identifier, e.g. `'warrior'`, `'mage'`. */
  id: string;
  /** Human-readable name. */
  name?: string;
  /**
   * Experience-curve parameters for this class.
   *
   * Uses the engine's default quadratic formula:
   * `exp(level) = base * level^exp + extra * level`
   */
  expCurve?: {
    /** Base coefficient.  Defaults to `30`. */
    base?: number;
    /** Exponent.  Defaults to `2`. */
    exp?: number;
    /** Extra linear coefficient.  Defaults to `0`. */
    extra?: number;
    /** Maximum level.  Defaults to `99`. */
    maxLevel?: number;
  };
  /**
   * Base stat values at level 1.
   *
   * Common keys: `hp`, `hpMax`, `mp`, `mpMax`, `atk`, `def`, `agi`, `luk`.
   * Games may add any additional stat keys.
   */
  baseStats?: StatMap;
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

/**
 * A simplified, data-friendly actor definition.
 *
 * Unlike {@link ActorDef}, triggers here are serialisable plain objects.
 * To attach programmatic condition functions or complex trigger logic, use
 * {@link ActorDef} directly via `actor/define`.
 */
export interface RpgActorEntry {
  /** Unique identifier, e.g. `'hero'`, `'merchant-1'`. */
  id: string;
  /** Display name for this actor. */
  name?: string;
  /** References a {@link RpgClassDef.id} to inherit its exp curve and stats. */
  classId?: string;
  /** Starting level.  Defaults to `1`. */
  initialLevel?: number;
  /**
   * Extra key-value pairs merged into the actor's initial state.
   * `name`, `level`, and `classId` are always seeded from the fields above.
   */
  initialState?: Record<string, unknown>;
  /**
   * Script definitions that belong to this actor.
   * Forwarded to `ScriptManager` when the actor def is registered.
   */
  scripts?: ScriptDef[];
  /**
   * Data-only trigger entries (no condition functions).
   *
   * Fields mirror {@link import('./actor.js').TriggerDef} except `condition`
   * and `varsFromEvent`, which require code and must be added programmatically.
   */
  triggers?: RpgTriggerEntry[];
}

/**
 * Serialisable (data-only) trigger entry used inside {@link RpgActorEntry}.
 */
export interface RpgTriggerEntry {
  /** Unique id within this actor, e.g. `'on-interact'`. */
  id: string;
  /** EventBus event name that fires this trigger. */
  event: string;
  /** ID of the script in this actor's `scripts` array to execute. */
  script: string;
  /** Execution mode.  Defaults to `'blocking'`. */
  mode?: 'concurrent' | 'blocking';
  /** Priority for blocking triggers.  Defaults to `10`. */
  priority?: number;
  /** What to do after a blocking script ends.  Defaults to `'nothing'`. */
  onEnd?: 'restore' | 'nothing' | string;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * An item definition entry — a direct alias of the engine's {@link ItemDef}.
 *
 * Accepted fields: `id`, `name`, `description`, `category`, `price`,
 * `maxStack`, `equipModifiers`, `useScriptId`, plus any custom keys.
 */
export type RpgItemEntry = ItemDef;

// ---------------------------------------------------------------------------
// Status effects
// ---------------------------------------------------------------------------

/**
 * A status-effect definition entry — a direct alias of {@link StatusEffectDef}.
 *
 * Accepted fields: `id`, `name`, `modifiers`, `duration`, `tickDamage`, `tickMs`.
 */
export type RpgStatusEffectEntry = StatusEffectDef;

// ---------------------------------------------------------------------------
// Top-level game data container
// ---------------------------------------------------------------------------

/**
 * The root data object that describes a complete RPG game.
 *
 * Pass this to {@link loadRpgData} to obtain engine-ready definitions.
 *
 * All fields are optional — include only what your game needs.
 *
 * @example
 * ```ts
 * import { loadRpgData } from '@inkshot/engine';
 *
 * const data = loadRpgData({
 *   meta: { title: 'My RPG', locale: 'en', initialGold: 100 },
 *   classes: [
 *     {
 *       id: 'warrior',
 *       expCurve: { base: 30, exp: 2 },
 *       baseStats: { hp: 120, hpMax: 120, atk: 15, def: 10, agi: 8 },
 *     },
 *   ],
 *   actors: [
 *     { id: 'hero', name: 'Hero', classId: 'warrior', initialLevel: 1 },
 *   ],
 *   items: [
 *     { id: 'potion', name: 'Potion', category: 'item', price: 50, maxStack: 99 },
 *     { id: 'iron-sword', name: 'Iron Sword', category: 'weapon', price: 200, maxStack: 1,
 *       equipModifiers: [{ stat: 'atk', value: 10, mode: 'add' }] },
 *   ],
 *   statusEffects: [
 *     { id: 'poison', name: 'Poison', modifiers: [{ stat: 'atk', value: 0.8, mode: 'multiply' }],
 *       duration: 15000, tickDamage: 5, tickMs: 1000 },
 *   ],
 *   scripts: [
 *     { id: 'shop-intro', nodes: [{ cmd: 'say', text: 'Welcome!', speaker: 'Merchant' }] },
 *   ],
 * });
 *
 * // Inject into the running engine:
 * for (const actor of data.actors) {
 *   core.events.emitSync('actor/define', { def: actor });
 * }
 * for (const curve of data.expCurves) {
 *   core.events.emitSync('exp/curve:define', { curve });
 * }
 * for (const profile of data.statProfiles) {
 *   core.events.emitSync('stats/profile:define', { profile });
 * }
 * for (const item of data.items) {
 *   core.events.emitSync('inventory/item:define', { item });
 * }
 * for (const effect of data.statusEffects) {
 *   core.events.emitSync('stats/status:define', { effect });
 * }
 * for (const script of data.scripts) {
 *   core.events.emitSync('script/define', { script });
 * }
 * ```
 */
export interface RpgGameData {
  /** Top-level metadata about the game. */
  meta?: RpgGameMeta;
  /**
   * Character class definitions.
   *
   * Each class generates one {@link ExpCurveDef} and one {@link StatProfileDef}
   * in the output of {@link loadRpgData}.
   */
  classes?: RpgClassDef[];
  /** Actor type definitions. */
  actors?: RpgActorEntry[];
  /** Item / weapon / armor / key-item definitions. */
  items?: RpgItemEntry[];
  /** Status effect (buff / debuff) definitions. */
  statusEffects?: RpgStatusEffectEntry[];
  /**
   * Standalone script definitions (not attached to any actor).
   *
   * These are actor-independent scripts for cutscenes, common events, etc.
   */
  scripts?: ScriptDef[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Full output of {@link loadRpgData}. */
export interface RpgDataOutput {
  /** Parsed game title (empty string if omitted). */
  gameTitle: string;
  /** Arbitrary version string from metadata (empty string if omitted). */
  version: string;
  /** Detected or specified locale code. */
  locale: string;
  /** Starting gold amount. */
  initialGold: number;
  /** Initial variable-store values. */
  initialVariables: Record<string, unknown>;
  /** Actor defs ready for `actor/define`. */
  actors: ActorDef[];
  /** Stat profile defs ready for `stats/profile:define`. */
  statProfiles: StatProfileDef[];
  /** Experience curve defs ready for `exp/curve:define`. */
  expCurves: ExpCurveDef[];
  /** Item defs ready for `inventory/item:define`. */
  items: ItemDef[];
  /** Status effect defs ready for `stats/status:define`. */
  statusEffects: StatusEffectDef[];
  /** Standalone script defs ready for `script/define`. */
  scripts: ScriptDef[];
  /** Flattened list of all stat modifiers from items (for reference). */
  equipModifiers: Array<{ itemId: string; modifiers: StatModifier[] }>;
}
