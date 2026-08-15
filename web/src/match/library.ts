/**
 * The shared move library, spec §5.
 *
 * The most useful structural finding in the source material: the original
 * developers did not author 120 unique animations per wrestler. They built a
 * shared pool of numbered variants per move family (`Clothesline 10`,
 * `Back Suplex 9`, `Sleeper Hold 8`) and assembled each character by selecting
 * from that pool, adding only a handful of genuinely unique signature and
 * finisher moves. The guide is, accidentally, a census of that pool.
 *
 * This file is that pool. `movesets.ts` is the selection. A wrestler is an
 * assembly manifest over these ids, which is why adding a wrestler means
 * writing a data file rather than touching the engine (spec §1).
 *
 * Two things worth reading before editing:
 *
 * - `damageRegion` follows **body mechanics, not move category**. A Boston Crab
 *   damages the torso, because the spine is what is under pressure; a snapmare
 *   damages the head and neck, not the arm that threw it. The spec calls this
 *   out explicitly and it is the difference between a damage system that feels
 *   intelligent and one that feels arbitrary.
 * - Every timing number in here was derived by feel. None of the source
 *   material contains frame data (spec §17), so these are the project's own
 *   numbers and are expected to move during Phase 10 tuning.
 */

import type { MoveDef, MoveCategory, PositionState, Region, ReversalChannel } from "./types";

type MoveSeed = Partial<MoveDef> &
  Pick<MoveDef, "id" | "displayName" | "category" | "animation" | "damage" | "damageRegion">;

/**
 * Which position states each category can be executed from. Grapple moves are
 * only reachable from inside a base grapple, running moves only while running,
 * and a reversal is reachable from anywhere because it is spawned by the engine
 * rather than pressed from a standing state.
 */
const CATEGORY_POSITIONS: Record<MoveCategory, PositionState[]> = {
  strike: ["standing"],
  combo: ["standing"],
  grappleEntry: ["standing"],
  grappleMove: ["grappleHolding", "rearHolding"],
  rearGrapple: ["standing", "rearHolding"],
  whip: ["standing", "grappleHolding", "rearHolding"],
  ground: ["standing"],
  groundAttack: ["standing"],
  pin: ["standing"],
  submission: ["standing", "grappleHolding", "rearHolding"],
  running: ["running"],
  counter: ["standing"],
  reversal: [],
  taunt: ["standing"],
  finisher: ["standing", "grappleHolding", "rearHolding"],
  aerial: ["topTurnbuckle"],
  turnbuckle: ["standing"],
};

/** Sensible per-category defaults so each entry states only what is interesting. */
const CATEGORY_DEFAULTS: Record<
  MoveCategory,
  Pick<MoveDef, "clip" | "reversalType" | "reversalWindow" | "startup" | "recovery" | "impactStrength">
> = {
  strike: { clip: "strike", reversalType: "strike", reversalWindow: 0.2, startup: 0.26, recovery: 0.3, impactStrength: 0.35 },
  combo: { clip: "strike", reversalType: "strike", reversalWindow: 0.18, startup: 0.22, recovery: 0.26, impactStrength: 0.3 },
  grappleEntry: { clip: "strike", reversalType: "grapple", reversalWindow: 0.34, startup: 0.36, recovery: 0.32, impactStrength: 0.12 },
  grappleMove: { clip: "strike", reversalType: "grapple", reversalWindow: 0.32, startup: 0.52, recovery: 0.72, impactStrength: 0.7 },
  rearGrapple: { clip: "strike", reversalType: "grapple", reversalWindow: 0.28, startup: 0.5, recovery: 0.7, impactStrength: 0.7 },
  whip: { clip: "strike", reversalType: "grapple", reversalWindow: 0.3, startup: 0.3, recovery: 0.45, impactStrength: 0.2 },
  ground: { clip: "strike", reversalType: "grapple", reversalWindow: 0.26, startup: 0.45, recovery: 0.6, impactStrength: 0.5 },
  groundAttack: { clip: "strike", reversalType: "none", reversalWindow: 0, startup: 0.3, recovery: 0.4, impactStrength: 0.45 },
  pin: { clip: "idle", reversalType: "none", reversalWindow: 0, startup: 0.4, recovery: 0.5, impactStrength: 0.05 },
  submission: { clip: "strike", reversalType: "grapple", reversalWindow: 0.3, startup: 0.55, recovery: 0.6, impactStrength: 0.3 },
  running: { clip: "strike", reversalType: "strike", reversalWindow: 0.26, startup: 0.34, recovery: 0.5, impactStrength: 0.65 },
  counter: { clip: "strike", reversalType: "none", reversalWindow: 0, startup: 0.24, recovery: 0.55, impactStrength: 0.75 },
  reversal: { clip: "strike", reversalType: "strike", reversalWindow: 0.22, startup: 0.3, recovery: 0.45, impactStrength: 0.4 },
  taunt: { clip: "idle", reversalType: "none", reversalWindow: 0, startup: 0.2, recovery: 0.7, impactStrength: 0 },
  finisher: { clip: "strike", reversalType: "finisher", reversalWindow: 0.38, startup: 0.8, recovery: 1.15, impactStrength: 1 },
  aerial: { clip: "strike", reversalType: "strike", reversalWindow: 0.3, startup: 0.6, recovery: 0.8, impactStrength: 0.85 },
  turnbuckle: { clip: "strike", reversalType: "grapple", reversalWindow: 0.3, startup: 0.5, recovery: 0.7, impactStrength: 0.65 },
};

