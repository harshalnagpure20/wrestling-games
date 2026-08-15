/**
 * The vocabulary of the match engine.
 *
 * MECHANICS_SPEC.md §1 is the load-bearing idea here: the engine is a
 * **resolution table**, not an animation player with logic bolted on. Every
 * frame each wrestler holds a tuple of
 *
 *   (my position state, my condition, opponent position state, opponent
 *    condition, spatial relationship, held object) + input
 *
 * and a button press is a *lookup* into that tuple, never a trigger. So the
 * types below are deliberately data-shaped: a move is a record (§6), a wrestler
 * is a mapping from slot to record (§5), and nothing in this file knows that
 * three.js exists. That is what lets the whole systems layer run in a node test
 * with no renderer.
 */

import type { AttributeBlock, WrestlerId } from "../assets/generated";

// ------------------------------------------------------------------- states

/**
 * Position states, spec §3.
 *
 * The full list is declared here even though Phase 5 can only reach part of it,
 * because the resolution table keys off these names and the Phase 7 ring
 * systems must not require renaming anything. States marked *(Phase 7)* are
 * authored in the move tables already and simply unreachable until the ropes,
 * turnbuckles and apron become real.
 */
export type PositionState =
  | "standing"
  | "running"
  | "groggy"
  | "stunned"
  | "down"
  | "gettingUp"
  /** Holding the opponent in one of the four base grapples. */
  | "grappleHolding"
  /** Held in one of the four base grapples. */
  | "grappleHeld"
  | "rearHolding"
  | "rearHeld"
  | "submissionHolding"
  | "submissionCaught"
  | "pinning"
  | "pinned"
  | "ko"
  /** (Phase 7) */
  | "ropes"
  | "rebounding"
  | "turnbuckleFacing"
  | "turnbuckleBack"
  | "turnbuckleSlumped"
  | "topTurnbuckle"
  | "apron"
  | "outside"
  | "climbing";

/**
 * States in which the player drives the body around the canvas themselves.
 *
 * Groggy is deliberately absent. A groggy wrestler is stunned and vulnerable —
 * that is the whole reason so much of the setup play exists to put someone
 * there — so they neither act nor walk out of it.
 */
export const FREE_STATES: ReadonlySet<PositionState> = new Set<PositionState>([
  "standing",
  "running",
]);

/** States that mean "on the mat, not defending yourself". */
export const DOWNED_STATES: ReadonlySet<PositionState> = new Set<PositionState>([
  "down",
  "gettingUp",
  "pinned",
  "ko",
]);

export type Region = "head" | "torso" | "arms" | "legs";
export const REGIONS: Region[] = ["head", "torso", "arms", "legs"];

/** Four levels per region, spec §8: 1 fresh, 2 sore, 3 hurting, 4 critical. */
export type DamageLevel = 1 | 2 | 3 | 4;

export type DamageState = Record<Region, number>;

/** The four base grapples, spec §4. Direction → family is fixed. */
export type GrappleFamily = "power" | "submission" | "signature" | "quick";

export type Direction = "up" | "down" | "left" | "right" | "neutral";

/** Direction → base grapple, spec §4. */
export const GRAPPLE_FAMILY_BY_DIRECTION: Record<Exclude<Direction, "neutral">, GrappleFamily> = {
  up: "power",
  down: "submission",
  left: "signature",
  right: "quick",
};

export type DistanceBand = "clinch" | "close" | "mid" | "far";

/** Which end of a downed opponent the attacker is standing at, spec §3. */
export type GroundSide = "head" | "feet";

// -------------------------------------------------------------------- moves

export type MoveCategory =
  | "strike"
  | "combo"
  | "grappleEntry"
  | "grappleMove"
  | "rearGrapple"
  | "whip"
  | "ground"
  | "groundAttack"
  | "pin"
  | "submission"
  | "running"
  | "counter"
  | "reversal"
  | "taunt"
  | "finisher"
  | "aerial"
  | "turnbuckle";

