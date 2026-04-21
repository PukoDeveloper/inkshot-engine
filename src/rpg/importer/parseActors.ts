import type { ActorDef } from '../../types/actor.js';
import type { RmActor, RmClass } from '../../types/rpgimporter.js';

/**
 * Convert RPG Maker `Actors.json` entries into engine {@link ActorDef} objects.
 *
 * Each actor gets a minimal script/trigger setup — extend with game-specific
 * logic after importing.
 */
export function parseActors(actors: Array<RmActor | null>, _classes: Array<RmClass | null>): ActorDef[] {
  const result: ActorDef[] = [];
  for (const actor of actors) {
    if (!actor || actor.id === 0) continue;
    result.push({
      id: `actor_${actor.id}`,
      scripts: [],
      triggers: [],
      initialState: {
        name: actor.name,
        level: actor.initialLevel ?? 1,
        classId: actor.classId,
      },
    });
  }
  return result;
}
