/**
 * Assembly manifests, spec §5.
 *
 * A wrestler is not code and is not a bundle of animations — it is a mapping
 * from **slot** to **library entry**. Adding a wrestler means writing one of
 * these records; the engine never learns their name.
 *
 * The slot catalogue below is the full authoring surface (roughly the 120 slots
 * the spec describes). Phase 5 fills the MVP subset — chosen so that every
 * system is exercised at least once rather than to cover content — and the rest
 * are declared, empty, and reported as empty by {@link auditMoveset}. That is
 * the "build tooling so that a partially filled wrestler is playable and
 * clearly reports which slots are empty" requirement, and it is why the game
 * does not crash when you press a button nobody has authored yet.
 */

import type { WrestlerId } from "../assets/generated";
import { getMove } from "./library";
import type { MoveDef } from "./types";

export type SlotKey = string;

export interface SlotSpec {
  key: SlotKey;
  /** What the player is doing when this slot resolves. */
  note: string;
  /** Build phase that makes the slot *reachable*. 5 = playable now. */
  phase: 5 | 7;
}

/**
 * Every authored slot in the game, reachable or not.
 *
 * Order matters only for readability of the audit output.
 */
export const SLOT_CATALOGUE: SlotSpec[] = [
  // Standing, facing the opponent.
  { key: "standing.strike.up", note: "Strike ↑", phase: 5 },
  { key: "standing.strike.down", note: "Strike ↓", phase: 5 },
  { key: "standing.strike.left", note: "Strike ←", phase: 5 },
  { key: "standing.strike.right", note: "Strike →", phase: 5 },
  { key: "standing.combo.1", note: "Combination hit 1", phase: 5 },
  { key: "standing.combo.2", note: "Combination hit 2", phase: 5 },
  { key: "standing.combo.3", note: "Combination finish", phase: 5 },
  { key: "standing.whip", note: "Irish whip", phase: 5 },
  { key: "standing.grapple.up", note: "Enter power grapple", phase: 5 },
  { key: "standing.grapple.down", note: "Enter submission grapple", phase: 5 },
  { key: "standing.grapple.left", note: "Enter signature grapple", phase: 5 },
  { key: "standing.grapple.right", note: "Enter quick grapple", phase: 5 },

  // Inside each base grapple — four moves each. The centrepiece (§4).
  { key: "grapple.power.up", note: "Power grapple ↑", phase: 5 },
  { key: "grapple.power.down", note: "Power grapple ↓", phase: 5 },
  { key: "grapple.power.left", note: "Power grapple ←", phase: 5 },
  { key: "grapple.power.right", note: "Power grapple →", phase: 5 },
  { key: "grapple.submission.up", note: "Submission grapple ↑", phase: 5 },
  { key: "grapple.submission.down", note: "Submission grapple ↓", phase: 5 },
  { key: "grapple.submission.left", note: "Submission grapple ←", phase: 5 },
  { key: "grapple.submission.right", note: "Submission grapple →", phase: 5 },
  { key: "grapple.signature.up", note: "Signature grapple ↑", phase: 5 },
  { key: "grapple.signature.down", note: "Signature grapple ↓", phase: 5 },
  { key: "grapple.signature.left", note: "Signature grapple ←", phase: 5 },
  { key: "grapple.signature.right", note: "Signature grapple →", phase: 5 },
  { key: "grapple.quick.up", note: "Quick grapple ↑", phase: 5 },
  { key: "grapple.quick.down", note: "Quick grapple ↓", phase: 5 },
  { key: "grapple.quick.left", note: "Quick grapple ←", phase: 5 },
  { key: "grapple.quick.right", note: "Quick grapple →", phase: 5 },

  // Behind the opponent.
  { key: "rear.grapple.up", note: "Rear grapple ↑", phase: 5 },
  { key: "rear.grapple.down", note: "Rear grapple ↓", phase: 5 },
  { key: "rear.grapple.left", note: "Rear grapple ←", phase: 5 },
  { key: "rear.grapple.right", note: "Rear grapple →", phase: 5 },
  { key: "rearGroggy.grapple.up", note: "Rear grapple vs groggy ↑", phase: 7 },
  { key: "rearGroggy.grapple.down", note: "Rear grapple vs groggy ↓", phase: 7 },
  { key: "rearGroggy.grapple.left", note: "Rear grapple vs groggy ←", phase: 7 },
  { key: "rearGroggy.grapple.right", note: "Rear grapple vs groggy →", phase: 7 },

  // Opponent down.
  { key: "ground.head.up", note: "Ground, near head ↑ (raise)", phase: 5 },
  { key: "ground.head.down", note: "Ground, near head ↓ (pin)", phase: 5 },
  { key: "ground.head.left", note: "Ground, near head ←", phase: 5 },
  { key: "ground.head.right", note: "Ground, near head →", phase: 7 },
  { key: "ground.feet.up", note: "Ground, near feet ↑ (raise)", phase: 5 },
  { key: "ground.feet.down", note: "Ground, near feet ↓ (pin)", phase: 5 },
  { key: "ground.feet.left", note: "Ground, near feet ←", phase: 5 },
  { key: "ground.feet.right", note: "Ground, near feet →", phase: 7 },
  { key: "ground.attack.head", note: "Ground attack, near head", phase: 5 },
  { key: "ground.attack.feet", note: "Ground attack, near feet", phase: 5 },

  // Running.
  { key: "running.strike", note: "Running attack", phase: 5 },
  { key: "running.grapple", note: "Running grapple", phase: 5 },
  { key: "counter.up", note: "Counter a charge ↑", phase: 5 },
  { key: "counter.down", note: "Counter a charge ↓", phase: 5 },
  { key: "counter.neutral", note: "Counter a charge", phase: 5 },

  // Reversals — one authored counter per channel (§7).
  { key: "reversal.strike", note: "Strike reversal", phase: 5 },
  { key: "reversal.grapple", note: "Grapple reversal", phase: 5 },
  { key: "reversal.finisher", note: "Finisher reversal", phase: 5 },

  // Taunts and finishers.
  { key: "taunt.up", note: "Taunt ↑", phase: 5 },
  { key: "taunt.down", note: "Taunt ↓", phase: 5 },
  { key: "taunt.left", note: "Taunt ←", phase: 7 },
  { key: "taunt.right", note: "Taunt →", phase: 7 },
  { key: "finisher.1", note: "Finisher 1", phase: 5 },
  { key: "finisher.2", note: "Finisher 2", phase: 5 },

  // The ring as a system — authored in Phase 7 when the states become real.
  { key: "turnbuckle.facing.up", note: "Turnbuckle, facing ↑", phase: 7 },
  { key: "turnbuckle.facing.down", note: "Turnbuckle, facing ↓", phase: 7 },
  { key: "turnbuckle.back.up", note: "Turnbuckle, back exposed ↑", phase: 7 },
  { key: "turnbuckle.back.down", note: "Turnbuckle, back exposed ↓", phase: 7 },
  { key: "aerial.standing", note: "Aerial vs standing", phase: 7 },
  { key: "aerial.down", note: "Aerial vs downed", phase: 7 },
  { key: "ropes.whip", note: "Whip an opponent on the ropes", phase: 7 },
  { key: "ropes.rebound", note: "Rebound attack", phase: 7 },
  { key: "weapon.special.1", note: "Weapon special 1", phase: 7 },
  { key: "weapon.special.2", note: "Weapon special 2", phase: 7 },
];