/** Which button reverses this move, spec §7. */
export type ReversalChannel = "strike" | "grapple" | "finisher" | "none";

/**
 * The situational requirement carried by every finisher, spec §10. Getting into
 * the situation *is* the game, so the HUD reports "finisher available" and
 * "situation satisfied" as two separate readouts.
 */
export type SituationId =
  | "always"
  | "opponentGroggy"
  | "opponentDownNearHead"
  | "opponentDownNearFeet"
  | "opponentHeldInGrapple"
  | "opponentLimbHurt"
  | "opponentTurnbuckleFacing"
  | "holdingWeapon";

/**
 * A move is a data record, not a function (spec §6). Timings are in seconds and
 * were derived by feel — the source material contains no frame data at all
 * (spec §17), so these are the project's own numbers and are meant to be tuned.
 */
export interface MoveDef {
  id: string;
  displayName: string;
  category: MoveCategory;
  /**
   * Key into the shared move-animation library (spec §5). Format is
   * `family.variant`, deliberately *not* per-character: the whole point of the
   * library is that two wrestlers share `grapple.power.slam.1` and differ only
   * in their signature and finisher entries.
   */
  animation: string;
  /** Placeholder clip actually available today. Real clips land in Phase 6a. */
  clip: "idle" | "walk" | "run" | "strike" | "knockdown" | "getUp";

  requiredPosition: PositionState[];
  /** Opponent must be in one of these states, if given. */
  requiredOpponentPosition?: PositionState[];
  requiredSituation?: SituationId;

  damage: number;
  damageRegion: Region;
  /** 0–1, drives camera shake, audio weight and knockdown severity. */
  impactStrength: number;

  reversalType: ReversalChannel;
  /** Base width in seconds, before the defender's Technique scales it. */
  reversalWindow: number;
  /** Seconds from button press to the impact frame. */
  startup: number;
  /** Seconds after impact before the attacker may act again. */
  recovery: number;

  resultingSelfState: PositionState;
  resultingOpponentState: PositionState;
  /** Seconds the opponent spends groggy/stunned/down before recovering. */
  opponentStateSeconds?: number;

  causesBleed: boolean;
  causesPin: boolean;
  causesSubmission: boolean;
  /** Region under pressure in a hold — a Boston Crab is torso, not legs (§6). */
  submissionRegion?: Region;

  /**
   * Heaviest opponent this move can lift, in pounds. A lighter wrestler
   * attempting a lift on a much heavier one must fail *readably* rather than
   * clip through them (§6).
   */
  weightClassLimit?: number;
  staminaCost: number;
  meterGain: number;
  /**
   * The attacker's own region loaded by executing this move. Doing it with that
   * region already at level 3+ makes you recoil afterwards (§8, the second
   * direction of the damage system).
   */
  selfLoad?: Region;
}

// ------------------------------------------------------------------ context

export interface SpatialRelation {
  distance: number;
  band: DistanceBand;
  /** Attacker is behind the defender's back. */
  behind: boolean;
  /** Which end of a downed opponent we stand at; null when they are upright. */
  groundSide: GroundSide | null;
  /**
   * Close enough to the ropes for a rope break (§9). This is why dragging a
   * downed opponent to the centre of the ring before applying a hold is real
   * strategy, and it is passed in rather than computed so the match core stays
   * free of ring geometry.
   */
  nearRopes: boolean;
}

export interface FighterSnapshot {
  index: 0 | 1;
  id: WrestlerId;
  label: string;
  weight: number;
  attributes: AttributeBlock;
  state: PositionState;
  grappleFamily: GrappleFamily | null;
  damage: DamageState;
  damageLevels: Record<Region, DamageLevel>;
  bleeding: boolean;
  stamina: number;
  vitality: number;
  icons: number;
  iconCharge: number;
  comboIndex: number;
  busy: boolean;
  /** Which finisher slots are currently unlocked *and* situationally legal. */
  finisherReady: boolean;
  situationSatisfied: boolean;
  activeMove: string | null;
  lastAction: string;
}

