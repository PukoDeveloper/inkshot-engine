import type { Container } from 'pixi.js';
import type { Core } from '../core/Core.js';

// ---------------------------------------------------------------------------
// Widget interface
// ---------------------------------------------------------------------------

/**
 * The contract every UI widget must satisfy.
 *
 * A widget is a self-contained, Pixi-backed display unit managed by the
 * {@link UIManager}.  Each widget owns a Pixi `Container` that the manager
 * mounts on the `ui` render layer.
 *
 * ### Lifecycle (managed by UIManager)
 * 1. Widget is **created** via `ui/create` → factory is called → container added to ui layer.
 * 2. `show()` / `hide()` toggle visibility without destroying the container.
 * 3. `destroy()` should remove children and release memory; the manager removes
 *    the container from the layer afterwards.
 *
 * ### Optional hooks
 * - `update(props)` – called by `ui/update` to mutate the widget's appearance.
 * - `onLocaleChanged(locale)` – called by UIManager whenever `i18n/changed` fires.
 */
export interface UIWidget {
  /** Unique widget identifier (set by caller or auto-generated). */
  readonly id: string;
  /** Registered type name (e.g. `'button'`, `'label'`, `'myGame/healthbar'`). */
  readonly type: string;
  /** Root Pixi container.  UIManager mounts this on the ui layer. */
  readonly container: Container;

  /** Make the widget visible. */
  show(): void;
  /** Make the widget invisible (does NOT destroy it). */
  hide(): void;
  /** Release all resources owned by the widget. */
  destroy(): void;

  /**
   * Apply a partial property update.
   * The shape of `props` is widget-specific.
   * Called by `ui/update`; no-op if the widget doesn't need live updates.
   */
  update?(props: Record<string, unknown>): void;

  /**
   * Called after `i18n/changed` fires so the widget can re-translate its text.
   * Only implement this if the widget displays i18n-sourced text.
   */
  onLocaleChanged?(locale: string): void;

  /**
   * Called after `renderer/resize` fires so the widget can adapt its layout
   * to the new canvas dimensions.
   *
   * UIManager automatically re-applies anchor-based positioning for anchored
   * widgets before calling this hook.  Implement it only when the widget needs
   * additional resize-aware adjustments (e.g. resizing a background graphic or
   * re-wrapping text).
   */
  onResize?(width: number, height: number): void;
}

// ---------------------------------------------------------------------------
// Widget factory
// ---------------------------------------------------------------------------

/**
 * A function that creates a new {@link UIWidget} instance.
 *
 * Register custom factories with `ui/register` to extend the widget library.
 *
 * @example
 * ```ts
 * const healthBarFactory: UIWidgetFactory<{ maxHp: number; hp: number }> = (id, props, core) => {
 *   const container = new Container();
 *   // … build your display objects …
 *   return { id, type: 'myGame/healthbar', container, show() {…}, hide() {…}, destroy() {…} };
 * };
 *
 * core.events.emitSync('ui/register', { type: 'myGame/healthbar', factory: healthBarFactory });
 * ```
 */
export type UIWidgetFactory<P extends Record<string, unknown> = Record<string, unknown>> = (
  id: string,
  props: P,
  core: Core,
) => UIWidget;

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

/**
 * Named anchor positions for automatic viewport-relative placement.
 *
 * When a widget is created with an `anchor`, UIManager positions it using the
 * current viewport size plus the `x` / `y` pixel offsets supplied in
 * {@link UICreateParams}.
 *
 * @example
 * ```ts
 * core.events.emitSync('ui/create', {
 *   type: 'label',
 *   id: 'score',
 *   text: '0',
 *   anchor: 'top-right',
 *   x: -16,   // 16 px from the right edge
 *   y: 16,    // 16 px from the top
 * });
 * ```
 */
export type UIAnchor =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

// ---------------------------------------------------------------------------
// Core events
// ---------------------------------------------------------------------------

/**
 * Parameters for `ui/register`.
 *
 * Registers a {@link UIWidgetFactory} under the given `type` name.
 * Re-registering an existing type replaces the factory.
 *
 * @example
 * ```ts
 * core.events.emitSync<UIRegisterParams>('ui/register', {
 *   type: 'myGame/dialog',
 *   factory: myDialogFactory,
 * });
 * ```
 */
export interface UIRegisterParams {
  /** Unique type name (e.g. `'button'`, `'myGame/healthbar'`). */
  readonly type: string;
  /** Factory function that produces widget instances. */
  readonly factory: UIWidgetFactory;
}

/** Output for `ui/register`. */
export interface UIRegisterOutput {
  /** `true` if the type was newly registered; `false` if it replaced an existing entry. */
  registered: boolean;
}

/**
 * Parameters for `ui/create`.
 *
 * `type` and optional `id` are required; all other fields are forwarded to the
 * factory as the `props` argument.
 */
