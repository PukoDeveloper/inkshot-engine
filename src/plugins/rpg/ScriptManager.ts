import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  ScriptDef,
  ScriptContext,
  ScriptCommandHandler,
  ScriptDefineParams,
  ScriptRunParams,
  ScriptStopParams,
  ScriptRegisterCommandParams,
  ScriptStateGetOutput,
  ScriptInstanceState,
  ScriptStartedParams,
  ScriptEndedParams,
  ScriptStepParams,
  ScriptErrorParams,
} from '../../types/script.js';
import type { GameStateGetOutput } from '../../types/game.js';
import type { StoreGetParams, StoreGetOutput, StoreSetParams } from '../../types/store.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RunState {
  readonly script: ScriptDef;
  readonly instanceId: string;
  readonly vars: Record<string, unknown>;
  readonly priority: number;
  /** Set to true to break out of the execution loop after the current command. */
  stopped: boolean;
  /**
   * Cleanup functions registered by command handlers via ctx.onStop().
   * Called by _stopInstance() so that pending promises are resolved and
   * listeners are unregistered before the run frame is abandoned.
   */
  readonly stopResolvers: Array<() => void>;
  /**
   * The node index that the CURRENT _executeNodes frame is about to run.
   * Updated by the running frame so state:get can report an accurate position.
   */
  currentNodeIndex: number;
}