/** One frame of intent, already edge-detected by the presentation layer. */
export interface MatchInput {
  direction: Direction;
  strike: boolean;
  grapple: boolean;
  action: boolean;
  finisher: boolean;
  /** Held, not edged — taunting longer fills the meter more (§10). */
  tauntHeld: boolean;
  taunt: boolean;
  reverseStrike: boolean;
  reverseGrapple: boolean;
  run: boolean;
  /** The stick is actually deflected — running needs a direction to run in. */
  moving: boolean;
  /** Any face-button edge — feeds kickouts and the submission contest. */
  mash: boolean;
}

export function emptyMatchInput(): MatchInput {
  return {
    direction: "neutral",
    strike: false,
    grapple: false,
    action: false,
    finisher: false,
    tauntHeld: false,
    taunt: false,
    reverseStrike: false,
    reverseGrapple: false,
    run: false,
    moving: false,
    mash: false,
  };
}

// -------------------------------------------------------------------- rules

/** Spec §14, the subset the singles match needs. */
export interface MatchRules {
  koEnabled: boolean;
  tapOutsEnabled: boolean;
  ropeBreaks: boolean;
  ringOutCount: boolean;
  countOutSeconds: number;
  /** 0 = unlimited. */
  matchLengthSeconds: number;
  finisherCharge: "normal" | "fast" | "fastest";
  difficulty: "easy" | "normal" | "hard" | "hardest";
}

export const DEFAULT_RULES: MatchRules = {
  koEnabled: true,
  tapOutsEnabled: true,
  ropeBreaks: true,
  ringOutCount: true,
  countOutSeconds: 20,
  matchLengthSeconds: 900,
  finisherCharge: "normal",
  difficulty: "normal",
};

export const FINISHER_CHARGE_RATE: Record<MatchRules["finisherCharge"], number> = {
  normal: 1,
  fast: 1.5,
  fastest: 2.25,
};

// ------------------------------------------------------------------- events

export type MatchEvent =
  | { type: "move:start"; fighter: 0 | 1; move: MoveDef }
  | { type: "move:impact"; fighter: 0 | 1; move: MoveDef; damage: number; region: Region }
  | { type: "move:whiff"; fighter: 0 | 1; move: MoveDef }
  | { type: "move:failed"; fighter: 0 | 1; move: MoveDef; reason: "tooHeavy" | "tooTired" | "outOfRange" }
  | { type: "move:recoil"; fighter: 0 | 1; region: Region }
  | { type: "reversal"; fighter: 0 | 1; channel: ReversalChannel; depth: number; move: MoveDef }
  | { type: "reversal:missed"; fighter: 0 | 1; channel: ReversalChannel }
  | { type: "state"; fighter: 0 | 1; state: PositionState; previous: PositionState }
  | { type: "bleed"; fighter: 0 | 1 }
  | { type: "grapple:enter"; fighter: 0 | 1; family: GrappleFamily }
  | { type: "grapple:break"; fighter: 0 | 1 }
  | { type: "pin:start"; fighter: 0 | 1 }
  | { type: "pin:count"; fighter: 0 | 1; count: 1 | 2 | 3 }
  | { type: "pin:guaranteed"; fighter: 0 | 1 }
  | { type: "pin:kickout"; fighter: 0 | 1; atCount: number }
  | { type: "submission:start"; fighter: 0 | 1; region: Region }
  | { type: "submission:end"; fighter: 0 | 1; tapped: boolean }
  | { type: "meter:icon"; fighter: 0 | 1; icons: number }
  | { type: "count:tick"; fighter: 0 | 1; count: number }
  | { type: "match:end"; result: MatchResult };

export interface MatchResult {
  /** null on a draw / time limit. */
  winner: 0 | 1 | null;
  loser: 0 | 1 | null;
  condition: string;
  label: string;
  atSeconds: number;
}
