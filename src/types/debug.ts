// ---------------------------------------------------------------------------
// Debug types — used by DebugPlugin
// ---------------------------------------------------------------------------

/**
 * A single entry recorded in the DebugPlugin event log.
 *
 * The log captures every `emit` / `emitSync` call that passes through the
 * `EventBus` (except events whose name starts with `debug/` to avoid
 * recursive pollution).
 */
export interface DebugEventEntry {
  /** Base event name as passed to `EventBus.emit` / `emitSync`. */
  name: string;
  /** Raw parameters object (may be an empty object). */
  params: unknown;
  /** `performance.now()` timestamp at the moment the event was dispatched. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

/**
 * Options accepted by the {@link DebugPlugin} constructor.
 */
export interface DebugPluginOptions {
  /**
   * Maximum number of events to retain in the circular event log.
   * The oldest entry is removed when the limit is exceeded.
   * Defaults to `200`.
   */
  maxEventLogSize?: number;

  /**
   * Whether the debug overlay starts visible.
   * Defaults to `false` (invisible until toggled).
   */
  visible?: boolean;

  /**
   * Keyboard keys that toggle the overlay on / off.
   *
   * Matched against `KeyboardEvent.key` (case-sensitive).
   * Defaults to `['\`', 'F12']`.
   */
  toggleKeys?: string[];

  /**
   * Number of frame-time samples to keep for the FPS line chart.
   * Defaults to `60`.
   */
  fpsHistorySize?: number;
}

// ---------------------------------------------------------------------------
// Event param / output types
// ---------------------------------------------------------------------------

/** Params for `debug/overlay:toggle`. */
export interface DebugOverlayToggleParams {
  /**
   * Explicit target visibility.
   * When omitted the current visibility is flipped.
   */
  visible?: boolean;
}

/** Output for `debug/overlay:toggle` and `debug/overlay:visible`. */
export interface DebugOverlayVisibleOutput {
  visible: boolean;
}

/** Params for `debug/event-log:filter`. */
export interface DebugEventLogFilterParams {
  /**
   * Substring to filter by (matched case-insensitively against the event name).
   * Pass an empty string to clear the filter and show all events.
   */
  filter: string;
}

/** Output for `debug/event-log:get`. */
export interface DebugEventLogGetOutput {
  /**
   * Filtered event log entries (most recent entry last).
   * The returned array is a shallow copy of the internal buffer.
   */
  entries: DebugEventEntry[];
}
