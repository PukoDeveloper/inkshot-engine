// ---------------------------------------------------------------------------
// Battle combatant
// ---------------------------------------------------------------------------

/** A participant on one side of a battle (party member or enemy). */
export interface BattleCombatant {
  /** Actor / enemy instance ID. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** `'party'` = player-controlled; `'enemy'` = AI-controlled. */
  readonly side: 'party' | 'enemy';
  /** Whether this combatant is still able to act. */
  alive: boolean;
}

// ---------------------------------------------------------------------------
// Battle action
// ---------------------------------------------------------------------------

/** Action types a combatant can take during their turn. */
export type BattleActionKind = 'attack' | 'skill' | 'item' | 'guard' | 'flee' | string;

/** A queued or resolved battle action. */
export interface BattleAction {
  /** The combatant performing the action. */
  readonly actorId: string;
  readonly kind: BattleActionKind;
  /** Skill ID (for `'skill'` actions). */
  readonly skillId?: string;
  /** Item ID (for `'item'` actions). */
  readonly itemId?: string;
  /** Target combatant ID(s).  Empty array means all enemies / all allies. */
  readonly targetIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Battle state machine
// ---------------------------------------------------------------------------

export type BattlePhase = 'idle' | 'acting' | 'resolving' | 'end';
export type BattleSide = 'party' | 'enemy';

/** Snapshot of the current battle state. */
export interface BattleState {
  readonly battleId: string;
  phase: BattlePhase;
  /** Current turn number (starts at 1). */
  turn: number;
  party: BattleCombatant[];
  enemies: BattleCombatant[];
  /** Pending actions accumulated during the `'acting'` phase. */
  pendingActions: BattleAction[];
}

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `battle/start`. */
export interface BattleStartParams {
  /** Unique battle session identifier (auto-generated when omitted). */
  readonly battleId?: string;
  readonly party: ReadonlyArray<{ id: string; name: string }>;
  readonly enemies: ReadonlyArray<{ id: string; name: string }>;
}

/** Output for `battle/start`. */
export interface BattleStartOutput {
  battleId: string;
  state: BattleState;
}

/** Parameters for `battle/action`. */
export interface BattleActionParams {
  readonly battleId: string;
  readonly action: BattleAction;
}

/** Parameters for `battle/resolve`. */
export interface BattleResolveParams {
  readonly battleId: string;
}

/** Output for `battle/resolve`. */
export interface BattleResolveOutput {
  /** Results for each resolved action. */
  results: Array<{
    action: BattleAction;
    /** Damage / healing values keyed by target ID. */
    effects: Record<string, { delta: number; stat: string }>;
    /** Whether the action was a critical hit. */
    critical: boolean;
    /** Whether the target was defeated by this action. */
    defeated: boolean;
  }>;
}

/** Parameters for `battle/end`. */
export interface BattleEndParams {
  readonly battleId: string;
  /** Outcome of the battle. */
  readonly outcome: 'victory' | 'defeat' | 'escape';
}

/** Parameters for `battle/state:get`. */
export interface BattleStateGetParams {
  readonly battleId: string;
}

/** Output for `battle/state:get`. */
export interface BattleStateGetOutput {
  state: BattleState | null;
}

// ---------------------------------------------------------------------------
// Notifications emitted BY BattleSystem
// ---------------------------------------------------------------------------

export interface BattleStartedParams {
  readonly battleId: string;
  readonly state: BattleState;
}

export interface BattleTurnStartParams {
  readonly battleId: string;
  readonly turn: number;
}

export interface BattleActionResolvedParams {
  readonly battleId: string;
  readonly action: BattleAction;
  readonly effects: Record<string, { delta: number; stat: string }>;
  readonly critical: boolean;
  readonly defeated: boolean;
}

export interface BattleEndedParams {
  readonly battleId: string;
  readonly outcome: 'victory' | 'defeat' | 'escape';
}

export interface BattleCombatantDefeatedParams {
  readonly battleId: string;
  readonly combatantId: string;
  readonly side: 'party' | 'enemy';
}
