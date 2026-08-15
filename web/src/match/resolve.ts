/**
 * The resolution table, spec §1.
 *
 * > Every frame, for every wrestler, the game holds a tuple:
 * > (my position state, my condition, opponent position state, opponent
 * >  condition, spatial relationship, held object) + input -> move
 * >
 * > A button press is a lookup, never a trigger.
 *
 * This file is that lookup and nothing else. It computes a slot key from the
 * tuple, asks the wrestler's assembly manifest what lives in that slot, and
 * checks the move's own requirements. It never mutates anything, which is why
 * the engine can ask it hypothetical questions — "would a finisher resolve
 * right now?" — to drive the HUD's situation readout.
 *
 * The consequence the spec insists on: the same button in two different states
 * produces two entirely different, hand-authored moves. Nothing here falls back
 * to "well, do a punch then".
 */

import { moveForSlot, type SlotKey } from "./movesets";
import {
  type Direction,
  type FighterSnapshot,
  type MoveDef,
  type SituationId,
  type SpatialRelation,
} from "./types";

export type ResolveButton = "strike" | "grapple" | "finisher" | "taunt";

export interface ResolveRequest {
  self: FighterSnapshot;
  opponent: FighterSnapshot;
  spatial: SpatialRelation;
  button: ResolveButton;
  direction: Direction;
}

export type ResolveFailure =
  | "unauthored"
  | "badState"
  | "outOfRange"
  | "tooHeavy"
  | "noSituation"
  | "noIcons";

/**
 * A single record rather than a discriminated union, because this project
 * compiles with `strictNullChecks: false` and `true`/`false` literal types do
 * not narrow under it. `ok` implies `move` is present.
 */
export interface Resolution {
  ok: boolean;
  slot: SlotKey | null;
  move?: MoveDef;
  reason?: ResolveFailure;
}

/** Reach per category, in metres. Tuned against the ring, not invented. */
const RANGE: Record<string, number> = {
  strike: 2.2,
  combo: 2.2,
  grappleEntry: 1.75,
  whip: 1.75,
  rearGrapple: 1.75,
  ground: 1.9,
  groundAttack: 1.9,
  pin: 1.9,
  running: 2.7,
  counter: 3.2,
  finisher: 2.4,
  aerial: 4,
  turnbuckle: 2,
  // Already locked together — the distance check happened on entry.
  grappleMove: Infinity,
  submission: Infinity,
  reversal: Infinity,
  taunt: Infinity,
};

/**
 * Is the finisher's situational requirement satisfied right now (§10)?
 *
 * Kept as a pure predicate over the same tuple the table uses, so the HUD's
 * "situation satisfied" light and the actual button press can never disagree.
 */
export function situationSatisfied(
  situation: SituationId | undefined,
  self: FighterSnapshot,
  opponent: FighterSnapshot,
  spatial: SpatialRelation,
): boolean {
  switch (situation) {
    case undefined:
    case "always":
      return true;
    case "opponentGroggy":
      return opponent.state === "groggy" || opponent.state === "stunned";
    case "opponentDownNearHead":
      return (
        (opponent.state === "down" || opponent.state === "gettingUp") && spatial.groundSide === "head"
      );
    case "opponentDownNearFeet":
      return (
        (opponent.state === "down" || opponent.state === "gettingUp") && spatial.groundSide === "feet"
      );
    case "opponentHeldInGrapple":
      return self.state === "grappleHolding" || self.state === "rearHolding";
    case "opponentLimbHurt":
      return opponent.damageLevels.arms >= 3 || opponent.damageLevels.legs >= 3;
    // Phase 7 states — declared so finishers can require them without a rename.
    case "opponentTurnbuckleFacing":
      return opponent.state === "turnbuckleFacing";
    case "holdingWeapon":
      return false;
    default:
      return false;
  }
}

