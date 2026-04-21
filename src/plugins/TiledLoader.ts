import type {
  TilemapData,
  TilemapLayerDef,
  TilesetDef,
  AnimatedTileDef,
  TileAnimationFrame,
  AutotileGroupDef,
} from '../types/tilemap.js';
import type { ActorDef } from '../types/actor.js';
import type { TileCollisionShape } from '../types/physics.js';

// ---------------------------------------------------------------------------
// Tiled JSON (`.tmj`) format types
// ---------------------------------------------------------------------------

/**
 * A tileset entry as it appears in the `.tmj` root `tilesets` array.
 */
export interface TiledTilesetRef {
  firstgid: number;
  /** Relative path to the `.tsj` file (ignored — only `firstgid` is used). */
  source?: string;
  /** Inline tileset data (present when the tileset is embedded in the map). */
  name?: string;
  tilewidth?: number;
  tileheight?: number;
  tilecount?: number;
  columns?: number;
  spacing?: number;
  margin?: number;
  /** Asset key that was pre-loaded via `assets/load`. */
  textureKey?: string;
}

/** A single tile's metadata entry inside `TiledTilesetData.tiles`. */
export interface TiledTileData {
  /** Local (0-based within tileset) tile id. */
  id: number;
  type?: string;
  properties?: TiledProperty[];
  animation?: TiledAnimationFrame[];
  objectgroup?: TiledObjectLayer;
}

export interface TiledAnimationFrame {
  tileid: number;
  duration: number;
}

/** Custom property as serialised by Tiled. */
export interface TiledProperty {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool' | 'color' | 'file' | 'object';
  value: unknown;
}

/** A layer in the `.tmj` file — either a tile layer or an object layer. */
export type TiledLayer = TiledTileLayer | TiledObjectLayer | TiledGroupLayer;

export interface TiledTileLayer {
  type: 'tilelayer';
  name: string;
  id?: number;
  width: number;
  height: number;
  /** Flat row-major tile GID array.  `0` means empty. */
  data: number[];
  visible?: boolean;
  opacity?: number;
  offsetx?: number;
  offsety?: number;
  properties?: TiledProperty[];
}

export interface TiledObjectLayer {
  type: 'objectgroup';
  name: string;
  id?: number;
  objects: TiledObject[];
  visible?: boolean;
  opacity?: number;
  properties?: TiledProperty[];
}

export interface TiledGroupLayer {
  type: 'group';
  name: string;
  id?: number;
  layers: TiledLayer[];
  visible?: boolean;
  properties?: TiledProperty[];
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  visible?: boolean;
  properties?: TiledProperty[];
  /** Present when the object is a tile reference. */
  gid?: number;
  /** Present when the object is a polyline. */
  polyline?: { x: number; y: number }[];
  /** Present when the object is a polygon. */
  polygon?: { x: number; y: number }[];
  /** Present when the object is an ellipse. */
  ellipse?: boolean;
  /** Present when the object is a point. */
  point?: boolean;
}

/**
 * The root structure of a Tiled JSON map file (`.tmj`).
 */
export interface TiledMap {
  version?: string;
  tiledversion?: string;
  type?: 'map';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  orientation?: 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal';
  renderorder?: 'right-down' | 'right-up' | 'left-down' | 'left-up';
  tilesets: TiledTilesetRef[];
  layers: TiledLayer[];
  properties?: TiledProperty[];
  nextlayerid?: number;
  nextobjectid?: number;
}

// ---------------------------------------------------------------------------
// Loader options
// ---------------------------------------------------------------------------

export interface TiledLoaderOptions {
  /**
   * Map from tileset name (from `.tmj`) to the pre-loaded asset key.
   *
   * ```ts
   * tilesetTextureKeys: { 'world': 'tileset_world', 'dungeon': 'tileset_dungeon' }
   * ```
   */
  tilesetTextureKeys: Record<string, string>;