export interface UICreateParams extends Record<string, unknown> {
  /** Widget type name (must be registered via `ui/register` or built-in). */
  readonly type: string;
  /**
   * Stable identifier for this widget instance.
   * Defaults to an auto-generated string if omitted.
   * Duplicate IDs throw immediately.
   */
  readonly id?: string;
  /**
   * Viewport-relative anchor for automatic positioning.
   * Combined with `x` / `y` pixel offsets.
   */
  readonly anchor?: UIAnchor;
  /** Pixel offset in the X direction from the anchor point (default `0`). */
  readonly x?: number;
  /** Pixel offset in the Y direction from the anchor point (default `0`). */
  readonly y?: number;
}

/** Output for `ui/create`. */
export interface UICreateOutput {
  /** The newly created widget instance. */
  widget: UIWidget;
}

/** Parameters for `ui/show`. */
export interface UIShowParams {
  /** The id of the widget to show. */
  readonly id: string;
}

/** Parameters for `ui/hide`. */
export interface UIHideParams {
  /** The id of the widget to hide. */
  readonly id: string;
}

/** Parameters for `ui/destroy`. */
export interface UIDestroyParams {
  /** The id of the widget to destroy and remove from the layer. */
  readonly id: string;
}

/**
 * Parameters for `ui/update`.
 *
 * Passes a partial set of props to the widget's `update()` method.
 * Fields other than `id` are forwarded as-is.
 */
export interface UIUpdateParams extends Record<string, unknown> {
  /** The id of the widget to update. */
  readonly id: string;
}

/** Parameters for `ui/get`. */
export interface UIGetParams {
  /** The id of the widget to retrieve. */
  readonly id: string;
}

/** Output for `ui/get`. */
export interface UIGetOutput {
  /** The widget instance, or `undefined` if no widget with this id exists. */
  widget: UIWidget | undefined;
}

// ---------------------------------------------------------------------------
// Notification params (emitted by UIManager)
// ---------------------------------------------------------------------------

/** Emitted after a widget is successfully created. */
export interface UICreatedParams {
  readonly id: string;
  readonly type: string;
  readonly widget: UIWidget;
}

/** Emitted after a widget's visibility is set to `true`. */
export interface UIShownParams {
  readonly id: string;
}

/** Emitted after a widget's visibility is set to `false`. */
export interface UIHiddenParams {
  readonly id: string;
}

/** Emitted after a widget is destroyed and removed from the layer. */
export interface UIDestroyedParams {
  readonly id: string;
}

// ---------------------------------------------------------------------------
// Built-in widget props
// ---------------------------------------------------------------------------

/** Props for the built-in `label` widget. */
export interface UILabelProps extends UICreateParams {
  readonly type: 'label';
  /** Display text (used when `i18nKey` is absent). */
  readonly text?: string;
  /** i18n translation key (looked up via `i18n/t`). */
  readonly i18nKey?: string;
  /** Interpolation arguments forwarded to `i18n/t`. */
  readonly i18nArgs?: Record<string, string>;
  readonly fontSize?: number;
  /** Hex colour, e.g. `0xffffff`. */
  readonly color?: number;
  readonly fontFamily?: string;
  readonly align?: 'left' | 'center' | 'right';
  /** Maximum text wrap width in pixels (enables word-wrap when set). */
  readonly wordWrapWidth?: number;
}

/** Props for the built-in `button` widget. */
export interface UIButtonProps extends UICreateParams {
  readonly type: 'button';
  readonly text?: string;
  readonly i18nKey?: string;
  readonly i18nArgs?: Record<string, string>;
  /** Button width in pixels. Default: `120`. */
  readonly width?: number;
  /** Button height in pixels. Default: `40`. */
  readonly height?: number;
  readonly backgroundColor?: number;
  /** Background colour when the pointer hovers over the button. */
  readonly hoverColor?: number;
  /** Background colour while the button is pressed. */
  readonly pressColor?: number;
  readonly textColor?: number;
  readonly fontSize?: number;
  readonly cornerRadius?: number;
  /** Called when the button is clicked / tapped. */
  readonly onClick?: () => void;
}

/** Props for the built-in `panel` widget. */
export interface UIPanelProps extends UICreateParams {
  readonly type: 'panel';
  readonly width: number;
  readonly height: number;
  readonly backgroundColor?: number;
  readonly borderColor?: number;
  readonly borderWidth?: number;
  readonly cornerRadius?: number;
  readonly alpha?: number;
}

/** Props for the built-in `progressbar` widget. */
export interface UIProgressBarProps extends UICreateParams {
  readonly type: 'progressbar';
  readonly width: number;
  /** Track height in pixels. Default: `16`. */
  readonly height?: number;
  /** Current fill ratio in `[0, 1]`. Default: `0`. */
  readonly value?: number;
  readonly backgroundColor?: number;
  readonly foregroundColor?: number;
  readonly direction?: 'horizontal' | 'vertical';
  readonly cornerRadius?: number;
}

