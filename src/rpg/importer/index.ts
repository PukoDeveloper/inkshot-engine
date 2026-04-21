export { parseActors } from './parseActors.js';
export { parseClasses } from './parseClasses.js';
export { parseItems } from './parseItems.js';
export { parseStates } from './parseStates.js';
export { parseCommonEvents } from './parseCommonEvents.js';
export { parseMap } from './parseMaps.js';
export { parseSystem } from './parseSystem.js';

import type { RpgImporterOptions, RpgImporterOutput } from '../../types/rpgimporter.js';
import { parseActors } from './parseActors.js';
import { parseClasses } from './parseClasses.js';
import { parseItems } from './parseItems.js';
import { parseStates } from './parseStates.js';
import { parseCommonEvents } from './parseCommonEvents.js';
import { parseMap } from './parseMaps.js';
import { parseSystem } from './parseSystem.js';

// ---------------------------------------------------------------------------
// importRpgMakerData
// ---------------------------------------------------------------------------

/**
 * **All-in-one RPG Maker data importer.**
 *
 * Accepts the raw parsed JSON objects from the RPG Maker `data/` directory
 * and returns engine-native data structures ready to be loaded into the
 * running plugin systems.
 *
 * ### Usage
 * ```ts
 * import { importRpgMakerData } from 'inkshot-engine/rpg/importer';
 *
 * // Load raw JSON files however you prefer (fetch, fs.readFile, etc.)
 * const raw = {
 *   actors: await fetch('/data/Actors.json').then(r => r.json()),
 *   classes: await fetch('/data/Classes.json').then(r => r.json()),
 *   items:   await fetch('/data/Items.json').then(r => r.json()),
 *   // … etc.
 * };
 *
 * const data = importRpgMakerData(raw, { dataDir: '/data/' });
 *
 * // Inject into the running engine:
 * for (const actor of data.actors) {
 *   core.events.emitSync('actor/define', { def: actor });
 * }
 * for (const curve of data.expCurves) {
 *   core.events.emitSync('exp/curve:define', { curve });
 * }
 * // … etc.
 * ```
 */
export function importRpgMakerData(
  raw: {
    actors?: unknown[];
    classes?: unknown[];
    items?: unknown[];
    weapons?: unknown[];
    armors?: unknown[];
    states?: unknown[];
    commonEvents?: unknown[];
    system?: Record<string, unknown>;
    maps?: Record<string, unknown>;
  },
  opts: Partial<RpgImporterOptions> = {},
): RpgImporterOutput {
  const assetBase = opts.assetBase ?? 'img/tilesets/';

  // ── System ────────────────────────────────────────────────────────────────
  const sysResult = raw.system
    ? parseSystem(raw.system as Parameters<typeof parseSystem>[0])
    : { version: 'unknown' as const, gameTitle: '', locale: 'en', initialGold: 0, initialVariables: {} };

  // ── Actors / Classes ──────────────────────────────────────────────────────
  const actors = parseActors(
    (raw.actors ?? []) as Parameters<typeof parseActors>[0],
    (raw.classes ?? []) as Parameters<typeof parseActors>[1],
  );
  const { curves: expCurves, profiles: statProfiles } = parseClasses(
    (raw.classes ?? []) as Parameters<typeof parseClasses>[0],
  );

  // ── Items ─────────────────────────────────────────────────────────────────
  const items = parseItems(
    (raw.items ?? []) as Parameters<typeof parseItems>[0],
    (raw.weapons ?? []) as Parameters<typeof parseItems>[1],
    (raw.armors ?? []) as Parameters<typeof parseItems>[2],
  );

  // ── States ────────────────────────────────────────────────────────────────
  const statusEffects = parseStates(
    (raw.states ?? []) as Parameters<typeof parseStates>[0],
  );

  // ── Common events → scripts ───────────────────────────────────────────────
  const scripts = parseCommonEvents(
    (raw.commonEvents ?? []) as Parameters<typeof parseCommonEvents>[0],
  );

  // ── Maps ──────────────────────────────────────────────────────────────────
  const maps: RpgImporterOutput['maps'] = {};
  if (raw.maps) {
    for (const [key, mapData] of Object.entries(raw.maps)) {
      // key is expected to be like 'Map001'
      const numericId = parseInt(key.replace(/\D/g, ''), 10);
      if (!isNaN(numericId) && mapData) {
        maps[key] = parseMap(numericId, mapData as Parameters<typeof parseMap>[1], assetBase);
      }
    }
  }

  return {
    version: sysResult.version,
    actors,
    statProfiles,
    expCurves,
    items,
    statusEffects,
    scripts,
    maps,
    initialVariables: sysResult.initialVariables,
    initialGold: sysResult.initialGold,
    locale: sysResult.locale,
  };
}
