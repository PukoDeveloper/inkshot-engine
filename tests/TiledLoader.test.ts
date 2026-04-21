import { describe, it, expect } from 'vitest';
import { loadTiledMap } from '../src/plugins/TiledLoader.js';
import type { TiledMap } from '../src/plugins/TiledLoader.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTiledMap(overrides: Partial<TiledMap> = {}): TiledMap {
  return {
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [
      {
        firstgid: 1,
        name: 'world',
        tilewidth: 16,
        tileheight: 16,
        tilecount: 64,
        columns: 8,
      },
    ],
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width: 4,
        height: 3,
        data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadTiledMap', () => {
  // ── basic conversion ──────────────────────────────────────────────────────
  describe('basic conversion', () => {
    it('copies map dimensions to TilemapData', () => {
      const { tilemapData } = loadTiledMap(makeTiledMap(), {
        tilesetTextureKeys: { world: 'key_world' },
      });
      expect(tilemapData.tileWidth).toBe(16);
      expect(tilemapData.tileHeight).toBe(16);
      expect(tilemapData.mapWidth).toBe(4);
      expect(tilemapData.mapHeight).toBe(3);
    });

    it('maps tileset name to provided textureKey', () => {
      const { tilemapData } = loadTiledMap(makeTiledMap(), {
        tilesetTextureKeys: { world: 'tileset_key' },
      });
      expect(tilemapData.tilesets[0]!.textureKey).toBe('tileset_key');
    });

    it('preserves tileset firstgid', () => {
      const { tilemapData } = loadTiledMap(makeTiledMap(), {
        tilesetTextureKeys: { world: 'k' },
      });
      expect(tilemapData.tilesets[0]!.firstgid).toBe(1);
    });

    it('copies tile layer data verbatim', () => {
      const data = [1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0];
      const { tilemapData } = loadTiledMap(
        makeTiledMap({ layers: [{ type: 'tilelayer', name: 'ground', width: 4, height: 3, data }] }),
        { tilesetTextureKeys: { world: 'k' } },
      );
      expect(tilemapData.layers[0]!.data).toEqual(data);
    });

    it('passes chunkSize option through', () => {
      const { tilemapData } = loadTiledMap(makeTiledMap(), {
        tilesetTextureKeys: { world: 'k' },
        chunkSize: 32,
      });
      expect(tilemapData.chunkSize).toBe(32);
    });
  });

  // ── layer properties ──────────────────────────────────────────────────────
  describe('layer properties', () => {
    it('converts layer visibility and opacity', () => {
      const { tilemapData } = loadTiledMap(
        makeTiledMap({
          layers: [
            {
              type: 'tilelayer',
              name: 'bg',
              width: 4,
              height: 3,
              data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
              visible: false,
              opacity: 0.5,
            },
          ],
        }),
        { tilesetTextureKeys: { world: 'k' } },
      );
      expect(tilemapData.layers[0]!.visible).toBe(false);
      expect(tilemapData.layers[0]!.opacity).toBe(0.5);
    });

    it('defaults visibility to true when omitted', () => {
      const { tilemapData } = loadTiledMap(makeTiledMap(), {
        tilesetTextureKeys: { world: 'k' },
      });
      expect(tilemapData.layers[0]!.visible).toBe(true);
    });
  });

  // ── auto collision layers ────────────────────────────────────────────────
  describe('autoCollisionLayers', () => {
    it('marks layers named "collision*" as colliders', () => {
      const { tilemapData } = loadTiledMap(
        makeTiledMap({
          layers: [
            {
              type: 'tilelayer',
              name: 'collision',
              width: 4,
              height: 3,
              data: [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            },
          ],
        }),
        { tilesetTextureKeys: { world: 'k' }, autoCollisionLayers: true },
      );
      const layer = tilemapData.layers[0]!;
      expect(layer.collider).toBe(true);
      expect(layer.tileShapes![1]).toBe('solid');
    });

    it('does not mark non-collision layers when autoCollisionLayers is false', () => {
      const { tilemapData } = loadTiledMap(makeTiledMap(), {
        tilesetTextureKeys: { world: 'k' },
        autoCollisionLayers: false,
      });
      expect(tilemapData.layers[0]!.collider).toBeUndefined();
    });
  });

  // ── collision shapes from tile properties ────────────────────────────────
  describe('tile collision shapes', () => {
    it('reads collision shape from tile properties', () => {
      const mapWithTileData: TiledMap = {
        ...makeTiledMap(),
        tilesets: [
          {
            firstgid: 1,
            name: 'world',
            tilewidth: 16,
            tileheight: 16,
            tilecount: 4,
            columns: 2,
            // Inline tile data with a 'collision' property.
            tiles: [
              {
                id: 0, // local index 0 → GID 1
                properties: [{ name: 'collision', type: 'bool', value: true }],
              },
            ],
          } as unknown as import('../src/plugins/TiledLoader.js').TiledTilesetRef,
        ],
        layers: [
          {
            type: 'tilelayer',
            name: 'ground',
            width: 4,
            height: 3,
            data: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        ],
      };

      const { tilemapData } = loadTiledMap(mapWithTileData, {
        tilesetTextureKeys: { world: 'k' },
        collisionPropertyMap: { collision: 'solid' },
      });

      expect(tilemapData.layers[0]!.collider).toBe(true);
      expect(tilemapData.layers[0]!.tileShapes![1]).toBe('solid');
    });
  });

  // ── animated tiles ────────────────────────────────────────────────────────
  describe('animated tiles', () => {
    it('extracts animation frames from tile data', () => {
      const mapWithAnim: TiledMap = {
        ...makeTiledMap(),
        tilesets: [
          {
            firstgid: 1,
            name: 'world',
            tilewidth: 16,
            tileheight: 16,
            tilecount: 4,
            columns: 2,
            tiles: [
              {
                id: 0, // GID 1
                animation: [
                  { tileid: 0, duration: 200 },
                  { tileid: 1, duration: 200 },
                ],
              },
            ],
          } as unknown as import('../src/plugins/TiledLoader.js').TiledTilesetRef,
        ],
      };
      const { tilemapData } = loadTiledMap(mapWithAnim, {
        tilesetTextureKeys: { world: 'k' },
      });
      expect(tilemapData.animatedTiles).toBeDefined();
      expect(tilemapData.animatedTiles![1]!.frames).toHaveLength(2);
      expect(tilemapData.animatedTiles![1]!.frames[0]!.tileId).toBe(1); // firstgid + tileid
      expect(tilemapData.animatedTiles![1]!.frames[0]!.duration).toBe(200);
    });
  });

  // ── object layers → actors ────────────────────────────────────────────────
  describe('object layers', () => {
    it('converts matching objects to ActorDefs', () => {
      const mapWithObjects: TiledMap = {
        ...makeTiledMap({
          layers: [
            ...makeTiledMap().layers,
            {
              type: 'objectgroup',
              name: 'entities',
              objects: [
                { id: 1, name: 'hero', type: 'Player', x: 32, y: 48 },
                { id: 2, name: 'goblin', type: 'Enemy', x: 64, y: 80 },
                { id: 3, name: 'box', type: 'Unknown', x: 0, y: 0 },
              ],
            },
          ],
        }),
      };

      const { actors } = loadTiledMap(mapWithObjects, {
        tilesetTextureKeys: { world: 'k' },
        actorFactories: {
          Player: (obj) => ({
            id: 'player',
            scripts: [],
            triggers: [],
            initialState: { spawnX: obj.x, spawnY: obj.y },
          }),
          Enemy: (obj) => ({
            id: `enemy_${obj.id}`,
            scripts: [],
            triggers: [],
            initialState: { spawnX: obj.x, spawnY: obj.y },
          }),
        },
      });

      expect(actors).toHaveLength(2);
      expect(actors.find((a) => a.id === 'player')).toBeDefined();
      expect(actors.find((a) => a.id.startsWith('enemy_'))).toBeDefined();
    });

    it('returns empty actors when no factories provided', () => {
      const mapWithObjects: TiledMap = {
        ...makeTiledMap({
          layers: [
            ...makeTiledMap().layers,
            {
              type: 'objectgroup',
              name: 'entities',
              objects: [{ id: 1, name: 'p', type: 'Player', x: 0, y: 0 }],
            },
          ],
        }),
      };
      const { actors } = loadTiledMap(mapWithObjects, {
        tilesetTextureKeys: { world: 'k' },
      });
      expect(actors).toHaveLength(0);
    });
  });

  // ── group layers ──────────────────────────────────────────────────────────
  describe('group layers', () => {
    it('flattens nested tile layers from group layers', () => {
      const mapWithGroup: TiledMap = {
        ...makeTiledMap({
          layers: [
            {
              type: 'group',
              name: 'bg-group',
              layers: [
                {
                  type: 'tilelayer',
                  name: 'sky',
                  width: 4,
                  height: 3,
                  data: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                },
                {
                  type: 'tilelayer',
                  name: 'ground',
                  width: 4,
                  height: 3,
                  data: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
                },
              ],
            },
          ],
        }),
      };
      const { tilemapData } = loadTiledMap(mapWithGroup, {
        tilesetTextureKeys: { world: 'k' },
      });
      expect(tilemapData.layers).toHaveLength(2);
      expect(tilemapData.layers.map((l) => l.name)).toContain('sky');
      expect(tilemapData.layers.map((l) => l.name)).toContain('ground');
    });
  });

  // ── custom property parsing ───────────────────────────────────────────────
  describe('custom object properties', () => {
    it('passes parsed properties to the actor factory', () => {
      const mapWithProps: TiledMap = {
        ...makeTiledMap({
          layers: [
            ...makeTiledMap().layers,
            {
              type: 'objectgroup',
              name: 'npcs',
              objects: [
                {
                  id: 1,
                  name: 'chest',
                  type: 'Chest',
                  x: 0,
                  y: 0,
                  properties: [
                    { name: 'gold', type: 'int', value: 50 },
                    { name: 'locked', type: 'bool', value: true },
                  ],
                },
              ],
            },
          ],
        }),
      };

      let capturedProps: Record<string, unknown> = {};
      loadTiledMap(mapWithProps, {
        tilesetTextureKeys: { world: 'k' },
        actorFactories: {
          Chest: (_obj, props) => {
            capturedProps = props;
            return { id: 'chest', scripts: [], triggers: [], initialState: {} };
          },
        },
      });

      expect(capturedProps['gold']).toBe(50);
      expect(capturedProps['locked']).toBe(true);
    });
  });
});