// ---------------------------------------------------------------------------
// ScriptManager
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that executes scripts defined as ordered lists of command
 * nodes.
 *
 * `ScriptManager` supports **concurrent execution**: multiple scripts run
 * simultaneously as independent *instances*, each identified by a unique
 * `instanceId`.  This is essential for RPG games where many NPCs need their
 * own behaviour loops running at the same time.
 *
 * ---
 *
 * ### Concurrency model
 *
 * Scripts run in JavaScript's single-threaded event loop.  Two async chains
 * interleave naturally — no true parallelism or polling is needed.
 *
 * ```
 * NPC-1 patrol  ──wait(2000)──────────────────────────────►
 * NPC-2 patrol      ──wait(2000)──────────────────────────►
 * Player dialogue         ──say──►──choices──►──say──►end
 * ```
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
 * ### Variable reference format
 *
 * Wherever a command accepts a `var` field or a text string that embeds
 * values, two formats are recognised:
 *
 * | Format        | Resolves to                                              |
 * |---------------|----------------------------------------------------------|
 * | `$name`       | The script-local variable `ctx.vars.name`                |
 * | `$ns.key`     | The persistent store value at namespace `ns`, key `key`  |
 *
 * In text fields (`say`, `choices`), use `{$name}` or `{$ns.key}` to embed
 * the resolved value inline:
 * ```ts
 * { cmd: 'say', text: 'HP: {$player.hp}, Gold: {$gold}' }
 * ```
 *
 * ---
 *
 * | Command         | Fields                                                                    | Description                                                               |
 * |-----------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------|
 * | `label`         | `name` (string)                                                           | Position marker (no-op at runtime)                                        |
 * | `jump`          | `target` (string)                                                         | Unconditional jump to a label                                             |
 * | `if`            | `var` (var-ref), `op?` (string), `value`, `jump` (string)                 | Jump when the comparison holds; `op`: `eq`(default) `ne` `gt` `lt` `gte` `lte` |
 * | `set`           | `var` (var-ref), `value`                                                  | Write a value into the script var store or persistent store               |
 * | `wait`          | `ms` (number)                                                             | Pause execution for `ms` milliseconds                                     |
 * | `emit`          | `event` (string), `params?` (object)                                      | Emit a custom event synchronously                                         |
 * | `say`           | `text?`, `speaker?`, `portrait?`, `speed?`, …                             | Show dialogue text (with `{$var}` interpolation), wait for advance        |
 * | `choices`       | `choices` (string[]), `prompt?`, `var?`                                   | Show choices (with `{$var}` interpolation), store picked index in `var`   |
 * | `end`           | —                                                                         | Close the dialogue session                                                |
 * | `wait-event`    | `event` (string), `var?`, `timeout?` (ms), `timeoutJump?`                 | Suspend until an event fires; optional timeout with label fallback        |
 * | `call`          | `id` (string), `vars?` (object)                                           | Run a sub-script inline and await its completion                          |
 * | `fork`          | `id` (string), `instanceId?`, `vars?`, `priority?`                        | Launch a concurrent instance (fire-and-forget)                            |
 * | `wait-instance` | `instanceId` (string)                                                     | Suspend until a named instance finishes                                   |
 * | `stop-instance` | `instanceId` (string)                                                     | Stop another running instance                                             |
 *
 * ---
 *
 * ### Concurrency & priority
 *
 * ```ts
 * // Two guard NPCs patrol concurrently (different instanceIds)
 * core.events.emitSync('script/run', { id: 'npc-patrol', instanceId: 'guard-1', vars: { npcId: 'guard-1' } });
 * core.events.emitSync('script/run', { id: 'npc-patrol', instanceId: 'guard-2', vars: { npcId: 'guard-2' } });
 *
 * // Player spotted — higher-priority chase interrupts guard-1's patrol
 * core.events.emitSync('script/run', { id: 'npc-chase', instanceId: 'guard-1', priority: 10 });
 *
 * // Exclusive cutscene — stops every running instance first
 * core.events.emitSync('script/run', { id: 'cutscene-intro', exclusive: true });
 * ```
 *
 * ---
 *
 * ### NPC patrol example (looping behaviour)
 *
 * ```ts
 * const patrolScript: ScriptDef = {
 *   id: 'npc-patrol',
 *   nodes: [
 *     { cmd: 'label',  name: 'loop' },
 *     { cmd: 'emit',   event: 'npc/set-velocity', params: { vx: 50 } },
 *     { cmd: 'wait',   ms: 2000 },
 *     { cmd: 'emit',   event: 'npc/set-velocity', params: { vx: -50 } },
 *     { cmd: 'wait',   ms: 2000 },
 *     { cmd: 'jump',   target: 'loop' },
 *   ],
 * };
 * ```
 *
 * ---
 *
 * ### `call` / sub-script example
 *
 * ```ts
 * // Sub-script defined separately
 * const greetScript: ScriptDef = {
 *   id: 'npc-greet',
 *   nodes: [
 *     { cmd: 'say', text: 'Hello traveller!', speaker: 'Guard' },
 *     { cmd: 'end' },
 *   ],
 * };
 *
 * // Main NPC script calls the greeting then resumes patrol
 * const npcScript: ScriptDef = {
 *   id: 'npc-main',
 *   nodes: [
 *     { cmd: 'call',  id: 'npc-greet' },   // inline execution, awaited
 *     { cmd: 'jump',  target: 'patrol' },
 *     { cmd: 'label', name: 'patrol' },
 *     // … patrol nodes …
 *   ],
 * };
 * ```
 *
 * ---
 *
 * ### Events handled
 *
 * | Event                     | Description                                         |
 * |---------------------------|-----------------------------------------------------|
 * | `script/define`           | Register (or overwrite) a script definition         |
 * | `script/run`              | Start a script instance                             |
 * | `script/stop`             | Stop one or all running instances                   |
 * | `script/register-command` | Register a new command handler                      |
 * | `script/state:get`        | Query the current execution state                   |
 *
 * ### Events emitted
 *
 * | Event            | When                                               |
 * |------------------|----------------------------------------------------|
 * | `script/started` | A script instance begins execution                 |
 * | `script/ended`   | A script instance finishes normally or is stopped  |
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

  /**
   * All active execution states, keyed by instanceId.
   * Multiple instances can run concurrently.
   */
  private readonly _running = new Map<string, RunState>();

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

      const instanceId = params.instanceId ?? params.id;
      const priority   = params.priority ?? 0;
      const vars       = { ...(params.vars ?? {}) };

      // exclusive: stop all running instances before starting
      if (params.exclusive) {
        this._stopAll();
      }

      // Priority guard: reject lower-priority runs on the same instance
      const existing = this._running.get(instanceId);
      if (existing && priority < existing.priority) {
        console.warn(
          `[ScriptManager] script/run: instance "${instanceId}" is already running ` +
          `"${existing.script.id}" at priority ${existing.priority}. ` +
          `New script "${params.id}" (priority ${priority}) was rejected.`,
        );
        return;
      }

      // Stop the existing instance (same or lower priority) before replacing
      if (existing) {
        this._stopInstance(instanceId);
      }

      void this._execute(script, instanceId, vars, priority);
    });

    // ── script/stop ───────────────────────────────────────────────────────
    events.on<ScriptStopParams>(this.namespace, 'script/stop', (params) => {
      if (params.instanceId !== undefined) {
        this._stopInstance(params.instanceId);
      } else {
        this._stopAll();
      }
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
        const instances: ScriptInstanceState[] = [];
        for (const state of this._running.values()) {
          instances.push({
            instanceId:  state.instanceId,
            scriptId:    state.script.id,
            nodeIndex:   state.currentNodeIndex,
            priority:    state.priority,
          });
        }
        output.running   = instances.length > 0;
        output.instances = instances;
        // Legacy single-instance compat fields
        output.scriptId  = instances[0]?.scriptId ?? null;
        output.nodeIndex = instances[0]?.nodeIndex ?? null;
      },
    );
  }

  destroy(core: Core): void {
    this._stopAll();
    core.events.removeNamespace(this.namespace);
    this._scripts.clear();
    this._running.clear();
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** `true` when at least one script instance is currently running. */
  get isRunning(): boolean {
    return this._running.size > 0;
  }

  /**
   * ID of the first running script, or `null` when idle.
   * @deprecated Use `runningInstances` when you need information about
   *   concurrent instances.
   */
  get currentScriptId(): string | null {
    return this._running.values().next().value?.script.id ?? null;
  }

  /**
   * Snapshot of all currently running script instances.
   * Useful for saving/restoring game state.
   */
  get runningInstances(): ScriptInstanceState[] {
    const result: ScriptInstanceState[] = [];
    for (const state of this._running.values()) {
      result.push({
        instanceId:  state.instanceId,
        scriptId:    state.script.id,
        nodeIndex:   state.currentNodeIndex,
        priority:    state.priority,
      });
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private – execution engine
  // ---------------------------------------------------------------------------

  private async _execute(
    script: ScriptDef,
    instanceId: string,
    vars: Record<string, unknown>,
    priority: number,
  ): Promise<void> {
    const core = this._core;
    if (!core) return;

    const state: RunState = {
      script,
      instanceId,
      vars,
      priority,
      stopped: false,
      stopResolvers: [],
      currentNodeIndex: 0,
    };
    this._running.set(instanceId, state);

    core.events.emitSync<ScriptStartedParams>('script/started', {
      id: script.id,
      instanceId,
    });

    await this._executeNodes(script, state);

    // Only emit ended if this state is still the active one for this instance
    if (this._running.get(instanceId) === state) {
      this._running.delete(instanceId);
      core.events.emitSync<ScriptEndedParams>('script/ended', {
        id: script.id,
        instanceId,
      });
    }
  }

  /**
   * Core execution loop.  Runs the nodes of `script` using the provided
   * `state` (vars, stopped flag, stopResolvers, instanceId).
   *
   * This method is reentrant: the `call` command invokes it recursively with
   * a different `script` but the **same** `state`, so both levels share the
   * same variable store and respond to the same stop signal.
   */
  private async _executeNodes(script: ScriptDef, state: RunState): Promise<void> {
    const core = this._core;
    if (!core) return;

    let nextIndex = 0;

    while (nextIndex < script.nodes.length && !state.stopped) {
      const index = nextIndex;
      const node  = script.nodes[index]!;
      // Default: advance to the next node.  jumpTo() may override this.
      nextIndex = index + 1;
      // Update the publicly visible position for state:get
      state.currentNodeIndex = index;

      const handler = this._commands.get(node.cmd);
      if (!handler) {
        console.warn(
          `[ScriptManager] Unknown command "${node.cmd}" at index ${index} ` +
          `in script "${script.id}" (instance: "${state.instanceId}").`,
        );
        continue;
      }

      core.events.emitSync<ScriptStepParams>('script/step', {
        id:         script.id,
        instanceId: state.instanceId,
        index,
        cmd:        node.cmd,
      });

      // jumpTo mutates nextIndex via closure
      const ctx: ScriptContext = {
        core,
        script,
        node,
        index,
        vars:       state.vars,
        instanceId: state.instanceId,
        jumpTo(targetIndex: number): void {
          nextIndex = targetIndex;
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
          `[ScriptManager] Error in command "${node.cmd}" at index ${index} ` +
          `in script "${script.id}" (instance: "${state.instanceId}"):`,
          err,
        );
        core.events.emitSync<ScriptErrorParams>('script/error', {
          id:         script.id,
          instanceId: state.instanceId,
          index,
          cmd:        node.cmd,
          message,
        });
        state.stopped = true;
        // Call stop resolvers to clean up any registered listeners / timeouts.
        for (const fn of state.stopResolvers) fn();
      }

      // Clear per-command stop resolvers after the handler completes.
      state.stopResolvers.length = 0;

      // If _stopInstance() replaced or cleared this instance, abandon execution.
      if (this._running.get(state.instanceId) !== state) return;
    }
  }

  /**
   * Stop a specific running instance and emit `script/ended`.
   * No-op if the instance does not exist.
   */
  private _stopInstance(instanceId: string): void {
    const state = this._running.get(instanceId);
    if (!state) return;
    state.stopped = true;
    this._running.delete(instanceId);
    // Unblock any pending promises registered via ctx.onStop().
    for (const fn of state.stopResolvers) fn();
    this._core?.events.emitSync<ScriptEndedParams>('script/ended', {
      id:         state.script.id,
      instanceId: state.instanceId,
    });
  }

  /** Stop every running instance. */
  private _stopAll(): void {
    // Snapshot keys to avoid mutation during iteration
    for (const instanceId of [...this._running.keys()]) {
      this._stopInstance(instanceId);
    }
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

    // ── if: conditional jump with operator support ────────────────────────
    //
    // Fields:
    //   var   (var-ref) – variable to test; supports $name (script-local) and
    //                     $ns.key (persistent store)
    //   op    (string)  – comparison operator; defaults to 'eq'
    //                     'eq'  – equal (===)
    //                     'ne'  – not equal (!==)
    //                     'gt'  – greater than (numeric)
    //                     'lt'  – less than (numeric)
    //                     'gte' – greater than or equal (numeric)
    //                     'lte' – less than or equal (numeric)
    //   value           – the value to compare against
    //   jump  (string)  – label to jump to when the condition holds
    //
    // Examples:
    //   { cmd: 'if', var: '$gold',       op: 'gte', value: 100, jump: 'rich' }
    //   { cmd: 'if', var: '$player.hp',  op: 'lt',  value: 20,  jump: 'danger' }
    //   { cmd: 'if', var: '$questDone',  value: true,            jump: 'done' }
    this._commands.set('if', (ctx) => {
      const varRef    = ctx.node.var  as string | undefined;
      const op        = (ctx.node.op  as string | undefined) ?? 'eq';
      const expected  = ctx.node.value;
      const labelName = ctx.node.jump as string | undefined;
      if (!varRef || !labelName) {
        console.warn(
          '[ScriptManager] if: requires "var", "value", and "jump" fields.',
        );
        return;
      }

      const actual = this._resolveVar(varRef, ctx);
      let condition: boolean;
      switch (op) {
        case 'eq':  condition = actual === expected; break;
        case 'ne':  condition = actual !== expected; break;
        case 'gt':  condition = (actual as number) > (expected as number); break;
        case 'lt':  condition = (actual as number) < (expected as number); break;
        case 'gte': condition = (actual as number) >= (expected as number); break;
        case 'lte': condition = (actual as number) <= (expected as number); break;
        default:
          console.warn(
            `[ScriptManager] if: unknown op "${op}". Supported: eq, ne, gt, lt, gte, lte.`,
          );
          return;
      }

      if (condition) {
        const idx = this._findLabel(ctx.script, labelName);
        if (idx !== -1) {
          ctx.jumpTo(idx);
        } else {
          console.warn(
            `[ScriptManager] if: label "${labelName}" not found ` +
            `in script "${ctx.script.id}".`,
          );
        }
      }
    });

    // ── set: write to the script variable store or persistent store ──────
    this._commands.set('set', (ctx) => {
      const varRef = ctx.node.var as string | undefined;
      if (!varRef) {
        console.warn('[ScriptManager] set: missing "var" field.');
        return;
      }
      if (varRef.startsWith('$')) {
        const name = varRef.slice(1);
        const dot  = name.indexOf('.');
        if (dot !== -1) {
          ctx.core.events.emitSync<StoreSetParams>('store/set', {
            ns:    name.slice(0, dot),
            key:   name.slice(dot + 1),
            value: ctx.node.value,
          });
          return;
        }
        ctx.vars[name] = ctx.node.value;
        return;
      }
      ctx.vars[varRef] = ctx.node.value;
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
      // Lock player input during dialogue if the game is currently in the
      // 'playing' phase.  The state is restored once the player advances.
      const { output: stateOut } = ctx.core.events.emitSync<Record<string, never>, GameStateGetOutput>(
        'game/state:get', {},
      );
      const lockGameState = stateOut.state === 'playing';
      if (lockGameState) {
        ctx.core.events.emitSync('game/state:set', { state: 'cutscene' });
      }

      ctx.core.events.emitSync('dialogue/show-text', {
        text:           ctx.node.text    != null
                          ? this._interpolateText(ctx.node.text as string, ctx)
                          : undefined,
        speaker:        ctx.node.speaker       as string | undefined,
        portrait:       ctx.node.portrait      as string | undefined,
        speed:          ctx.node.speed         as number | undefined,
        i18nKey:        ctx.node.i18nKey       as string | undefined,
        i18nArgs:       ctx.node.i18nArgs      as Record<string, string> | undefined,
        speakerI18nKey: ctx.node.speakerI18nKey as string | undefined,
      });
      return new Promise<void>((resolve) => {
        let restored = false;
        const restore = () => {
          if (restored) return;
          restored = true;
          if (lockGameState) ctx.core.events.emitSync('game/state:set', { state: 'playing' });
        };
        const off = ctx.core.events.once(this.namespace, 'dialogue/advanced', () => {
          restore();
          resolve();
        });
        ctx.onStop(() => { off(); restore(); resolve(); });
      });
    });

    // ── choices: show a choice list and store the picked index ────────────
    this._commands.set('choices', (ctx) => {
      const rawChoices = ctx.node.choices as string[] | undefined;
      if (!Array.isArray(rawChoices)) {
        console.warn('[ScriptManager] choices: "choices" must be an array of strings.');
        return;
      }
      const choices = rawChoices.map((text, index) => ({
        text:  this._interpolateText(text, ctx),
        index,
      }));

      // Lock player input during choice selection if the game is currently in
      // the 'playing' phase.  The state is restored once a choice is made.
      const { output: stateOut } = ctx.core.events.emitSync<Record<string, never>, GameStateGetOutput>(
        'game/state:get', {},
      );
      const lockGameState = stateOut.state === 'playing';
      if (lockGameState) {
        ctx.core.events.emitSync('game/state:set', { state: 'cutscene' });
      }

      ctx.core.events.emitSync('dialogue/show-choices', {
        prompt:  ctx.node.prompt != null
                   ? this._interpolateText(ctx.node.prompt as string, ctx)
                   : undefined,
        choices,
      });
      return new Promise<void>((resolve) => {
        let restored = false;
        const restore = () => {
          if (restored) return;
          restored = true;
          if (lockGameState) ctx.core.events.emitSync('game/state:set', { state: 'playing' });
        };
        const off = ctx.core.events.once(
          this.namespace,
          'dialogue/choice:made',
          (params: { index: number }) => {
            const varName = ctx.node.var as string | undefined;
            if (varName) ctx.vars[varName] = params.index;
            restore();
            resolve();
          },
        );
        ctx.onStop(() => { off(); restore(); resolve(); });
      });
    });

    // ── end: close the dialogue session ───────────────────────────────────
    this._commands.set('end', (ctx) => {
      ctx.core.events.emitSync('dialogue/end', {});
    });

    // ── wait-event: suspend until a named event fires ──────────────────────
    //
    // Fields:
    //   event        (string)  – the event name to wait for
    //   var          (string)  – optional: store the event payload in this variable
    //   timeout      (number)  – optional: milliseconds before giving up
    //   timeoutJump  (string)  – optional: label to jump to on timeout; when
    //                            omitted the script simply continues from the
    //                            next node after the wait-event
    //
    // Example: wait for the player to enter a trigger zone, then proceed
    //   { cmd: 'wait-event', event: 'zone/entered', var: 'zonePayload' }
    //
    // Example: with a 5-second timeout fallback
    //   { cmd: 'wait-event', event: 'npc/arrived', timeout: 5000, timeoutJump: 'fallback' }
    this._commands.set('wait-event', (ctx) => {
      const event       = ctx.node.event       as string | undefined;
      if (!event) {
        console.warn('[ScriptManager] wait-event: missing "event" field.');
        return;
      }
      const varName     = ctx.node.var         as string | undefined;
      const timeoutMs   = ctx.node.timeout     as number | undefined;
      const timeoutJump = ctx.node.timeoutJump as string | undefined;

      return new Promise<void>((resolve) => {
        let settled = false;

        const settle = (): void => {
          if (settled) return;
          settled = true;
          off();
          if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
          resolve();
        };

        // Use on() + manual off() so the timeout can cancel the listener
        // and to avoid race conditions if multiple events fire in sequence.
        const off = ctx.core.events.on(
          this.namespace,
          event,
          (payload: unknown) => {
            if (settled) return;
            if (varName) ctx.vars[varName] = payload;
            settle();
          },
        );

        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        if (typeof timeoutMs === 'number') {
          timeoutHandle = setTimeout(() => {
            if (settled) return;
            if (timeoutJump) {
              const idx = this._findLabel(ctx.script, timeoutJump);
              if (idx !== -1) {
                ctx.jumpTo(idx);
              } else {
                console.warn(
                  `[ScriptManager] wait-event: timeout label "${timeoutJump}" not found ` +
                  `in script "${ctx.script.id}".`,
                );
              }
            }
            settle();
          }, timeoutMs);
        }

        ctx.onStop(settle);
      });
    });

    // ── call: run a sub-script inline and await its completion ────────────
    //
    // Fields:
    //   id    (string)           – ID of the script to call
    //   vars  (object, optional) – extra variables merged into the var store
    //
    // The called script shares the calling instance's variable store and
    // responds to the same stop signal.  It does NOT produce its own
    // script/started or script/ended events (it is inline, not a new instance).
    //
    // Example: guard says hello, then returns to patrol
    //   { cmd: 'call', id: 'npc-greet' }
    this._commands.set('call', async (ctx) => {
      const id = ctx.node.id as string | undefined;
      if (!id) {
        console.warn('[ScriptManager] call: missing "id" field.');
        return;
      }
      const subScript = this._scripts.get(id);
      if (!subScript) {
        console.warn(`[ScriptManager] call: script "${id}" is not defined.`);
        return;
      }
      // Merge any extra vars supplied on the call node
      const extraVars = ctx.node.vars as Record<string, unknown> | undefined;
      if (extraVars) Object.assign(ctx.vars, extraVars);

      // Retrieve the live RunState for this instance so we can share it
      const state = this._running.get(ctx.instanceId);
      if (!state || state.stopped) return;

      await this._executeNodes(subScript, state);
    });

    // ── fork: launch a concurrent script instance (fire-and-forget) ───────
    //
    // Fields:
    //   id          (string)           – script definition to run
    //   instanceId  (string, optional) – instance ID; defaults to script id
    //   vars        (object, optional) – seed variables for the new instance
    //   priority    (number, optional) – execution priority; defaults to 0
    //
    // Example: start an explosion VFX script without blocking the main flow
    //   { cmd: 'fork', id: 'explosion-vfx', instanceId: 'vfx-boom' }
    this._commands.set('fork', (ctx) => {
      const id = ctx.node.id as string | undefined;
      if (!id) {
        console.warn('[ScriptManager] fork: missing "id" field.');
        return;
      }
      const script = this._scripts.get(id);
      if (!script) {
        console.warn(`[ScriptManager] fork: script "${id}" is not defined.`);
        return;
      }
      const instanceId = (ctx.node.instanceId as string | undefined) ?? id;
      const vars       = { ...(ctx.node.vars as Record<string, unknown> | undefined ?? {}) };
      const priority   = (ctx.node.priority as number | undefined) ?? 0;

      // Priority check for the target instance
      const existing = this._running.get(instanceId);
      if (existing && priority < existing.priority) {
        console.warn(
          `[ScriptManager] fork: instance "${instanceId}" is already running ` +
          `at priority ${existing.priority}; fork at priority ${priority} was rejected.`,
        );
        return;
      }
      if (existing) {
        this._stopInstance(instanceId);
      }

      void this._execute(script, instanceId, vars, priority);
    });

    // ── wait-instance: suspend until a named instance finishes ────────────
    //
    // Fields:
    //   instanceId (string) – the instance to wait for
    //
    // Resolves immediately if the instance is not currently running.
    //
    // Example: fork an effect then wait for it to complete
    //   { cmd: 'fork',          id: 'boss-intro-vfx', instanceId: 'vfx' }
    //   { cmd: 'wait-instance', instanceId: 'vfx' }
    //   { cmd: 'say',           text: 'Now fight!' }
    this._commands.set('wait-instance', (ctx) => {
      const instanceId = ctx.node.instanceId as string | undefined;
      if (!instanceId) {
        console.warn('[ScriptManager] wait-instance: missing "instanceId" field.');
        return;
      }
      // Already done (or never started) — resolve immediately
      if (!this._running.has(instanceId)) return;

      return new Promise<void>((resolve) => {
        const off = ctx.core.events.on(
          this.namespace,
          'script/ended',
          (p: ScriptEndedParams) => {
            if (p.instanceId === instanceId) {
              off();
              resolve();
            }
          },
        );
        ctx.onStop(() => { off(); resolve(); });
      });
    });

    // ── stop-instance: stop another running instance ───────────────────────
    //
    // Fields:
    //   instanceId (string) – the instance to stop
    //
    // Useful for NPC state-machine transitions within a single master script.
    //
    // Example: stop the guard's patrol before starting a chase
    //   { cmd: 'stop-instance', instanceId: 'guard-patrol' }
    //   { cmd: 'fork',          id: 'npc-chase', instanceId: 'guard-chase' }
    this._commands.set('stop-instance', (ctx) => {
      const instanceId = ctx.node.instanceId as string | undefined;
      if (!instanceId) {
        console.warn('[ScriptManager] stop-instance: missing "instanceId" field.');
        return;
      }
      this._stopInstance(instanceId);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a variable reference to its current value.
   *
   * - `$name`    → script-local variable `ctx.vars[name]`
   * - `$ns.key`  → persistent store value via `store/get`
   *
   * If the reference does not start with `$` it is treated as a bare
   * script-local key for backward compatibility.
   */
  private _resolveVar(ref: string, ctx: ScriptContext): unknown {
    if (!ref.startsWith('$')) {
      return ctx.vars[ref];
    }
    const name = ref.slice(1);
    const dot  = name.indexOf('.');
    if (dot !== -1) {
      const { output } = ctx.core.events.emitSync<StoreGetParams, StoreGetOutput>(
        'store/get',
        { ns: name.slice(0, dot), key: name.slice(dot + 1) },
      );
      return output.value;
    }
    return ctx.vars[name];
  }

  /**
   * Replace all `{$name}` and `{$ns.key}` placeholders in a text string with
   * their resolved values.  Unknown references are replaced with an empty string.
   *
   * This runs before the text is forwarded to the dialogue system so that the
   * existing dialogue markup parser (`parseDialogueMarkup`) receives the fully
   * substituted string and can apply its own `[tag]`-based formatting on top.
   */
  private _interpolateText(text: string, ctx: ScriptContext): string {
    return text.replace(/\{\$([^}]+)\}/g, (_, ref: string) => {
      const value = this._resolveVar(`$${ref}`, ctx);
      return value !== undefined ? String(value) : '';
    });
  }

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
