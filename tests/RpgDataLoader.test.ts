import { describe, it, expect } from 'vitest';
import { loadRpgData } from '../src/rpg/data/loader.js';
import type { RpgGameData } from '../src/types/rpgdata.js';

// ---------------------------------------------------------------------------
// Fixture helpers
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
      name: 'Warrior',
      expCurve: { base: 30, exp: 2, extra: 5, maxLevel: 50 },
      baseStats: { hp: 120, hpMax: 120, mp: 20, mpMax: 20, atk: 15, def: 10, agi: 8, luk: 5 },
    },
    {
      id: 'mage',
      name: 'Mage',
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
      initialState: { isPartyLeader: true },
      scripts: [
        { id: 'hero-intro', nodes: [{ cmd: 'say', text: 'I will save the world!', speaker: 'Hero' }] },
      ],
      triggers: [
        { id: 'on-interact', event: 'player/interact', script: 'hero-intro', mode: 'blocking', priority: 10 },
      ],
    },
    {
      id: 'merchant',
      name: 'Merchant',
      initialLevel: 1,
    },
  ],
  items: [
    { id: 'potion',     name: 'Potion',     category: 'item',   price: 50,  maxStack: 99 },
    { id: 'iron-sword', name: 'Iron Sword', category: 'weapon', price: 200, maxStack: 1,
      equipModifiers: [{ stat: 'atk', value: 10, mode: 'add' }] },
    { id: 'wood-shield', name: 'Wood Shield', category: 'armor', price: 100, maxStack: 1,
      equipModifiers: [{ stat: 'def', value: 5, mode: 'add' }] },
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
    {
      id: 'haste',
      name: 'Haste',
      modifiers: [{ stat: 'agi', value: 1.5, mode: 'multiply' }],
    },
  ],
  scripts: [
    { id: 'cutscene-intro', nodes: [{ cmd: 'say', text: 'Long ago…' }] },
  ],
};

// ---------------------------------------------------------------------------
// Tests: empty / minimal input
// ---------------------------------------------------------------------------

