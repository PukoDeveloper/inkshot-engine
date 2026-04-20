import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  ScriptDef,
  ScriptContext,
  ScriptCommandHandler,
  ScriptDefineParams,
  ScriptRunParams,
  ScriptStopParams,
  ScriptRegisterCommandParams,
  ScriptStateGetOutput,
  ScriptStartedParams,
  ScriptEndedParams,
  ScriptStepParams,
  ScriptErrorParams,
} from '../types/script.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RunState {
  readonly script: ScriptDef;
  readonly vars: Record<string, unknown>;
  /** Cursor: index of the next node to execute. Mutated by jumpTo(). */
  nextIndex: number;
  /** Set to true to break out of the execution loop after the current command. */
  stopped: boolean;
  /**
   * Cleanup functions registered by command handlers via ctx.onStop().
   * Called by _stop() so that pending promises are resolved and listeners
   * are unregistered before the run frame is abandoned.
   */
  readonly stopResolvers: Array<() => void>;
}

// ---------------------------------------------------------------------------
// ScriptManager
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that executes scripts defined as ordered lists of command
 * nodes.
 *
 * `ScriptManager` is an open-ended execution engine: it ships with a small set
 * of built-in commands and is designed so that **any plugin or game code** can
 * extend it by registering additional commands — either at construction time or
 * dynamically via the `script/register-command` event.
 *
 * ---
 *
 * ### Script format
 *
 * A script is a {@link ScriptDef} with a unique `id` and an array of
 * {@link ScriptNode} objects.  Each node **must** have a `cmd` field; all
 * other fields are forwarded to the matching handler.
 *
 * ```ts
 * import type { ScriptDef } from 'inkshot-engine';
 *
 * const introScript: ScriptDef = {
 *   id: 'intro',
 *   nodes: [
 *     { cmd: 'say',     text: 'Welcome!', speaker: 'Narrator' },
 *     { cmd: 'choices', choices: ['Continue', 'Quit'], var: 'choice' },
 *     { cmd: 'if',      var: 'choice', value: 1, jump: 'quit' },
 *     { cmd: 'say',     text: 'The adventure begins…' },
 *     { cmd: 'jump',    target: 'done' },
 *     { cmd: 'label',   name: 'quit' },
 *     { cmd: 'say',     text: 'See you next time.' },
 *     { cmd: 'label',   name: 'done' },
 *     { cmd: 'end' },
 *   ],
 * };
 * ```
 *
 * ---
 *
 * ### Built-in commands
 *
 * | Command   | Fields                                             | Description                                 |
 * |-----------|----------------------------------------------------|---------------------------------------------|
 * | `label`   | `name` (string)                                    | Position marker (no-op at runtime)          |
 * | `jump`    | `target` (string)                                  | Unconditional jump to a label               |
 * | `if`      | `var`, `value`, `jump`                             | Jump to a label when `vars[var] === value`  |
 * | `set`     | `var` (string), `value`                            | Write a value into the script variable store|
 * | `wait`    | `ms` (number)                                      | Pause execution for `ms` milliseconds       |
 * | `emit`    | `event` (string), `params?` (object)               | Emit a custom event synchronously           |
 * | `say`     | `text?`, `speaker?`, `portrait?`, `speed?`, …      | Show dialogue text, wait for advance        |
 * | `choices` | `choices` (string[]), `prompt?`, `var?`            | Show choices, store picked index in `var`   |
 * | `end`     | —                                                  | Close the dialogue session                  |
 *
 * ---
 *
 * ### Extensibility
 *
 * Register custom commands at construction time:
 * ```ts
 * const scripts = new ScriptManager({
 *   commands: {
 *     'play-sfx': (ctx) => {
 *       ctx.core.events.emitSync('audio/play', { key: ctx.node.key as string });
 *     },
 *   },
 * });
 * ```
 *
 * Or dynamically after `init()`:
 * ```ts
 * core.events.emitSync('script/register-command', {
 *   cmd: 'shake-camera',
 *   handler: async (ctx) => {
 *     await ctx.core.events.emit('camera/shake', { intensity: 10, duration: 300 });
 *   },
 * });
 * ```
 *
 * ---
 *
 * ### Events handled
 *
 * | Event                     | Description                                         |
 * |---------------------------|-----------------------------------------------------|
 * | `script/define`           | Register (or overwrite) a script definition         |
 * | `script/run`              | Start running a registered script                   |
 * | `script/stop`             | Stop the currently running script                   |
 * | `script/register-command` | Register a new command handler                      |
 * | `script/state:get`        | Query the current execution state                   |
 *
 * ### Events emitted
 *
 * | Event            | When                                               |
 * |------------------|----------------------------------------------------|
 * | `script/started` | A script begins execution                          |
 * | `script/ended`   | A script finishes normally or is stopped           |
 * | `script/step`    | Before each command node executes                  |
 * | `script/error`   | A command handler throws an unhandled error        |
 *
 * @example
 * ```ts
 * import { createEngine, ScriptManager, DialogueManager } from 'inkshot-engine';
 * import type { ScriptDef } from 'inkshot-engine';
 *
 * const scripts = new ScriptManager();
 * const { core } = await createEngine({
 *   plugins: [new DialogueManager(), scripts],
 * });
 *
 * core.events.emitSync('script/define', {
 *   script: {
 *     id: 'greet',
 *     nodes: [
 *       { cmd: 'say', text: 'Hello!', speaker: 'Guard' },
 *       { cmd: 'end' },
 *     ],
 *   },
 * });
 *
 * core.events.emitSync('script/run', { id: 'greet' });
 * ```
 */
