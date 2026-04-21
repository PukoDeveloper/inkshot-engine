import type { ItemDef, ItemCategory } from '../../types/inventory.js';
import type { RmItem, RmWeapon, RmArmor } from '../../types/rpgimporter.js';

// RPG Maker param index → stat name
const PARAM_NAMES = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'] as const;

/**
 * Convert `Items.json`, `Weapons.json`, and `Armors.json` into engine
 * {@link ItemDef} arrays.
 */
export function parseItems(
  items: Array<RmItem | null>,
  weapons: Array<RmWeapon | null>,
  armors: Array<RmArmor | null>,
): ItemDef[] {
  const result: ItemDef[] = [];

  for (const item of items) {
    if (!item || item.id === 0) continue;
    const category: ItemCategory = item.itypeId === 2 ? 'key' : 'item';
    result.push({
      id: `item_${item.id}`,
      name: item.name,
      description: item.description,
      category,
      price: item.price ?? 0,
      maxStack: 99,
    });
  }

  for (const weapon of weapons) {
    if (!weapon || weapon.id === 0) continue;
    const mods = _buildParamMods(weapon.params);
    result.push({
      id: `weapon_${weapon.id}`,
      name: weapon.name,
      description: weapon.description,
      category: 'weapon',
      price: weapon.price ?? 0,
      maxStack: 1,
      equipModifiers: mods,
    });
  }

  for (const armor of armors) {
    if (!armor || armor.id === 0) continue;
    const mods = _buildParamMods(armor.params);
    result.push({
      id: `armor_${armor.id}`,
      name: armor.name,
      description: armor.description,
      category: armor.atypeId === 5 ? 'accessory' : 'armor',
      price: armor.price ?? 0,
      maxStack: 1,
      equipModifiers: mods,
    });
  }

  return result;
}

function _buildParamMods(params: number[] | undefined): ItemDef['equipModifiers'] {
  if (!Array.isArray(params)) return [];
  return params
    .map((value, idx) => ({ stat: PARAM_NAMES[idx] ?? `param${idx}`, value, mode: 'add' as const }))
    .filter((m) => m.value !== 0);
}
