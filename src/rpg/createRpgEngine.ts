import { createEngine } from '../createEngine.js';
import type { EngineOptions, EngineInstance } from '../createEngine.js';
import type { EnginePlugin } from '../types/plugin.js';

// Core plugins already in the engine
import { AudioManager } from '../plugins/audio/AudioManager.js';
import { ResourceManager } from '../plugins/data/ResourceManager.js';
import { DataManager } from '../plugins/data/DataManager.js';
import { InputManager } from '../plugins/input/InputManager.js';
import { GameStateManager } from '../plugins/gameplay/GameStateManager.js';
import { SceneManager } from '../plugins/scene/SceneManager.js';
import { EntityManager } from '../plugins/entity/EntityManager.js';
import { TilemapManager } from '../plugins/tilemap/TilemapManager.js';
import { TweenManager } from '../plugins/animation/TweenManager.js';
import { TimerManager } from '../plugins/gameplay/TimerManager.js';
import { UIManager } from '../plugins/ui/UIManager.js';
import { SaveManager } from '../plugins/save/SaveManager.js';
import { LocalStorageSaveAdapter } from '../plugins/save/LocalStorageSaveAdapter.js';
import { LocalizationManager } from '../plugins/data/LocalizationManager.js';
import { ParticleManager } from '../plugins/world/ParticleManager.js';
import { PathfindingManager } from '../plugins/world/PathfindingManager.js';
import { AchievementPlugin } from '../plugins/gameplay/AchievementPlugin.js';
import { LightingPlugin } from '../plugins/world/LightingPlugin.js';
import { FogOfWarPlugin } from '../plugins/world/FogOfWarPlugin.js';
import { MinimapPlugin } from '../plugins/ui/MinimapPlugin.js';

// RPG plugins
import { VariableStoreManager } from '../plugins/rpg/VariableStoreManager.js';
import { ScriptManager } from '../plugins/rpg/ScriptManager.js';
import { DialogueManager } from '../plugins/rpg/DialogueManager.js';
import { ActorManager } from '../plugins/rpg/ActorManager.js';
import { PlayerController } from '../plugins/rpg/PlayerController.js';
import { StatsSystem } from '../plugins/rpg/StatsSystem.js';
import { InventorySystem } from '../plugins/rpg/InventorySystem.js';
import { ShopSystem } from '../plugins/rpg/ShopSystem.js';
import { ExperienceSystem } from '../plugins/rpg/ExperienceSystem.js';
import { BattleSystem } from '../plugins/rpg/BattleSystem.js';
import { RpgMenuSystem } from '../plugins/rpg/RpgMenuSystem.js';

import type { RpgMenuSystemOptions } from '../types/rpgmenu.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Additional per-subsystem options accepted by {@link createRpgEngine}.
 *
 * All fields are optional; sensible defaults are applied for every subsystem.
 */
export interface RpgEngineOptions extends EngineOptions {
  /** Options forwarded to `RpgMenuSystem`. */
  rpgMenu?: RpgMenuSystemOptions;
  /** Options forwarded to `ShopSystem`. */
  shop?: { goldNamespace?: string; goldKey?: string };
  /**
   * Extra plugins to include *after* the built-in RPG bundle.
   */
  extraPlugins?: EnginePlugin[];
}

/**
 * Convenience type returned by {@link createRpgEngine}.
 */
export interface RpgEngineInstance extends EngineInstance {
  rpg: {
    stats: StatsSystem;
    inventory: InventorySystem;
    shop: ShopSystem;
    exp: ExperienceSystem;
    battle: BattleSystem;
    menu: RpgMenuSystem;
    variableStore: VariableStoreManager;
    script: ScriptManager;
    dialogue: DialogueManager;
    actor: ActorManager;
  };
}

// ---------------------------------------------------------------------------
// RPG_PLUGIN_BUNDLE
// ---------------------------------------------------------------------------