function move(seed: MoveSeed): MoveDef {
  const base = CATEGORY_DEFAULTS[seed.category];
  return {
    clip: base.clip,
    requiredPosition: CATEGORY_POSITIONS[seed.category],
    impactStrength: base.impactStrength,
    reversalType: base.reversalType,
    reversalWindow: base.reversalWindow,
    startup: base.startup,
    recovery: base.recovery,
    resultingSelfState: "standing",
    resultingOpponentState: "standing",
    causesBleed: false,
    causesPin: false,
    causesSubmission: false,
    staminaCost: 5,
    meterGain: 0.05,
    ...seed,
  } as MoveDef;
}

/** Convenience for the many "knock them down for N seconds" entries. */
function knocksDown(seconds: number): Pick<MoveDef, "resultingOpponentState" | "opponentStateSeconds"> {
  return { resultingOpponentState: "down", opponentStateSeconds: seconds };
}

function leavesGroggy(seconds: number): Pick<MoveDef, "resultingOpponentState" | "opponentStateSeconds"> {
  return { resultingOpponentState: "groggy", opponentStateSeconds: seconds };
}

const ENTRIES: MoveDef[] = [
  // ------------------------------------------------------------- strikes
  // Six slots covering eight directions; four of them are authored for the MVP
  // (spec §5), and the neutral press runs the three-hit combination string.
  //
  // The pool carries no filler. When the roster retune left the jab, the body
  // kick and the plain shoulder block with nobody to assign them to, they came
  // out rather than sitting here unreachable — `match.test.ts` asserts that
  // every entry in this file is claimed by some slot, which is what keeps the
  // library honest as the characters change.
  move({
    id: "strike.hook",
    displayName: "Hook",
    category: "strike",
    animation: "strike.punch.2",
    damage: 7,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 6,
    meterGain: 0.11,
    impactStrength: 0.45,
  }),
  move({
    id: "strike.uppercut",
    displayName: "Uppercut",
    category: "strike",
    animation: "strike.uppercut.1",
    damage: 9,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 8,
    meterGain: 0.12,
    startup: 0.34,
    recovery: 0.4,
    impactStrength: 0.6,
    ...leavesGroggy(1.4),
  }),
  move({
    id: "strike.lowKick",
    displayName: "Low kick",
    category: "strike",
    animation: "strike.kick.low.1",
    damage: 6,
    damageRegion: "legs",
    selfLoad: "legs",
    staminaCost: 5,
    meterGain: 0.09,
  }),
  move({
    id: "strike.elbow",
    displayName: "Elbow smash",
    category: "strike",
    animation: "strike.elbow.1",
    damage: 8,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 6,
    meterGain: 0.11,
    causesBleed: true,
    impactStrength: 0.55,
  }),

  // The heavy strike set. Slow enough that a competent opponent can *see* them
  // coming and reverse them, and paid for with damage that ends exchanges in
  // one hit. This is Ironclad's whole standing game: he does not out-speed
  // anyone, he makes every trade catastrophic.
  move({
    id: "strike.clubbingForearm",
    displayName: "Clubbing forearm",
    category: "strike",
    animation: "strike.club.1",
    damage: 14,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 10,
    meterGain: 0.13,
    // Nearly twice a jab's startup. The reversal window is correspondingly
    // generous — a telegraphed bomb has to be punishable or it is just tax.
    startup: 0.48,
    recovery: 0.52,
    reversalWindow: 0.3,
    impactStrength: 0.8,
    causesBleed: true,
    ...leavesGroggy(2.1),
  }),
  move({
    id: "strike.heavyBoot",
    displayName: "Heavy boot",
    category: "strike",
    animation: "strike.boot.1",
    damage: 12,
    damageRegion: "torso",
    selfLoad: "legs",
    staminaCost: 9,
    meterGain: 0.11,
    startup: 0.42,
    recovery: 0.5,
    reversalWindow: 0.28,
    impactStrength: 0.75,
    ...knocksDown(1.7),
  }),
  move({
    id: "strike.shortKnee",
    displayName: "Short knee",
    category: "strike",
    animation: "strike.knee.1",
    damage: 9,
    damageRegion: "torso",
    selfLoad: "legs",
    staminaCost: 6,
    meterGain: 0.12,
    // Vanguard's burst tool: fast, hurts, and leaves them briefly groggy, which
    // is the doorway to his own sit-out finisher.
    startup: 0.22,
    recovery: 0.26,
    impactStrength: 0.55,
    ...leavesGroggy(1.3),
  }),

  // The combination string — three chained hits on repeated strike presses.
  // The third lands hard and leaves them groggy, which is the cheapest legal
  // route into a finisher situation and therefore the one new players find.
  move({
    id: "strike.combo.1",
    displayName: "Combination 1",
    category: "combo",
    animation: "strike.combo.1",
    damage: 4,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 4,
    meterGain: 0.08,
  }),
  move({
    id: "strike.combo.2",
    displayName: "Combination 2",
    category: "combo",
    animation: "strike.combo.2",
    damage: 5,
    damageRegion: "torso",
    selfLoad: "arms",
    staminaCost: 5,
    meterGain: 0.09,
  }),
  move({
    id: "strike.combo.3",
    displayName: "Combination finish",
    category: "combo",
    animation: "strike.combo.3",
    damage: 9,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 8,
    meterGain: 0.14,
    startup: 0.32,
    recovery: 0.46,
    impactStrength: 0.7,
    ...leavesGroggy(1.8),
  }),

  // -------------------------------------------------------- grapple entries
  // Step one of spec §4: lock into one of four base grapples. Each is an
  // occupiable state with its own hold and its own reversal window, which is
  // what gives grappling its texture — the opponent gets a read on which
  // family you chose before the move lands.
  move({
    id: "grappleEntry.power",
    displayName: "Collar-and-elbow (power)",
    category: "grappleEntry",
    animation: "grapple.entry.power.1",
    damage: 0,
    damageRegion: "torso",
    staminaCost: 7,
    meterGain: 0.03,
    startup: 0.42,
    resultingSelfState: "grappleHolding",
    resultingOpponentState: "grappleHeld",
  }),
  move({
    id: "grappleEntry.submission",
    displayName: "Wrist control (submission)",
    category: "grappleEntry",
    animation: "grapple.entry.submission.1",
    damage: 0,
    damageRegion: "arms",
    staminaCost: 5,
    meterGain: 0.03,
    startup: 0.34,
    resultingSelfState: "grappleHolding",
    resultingOpponentState: "grappleHeld",
  }),
  move({
    id: "grappleEntry.signature",
    displayName: "Signature lock-up",
    category: "grappleEntry",
    animation: "grapple.entry.signature.1",
    damage: 0,
    damageRegion: "torso",
    staminaCost: 6,
    meterGain: 0.04,
    startup: 0.38,
    resultingSelfState: "grappleHolding",
    resultingOpponentState: "grappleHeld",
  }),
  move({
    id: "grappleEntry.quick",
    displayName: "Quick tie-up",
    category: "grappleEntry",
    animation: "grapple.entry.quick.1",
    damage: 0,
    damageRegion: "arms",
    staminaCost: 4,
    meterGain: 0.03,
    startup: 0.26,
    recovery: 0.24,
    reversalWindow: 0.26,
    resultingSelfState: "grappleHolding",
    resultingOpponentState: "grappleHeld",
  }),

  // ------------------------------------------------------ power grapple set
  move({
    id: "grapple.power.slam",
    displayName: "Body slam",
    category: "grappleMove",
    animation: "grapple.power.slam.1",
    damage: 13,
    damageRegion: "torso",
    selfLoad: "arms",
    staminaCost: 12,
    meterGain: 0.09,
    weightClassLimit: 330,
    impactStrength: 0.75,
    ...knocksDown(2.1),
  }),
  move({
    id: "grapple.power.suplex",
    displayName: "Vertical suplex",
    category: "grappleMove",
    animation: "grapple.power.suplex.1",
    // Head and neck take a vertical suplex, not the back the attacker used.
    damage: 15,
    damageRegion: "head",
    selfLoad: "torso",
    staminaCost: 15,
    meterGain: 0.1,
    weightClassLimit: 300,
    startup: 0.62,
    recovery: 0.85,
    impactStrength: 0.85,
    causesBleed: true,
    ...knocksDown(2.6),
  }),
  move({
    id: "grapple.power.powerbomb",
    displayName: "Powerbomb",
    category: "grappleMove",
    animation: "grapple.power.powerbomb.1",
    damage: 18,
    damageRegion: "torso",
    selfLoad: "legs",
    staminaCost: 18,
    meterGain: 0.12,
    // The one entry in the pool a cruiserweight genuinely cannot perform on a
    // super-heavyweight. It is here to make the weight class visible (§12).
    weightClassLimit: 280,
    startup: 0.72,
    recovery: 0.95,
    impactStrength: 0.95,
    ...knocksDown(3),
  }),
  move({
    id: "grapple.power.press",
    displayName: "Overhead press drop",
    category: "grappleMove",
    animation: "grapple.power.press.1",
    damage: 16,
    damageRegion: "torso",
    selfLoad: "arms",
    staminaCost: 17,
    meterGain: 0.11,
    weightClassLimit: 260,
    startup: 0.8,
    recovery: 0.9,
    impactStrength: 0.9,
    ...knocksDown(2.8),
  }),

  // ------------------------------------------------- submission grapple set
  move({
    id: "grapple.sub.armWringer",
    displayName: "Arm wringer",
    category: "grappleMove",
    animation: "grapple.sub.armwringer.1",
    damage: 9,
    damageRegion: "arms",
    selfLoad: "arms",
    staminaCost: 9,
    meterGain: 0.07,
    ...leavesGroggy(1.5),
  }),
  move({
    id: "grapple.sub.legTrip",
    displayName: "Leg trip",
    category: "grappleMove",
    animation: "grapple.sub.legtrip.1",
    damage: 8,
    damageRegion: "legs",
    selfLoad: "legs",
    staminaCost: 8,
    meterGain: 0.07,
    ...knocksDown(1.6),
  }),
  move({
    id: "grapple.sub.bostonCrab",
    displayName: "Boston crab",
    category: "submission",
    animation: "grapple.sub.bostoncrab.1",
    // The spec's own worked example: the spine is under pressure, not the legs.
    damage: 6,
    damageRegion: "torso",
    submissionRegion: "torso",
    causesSubmission: true,
    selfLoad: "arms",
    staminaCost: 14,
    meterGain: 0.06,
    resultingSelfState: "submissionHolding",
    resultingOpponentState: "submissionCaught",
  }),
  move({
    id: "grapple.sub.sleeper",
    displayName: "Sleeper hold",
    category: "submission",
    animation: "grapple.sub.sleeper.1",
    damage: 5,
    damageRegion: "head",
    submissionRegion: "head",
    causesSubmission: true,
    selfLoad: "arms",
    staminaCost: 12,
    meterGain: 0.06,
    resultingSelfState: "submissionHolding",
    resultingOpponentState: "submissionCaught",
  }),

  // ------------------------------------------------------ quick grapple set
  move({
    id: "grapple.quick.armDrag",
    displayName: "Arm drag",
    category: "grappleMove",
    animation: "grapple.quick.armdrag.1",
    damage: 7,
    damageRegion: "arms",
    selfLoad: "arms",
    staminaCost: 6,
    meterGain: 0.06,
    startup: 0.38,
    recovery: 0.5,
    impactStrength: 0.5,
    ...knocksDown(1.3),
  }),
  move({
    id: "grapple.quick.snapmare",
    displayName: "Snapmare",
    category: "grappleMove",
    animation: "grapple.quick.snapmare.1",
    damage: 8,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 7,
    meterGain: 0.06,
    startup: 0.4,
    recovery: 0.52,
    impactStrength: 0.55,
    ...knocksDown(1.5),
  }),
  move({
    id: "grapple.quick.hipToss",
    displayName: "Hip toss",
    category: "grappleMove",
    animation: "grapple.quick.hiptoss.1",
    damage: 10,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 9,
    meterGain: 0.07,
    weightClassLimit: 320,
    startup: 0.45,
    recovery: 0.6,
    impactStrength: 0.65,
    ...knocksDown(1.8),
  }),
  move({
    id: "grapple.quick.kneeLift",
    displayName: "Knee lift",
    category: "grappleMove",
    animation: "grapple.quick.kneelift.1",
    damage: 8,
    damageRegion: "torso",
    selfLoad: "legs",
    staminaCost: 6,
    meterGain: 0.07,
    startup: 0.3,
    recovery: 0.4,
    impactStrength: 0.45,
    ...leavesGroggy(1.6),
  }),

  // --------------------------------------------------------- rear grapples
  move({
    id: "rear.backdrop",
    displayName: "Back drop",
    category: "rearGrapple",
    animation: "rear.backdrop.1",
    damage: 14,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 13,
    meterGain: 0.1,
    weightClassLimit: 310,
    requiredPosition: ["standing", "rearHolding"],
    impactStrength: 0.8,
    ...knocksDown(2.4),
  }),
  move({
    id: "rear.bulldog",
    displayName: "Bulldog",
    category: "rearGrapple",
    animation: "rear.bulldog.1",
    damage: 12,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 10,
    meterGain: 0.09,
    requiredPosition: ["standing", "rearHolding"],
    causesBleed: true,
    ...knocksDown(2.2),
  }),
  move({
    id: "rear.atomicDrop",
    displayName: "Atomic drop",
    category: "rearGrapple",
    animation: "rear.atomicdrop.1",
    damage: 11,
    damageRegion: "legs",
    selfLoad: "legs",
    staminaCost: 11,
    meterGain: 0.08,
    requiredPosition: ["standing", "rearHolding"],
    ...leavesGroggy(2),
  }),
  move({
    id: "rear.sleeper",
    displayName: "Rear sleeper",
    category: "submission",
    animation: "rear.sleeper.1",
    damage: 5,
    damageRegion: "head",
    submissionRegion: "head",
    causesSubmission: true,
    selfLoad: "arms",
    staminaCost: 12,
    meterGain: 0.05,
    requiredPosition: ["standing", "rearHolding"],
    resultingSelfState: "submissionHolding",
    resultingOpponentState: "submissionCaught",
  }),

  // --------------------------------------------------------------- ground
  // Near the head and near the feet resolve to entirely different tables (§3).
  move({
    id: "ground.head.raise",
    displayName: "Pull upright",
    category: "ground",
    animation: "ground.raise.1",
    damage: 2,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 6,
    meterGain: 0.03,
    requiredPosition: ["standing"],
    requiredOpponentPosition: ["down", "gettingUp"],
    startup: 0.4,
    recovery: 0.35,
    ...leavesGroggy(2.4),
  }),
  move({
    id: "ground.head.camelClutch",
    displayName: "Camel clutch",
    category: "submission",
    animation: "ground.camelclutch.1",
    damage: 6,
    damageRegion: "torso",
    submissionRegion: "torso",
    causesSubmission: true,
    selfLoad: "arms",
    staminaCost: 13,
    meterGain: 0.05,
    requiredPosition: ["standing"],
    requiredOpponentPosition: ["down", "gettingUp"],
    resultingSelfState: "submissionHolding",
    resultingOpponentState: "submissionCaught",
  }),
  move({
    id: "ground.feet.legLock",
    displayName: "Half crab",
    category: "submission",
    animation: "ground.halfcrab.1",
    damage: 6,
    damageRegion: "legs",
    submissionRegion: "legs",
    causesSubmission: true,
    selfLoad: "arms",
    staminaCost: 12,
    meterGain: 0.05,
    requiredPosition: ["standing"],
    requiredOpponentPosition: ["down", "gettingUp"],
    resultingSelfState: "submissionHolding",
    resultingOpponentState: "submissionCaught",
  }),
  move({
    id: "ground.attack.stomp",
    displayName: "Stomp",
    category: "groundAttack",
    animation: "ground.stomp.1",
    damage: 5,
    damageRegion: "torso",
    selfLoad: "legs",
    staminaCost: 4,
    meterGain: 0.08,
    requiredPosition: ["standing"],
    requiredOpponentPosition: ["down", "gettingUp"],
    ...knocksDown(0.9),
  }),
  move({
    id: "ground.attack.headStomp",
    displayName: "Head stomp",
    category: "groundAttack",
    animation: "ground.stomp.2",
    damage: 6,
    damageRegion: "head",
    selfLoad: "legs",
    staminaCost: 5,
    meterGain: 0.09,
    causesBleed: true,
    requiredPosition: ["standing"],
    requiredOpponentPosition: ["down", "gettingUp"],
    ...knocksDown(0.9),
  }),

  // ------------------------------------------------------------------ pin
  move({
    id: "pin.lateral",
    displayName: "Lateral press",
    category: "pin",
    animation: "pin.lateral.1",
    damage: 0,
    damageRegion: "torso",
    causesPin: true,
    staminaCost: 5,
    meterGain: 0,
    requiredPosition: ["standing"],
    requiredOpponentPosition: ["down", "gettingUp"],
    resultingSelfState: "pinning",
    resultingOpponentState: "pinned",
  }),

  // -------------------------------------------------------------- running
  move({
    id: "running.clothesline",
    displayName: "Running clothesline",
    category: "running",
    animation: "running.clothesline.1",
    damage: 12,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 11,
    meterGain: 0.1,
    requiredPosition: ["running"],
    impactStrength: 0.8,
    ...knocksDown(2.2),
  }),
  move({
    id: "running.shoulderTackle",
    displayName: "Running shoulder tackle",
    category: "running",
    animation: "running.shouldertackle.1",
    // Vanguard's signature bit of offence and the loudest non-finisher hit in
    // the game. 280 lb arriving at a dead run: it costs real stamina, it can be
    // read and countered, and when it lands the match stops for a beat.
    damage: 17,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 15,
    meterGain: 0.14,
    requiredPosition: ["running"],
    startup: 0.3,
    recovery: 0.62,
    impactStrength: 0.92,
    ...knocksDown(2.9),
  }),
  move({
    id: "running.grapple.bulldog",
    displayName: "Running bulldog",
    category: "running",
    animation: "running.bulldog.1",
    damage: 13,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 13,
    meterGain: 0.1,
    requiredPosition: ["running"],
    reversalType: "grapple",
    impactStrength: 0.8,
    ...knocksDown(2.4),
  }),

  // ------------------------------------------------------- running counters
  // Moves that catch a *charging* opponent. The reward for standing still and
  // reading the run rather than mashing into it.
  move({
    id: "counter.backdrop",
    displayName: "Counter back drop",
    category: "counter",
    animation: "counter.backdrop.1",
    damage: 15,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 10,
    meterGain: 0.12,
    weightClassLimit: 320,
    requiredOpponentPosition: ["running"],
    impactStrength: 0.9,
    ...knocksDown(2.8),
  }),
  move({
    id: "counter.powerslam",
    displayName: "Counter powerslam",
    category: "counter",
    animation: "counter.powerslam.1",
    damage: 17,
    damageRegion: "torso",
    selfLoad: "arms",
    staminaCost: 13,
    meterGain: 0.13,
    weightClassLimit: 300,
    requiredOpponentPosition: ["running"],
    impactStrength: 0.95,
    ...knocksDown(3),
  }),
  move({
    id: "counter.dropToeHold",
    displayName: "Drop toe hold",
    category: "counter",
    animation: "counter.droptoe.1",
    damage: 9,
    damageRegion: "legs",
    selfLoad: "arms",
    staminaCost: 7,
    meterGain: 0.1,
    requiredOpponentPosition: ["running"],
    impactStrength: 0.6,
    ...knocksDown(2),
  }),

  // ------------------------------------------------------------- reversals
  // The reversal is itself a move, which is what makes counter-to-a-counter
  // fall out of the engine for free (spec §7): it runs through the same
  // execution path and therefore opens its own window against the original
  // attacker.
  move({
    id: "reversal.strike.block",
    displayName: "Block and counter",
    category: "reversal",
    animation: "reversal.block.1",
    damage: 6,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 6,
    meterGain: 0.08,
    reversalType: "strike",
    ...leavesGroggy(1.6),
  }),
  move({
    id: "reversal.grapple.wristLock",
    displayName: "Wrist-lock reversal",
    category: "reversal",
    animation: "reversal.wristlock.1",
    damage: 5,
    damageRegion: "arms",
    selfLoad: "arms",
    staminaCost: 7,
    meterGain: 0.08,
    // Reversing a grapple puts you behind them — and *that* is reversible in
    // turn, which is the one level of counter-to-a-counter the spec requires.
    reversalType: "strike",
    resultingSelfState: "rearHolding",
    resultingOpponentState: "rearHeld",
    opponentStateSeconds: 2.2,
  }),
  move({
    id: "reversal.finisher.shove",
    displayName: "Finisher escape",
    category: "reversal",
    animation: "reversal.shove.1",
    damage: 8,
    damageRegion: "torso",
    selfLoad: "arms",
    staminaCost: 10,
    meterGain: 0.12,
    reversalType: "none",
    ...leavesGroggy(2.2),
  }),

  // ---------------------------------------------------------------- taunts
  // Taunting fills the meter and taunting *longer* fills it more, which is what
  // makes showboating a mechanic rather than a decoration (§10).
  move({
    id: "taunt.call",
    displayName: "Call them on",
    category: "taunt",
    animation: "taunt.call.1",
    damage: 0,
    damageRegion: "head",
    staminaCost: 0,
    meterGain: 0.12,
    recovery: 0.6,
  }),
  move({
    id: "taunt.flex",
    displayName: "Flex",
    category: "taunt",
    animation: "taunt.flex.1",
    damage: 0,
    damageRegion: "head",
    staminaCost: 0,
    meterGain: 0.14,
    recovery: 0.8,
  }),

  // ------------------------------------------------------------------ whip
  move({
    id: "whip.irish",
    displayName: "Irish whip",
    category: "whip",
    animation: "whip.irish.1",
    damage: 0,
    damageRegion: "torso",
    selfLoad: "arms",
    staminaCost: 6,
    meterGain: 0.04,
    requiredPosition: ["standing", "grappleHolding", "rearHolding"],
    // Phase 7 turns this into a real rebound; today it shoves them away and
    // leaves them staggering, which is enough to prove the slot resolves.
    ...leavesGroggy(1.2),
  }),

  // ----------------------------------------- signature sets (per character)
  // Spec §5: each character gets only three to five genuinely unique
  // animations — their signature grapple family and their two finishers.
  // Everything above this line is shared.
  move({
    id: "sig.ironclad.anvilHook",
    displayName: "Anvil hook",
    category: "grappleMove",
    animation: "sig.ironclad.anvilhook.1",
    damage: 15,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 13,
    meterGain: 0.11,
    impactStrength: 0.85,
    causesBleed: true,
    ...knocksDown(2.4),
  }),
  move({
    id: "sig.ironclad.foundryDrop",
    displayName: "Foundry drop",
    category: "grappleMove",
    animation: "sig.ironclad.foundrydrop.1",
    damage: 17,
    damageRegion: "torso",
    selfLoad: "legs",
    staminaCost: 16,
    meterGain: 0.11,
    weightClassLimit: 300,
    startup: 0.68,
    recovery: 0.9,
    impactStrength: 0.9,
    ...knocksDown(2.8),
  }),
  move({
    id: "sig.ironclad.girderLift",
    displayName: "Girder lift",
    category: "grappleMove",
    animation: "sig.ironclad.girderlift.1",
    damage: 14,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 15,
    meterGain: 0.1,
    weightClassLimit: 340,
    ...knocksDown(2.3),
  }),
  move({
    id: "sig.ironclad.vice",
    displayName: "Iron vice",
    category: "submission",
    animation: "sig.ironclad.vice.1",
    damage: 7,
    damageRegion: "torso",
    submissionRegion: "torso",
    causesSubmission: true,
    selfLoad: "arms",
    staminaCost: 15,
    meterGain: 0.06,
    resultingSelfState: "submissionHolding",
    resultingOpponentState: "submissionCaught",
  }),

  // Vanguard's signature family is the vertical slam set: pick them up, hold
  // them there a beat, put them through the mat. Short, violent, no finesse.
  // Every entry is a lift, which is what makes his weight class matter — at
  // 280 lb he can perform all of them on Ironclad except the deadlift.
  move({
    id: "sig.vanguard.liftSlam",
    displayName: "Vertical lift slam",
    category: "grappleMove",
    animation: "sig.vanguard.liftslam.1",
    damage: 16,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 14,
    meterGain: 0.11,
    weightClassLimit: 340,
    startup: 0.55,
    recovery: 0.7,
    impactStrength: 0.85,
    ...knocksDown(2.5),
  }),
  move({
    id: "sig.vanguard.gutDump",
    displayName: "Gutwrench dump",
    category: "grappleMove",
    animation: "sig.vanguard.gutdump.1",
    damage: 15,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 13,
    meterGain: 0.1,
    weightClassLimit: 330,
    startup: 0.48,
    recovery: 0.62,
    impactStrength: 0.82,
    ...knocksDown(2.3),
  }),
  move({
    id: "sig.vanguard.driveSlam",
    displayName: "Drive slam",
    category: "grappleMove",
    animation: "sig.vanguard.driveslam.1",
    // Carried backwards and driven down: the neck and head take it, not the
    // torso he was holding.
    damage: 14,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 12,
    meterGain: 0.11,
    weightClassLimit: 330,
    startup: 0.44,
    recovery: 0.58,
    impactStrength: 0.8,
    causesBleed: true,
    ...knocksDown(2.2),
  }),
  move({
    id: "sig.vanguard.deadliftSlam",
    displayName: "Deadlift slam",
    category: "grappleMove",
    animation: "sig.vanguard.deadliftslam.1",
    damage: 18,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 18,
    meterGain: 0.12,
    // The one lift even he cannot get on a 330 lb man — the weight class has to
    // bite somewhere or it is decoration (§12).
    weightClassLimit: 300,
    startup: 0.66,
    recovery: 0.88,
    impactStrength: 0.95,
    ...knocksDown(3),
  }),

  // ------------------------------------------------------------- finishers
  // Two per wrestler, each with a *different* situational requirement, so the
  // HUD's two readouts ("available" and "situation satisfied") are meaningfully
  // separate and getting into position is the game (§10).
  move({
    id: "fin.ironclad.anvilDrop",
    displayName: "ANVIL DROP",
    category: "finisher",
    animation: "fin.ironclad.anvildrop.1",
    damage: 34,
    damageRegion: "head",
    selfLoad: "arms",
    staminaCost: 20,
    meterGain: 0,
    // A fireman's-carry dump slam: hoists them across the shoulders, walks a
    // step, and throws them off. Only legal while they are groggy, because
    // nobody stands still for it.
    requiredSituation: "opponentGroggy",
    weightClassLimit: 340,
    causesBleed: true,
    startup: 0.85,
    recovery: 1.2,
    impactStrength: 1,
    ...knocksDown(4.2),
  }),
  move({
    id: "fin.ironclad.forgeSeal",
    displayName: "FORGE SEAL",
    category: "finisher",
    animation: "fin.ironclad.forgeseal.1",
    // A kneeling arm lock, not a slam: he drops a knee across them, traps the
    // arm and cranks. Reachable only standing over a downed opponent's head,
    // which makes "put them down, then walk to the right end of them" a real
    // sequence rather than a button.
    damage: 11,
    damageRegion: "arms",
    submissionRegion: "arms",
    causesSubmission: true,
    selfLoad: "arms",
    staminaCost: 18,
    meterGain: 0,
    requiredSituation: "opponentDownNearHead",
    requiredOpponentPosition: ["down", "gettingUp"],
    startup: 0.6,
    impactStrength: 0.7,
    resultingSelfState: "submissionHolding",
    resultingOpponentState: "submissionCaught",
  }),
  move({
    id: "fin.vanguard.breakwall",
    displayName: "BREAKWALL",
    category: "finisher",
    animation: "fin.vanguard.breakwall.1",
    // Running midsection tackle. The situational requirement *is* the run: he
    // has to build speed across the ring with the meter stored, which is the
    // most readable finisher setup in the game and the one that suits a man
    // whose entire identity is forward momentum.
    damage: 32,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 19,
    meterGain: 0,
    requiredSituation: "always",
    requiredPosition: ["running"],
    startup: 0.42,
    recovery: 1.05,
    impactStrength: 1,
    causesBleed: true,
    ...knocksDown(4.2),
  }),
  move({
    id: "fin.vanguard.spireDrop",
    displayName: "SPIRE DROP",
    category: "finisher",
    animation: "fin.vanguard.spiredrop.1",
    // Sit-out vertical slam: deadlift them straight up, hold, then drop through
    // the mat with his own weight behind it.
    damage: 31,
    damageRegion: "torso",
    selfLoad: "torso",
    staminaCost: 18,
    meterGain: 0,
    requiredSituation: "opponentGroggy",
    weightClassLimit: 340,
    startup: 0.78,
    recovery: 1.15,
    impactStrength: 1,
    ...knocksDown(4.1),
  }),
];

export const MOVE_LIBRARY: Record<string, MoveDef> = Object.fromEntries(
  ENTRIES.map((entry) => [entry.id, entry]),
);

export function getMove(id: string): MoveDef | null {
  return MOVE_LIBRARY[id] ?? null;
}

/** Family census, the same shape the period guide accidentally documented. */
export function libraryFamilies(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of ENTRIES) {
    const family = entry.animation.split(".").slice(0, -1).join(".");
    counts[family] = (counts[family] ?? 0) + 1;
  }
  return counts;
}

export const MOVE_COUNT = ENTRIES.length;

/** Channel a defender must press to reverse a move in flight. */
export function reversalChannelOf(move: MoveDef): ReversalChannel {
  return move.reversalType;
}

/** Region a move loads on the attacker, for the recoil rule in §8. */
export function selfLoadOf(move: MoveDef): Region | undefined {
  return move.selfLoad;
}