export class ScriptManager implements EnginePlugin {
  readonly namespace = 'script';

  private _core: Core | null = null;

  /** Registry of all known script definitions, keyed by script.id. */
  private readonly _scripts = new Map<string, ScriptDef>();

  /** Registry of all command handlers (built-in + externally registered). */
  private readonly _commands = new Map<string, ScriptCommandHandler>();

  /** The active execution state, or `null` when no script is running. */
  private _running: RunState | null = null;

  /**
   * @param options.commands  Additional commands to register at construction
   *   time.  These are merged with (and may override) built-in commands, so
   *   you can replace a built-in with a custom implementation if needed.
   */
  constructor(options: { commands?: Record<string, ScriptCommandHandler> } = {}) {
    this._registerBuiltinCommands();
    for (const [cmd, handler] of Object.entries(options.commands ?? {})) {
      this._commands.set(cmd, handler);
    }
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    // ── script/define ─────────────────────────────────────────────────────
    events.on<ScriptDefineParams>(this.namespace, 'script/define', (params) => {
      this._scripts.set(params.script.id, params.script);
    });

    // ── script/run ────────────────────────────────────────────────────────
    events.on<ScriptRunParams>(this.namespace, 'script/run', (params) => {
      const script = this._scripts.get(params.id);
      if (!script) {
        console.warn(`[ScriptManager] script/run: script "${params.id}" is not defined.`);
        return;
      }
      void this._execute(script, { ...(params.vars ?? {}) });
    });

    // ── script/stop ───────────────────────────────────────────────────────
    events.on<ScriptStopParams>(this.namespace, 'script/stop', () => {
      this._stop();
    });

    // ── script/register-command ───────────────────────────────────────────
    events.on<ScriptRegisterCommandParams>(
      this.namespace,
      'script/register-command',
      (params) => {
        this._commands.set(params.cmd, params.handler);
      },
    );

    // ── script/state:get ──────────────────────────────────────────────────
    events.on<Record<string, never>, ScriptStateGetOutput>(
      this.namespace,
      'script/state:get',
      (_params, output) => {
        output.running   = this._running !== null;
        output.scriptId  = this._running?.script.id ?? null;
        output.nodeIndex = this._running?.nextIndex ?? 0;
      },
    );
  }