/**
 * Build the ordered list of all built-in RPG plugins.
 *
 * Use {@link createRpgEngine} for a one-liner; call this directly only when
 * you need to compose the plugin list manually.
 */
export function buildRpgPluginBundle(opts: Pick<RpgEngineOptions, 'rpgMenu' | 'shop'> = {}): EnginePlugin[] {
  return [
    new ResourceManager(),
    new DataManager(),
    new AudioManager(),
    new InputManager(),
    new GameStateManager(),
    new LocalStorageSaveAdapter(),
    new SaveManager(),
    new LocalizationManager(),
    new SceneManager(),
    new EntityManager(),
    new TilemapManager(),
    new TweenManager(),
    new TimerManager(),
    new ParticleManager(),
    new PathfindingManager(),
    new UIManager(),
    new AchievementPlugin(),
    new LightingPlugin(),
    new FogOfWarPlugin(),
    new MinimapPlugin(),
    new VariableStoreManager(),
    new ScriptManager(),
    new DialogueManager(),
    new ActorManager(),
    new PlayerController(),
    new StatsSystem(),
    new InventorySystem(),
    new ShopSystem(opts.shop),
    new ExperienceSystem(),
    new BattleSystem(),
    new RpgMenuSystem(opts.rpgMenu),
  ];
}

/**
 * Ordered array of default RPG plugin instances (no custom options).
 *
 * > **Note**: This is a snapshot created at module load time.
 * > For custom per-system options call {@link buildRpgPluginBundle} or
 * > {@link createRpgEngine}.
 */
export const RPG_PLUGIN_BUNDLE: EnginePlugin[] = buildRpgPluginBundle();

// ---------------------------------------------------------------------------
// createRpgEngine
// ---------------------------------------------------------------------------

/**
 * **One-liner RPG engine startup.**
 *
 * Creates and initialises the Inkshot engine with the full RPG plugin bundle
 * (audio, input, save, scenes, tilemap, dialogue, scripts, actors, player,
 * stats, inventory, shop, experience, battle, and menu) in a single call.
 *
 * ```ts
 * import { createRpgEngine } from '@inkshot/engine/rpg';
 *
 * const { core, rpg } = await createRpgEngine({
 *   container: '#app',
 *   width: 1280,
 *   height: 720,
 *   dataRoot: '/assets/',
 * });
 *
 * core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { hp: 100, hpMax: 100 } });
 * ```
 */
export async function createRpgEngine(options: RpgEngineOptions = {}): Promise<RpgEngineInstance> {
  const { rpgMenu, shop, extraPlugins = [], plugins: userPlugins = [], ...engineOptions } = options;

  const bundle = buildRpgPluginBundle({ rpgMenu, shop });
  const allPlugins: EnginePlugin[] = [...bundle, ...extraPlugins, ...(userPlugins as EnginePlugin[])];

  const base = await createEngine({ ...engineOptions, plugins: allPlugins });

  const findPlugin = <T extends EnginePlugin>(ns: string): T => {
    const p = base.plugins.find((pl) => pl.namespace === ns);
    if (!p) throw new Error(`[createRpgEngine] Plugin "${ns}" was not initialised.`);
    return p as T;
  };

  return {
    ...base,
    rpg: {
      stats:         findPlugin<StatsSystem>('stats'),
      inventory:     findPlugin<InventorySystem>('inventory'),
      shop:          findPlugin<ShopSystem>('shop'),
      exp:           findPlugin<ExperienceSystem>('exp'),
      battle:        findPlugin<BattleSystem>('battle'),
      menu:          findPlugin<RpgMenuSystem>('rpgmenu'),
      variableStore: findPlugin<VariableStoreManager>('store'),
      script:        findPlugin<ScriptManager>('script'),
      dialogue:      findPlugin<DialogueManager>('dialogue'),
      actor:         findPlugin<ActorManager>('actor'),
    },
  };
}
