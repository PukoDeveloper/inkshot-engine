import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerRpgData } from '../src/rpg/data/register.js';
import type { RpgGameData } from '../src/types/rpgdata.js';

// ---------------------------------------------------------------------------
// Minimal mock Core
// ---------------------------------------------------------------------------

function makeMockCore() {
  const emitted: Array<{ event: string; params: unknown }> = [];
  const core = {
    events: {
      emitSync: vi.fn((event: string, params: unknown) => {
        emitted.push({ event, params });
      }),
    },
    _emitted: emitted,
  };
  return core as unknown as import('../src/core/Core.js').Core & { _emitted: typeof emitted };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL: RpgGameData = {};

const FULL: RpgGameData = {
  meta: {
    title: 'Quest of Heroes',
    version: '1.0.0',
    locale: 'en',
    initialGold: 150,
    initialVariables: { introPlayed: false, chapter: 1 },
  },
  classes: [
    {
      id: 'warrior',
      expCurve: { base: 30, exp: 2, extra: 5, maxLevel: 50 },
      baseStats: { hp: 120, hpMax: 120, mp: 20, mpMax: 20, atk: 15, def: 10, agi: 8, luk: 5 },
    },
    {
      id: 'mage',
      expCurve: { base: 25, exp: 2 },
      baseStats: { hp: 60, hpMax: 60, mp: 80, mpMax: 80, atk: 6, def: 4, agi: 10, luk: 8 },
    },
  ],
  actors: [
    {
      id: 'hero',
      name: 'Hero',
      classId: 'warrior',
      initialLevel: 1,
      scripts: [{ id: 'hero-intro', nodes: [{ cmd: 'say', text: 'I will save the world!', speaker: 'Hero' }] }],
      triggers: [{ id: 'on-interact', event: 'player/interact', script: 'hero-intro', mode: 'blocking' }],
    },
    { id: 'merchant', name: 'Merchant', initialLevel: 1 },
  ],
  items: [
    { id: 'potion',      name: 'Potion',      category: 'item',   price: 50,  maxStack: 99 },
    { id: 'iron-sword',  name: 'Iron Sword',  category: 'weapon', price: 200, maxStack: 1,
      equipModifiers: [{ stat: 'atk', value: 10, mode: 'add' }] },
  ],
  statusEffects: [
    {
      id: 'poison',
      name: 'Poison',
      modifiers: [{ stat: 'agi', value: 0.9, mode: 'multiply' }],
      duration: 15000,
      tickDamage: 5,
      tickMs: 1000,
    },
  ],
  scripts: [
    { id: 'cutscene-intro', nodes: [{ cmd: 'say', text: 'Long ago…' }] },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockCore = ReturnType<typeof makeMockCore>;

function emittedFor(core: MockCore, event: string) {
  return core._emitted.filter((e) => e.event === event).map((e) => e.params);
}

// ---------------------------------------------------------------------------
// Tests: minimal / empty input
// ---------------------------------------------------------------------------

describe('registerRpgData – empty input', () => {
  let core: MockCore;
  beforeEach(() => { core = makeMockCore(); registerRpgData(core, MINIMAL); });

  it('does not emit any events for an empty data object', () => {
    expect(core._emitted).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: classes → stat profiles + exp curves
// ---------------------------------------------------------------------------

describe('registerRpgData – classes', () => {
  let core: MockCore;
  beforeEach(() => { core = makeMockCore(); registerRpgData(core, FULL); });

  it('emits stats/profile:define once per class', () => {
    const profiles = emittedFor(core, 'stats/profile:define');
    expect(profiles).toHaveLength(2);
  });

  it('emits exp/curve:define once per class', () => {
    const curves = emittedFor(core, 'exp/curve:define');
    expect(curves).toHaveLength(2);
  });

  it('warrior profile has correct base stats', () => {
    const [first] = emittedFor(core, 'stats/profile:define') as Array<{ profile: { id: string; base: Record<string, number> } }>;
    const warrior = first?.profile.id === 'warrior' ? first.profile : undefined;
    expect(warrior).toBeDefined();
    expect(warrior?.base['hp']).toBe(120);
    expect(warrior?.base['atk']).toBe(15);
  });

  it('warrior exp curve has correct params', () => {
    const curves = emittedFor(core, 'exp/curve:define') as Array<{ curve: { id: string; base: number; maxLevel: number } }>;
    const warriorCurve = curves.find((c) => c.curve.id === 'warrior')?.curve;
    expect(warriorCurve?.base).toBe(30);
    expect(warriorCurve?.maxLevel).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Tests: actors
// ---------------------------------------------------------------------------

describe('registerRpgData – actors', () => {
  let core: MockCore;
  beforeEach(() => { core = makeMockCore(); registerRpgData(core, FULL); });

  it('emits actor/define once per actor', () => {
    const actors = emittedFor(core, 'actor/define');
    expect(actors).toHaveLength(2);
  });

  it('hero ActorDef has correct id', () => {
    const defs = emittedFor(core, 'actor/define') as Array<{ def: { id: string } }>;
    expect(defs.find((d) => d.def.id === 'hero')).toBeDefined();
  });

  it('hero ActorDef seeds name into initialState', () => {
    const defs = emittedFor(core, 'actor/define') as Array<{ def: { id: string; initialState: Record<string, unknown> } }>;
    const hero = defs.find((d) => d.def.id === 'hero')?.def;
    expect(hero?.initialState['name']).toBe('Hero');
    expect(hero?.initialState['classId']).toBe('warrior');
    expect(hero?.initialState['level']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: items
// ---------------------------------------------------------------------------

describe('registerRpgData – items', () => {
  let core: MockCore;
  beforeEach(() => { core = makeMockCore(); registerRpgData(core, FULL); });

  it('emits inventory/item:define once per item', () => {
    const items = emittedFor(core, 'inventory/item:define');
    expect(items).toHaveLength(2);
  });

  it('potion item has correct fields', () => {
    const items = emittedFor(core, 'inventory/item:define') as Array<{ item: { id: string; price: number } }>;
    const potion = items.find((i) => i.item.id === 'potion')?.item;
    expect(potion?.price).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Tests: status effects
// ---------------------------------------------------------------------------

describe('registerRpgData – statusEffects', () => {
  let core: MockCore;
  beforeEach(() => { core = makeMockCore(); registerRpgData(core, FULL); });

  it('emits stats/status:define once per status effect', () => {
    const effects = emittedFor(core, 'stats/status:define');
    expect(effects).toHaveLength(1);
  });

  it('poison effect has correct duration', () => {
    const effects = emittedFor(core, 'stats/status:define') as Array<{ effect: { id: string; duration: number } }>;
    expect(effects[0]?.effect.id).toBe('poison');
    expect(effects[0]?.effect.duration).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// Tests: standalone scripts
// ---------------------------------------------------------------------------

describe('registerRpgData – scripts', () => {
  let core: MockCore;
  beforeEach(() => { core = makeMockCore(); registerRpgData(core, FULL); });

  it('emits script/define once per standalone script', () => {
    const scripts = emittedFor(core, 'script/define');
    expect(scripts).toHaveLength(1);
  });

  it('script has correct id', () => {
    const scripts = emittedFor(core, 'script/define') as Array<{ script: { id: string } }>;
    expect(scripts[0]?.script.id).toBe('cutscene-intro');
  });
});

// ---------------------------------------------------------------------------
// Tests: initialGold
// ---------------------------------------------------------------------------

describe('registerRpgData – initialGold', () => {
  it('emits store/set for player.gold when initialGold > 0', () => {
    const core = makeMockCore();
    registerRpgData(core, { meta: { initialGold: 150 } });
    const sets = emittedFor(core, 'store/set') as Array<{ ns: string; key: string; value: unknown }>;
    const goldSet = sets.find((s) => s.ns === 'player' && s.key === 'gold');
    expect(goldSet).toBeDefined();
    expect(goldSet?.value).toBe(150);
  });

  it('does not emit store/set when initialGold is 0 (default)', () => {
    const core = makeMockCore();
    registerRpgData(core, { meta: { title: 'Test' } });
    const sets = emittedFor(core, 'store/set');
    expect(sets).toHaveLength(0);
  });

  it('does not emit store/set when meta is omitted', () => {
    const core = makeMockCore();
    registerRpgData(core, MINIMAL);
    const sets = emittedFor(core, 'store/set');
    expect(sets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: initialVariables
// ---------------------------------------------------------------------------

describe('registerRpgData – initialVariables', () => {
  it('emits store/patch for game namespace when initialVariables is non-empty', () => {
    const core = makeMockCore();
    registerRpgData(core, { meta: { initialVariables: { chapter: 1, introPlayed: false } } });
    const patches = emittedFor(core, 'store/patch') as Array<{ ns: string; patch: Record<string, unknown> }>;
    const gamePatch = patches.find((p) => p.ns === 'game');
    expect(gamePatch).toBeDefined();
    expect(gamePatch?.patch['chapter']).toBe(1);
    expect(gamePatch?.patch['introPlayed']).toBe(false);
  });

  it('does not emit store/patch when initialVariables is empty', () => {
    const core = makeMockCore();
    registerRpgData(core, { meta: { initialVariables: {} } });
    const patches = emittedFor(core, 'store/patch');
    expect(patches).toHaveLength(0);
  });

  it('does not emit store/patch when meta is omitted', () => {
    const core = makeMockCore();
    registerRpgData(core, MINIMAL);
    const patches = emittedFor(core, 'store/patch');
    expect(patches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: emission order
// ---------------------------------------------------------------------------

describe('registerRpgData – emission order', () => {
  it('emits stat profiles before exp curves, actors, items, effects, scripts', () => {
    const core = makeMockCore();
    registerRpgData(core, FULL);
    const events = core._emitted.map((e) => e.event);
    const profileIdx = events.indexOf('stats/profile:define');
    const curveIdx   = events.indexOf('exp/curve:define');
    const actorIdx   = events.indexOf('actor/define');
    const itemIdx    = events.indexOf('inventory/item:define');
    const effectIdx  = events.indexOf('stats/status:define');
    const scriptIdx  = events.indexOf('script/define');
    expect(profileIdx).toBeLessThan(curveIdx);
    expect(curveIdx).toBeLessThan(actorIdx);
    expect(actorIdx).toBeLessThan(itemIdx);
    expect(itemIdx).toBeLessThan(effectIdx);
    expect(effectIdx).toBeLessThan(scriptIdx);
  });
});

// ---------------------------------------------------------------------------
// Tests: data isolation (mutations do not bleed between calls)
// ---------------------------------------------------------------------------

describe('registerRpgData – data isolation', () => {
  it('subsequent calls are independent of each other', () => {
    const core1 = makeMockCore();
    const core2 = makeMockCore();

    registerRpgData(core1, FULL);
    registerRpgData(core2, FULL);

    expect(core1._emitted.length).toBe(core2._emitted.length);
  });
});