describe('loadRpgData – empty input', () => {
  it('returns sensible defaults when given an empty object', () => {
    const out = loadRpgData(MINIMAL);
    expect(out.gameTitle).toBe('');
    expect(out.locale).toBe('en');
    expect(out.initialGold).toBe(0);
    expect(out.initialVariables).toEqual({});
    expect(out.actors).toEqual([]);
    expect(out.expCurves).toEqual([]);
    expect(out.statProfiles).toEqual([]);
    expect(out.items).toEqual([]);
    expect(out.statusEffects).toEqual([]);
    expect(out.scripts).toEqual([]);
    expect(out.equipModifiers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: meta
// ---------------------------------------------------------------------------

describe('loadRpgData – meta', () => {
  it('parses title, version, locale, initialGold', () => {
    const out = loadRpgData(FULL);
    expect(out.gameTitle).toBe('Quest of Heroes');
    expect(out.locale).toBe('en');
    expect(out.initialGold).toBe(150);
  });

  it('carries initial variables through', () => {
    const out = loadRpgData(FULL);
    expect(out.initialVariables).toEqual({ introPlayed: false, chapter: 1 });
  });

  it('uses default locale "en" when omitted', () => {
    const out = loadRpgData({ meta: { title: 'Game' } });
    expect(out.locale).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// Tests: classes → expCurves + statProfiles
// ---------------------------------------------------------------------------

describe('loadRpgData – classes', () => {
  it('generates one ExpCurveDef per class', () => {
    const out = loadRpgData(FULL);
    expect(out.expCurves).toHaveLength(2);
  });

  it('warrior exp curve has correct params', () => {
    const out   = loadRpgData(FULL);
    const curve = out.expCurves.find((c) => c.id === 'warrior')!;
    expect(curve).toBeDefined();
    expect(curve.base).toBe(30);
    expect(curve.exp).toBe(2);
    expect(curve.extra).toBe(5);
    expect(curve.maxLevel).toBe(50);
  });

  it('mage exp curve uses defaults for missing fields', () => {
    const out   = loadRpgData(FULL);
    const curve = out.expCurves.find((c) => c.id === 'mage')!;
    expect(curve.extra).toBe(0);
    expect(curve.maxLevel).toBe(99);
  });

  it('generates one StatProfileDef per class', () => {
    const out = loadRpgData(FULL);
    expect(out.statProfiles).toHaveLength(2);
  });

  it('warrior stat profile has correct base stats', () => {
    const out     = loadRpgData(FULL);
    const profile = out.statProfiles.find((p) => p.id === 'warrior')!;
    expect(profile).toBeDefined();
    expect(profile.base['hp']).toBe(120);
    expect(profile.base['atk']).toBe(15);
    expect(profile.base['def']).toBe(10);
  });

  it('fills hpMax from hp when hpMax is omitted', () => {
    const out = loadRpgData({
      classes: [{ id: 'test', baseStats: { hp: 80 } }],
    });
    const profile = out.statProfiles[0]!;
    expect(profile.base['hp']).toBe(80);
    expect(profile.base['hpMax']).toBe(80);
  });

  it('fills hp from hpMax when hp is omitted', () => {
    const out = loadRpgData({
      classes: [{ id: 'test', baseStats: { hpMax: 90 } }],
    });
    const profile = out.statProfiles[0]!;
    expect(profile.base['hp']).toBe(90);
    expect(profile.base['hpMax']).toBe(90);
  });

  it('fills mpMax from mp when mpMax is omitted', () => {
    const out = loadRpgData({
      classes: [{ id: 'test', baseStats: { mp: 30 } }],
    });
    const profile = out.statProfiles[0]!;
    expect(profile.base['mpMax']).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Tests: actors
// ---------------------------------------------------------------------------

describe('loadRpgData – actors', () => {
  it('produces one ActorDef per entry', () => {
    const out = loadRpgData(FULL);
    expect(out.actors).toHaveLength(2);
  });

  it('hero ActorDef has correct id', () => {
    const out  = loadRpgData(FULL);
    const hero = out.actors.find((a) => a.id === 'hero')!;
    expect(hero).toBeDefined();
  });

  it('seeds name, classId, and level into initialState', () => {
    const out  = loadRpgData(FULL);
    const hero = out.actors.find((a) => a.id === 'hero')!;
    expect(hero.initialState?.['name']).toBe('Hero');
    expect(hero.initialState?.['classId']).toBe('warrior');
    expect(hero.initialState?.['level']).toBe(1);
  });

  it('merges extra initialState fields', () => {
    const out  = loadRpgData(FULL);
    const hero = out.actors.find((a) => a.id === 'hero')!;
    expect(hero.initialState?.['isPartyLeader']).toBe(true);
  });

  it('maps scripts into the ActorDef', () => {
    const out  = loadRpgData(FULL);
    const hero = out.actors.find((a) => a.id === 'hero')!;
    expect(hero.scripts).toHaveLength(1);
    expect(hero.scripts[0]!.id).toBe('hero-intro');
  });

  it('maps data-only triggers into the ActorDef', () => {
    const out  = loadRpgData(FULL);
    const hero = out.actors.find((a) => a.id === 'hero')!;
    expect(hero.triggers).toHaveLength(1);
    const trigger = hero.triggers[0]!;
    expect(trigger.id).toBe('on-interact');
    expect(trigger.event).toBe('player/interact');
    expect(trigger.script).toBe('hero-intro');
    expect(trigger.mode).toBe('blocking');
    expect(trigger.priority).toBe(10);
  });

  it('defaults level to 1 when initialLevel is omitted', () => {
    const out      = loadRpgData(FULL);
    const merchant = out.actors.find((a) => a.id === 'merchant')!;
    expect(merchant.initialState?.['level']).toBe(1);
  });

  it('actor with no triggers produces an empty triggers array', () => {
    const out      = loadRpgData(FULL);
    const merchant = out.actors.find((a) => a.id === 'merchant')!;
    expect(merchant.triggers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: items
// ---------------------------------------------------------------------------

describe('loadRpgData – items', () => {
  it('passes items through as-is', () => {
    const out = loadRpgData(FULL);
    expect(out.items).toHaveLength(3);
  });

  it('item fields are preserved', () => {
    const out    = loadRpgData(FULL);
    const potion = out.items.find((i) => i.id === 'potion')!;
    expect(potion.name).toBe('Potion');
    expect(potion.category).toBe('item');
    expect(potion.price).toBe(50);
    expect(potion.maxStack).toBe(99);
  });

  it('weapon equipModifiers are preserved', () => {
    const out   = loadRpgData(FULL);
    const sword = out.items.find((i) => i.id === 'iron-sword')!;
    expect(sword.equipModifiers).toHaveLength(1);
    expect(sword.equipModifiers![0]!.stat).toBe('atk');
    expect(sword.equipModifiers![0]!.value).toBe(10);
  });

  it('builds equipModifiers index only for items with modifiers', () => {
    const out = loadRpgData(FULL);
    expect(out.equipModifiers).toHaveLength(2); // sword + shield
    const swordEntry = out.equipModifiers.find((e) => e.itemId === 'iron-sword')!;
    expect(swordEntry.modifiers).toHaveLength(1);
  });

  it('returns empty equipModifiers when no items have modifiers', () => {
    const out = loadRpgData({ items: [{ id: 'key', name: 'Key', category: 'key' }] });
    expect(out.equipModifiers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: status effects
// ---------------------------------------------------------------------------

describe('loadRpgData – statusEffects', () => {
  it('passes status effects through', () => {
    const out = loadRpgData(FULL);
    expect(out.statusEffects).toHaveLength(2);
  });

  it('poison effect has correct fields', () => {
    const out    = loadRpgData(FULL);
    const poison = out.statusEffects.find((e) => e.id === 'poison')!;
    expect(poison.name).toBe('Poison');
    expect(poison.duration).toBe(15000);
    expect(poison.tickDamage).toBe(5);
    expect(poison.tickMs).toBe(1000);
    expect(poison.modifiers).toHaveLength(1);
  });

  it('permanent effect has no duration', () => {
    const out   = loadRpgData(FULL);
    const haste = out.statusEffects.find((e) => e.id === 'haste')!;
    expect(haste.duration).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: scripts
// ---------------------------------------------------------------------------

describe('loadRpgData – scripts', () => {
  it('passes standalone scripts through', () => {
    const out = loadRpgData(FULL);
    expect(out.scripts).toHaveLength(1);
    expect(out.scripts[0]!.id).toBe('cutscene-intro');
  });

  it('returns empty array when no scripts provided', () => {
    const out = loadRpgData(MINIMAL);
    expect(out.scripts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: data isolation (mutations must not cross calls)
// ---------------------------------------------------------------------------

describe('loadRpgData – data isolation', () => {
  it('mutating output does not affect subsequent calls', () => {
    const first  = loadRpgData(FULL);
    const second = loadRpgData(FULL);

    // Mutate first output
    (first.initialVariables as Record<string, unknown>)['extra'] = 999;
    first.actors.push({ id: 'fake', scripts: [], triggers: [] });

    // Second output must be unaffected
    expect(second.initialVariables['extra']).toBeUndefined();
    expect(second.actors.find((a) => a.id === 'fake')).toBeUndefined();
  });
});
