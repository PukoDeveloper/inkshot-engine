// ---------------------------------------------------------------------------
// RPG Menu types
// ---------------------------------------------------------------------------

/** Which page of the RPG menu is currently visible. */
export type RpgMenuPage = 'main' | 'status' | 'equipment' | 'items' | 'save' | string;

/** Options accepted by `RpgMenuSystem`. */
export interface RpgMenuSystemOptions {
  /**
   * Input action name used to open the main menu.
   * Defaults to `'menu'`.
   */
  readonly openAction?: string;
  /**
   * Input action name used to close / go back in the menu.
   * Defaults to `'cancel'`.
   */
  readonly cancelAction?: string;
  /**
   * Party actor IDs to show on the status / equipment screens.
   * Can be updated at runtime via `rpgmenu/party:set`.
   */
  readonly partyIds?: readonly string[];
  /**
   * Gold namespace used to look up the current gold value.
   * Expects `VariableStoreManager` to have `{ [goldKey]: number }` in this namespace.
   * Defaults to namespace `'player'`, key `'gold'`.
   */
  readonly goldNamespace?: string;
  readonly goldKey?: string;
}

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `rpgmenu/open`. */
export interface RpgMenuOpenParams {
  readonly page?: RpgMenuPage;
}

/** Parameters for `rpgmenu/close`. */
export interface RpgMenuCloseParams {}

/** Parameters for `rpgmenu/page:set`. */
export interface RpgMenuPageSetParams {
  readonly page: RpgMenuPage;
}

/** Output for `rpgmenu/state:get`. */
export interface RpgMenuStateGetOutput {
  open: boolean;
  page: RpgMenuPage;
}

/** Parameters for `rpgmenu/party:set`. */
export interface RpgMenuPartySetParams {
  readonly partyIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface RpgMenuOpenedParams {
  readonly page: RpgMenuPage;
}

export interface RpgMenuClosedParams {}

export interface RpgMenuPageChangedParams {
  readonly page: RpgMenuPage;
  readonly previous: RpgMenuPage;
}
