import type { TilemapData, TilemapLayerDef } from '../../types/tilemap.js';
import type { ActorDef } from '../../types/actor.js';
import type { RmMap, RmEvent } from '../../types/rpgimporter.js';
import { parseCommonEvents } from './parseCommonEvents.js';

/**
 * Convert an RPG Maker `MapXXX.json` object into a
 * `{ tilemap: TilemapData; actors: ActorDef[] }` pair.
 *
 * @param mapId   Numeric map id (used for naming, e.g. `'Map001'`).
 * @param map     Parsed map JSON.
 * @param assetBase  URL prefix for tileset images.
 */
export function parseMap(
  mapId: number,
  map: RmMap,
  assetBase = 'img/tilesets/',
): { tilemap: TilemapData; actors: ActorDef[] } {
  const mapKey = `Map${String(mapId).padStart(3, '0')}`;

  // ── Build tilemap layers ──────────────────────────────────────────────────
  const { width, height, data } = map;
  const layerCount = Math.floor(data.length / (width * height));
  const tileSize = 48;

  const layers: TilemapLayerDef[] = [];
  for (let z = 0; z < Math.min(layerCount, 6); z++) {
    const layerData: number[] = [];
    const offset = z * width * height;
    for (let i = 0; i < width * height; i++) {
      layerData.push(data[offset + i] ?? 0);
    }
    layers.push({
      name: `${mapKey}_layer${z}`,
      data: layerData,
    });
  }

  const tilemap: TilemapData = {
    tileWidth: tileSize,
    tileHeight: tileSize,
    mapWidth: width,
    mapHeight: height,
    tilesets: [
      {
        firstgid: 1,
        name: `${mapKey}_tileset`,
        textureKey: `${assetBase}tileset_${map.tilesetId}`,
        tileWidth: tileSize,
        tileHeight: tileSize,
        columns: 8,
      },
    ],
    layers,
  };

  // ── Build actor defs from events ─────────────────────────────────────────
  const actors: ActorDef[] = [];
  for (const evt of map.events ?? []) {
    if (!evt || evt.id === 0) continue;
    actors.push(_eventToActorDef(mapKey, evt));
  }

  return { tilemap, actors };
}

function _eventToActorDef(mapKey: string, evt: RmEvent): ActorDef {
  const scripts = parseCommonEvents(
    evt.pages.map((page, idx) => ({
      id: idx + 1,
      name: `${evt.name}_page${idx}`,
      trigger: page.conditions ? 1 : 0,
      list: page.list ?? [],
    }))
  );

  return {
    id: `${mapKey}_event_${evt.id}`,
    scripts,
    triggers: [],
    initialState: { name: evt.name, x: evt.x, y: evt.y, mapKey },
  };
}