  destroy(core: Core): void {
    this._stop();
    core.events.removeNamespace(this.namespace);
    this._scripts.clear();
    this._running = null;
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** `true` when a script is currently running. */
  get isRunning(): boolean {
    return this._running !== null;
  }

  /** ID of the currently running script, or `null` when idle. */
  get currentScriptId(): string | null {
    return this._running?.script.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private – execution engine
  // ---------------------------------------------------------------------------

  private async _execute(
    script: ScriptDef,
    vars: Record<string, unknown>,
  ): Promise<void> {
    const core = this._core;
    if (!core) return;

    // Stop any currently running script before starting the new one.
    if (this._running) {
      this._stop();
    }

    const state: RunState = {
      script,
      vars,
      nextIndex: 0,
      stopped: false,
      stopResolvers: [],
    };
    this._running = state;

    core.events.emitSync<ScriptStartedParams>('script/started', { id: script.id });

    while (state.nextIndex < script.nodes.length && !state.stopped) {
      const index = state.nextIndex;
      const node  = script.nodes[index]!;
      // Default: advance to the next node.  jumpTo() may override this.
      state.nextIndex = index + 1;

      const handler = this._commands.get(node.cmd);
      if (!handler) {
        console.warn(
          `[ScriptManager] Unknown command "${node.cmd}" at index ${index} ` +
          `in script "${script.id}".`,
        );
        continue;
      }

      core.events.emitSync<ScriptStepParams>('script/step', {
        id:    script.id,
        index,
        cmd:   node.cmd,
      });

      const ctx: ScriptContext = {
        core,
        script,
        node,
        index,
        vars: state.vars,
        jumpTo(targetIndex: number): void {
          state.nextIndex = targetIndex;
        },
        stop(): void {
          state.stopped = true;
        },
        onStop(fn: () => void): void {
          state.stopResolvers.push(fn);
        },
      };

      try {
        await handler(ctx);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[ScriptManager] Error in command "${node.cmd}" at index ${index}:`,
          err,
        );
        core.events.emitSync<ScriptErrorParams>('script/error', {
          id: script.id,
          index,
          cmd: node.cmd,
          message,
        });
        state.stopped = true;
      }

      // Clear per-command stop resolvers after the handler completes normally.
      state.stopResolvers.length = 0;

      // If _stop() was called (from outside or via ctx.stop()), or a new script
      // replaced this run, abandon execution.
      if (this._running !== state) return;
    }

    // Only emit ended if this is still the active run.
    if (this._running === state) {
      this._running = null;
      core.events.emitSync<ScriptEndedParams>('script/ended', { id: script.id });
    }
  }

  /** Stop the currently running script and emit `script/ended`. */
  private _stop(): void {
    if (!this._running) return;
    const state = this._running;
    state.stopped = true;
    this._running = null;
    // Unblock any pending promises registered via ctx.onStop().
    for (const fn of state.stopResolvers) fn();
    this._core?.events.emitSync<ScriptEndedParams>('script/ended', {
      id: state.script.id,
    });
  }

  // ---------------------------------------------------------------------------
  // Private – built-in commands
  // ---------------------------------------------------------------------------

  private _registerBuiltinCommands(): void {

    // ── label: position marker (no-op at runtime) ─────────────────────────
    this._commands.set('label', () => {
      // Resolved at jump-time by _findLabel(); nothing to do here.
    });

    // ── jump: unconditional jump to a named label ─────────────────────────
    this._commands.set('jump', (ctx) => {
      const target = ctx.node.target as string | undefined;
      if (!target) {
        console.warn('[ScriptManager] jump: missing "target" field.');
        return;
      }
      const idx = this._findLabel(ctx.script, target);
      if (idx === -1) {
        console.warn(
          `[ScriptManager] jump: label "${target}" not found ` +
          `in script "${ctx.script.id}".`,
        );
        return;
      }
      ctx.jumpTo(idx);
    });

    // ── if: conditional jump ──────────────────────────────────────────────
    this._commands.set('if', (ctx) => {
      const varName   = ctx.node.var  as string | undefined;
      const expected  = ctx.node.value;
      const labelName = ctx.node.jump as string | undefined;
      if (!varName || !labelName) {
        console.warn(
          '[ScriptManager] if: requires "var", "value", and "jump" fields.',
        );
        return;
      }
      if (ctx.vars[varName] === expected) {
        const idx = this._findLabel(ctx.script, labelName);
        if (idx !== -1) ctx.jumpTo(idx);
      }
    });

    // ── set: write to the script variable store ───────────────────────────
    this._commands.set('set', (ctx) => {
      const varName = ctx.node.var as string | undefined;
      if (!varName) {
        console.warn('[ScriptManager] set: missing "var" field.');
        return;
      }
      ctx.vars[varName] = ctx.node.value;
    });

    // ── wait: suspend execution for `ms` milliseconds ─────────────────────
    this._commands.set('wait', (ctx) => {
      const ms = ctx.node.ms as number | undefined;
      if (typeof ms !== 'number') {
        console.warn('[ScriptManager] wait: missing or invalid "ms" field.');
        return;
      }
      return new Promise<void>((resolve) => {
        const handle = setTimeout(resolve, ms);
        ctx.onStop(() => {
          clearTimeout(handle);
          resolve();
        });
      });
    });

    // ── emit: fire an arbitrary event synchronously ───────────────────────
    this._commands.set('emit', (ctx) => {
      const event = ctx.node.event as string | undefined;
      if (!event) {
        console.warn('[ScriptManager] emit: missing "event" field.');
        return;
      }
      const params = (ctx.node.params as Record<string, unknown> | undefined) ?? {};
      ctx.core.events.emitSync(event, params);
    });

    // ── say: show a dialogue line and wait for the player to advance ───────
    this._commands.set('say', (ctx) => {
      ctx.core.events.emitSync('dialogue/show-text', {
        text:           ctx.node.text          as string | undefined,
        speaker:        ctx.node.speaker       as string | undefined,
        portrait:       ctx.node.portrait      as string | undefined,
        speed:          ctx.node.speed         as number | undefined,
        i18nKey:        ctx.node.i18nKey       as string | undefined,
        i18nArgs:       ctx.node.i18nArgs      as Record<string, string> | undefined,
        speakerI18nKey: ctx.node.speakerI18nKey as string | undefined,
      });
      return new Promise<void>((resolve) => {
        const off = ctx.core.events.once(this.namespace, 'dialogue/advanced', resolve);
        ctx.onStop(() => { off(); resolve(); });
      });
    });

    // ── choices: show a choice list and store the picked index ────────────
    this._commands.set('choices', (ctx) => {
      const rawChoices = ctx.node.choices as string[] | undefined;
      if (!Array.isArray(rawChoices)) {
        console.warn('[ScriptManager] choices: "choices" must be an array of strings.');
        return;
      }
      const choices = rawChoices.map((text, index) => ({ text, index }));
      ctx.core.events.emitSync('dialogue/show-choices', {
        prompt:  ctx.node.prompt as string | undefined,
        choices,
      });
      return new Promise<void>((resolve) => {
        const off = ctx.core.events.once(
          this.namespace,
          'dialogue/choice:made',
          (params: { index: number }) => {
            const varName = ctx.node.var as string | undefined;
            if (varName) ctx.vars[varName] = params.index;
            resolve();
          },
        );
        ctx.onStop(() => { off(); resolve(); });
      });
    });

    // ── end: close the dialogue session ───────────────────────────────────
    this._commands.set('end', (ctx) => {
      ctx.core.events.emitSync('dialogue/end', {});
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Find the index of the first `label` node whose `name` equals `labelName`.
   * Returns `-1` when no such node exists.
   */
  private _findLabel(script: ScriptDef, labelName: string): number {
    return script.nodes.findIndex(
      (n) => n.cmd === 'label' && n.name === labelName,
    );
  }
}