/** Props for the built-in `slider` widget. */
export interface UISliderProps extends UICreateParams {
  readonly type: 'slider';
  readonly width: number;
  /** Track height in pixels. Default: `8`. */
  readonly height?: number;
  /** Initial value in `[0, 1]`. Default: `0`. */
  readonly value?: number;
  readonly trackColor?: number;
  readonly thumbColor?: number;
  /** Thumb radius in pixels. Default: `10`. */
  readonly thumbRadius?: number;
  /** Called with the new value whenever the slider moves. */
  readonly onChange?: (value: number) => void;
}

/** Props for the built-in `scrollview` widget. */
export interface UIScrollViewProps extends UICreateParams {
  readonly type: 'scrollview';
  readonly width: number;
  readonly height: number;
  readonly backgroundColor?: number;
}

/** Props for the built-in `dialog` widget. */
export interface UIDialogProps extends UICreateParams {
  readonly type: 'dialog';
  readonly title?: string;
  readonly titleI18nKey?: string;
  readonly message?: string;
  readonly messageI18nKey?: string;
  /** Dialog panel width in pixels. Default: `320`. */
  readonly width?: number;
  /** Dialog panel height in pixels. Default: `200`. */
  readonly height?: number;
  /** Confirm button label. Default: `'OK'`. */
  readonly confirmText?: string;
  readonly confirmI18nKey?: string;
  /** Cancel button label. Default: `'Cancel'`. */
  readonly cancelText?: string;
  readonly cancelI18nKey?: string;
  /** Called when the confirm button is clicked. */
  readonly onConfirm?: () => void;
  /** Called when the cancel button is clicked. */
  readonly onCancel?: () => void;
  /**
   * When `true` (default) a semi-transparent overlay covers the entire screen
   * behind the dialog.
   */
  readonly modal?: boolean;
}

/**
 * Props for the built-in `dialoguebox` widget.
 *
 * The widget subscribes to `dialogue/*` events and renders the active speaker,
 * body text (with typewriter effect), portrait slot, choice buttons, and a
 * continue indicator.
 */
export interface UIDialogueBoxProps extends UICreateParams {
  readonly type: 'dialoguebox';
  /** Panel width in pixels. Default: `600`. */
  readonly width?: number;
  /** Panel height in pixels. Default: `160`. */
  readonly height?: number;
  /** Panel background colour. Default: `0x1a1a2e`. */
  readonly backgroundColor?: number;
  /** Body text colour. Default: `0xffffff`. */
  readonly textColor?: number;
  /** Speaker name colour. Default: `0xffd700`. */
  readonly nameColor?: number;
  /** Panel corner radius. Default: `8`. */
  readonly cornerRadius?: number;
  /**
   * When `true` (default) a 64×64 portrait slot is reserved on the left side
   * of the panel.
   */
  readonly showPortrait?: boolean;
}

/** Props for the built-in `stack` (StackPanel) widget. */
export interface UIStackPanelProps extends UICreateParams {
  readonly type: 'stack';
  /** Layout direction. Default: `'vertical'`. */
  readonly direction?: 'horizontal' | 'vertical';
  /** Pixel gap between children. Default: `8`. */
  readonly spacing?: number;
  /** Inner padding applied before laying out children. */
  readonly padding?: {
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  };
  /** Child alignment along the cross-axis. Default: `'start'`. */
  readonly align?: 'start' | 'center' | 'end';
}

// ---------------------------------------------------------------------------
// ScrollView child management
// ---------------------------------------------------------------------------

/**
 * A {@link UIWidget} that also exposes child management and manual scrolling.
 * Returned by the built-in `scrollview` factory.
 */
export interface UIScrollViewWidget extends UIWidget {
  /** Add a child widget into the scrollable content area. */
  addChild(widget: UIWidget): void;
  /** Remove a child widget from the scrollable content area. */
  removeChild(id: string): void;
  /**
   * Programmatically set the scroll offset.
   * `y` controls vertical scroll (negative = scrolled down).
   */
  setScroll(x: number, y: number): void;
}

// ---------------------------------------------------------------------------
// StackPanel child management
// ---------------------------------------------------------------------------

/**
 * A {@link UIWidget} that stacks children linearly and re-flows on each change.
 * Returned by the built-in `stack` factory.
 */
export interface UIStackPanelWidget extends UIWidget {
  /** Append a child widget and re-flow the layout. */
  addChild(widget: UIWidget): void;
  /** Remove a child widget by id and re-flow the layout. */
  removeChild(id: string): void;
  /** Re-compute all child positions (called automatically after add/remove). */
  reflow(): void;
}
