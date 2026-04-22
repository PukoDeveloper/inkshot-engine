import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { InputActionTriggeredParams } from '../../types/input.js';
import type {
  RpgMenuPage,
  RpgMenuSystemOptions,
  RpgMenuOpenParams,
  RpgMenuPageSetParams,
  RpgMenuStateGetOutput,
  RpgMenuPartySetParams,
  RpgMenuOpenedParams,
  RpgMenuClosedParams,
  RpgMenuPageChangedParams,
} from '../../types/rpgmenu.js';

// ---------------------------------------------------------------------------
// RpgMenuSystem
// ---------------------------------------------------------------------------

/**
 * Plugin that manages the **RPG pause-menu state machine**.
 *
 * This plugin is UI-agnostic: it manages the open/closed state and the
 * current page, and emits events that a separate UI layer can react to.
 *
 * ### Default key bindings
 * - `'menu'`   action → opens the main menu
 * - `'cancel'` action → goes back / closes the menu
 *
 * ### EventBus API
 *
 * | Event                  | Params / Output                                    |
 * |------------------------|----------------------------------------------------|
 * | `rpgmenu/open`         | `RpgMenuOpenParams`                                |
 * | `rpgmenu/close`        | `{}`                                               |
 * | `rpgmenu/page:set`     | `RpgMenuPageSetParams`                             |
 * | `rpgmenu/state:get`    | `{} → RpgMenuStateGetOutput`                       |
 * | `rpgmenu/party:set`    | `RpgMenuPartySetParams`                            |
 * | `rpgmenu/opened`       | `RpgMenuOpenedParams` (notification)               |
 * | `rpgmenu/closed`       | `RpgMenuClosedParams` (notification)               |
 * | `rpgmenu/page:changed` | `RpgMenuPageChangedParams` (notification)          |
 */
export class RpgMenuSystem implements EnginePlugin {
  readonly namespace = 'rpgmenu';
  readonly dependencies = ['game'] as const;
  readonly editorMeta = {
    displayName: 'RPG Menu System',
    icon: 'rpgmenu',
    description: 'Manages the main RPG status/equipment menu with page navigation.',
    commands: [
      'rpgmenu/open', 'rpgmenu/close', 'rpgmenu/page:set', 'rpgmenu/party:set', 'rpgmenu/state:get',
    ] as const,
  };

  private _open = false;
  private _page: RpgMenuPage = 'main';

  private readonly _openAction: string;
  private readonly _cancelAction: string;

  constructor(opts: RpgMenuSystemOptions = {}) {
    this._openAction   = opts.openAction   ?? 'menu';
    this._cancelAction = opts.cancelAction ?? 'cancel';
  }

  init(core: Core): void {
    core.events.on<RpgMenuOpenParams>(this.namespace, 'rpgmenu/open', (p) => {
      this._openMenu(core, p.page ?? 'main');
    });

    core.events.on(this.namespace, 'rpgmenu/close', () => {
      this._closeMenu(core);
    });

    core.events.on<RpgMenuPageSetParams>(this.namespace, 'rpgmenu/page:set', (p) => {
      if (!this._open) return;
      const previous = this._page;
      this._page = p.page;
      core.events.emitSync<RpgMenuPageChangedParams>('rpgmenu/page:changed', { page: this._page, previous });
    });

    core.events.on<Record<string, never>, RpgMenuStateGetOutput>(this.namespace, 'rpgmenu/state:get', (_p, output) => {
      output.open = this._open;
      output.page = this._page;
    });

    core.events.on<RpgMenuPartySetParams>(this.namespace, 'rpgmenu/party:set', (_p) => {
      // Party list stored externally; acknowledged for API completeness.
    });

    // Input integration
    core.events.on<InputActionTriggeredParams>(this.namespace, 'input/action:triggered', (p) => {
      if (p.state !== 'pressed') return;

      if (p.action === this._openAction && !this._open) {
        const { output: gameOut } = core.events.emitSync<Record<string, never>, { state?: string }>('game/state:get', {});
        if (gameOut?.state === 'playing' || gameOut?.state === undefined) {
          this._openMenu(core, 'main');
        }
        return;
      }

      if (p.action === this._cancelAction && this._open) {
        if (this._page !== 'main') {
          const previous = this._page;
          this._page = 'main';
          core.events.emitSync<RpgMenuPageChangedParams>('rpgmenu/page:changed', { page: 'main', previous });
        } else {
          this._closeMenu(core);
        }
      }
    });
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _openMenu(core: Core, page: RpgMenuPage): void {
    if (this._open) return;
    this._open = true;
    this._page = page;
    core.events.emitSync('game/state:set', { state: 'paused' });
    core.events.emitSync<RpgMenuOpenedParams>('rpgmenu/opened', { page });
  }

  private _closeMenu(core: Core): void {
    if (!this._open) return;
    this._open = false;
    core.events.emitSync('game/state:set', { state: 'playing' });
    core.events.emitSync<RpgMenuClosedParams>('rpgmenu/closed', {});
  }
}
