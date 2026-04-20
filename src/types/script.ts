import type { Core } from '../core/Core.js';

// ---------------------------------------------------------------------------
// Script data format
// ---------------------------------------------------------------------------

/**
 * A single command node in a script.
 *
 * Every node **must** have a `cmd` field that identifies the command to run.
 * All other fields are forwarded to the command handler as-is, so the shape
 * of extra fields is entirely command-specific.
 *
 * @example
 * ```ts
 * const nodes: ScriptNode[] = [
 *   { cmd: 'say', text: 'Hello!', speaker: 'Alice' },
 *   { cmd: 'choices', choices: ['Wave back', 'Stay silent'], var: 'choice' },
 *   { cmd: 'if', var: 'choice', value: 0, jump: 'wave' },
 *   { cmd: 'jump', target: 'end' },
 *   { cmd: 'label', name: 'wave' },
 *   { cmd: 'say', text: 'Alice smiles.' },
 *   { cmd: 'label', name: 'end' },
 *   { cmd: 'end' },
 * ];
 * ```
 */
export interface ScriptNode {
  /** The name of the command to execute. */
  readonly cmd: string;
  /** Command-specific fields. The shape depends on the registered handler. */
  readonly [key: string]: unknown;
}

/**
 * A complete script definition: a unique identifier plus an ordered list of
 * command nodes.
 *
 * Scripts are registered with the engine via `script/define` and started via
 * `script/run`.
 */
export interface ScriptDef {
  /** Unique identifier used to reference this script (e.g. via `script/run`). */
  readonly id: string;
  /** Ordered list of command nodes that form the script body. */
  readonly nodes: readonly ScriptNode[];
}

// ---------------------------------------------------------------------------
// Command handler API
// ---------------------------------------------------------------------------

/**
 * Execution context passed to every command handler.
 *
 * Handlers can:
 * - Read the current node and script-local variables.
 * - Alter the execution cursor via {@link ScriptContext.jumpTo}.
 * - Terminate the script early via {@link ScriptContext.stop}.
 * - Register cleanup logic via {@link ScriptContext.onStop} (called when the
 *   script is stopped before the handler's returned promise resolves).
 */
export interface ScriptContext {
  /** The central engine core — gives access to the event bus and other systems. */
  readonly core: Core;
  /** The currently-running script definition. */
  readonly script: ScriptDef;
  /** The command node currently being executed. */
  readonly node: ScriptNode;
  /** Zero-based index of `node` within `script.nodes`. */
  readonly index: number;
  /**
   * Mutable key-value store that persists for the lifetime of this script run.
   *
   * Use it to pass data between commands — for example, storing the index of
   * the choice the player made so a later `if` command can branch on it.
   */
  readonly vars: Record<string, unknown>;

  /**
   * Move the execution cursor to `index`.
   *
   * The next command to run will be `script.nodes[index]`.
   * An out-of-range index ends the script normally (same as reaching the last node).
   */
  jumpTo(index: number): void;

  /**
   * Immediately stop script execution.
   *
   * Equivalent to calling `emitSync('script/stop', {})` but synchronous and
   * scoped to this run.  `script/ended` is emitted after all cleanup.
   */
  stop(): void;

  /**
   * Register a cleanup function that is called when the script is stopped
   * while this handler's returned promise is still pending.
   *
   * Use this to unregister event listeners and resolve/reject pending promises
   * so the async execution frame is not leaked.
   *
   * @example
   * ```ts
   * const myCommand: ScriptCommandHandler = (ctx) =>
   *   new Promise<void>((resolve) => {
   *     const off = ctx.core.events.once('myNs', 'some/event', resolve);
   *     ctx.onStop(() => { off(); resolve(); });
   *   });
   * ```
   */
  onStop(fn: () => void): void;
}

/**
 * A function that handles one script command.
 *
 * - Return `void` (synchronously) to advance to the next command immediately.
 * - Return `Promise<void>` to suspend the script until the promise settles.
 *   Register cleanup via `ctx.onStop` to avoid leaked async frames when the
 *   script is stopped before the promise resolves.
 */
export type ScriptCommandHandler = (ctx: ScriptContext) => void | Promise<void>;

// ---------------------------------------------------------------------------
// EventBus params / output  (commands sent TO ScriptManager)
// ---------------------------------------------------------------------------

/** Parameters for `script/define`. */
export interface ScriptDefineParams {
  /**
   * The script to register.  If a script with the same `id` already exists it
   * is silently overwritten.
   */
  readonly script: ScriptDef;
}

/** Parameters for `script/run`. */
export interface ScriptRunParams {
  /** ID of the script to run. Must have been registered via `script/define`. */
  readonly id: string;
  /**
   * Optional seed values for the script-local variable store.
   * Useful for passing initial state into a script (e.g. `{ npcId: 'guard-1' }`).
   */
  readonly vars?: Record<string, unknown>;
}

/** Parameters for `script/stop`. Stops the currently running script. */
export type ScriptStopParams = Record<string, never>;

/**
 * Parameters for `script/register-command`.
 *
 * Registers (or overwrites) a custom command handler.  Other plugins should
 * use this event during their own `init()` to add new commands.
 *
 * @example
 * ```ts
 * core.events.emitSync<ScriptRegisterCommandParams>('script/register-command', {
 *   cmd: 'play-sound',
 *   handler: (ctx) => {
 *     ctx.core.events.emitSync('audio/play', { key: ctx.node.key as string });
 *   },
 * });
 * ```
 */
export interface ScriptRegisterCommandParams {
  /** Command name that appears in the `cmd` field of script nodes. */
  readonly cmd: string;
  /** The handler to invoke when this command is encountered. */
  readonly handler: ScriptCommandHandler;
}

/** Output for `script/state:get`. */
export interface ScriptStateGetOutput {
  /** `true` when a script is currently running. */
  running: boolean;
  /** ID of the currently running script, or `null` when idle. */
  scriptId: string | null;
  /**
   * Zero-based index of the node currently being executed, or `null` when no
   * script is running.
   */
  nodeIndex: number | null;
}

// ---------------------------------------------------------------------------
// Notifications emitted BY ScriptManager
// ---------------------------------------------------------------------------

/** Emitted when a script begins execution. */
export interface ScriptStartedParams {
  /** ID of the script that started. */
  readonly id: string;
}

/** Emitted when a script finishes (all nodes executed or `stop()` called). */
export interface ScriptEndedParams {
  /** ID of the script that ended. */
  readonly id: string;
}

/**
 * Emitted once per command node, immediately before the handler executes.
 *
 * Useful for debugging, recording script state in save data, or building
 * script-replay tooling.
 */
export interface ScriptStepParams {
  /** ID of the running script. */
  readonly id: string;
  /** Zero-based index of the command about to execute. */
  readonly index: number;
  /** Name of the command about to execute. */
  readonly cmd: string;
}

/** Emitted when a command handler throws an unhandled error. */
export interface ScriptErrorParams {
  /** ID of the running script. */
  readonly id: string;
  /** Zero-based index of the failing command. */
  readonly index: number;
  /** Name of the failing command. */
  readonly cmd: string;
  /** Error message. */
  readonly message: string;
}
