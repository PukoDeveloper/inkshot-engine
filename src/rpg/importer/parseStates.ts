import type { StatusEffectDef, StatModifier } from '../../types/stats.js';
import type { RmState } from '../../types/rpgimporter.js';

/**
 * Convert `States.json` entries into engine {@link StatusEffectDef} objects.
 */
export function parseStates(states: Array<RmState | null>): StatusEffectDef[] {
  const result: StatusEffectDef[] = [];
  for (const state of states) {
    if (!state || state.id === 0) continue;

    // Derive a rough duration from turn limits.
    // RPG Maker uses turns, not ms — we treat 1 turn ≈ 3000 ms.
    const TURN_MS = 3000;
    let duration: number | undefined;
    if (state.autoRemovalTiming > 0 && state.maxTurns > 0) {
      duration = state.maxTurns * TURN_MS;
    }

    // restriction 4 = paralysis → halve AGI as a modifier
    const modifiers: StatModifier[] = [];
    if (state.restriction === 4) {
      modifiers.push({ stat: 'agi', value: 0.5, mode: 'multiply' });
    }

    result.push({
      id: `state_${state.id}`,
      name: state.name,
      modifiers,
      duration,
    });
  }
  return result;
}
