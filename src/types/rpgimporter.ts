import type { ActorDef } from './actor.js';
import type { ScriptDef } from './script.js';
import type { TilemapData } from './tilemap.js';
import type { StatProfileDef, StatusEffectDef } from './stats.js';
import type { ItemDef } from './inventory.js';
import type { ExpCurveDef } from './exp.js';

// ---------------------------------------------------------------------------
// RPG Maker raw JSON shapes (common subset for MV and MZ)
// ---------------------------------------------------------------------------

/** Version string from System.json. */
export type RpgMakerVersion = 'MV' | 'MZ' | 'unknown';

// ---------------------------------------------------------------------------
// Importer options
// ---------------------------------------------------------------------------

/** Options passed to `importRpgMakerData`. */
export interface RpgImporterOptions {
  /**
   * Directory (or URL base) that contains the RPG Maker `data/` folder
   * with Actor.json, Classes.json, etc.
   */
  readonly dataDir: string;
  /**
   * Force a specific RPG Maker version.  When omitted the importer detects
   * the version automatically from `System.json`.
   */
  readonly version?: RpgMakerVersion;
  /**
   * Asset URL prefix prepended to tileset image paths.
   * Defaults to `'img/tilesets/'`.
   */
  readonly assetBase?: string;
}

// ---------------------------------------------------------------------------
// Importer output
// ---------------------------------------------------------------------------

/** Full output of `importRpgMakerData`. */
export interface RpgImporterOutput {
  /** Detected RPG Maker version. */
  version: RpgMakerVersion;
  /** Actor defs ready for `actor/define`. */
  actors: ActorDef[];
  /** Stat profile defs ready for `stats/profile:define`. */
  statProfiles: StatProfileDef[];
  /** Exp curve defs ready for `exp/curve:define`. */
  expCurves: ExpCurveDef[];
  /** Item defs ready for `inventory/item:define`. */
  items: ItemDef[];
  /** Status effect defs ready for `stats/status:define`. */
  statusEffects: StatusEffectDef[];
  /** Script defs (from CommonEvents) ready for `script/define`. */
  scripts: ScriptDef[];
  /** Parsed map data keyed by map id string (e.g. `'Map001'`). */
  maps: Record<string, { tilemap: TilemapData; actors: ActorDef[] }>;
  /** Initial variable values parsed from System.json. */
  initialVariables: Record<string, unknown>;
  /** Initial gold amount parsed from System.json. */
  initialGold: number;
  /** Default locale code from System.json (e.g. `'ja'`). */
  locale: string;
}

// ---------------------------------------------------------------------------
// Low-level RPG Maker JSON shapes (partial — only fields we consume)
// ---------------------------------------------------------------------------

export interface RmActor {
  id: number;
  name: string;
  classId: number;
  initialLevel: number;
  maxLevel: number;
  equips: number[];
  [key: string]: unknown;
}

export interface RmClass {
  id: number;
  name: string;
  expParams: [number, number, number, number]; // [base, extra, acc_a, acc_b]
  params: number[][];  // [paramId][level] => value  (8 params × 99 levels)
  [key: string]: unknown;
}

export interface RmItem {
  id: number;
  name: string;
  description: string;
  itypeId: number; // 1=item 2=key
  price: number;
  consumable: boolean;
  effects: unknown[];
  [key: string]: unknown;
}

export interface RmWeapon {
  id: number;
  name: string;
  description: string;
  wtypeId: number;
  price: number;
  params: number[];
  [key: string]: unknown;
}

export interface RmArmor {
  id: number;
  name: string;
  description: string;
  atypeId: number;
  price: number;
  params: number[];
  [key: string]: unknown;
}

export interface RmEnemy {
  id: number;
  name: string;
  params: number[];
  exp: number;
  gold: number;
  [key: string]: unknown;
}

export interface RmState {
  id: number;
  name: string;
  restriction: number;
  autoRemovalTiming: number;
  minTurns: number;
  maxTurns: number;
  [key: string]: unknown;
}

export interface RmCommonEvent {
  id: number;
  name: string;
  trigger: number; // 0=none 1=autorun 2=parallel
  list: RmEventCommand[];
}

export interface RmEventCommand {
  code: number;
  indent: number;
  parameters: unknown[];
}

export interface RmSystem {
  gameTitle: string;
  locale?: string;        // MZ
  currency_unit?: string;
  variables: string[];
  switches: string[];
  [key: string]: unknown;
}

export interface RmMapInfo {
  id: number;
  name: string;
  parentId: number;
}

export interface RmMap {
  width: number;
  height: number;
  tilesetId: number;
  data: number[];        // flattened tile IDs
  events: Array<RmEvent | null>;
  [key: string]: unknown;
}

export interface RmEvent {
  id: number;
  name: string;
  x: number;
  y: number;
  pages: RmEventPage[];
}

export interface RmEventPage {
  conditions: unknown;
  list: RmEventCommand[];
  [key: string]: unknown;
}

export interface RmTileset {
  id: number;
  name: string;
  tilesetNames: string[]; // 9 image file names
  flags: number[];
  [key: string]: unknown;
}

export interface RmAnimation {
  id: number;
  name: string;
  frames: unknown[];
  [key: string]: unknown;
}
