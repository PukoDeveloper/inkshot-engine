import type { RmSystem, RpgMakerVersion } from '../../types/rpgimporter.js';

export interface SystemParseResult {
  version: RpgMakerVersion;
  gameTitle: string;
  locale: string;
  initialGold: number;
  initialVariables: Record<string, unknown>;
}

/**
 * Parse `System.json` and return engine-ready configuration.
 */
export function parseSystem(system: RmSystem): SystemParseResult {
  const version: RpgMakerVersion = system['battleSystem'] !== undefined ? 'MZ' : 'MV';

  // Build initial variable store from named switch / variable lists
  const initialVariables: Record<string, unknown> = {};
  if (Array.isArray(system.switches)) {
    for (let i = 1; i < system.switches.length; i++) {
      initialVariables[`switch_${i}`] = false;
    }
  }
  if (Array.isArray(system.variables)) {
    for (let i = 1; i < system.variables.length; i++) {
      initialVariables[`var_${i}`] = 0;
    }
  }

  return {
    version,
    gameTitle: system.gameTitle ?? '',
    locale: system.locale ?? 'ja',
    initialGold: 0,
    initialVariables,
  };
}
