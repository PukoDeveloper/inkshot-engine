import type { ExpCurveDef } from '../../types/exp.js';
import type { StatProfileDef, StatMap } from '../../types/stats.js';
import type { RmClass } from '../../types/rpgimporter.js';

// RPG Maker MV/MZ param indices
const PARAM_NAMES = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'] as const;

/**
 * Convert `Classes.json` into {@link ExpCurveDef} and {@link StatProfileDef} arrays.
 *
 * RPG Maker stores level-1..99 parameter values in `class.params[paramId][level]`.
 */
export function parseClasses(
  classes: Array<RmClass | null>,
): { curves: ExpCurveDef[]; profiles: StatProfileDef[] } {
  const curves: ExpCurveDef[] = [];
  const profiles: StatProfileDef[] = [];

  for (const cls of classes) {
    if (!cls || cls.id === 0) continue;

    const id = `class_${cls.id}`;

    // ── Experience curve ─────────────────────────────────────────────────────
    // RPG Maker MV curve formula:
    //   exp(n) = base * (n - 1)^0.9 + base * (acc_a + n) * (n - 1) / acc_b / 2
    // We approximate it with a simple quadratic using cls.expParams[0] and [1].
    const [base, extra] = cls.expParams ?? [30, 20, 30, 30];
    curves.push({
      id,
      base: base ?? 30,
      extra: extra ?? 0,
      exp: 2,
      maxLevel: 99,
    });

    // ── Base stat profile (level 1 values) ───────────────────────────────────
    const baseStats: StatMap = {};
    if (Array.isArray(cls.params)) {
      for (let paramId = 0; paramId < PARAM_NAMES.length; paramId++) {
        const colData = cls.params[paramId];
        if (Array.isArray(colData) && colData.length > 1) {
          // params[paramId][level]   (level 1 is index 1)
          baseStats[PARAM_NAMES[paramId]] = (colData[1] as number) ?? 0;
        }
      }
    }
    // Map hp/mp to the canonical names expected by BattleSystem
    baseStats['hp'] = baseStats['mhp'] ?? 100;
    baseStats['hpMax'] = baseStats['mhp'] ?? 100;
    baseStats['mp'] = baseStats['mmp'] ?? 0;
    baseStats['mpMax'] = baseStats['mmp'] ?? 0;

    profiles.push({ id, base: baseStats });
  }

  return { curves, profiles };
}