const PHASE_5_SLOTS = SLOT_CATALOGUE.filter((slot) => slot.phase === 5);

export type Moveset = Partial<Record<SlotKey, string>>;

/**
 * Shared assignments both wrestlers take from the pool. Only the signature
 * family, the finishers and a couple of stylistic picks differ per character —
 * which is exactly the architecture the source material implies.
 */
const COMMON: Moveset = {
  "standing.strike.up": "strike.uppercut",
  "standing.strike.down": "strike.lowKick",
  "standing.strike.left": "strike.hook",
  "standing.strike.right": "strike.bodyKick",
  "standing.combo.1": "strike.combo.1",
  "standing.combo.2": "strike.combo.2",
  "standing.combo.3": "strike.combo.3",
  "standing.whip": "whip.irish",

  "standing.grapple.up": "grappleEntry.power",
  "standing.grapple.down": "grappleEntry.submission",
  "standing.grapple.left": "grappleEntry.signature",
  "standing.grapple.right": "grappleEntry.quick",

  "grapple.power.up": "grapple.power.suplex",
  "grapple.power.down": "grapple.power.slam",
  "grapple.power.left": "grapple.power.press",
  "grapple.power.right": "grapple.power.powerbomb",

  "grapple.submission.up": "grapple.sub.sleeper",
  "grapple.submission.down": "grapple.sub.bostonCrab",
  "grapple.submission.left": "grapple.sub.armWringer",
  "grapple.submission.right": "grapple.sub.legTrip",

  "grapple.quick.up": "grapple.quick.snapmare",
  "grapple.quick.down": "grapple.quick.kneeLift",
  "grapple.quick.left": "grapple.quick.armDrag",
  "grapple.quick.right": "grapple.quick.hipToss",

  "rear.grapple.up": "rear.backdrop",
  "rear.grapple.down": "rear.atomicDrop",
  "rear.grapple.left": "rear.bulldog",
  "rear.grapple.right": "rear.sleeper",

  "ground.head.up": "ground.head.raise",
  "ground.head.down": "pin.lateral",
  "ground.head.left": "ground.head.camelClutch",
  "ground.feet.up": "ground.head.raise",
  "ground.feet.down": "pin.lateral",
  "ground.feet.left": "ground.feet.legLock",
  "ground.attack.head": "ground.attack.headStomp",
  "ground.attack.feet": "ground.attack.stomp",

  "running.strike": "running.clothesline",
  "running.grapple": "running.grapple.bulldog",
  "counter.up": "counter.backdrop",
  "counter.down": "counter.dropToeHold",
  "counter.neutral": "counter.powerslam",

  "reversal.strike": "reversal.strike.block",
  "reversal.grapple": "reversal.grapple.wristLock",
  "reversal.finisher": "reversal.finisher.shove",

  "taunt.up": "taunt.call",
  "taunt.down": "taunt.flex",
};