/** The slot key this tuple resolves to, or null if the input means nothing here. */
export function slotKeyFor(request: ResolveRequest): SlotKey | null {
  const { self, opponent, spatial, button, direction } = request;
  const dir = direction === "neutral" ? null : direction;
  const opponentDown = opponent.state === "down" || opponent.state === "gettingUp";
  const opponentCharging = opponent.state === "running";

  if (button === "taunt") return `taunt.${direction === "neutral" ? "up" : direction}`;

  if (button === "finisher") return null; // handled by finisherResolution

  // --- inside a base grapple: step two of the grapple matrix (§4)
  if (self.state === "grappleHolding") {
    if (button !== "grapple") return null;
    if (!dir) return "standing.whip";
    return `grapple.${self.grappleFamily ?? "quick"}.${dir}`;
  }

  if (self.state === "rearHolding") {
    if (button !== "grapple") return null;
    if (!dir) return "standing.whip";
    return `rear.grapple.${dir}`;
  }

  // --- already at speed: the running table wins over everything else, because
  // a wrestler at a dead run cannot stoop into a ground grapple.
  if (self.state === "running") {
    if (button === "strike") return "running.strike";
    if (button === "grapple") return "running.grapple";
    return null;
  }

  // --- opponent on the mat: near head and near feet are different tables (§3)
  if (opponentDown) {
    if (button === "strike") return `ground.attack.${spatial.groundSide ?? "feet"}`;
    if (button === "grapple") {
      return `ground.${spatial.groundSide ?? "feet"}.${dir ?? "up"}`;
    }
    return null;
  }

  // --- catching a charge. Reading the run beats mashing into it.
  if (opponentCharging && button === "grapple") {
    return `counter.${dir === "up" ? "up" : dir === "down" ? "down" : "neutral"}`;
  }

  // --- behind them
  if (spatial.behind && button === "grapple") {
    if (!dir) return "standing.whip";
    return opponent.state === "groggy" ? `rearGroggy.grapple.${dir}` : `rear.grapple.${dir}`;
  }

  // --- standing, facing
  if (button === "strike") {
    return dir ? `standing.strike.${dir}` : `standing.combo.${Math.min(3, self.comboIndex + 1)}`;
  }
  if (button === "grapple") {
    if (!dir) return "standing.whip";
    // Step one: direction chooses which of the four base grapples we enter.
    // The direction → family mapping itself lives in GRAPPLE_FAMILY_BY_DIRECTION
    // and is applied by the engine when the entry lands.
    return `standing.grapple.${dir}`;
  }
  return null;
}

function checkMove(
  move: MoveDef,
  slot: SlotKey,
  request: ResolveRequest,
): Resolution {
  const { self, opponent, spatial } = request;

  if (move.requiredPosition.length && !move.requiredPosition.includes(self.state)) {
    return { ok: false, slot, reason: "badState", move };
  }

  if (move.requiredOpponentPosition && !move.requiredOpponentPosition.includes(opponent.state)) {
    return { ok: false, slot, reason: "badState", move };
  }

  const reach = RANGE[move.category] ?? 2;
  if (spatial.distance > reach) return { ok: false, slot, reason: "outOfRange", move };

  // A lighter wrestler cannot lift a much heavier one, and the attempt must
  // fail readably rather than clip (§6).
  if (move.weightClassLimit !== undefined && opponent.weight > move.weightClassLimit) {
    return { ok: false, slot, reason: "tooHeavy", move };
  }

  if (!situationSatisfied(move.requiredSituation, self, opponent, spatial)) {
    return { ok: false, slot, reason: "noSituation", move };
  }

  return { ok: true, slot, move };
}

export function resolve(request: ResolveRequest): Resolution {
  if (request.button === "finisher") return finisherResolution(request);

  const slot = slotKeyFor(request);
  if (!slot) return { ok: false, slot: null, reason: "badState" };

  const move = moveForSlot(request.self.id, slot);
  if (!move) return { ok: false, slot, reason: "unauthored" };

  return checkMove(move, slot, request);
}

/**
 * Finishers are two slots, each with its own situational requirement, so the
 * press resolves to whichever one the current situation legalises. When neither
 * is legal the failure carries the move so the HUD can say *which* situation
 * the player is being asked to create.
 */
export function finisherResolution(request: ResolveRequest, id = request.self.id): Resolution {
  const slots: SlotKey[] = ["finisher.1", "finisher.2"];
  let lastFailure: Resolution | null = null;

  for (const slot of slots) {
    const move = moveForSlot(id, slot);
    if (!move) continue;
    const result = checkMove(move, slot, request);
    if (result.ok) {
      if (request.self.icons < 1) return { ok: false, slot, reason: "noIcons", move };
      return result;
    }
    lastFailure = result;
  }

  return lastFailure ?? { ok: false, slot: null, reason: "unauthored" };
}

/** True when a finisher would resolve except for the icon requirement. */
export function finisherSituationOpen(request: ResolveRequest, id = request.self.id): boolean {
  const result = finisherResolution(request, id);
  return result.ok || result.reason === "noIcons";
}