  /**
   * Map from tile **type** string (set in the Tiled object editor) to an
   * `ActorDef` factory.  Called for each object in object layers whose
   * `type` matches a key.
   *
   * If omitted, object layers are not converted to ActorDefs.
   */
  actorFactories?: Record<
    string,
    (obj: TiledObject, properties: Record<string, unknown>) => ActorDef
  >;

  /**
   * Map from custom tile **property name** to a collision shape resolver.
   *
   * When a tile has a property whose name matches a key here, the associated
   * shape string is used in the layer's `tileShapes` map.  The first matching
   * property wins.
   *
   * ```ts
   * collisionPropertyMap: { 'collides': 'solid', 'platform': 'top-only' }
   * ```
   *
   * Defaults to `{ collision: 'solid' }`.
   */
  collisionPropertyMap?: Record<string, TileCollisionShape | string>;

  /**
   * When `true`, tile layers whose **name** starts with `'collision'`
   * (case-insensitive) are automatically marked as colliders.
   * Defaults to `false`.
   */
  autoCollisionLayers?: boolean;

  /**
   * Number of tiles per chunk edge for the resulting `TilemapData`.
   * Defaults to `16`.
   */
  chunkSize?: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface TiledLoaderOutput {
  /** The converted `TilemapData` ready to pass to `tilemap/load`. */
  tilemapData: TilemapData;
  /**
   * Actor definitions parsed from Tiled object layers.
   * Empty array when no `actorFactories` were provided or no objects matched.
   */
  actors: ActorDef[];
}

// ---------------------------------------------------------------------------
// TiledLoader
// ---------------------------------------------------------------------------

/**
 * Convert a Tiled JSON map (`.tmj`) into `TilemapData` and `ActorDef[]`.
 *
 * ### Usage
 * ```ts
 * import { loadTiledMap } from 'inkshot-engine';
 *
 * const raw = await fetch('/maps/level1.tmj').then(r => r.json());
 * const { tilemapData, actors } = loadTiledMap(raw, {
 *   tilesetTextureKeys: { 'world': 'tileset_world' },
 *   actorFactories: {
 *     'Player': (obj, props) => ({ id: 'player', type: 'player', ...props }),
 *     'Enemy':  (obj, props) => ({ id: `enemy_${obj.id}`, type: 'enemy', ...props }),
 *   },
 * });
 *
 * await core.events.emit('tilemap/load', { mapData: tilemapData });
 * for (const actor of actors) {
 *   core.events.emitSync('actor/define', actor);
 * }
 * ```
 *
 * @param map  Parsed Tiled JSON object (result of `JSON.parse(tmjString)`).
 * @param opts Conversion options.
 */
export function loadTiledMap(map: TiledMap, opts: TiledLoaderOptions): TiledLoaderOutput {
  const collisionPropMap = opts.collisionPropertyMap ?? { collision: 'solid' };

  // ── 1. Convert tilesets ──────────────────────────────────────────────────
  const tilesets: TilesetDef[] = [];
  for (const ref of map.tilesets) {
    const name = ref.name ?? '';
    const textureKey = ref.textureKey ?? opts.tilesetTextureKeys[name] ?? '';
    tilesets.push({
      firstgid: ref.firstgid,
      name,
      textureKey,
      tileWidth: ref.tilewidth ?? map.tilewidth,
      tileHeight: ref.tileheight ?? map.tileheight,
      columns: ref.columns,
      spacing: ref.spacing,
      margin: ref.margin,
    });
  }

  // ── 2. Build per-GID tile metadata (collision shapes, animation) ─────────
  //   (We walk all inline tileset objects from the raw map if present.)
  const gidToShape: Map<number, TileCollisionShape | string> = new Map();
  const animatedTiles: Record<number, AnimatedTileDef> = {};

  for (const ref of map.tilesets) {
    const firstgid = ref.firstgid;
    // Inline tile data is stored in `ref` when the tileset is embedded.
    const tiles = (ref as unknown as { tiles?: TiledTileData[] }).tiles;
    if (!tiles) continue;

    for (const tile of tiles) {
      const gid = firstgid + tile.id;

      // Collision shape from custom properties.
      if (tile.properties) {
        for (const prop of tile.properties) {
          if (prop.name in collisionPropMap && prop.value) {
            gidToShape.set(gid, collisionPropMap[prop.name]!);
            break;
          }
        }
      }

      // Animation frames.
      if (tile.animation && tile.animation.length > 0) {
        const frames: TileAnimationFrame[] = tile.animation.map((f) => ({
          tileId: firstgid + f.tileid,
          duration: f.duration,
        }));
        animatedTiles[gid] = { frames };
      }
    }
  }

  // ── 3. Convert tile layers ────────────────────────────────────────────────
  const tilemapLayers: TilemapLayerDef[] = [];
  const actors: ActorDef[] = [];
  const autotileGroups: AutotileGroupDef[] = [];

  _flattenLayers(map.layers, tilemapLayers, actors, opts, gidToShape);

  // ── 4. Assemble TilemapData ───────────────────────────────────────────────
  const tilemapData: TilemapData = {
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    mapWidth: map.width,
    mapHeight: map.height,
    tilesets,
    layers: tilemapLayers,
    ...(Object.keys(animatedTiles).length > 0 ? { animatedTiles } : {}),
    ...(autotileGroups.length > 0 ? { autotileGroups } : {}),
    ...(opts.chunkSize !== undefined ? { chunkSize: opts.chunkSize } : {}),
  };

  return { tilemapData, actors };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _flattenLayers(
  layers: TiledLayer[],
  outTileLayers: TilemapLayerDef[],
  outActors: ActorDef[],
  opts: TiledLoaderOptions,
  gidToShape: Map<number, TileCollisionShape | string>,
): void {
  for (const layer of layers) {
    if (layer.type === 'group') {
      _flattenLayers(layer.layers, outTileLayers, outActors, opts, gidToShape);
      continue;
    }

    if (layer.type === 'tilelayer') {
      outTileLayers.push(_convertTileLayer(layer, opts, gidToShape));
      continue;
    }

    if (layer.type === 'objectgroup' && opts.actorFactories) {
      for (const obj of layer.objects) {
        const factory = opts.actorFactories[obj.type];
        if (factory) {
          const props = _parseProperties(obj.properties ?? []);
          outActors.push(factory(obj, props));
        }
      }
    }
  }
}

function _convertTileLayer(
  layer: TiledTileLayer,
  opts: TiledLoaderOptions,
  gidToShape: Map<number, TileCollisionShape | string>,
): TilemapLayerDef {
  const isCollisionLayer =
    opts.autoCollisionLayers === true &&
    layer.name.toLowerCase().startsWith('collision');

  // Build the tileShapes map for this layer.
  let tileShapes: Record<number, TileCollisionShape | string> | undefined;
  if (isCollisionLayer || _layerHasCollisionTiles(layer, gidToShape)) {
    tileShapes = {};
    for (const gid of layer.data) {
      if (gid !== 0 && gidToShape.has(gid) && !(gid in tileShapes)) {
        tileShapes[gid] = gidToShape.get(gid)!;
      }
    }
    if (isCollisionLayer) {
      // Mark every non-empty tile as solid when it doesn't have an explicit shape.
      for (const gid of layer.data) {
        if (gid !== 0 && !(gid in tileShapes)) {
          tileShapes[gid] = 'solid';
        }
      }
    }
    if (Object.keys(tileShapes).length === 0) tileShapes = undefined;
  }

  const result: TilemapLayerDef = {
    name: layer.name,
    data: layer.data,
    visible: layer.visible ?? true,
    opacity: layer.opacity ?? 1,
  };

  if (tileShapes && Object.keys(tileShapes).length > 0) {
    result.collider = true;
    result.tileShapes = tileShapes;
  }

  return result;
}

function _layerHasCollisionTiles(
  layer: TiledTileLayer,
  gidToShape: Map<number, TileCollisionShape | string>,
): boolean {
  for (const gid of layer.data) {
    if (gid !== 0 && gidToShape.has(gid)) return true;
  }
  return false;
}

function _parseProperties(props: TiledProperty[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const p of props) {
    result[p.name] = p.value;
  }
  return result;
}