export const MOVESETS: Record<WrestlerId, Moveset> = {
  /**
   * The super-heavyweight. Takes the power family's heaviest options, throws
   * the elbow rather than the hook, and cannot use the quick set's speed.
   */
  ironclad: {
    ...COMMON,
    "standing.strike.left": "strike.elbow",
    "grapple.signature.up": "sig.ironclad.anvilHook",
    "grapple.signature.down": "sig.ironclad.vice",
    "grapple.signature.left": "sig.ironclad.girderLift",
    "grapple.signature.right": "sig.ironclad.foundryDrop",
    "running.strike": "running.shoulderBlock",
    "counter.neutral": "counter.powerslam",
    "finisher.1": "fin.ironclad.anvilDrop",
    "finisher.2": "fin.ironclad.forgeSeal",
  },

  /**
   * The cruiserweight. Signature family is all speed and limb work, and the
   * second finisher is a submission rather than a slam — the two characters
   * therefore need two different setups to close out a match.
   */
  vanguard: {
    ...COMMON,
    // A lead jab rather than a body kick, and an elbow drop rather than a
    // stomp: the same slots, different picks out of the same pool.
    "standing.strike.right": "strike.jab",
    "ground.attack.feet": "ground.feet.elbowDrop",
    "grapple.signature.up": "sig.vanguard.spinToss",
    "grapple.signature.down": "sig.vanguard.armBar",
    "grapple.signature.left": "sig.vanguard.pivotKick",
    "grapple.signature.right": "sig.vanguard.gutwrench",
    "counter.neutral": "counter.dropToeHold",
    "finisher.1": "fin.vanguard.vanishingPoint",
    "finisher.2": "fin.vanguard.lockjaw",
  },
};

/** Resolve a slot for a wrestler. Returns null for an unauthored slot. */
export function moveForSlot(id: WrestlerId, slot: SlotKey): MoveDef | null {
  const moveId = MOVESETS[id]?.[slot];
  return moveId ? getMove(moveId) : null;
}

export interface MovesetAudit {
  id: WrestlerId;
  filled: SlotKey[];
  /** Declared but unauthored, split by whether the slot is reachable yet. */
  emptyPlayable: SlotKey[];
  emptyDeferred: SlotKey[];
  /** Assignments pointing at a library id that does not exist. */
  dangling: SlotKey[];
  /** Fraction of the currently reachable slots that are authored. */
  coverage: number;
}

/**
 * Reports what a wrestler is missing. A partially filled wrestler stays
 * playable — the resolution table simply finds nothing and the press is a
 * no-op — so this is the only thing standing between "unauthored" and
 * "silently broken".
 */
export function auditMoveset(id: WrestlerId): MovesetAudit {
  const set = MOVESETS[id] ?? {};
  const filled: SlotKey[] = [];
  const emptyPlayable: SlotKey[] = [];
  const emptyDeferred: SlotKey[] = [];
  const dangling: SlotKey[] = [];

  for (const slot of SLOT_CATALOGUE) {
    const moveId = set[slot.key];
    if (!moveId) {
      if (slot.phase === 5) emptyPlayable.push(slot.key);
      else emptyDeferred.push(slot.key);
      continue;
    }
    if (!getMove(moveId)) dangling.push(slot.key);
    else filled.push(slot.key);
  }

  const reachable = PHASE_5_SLOTS.length;
  const reachableFilled = filled.filter((key) =>
    PHASE_5_SLOTS.some((slot) => slot.key === key),
  ).length;

  return {
    id,
    filled,
    emptyPlayable,
    emptyDeferred,
    dangling,
    coverage: reachable === 0 ? 1 : reachableFilled / reachable,
  };
}
