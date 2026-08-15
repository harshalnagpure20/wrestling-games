/**
 * The bridge between the match engine and the canvas.
 *
 * Everything about *rules* lives in `src/match/` and knows nothing about
 * three.js. Everything about *bodies* lives here: where the two wrestlers
 * stand, which way they face, which clip is playing, and how the geometry of
 * that arrangement turns back into the spatial tuple the resolution table
 * reads (distance, behind-or-in-front, near the head or the feet, near the
 * ropes).
 *
 * The split is deliberate and it is what makes Phase 5 verifiable: the systems
 * layer is exercised by `match.test.ts` in a node process with no renderer, and
 * this file is the only thing that has to be judged by eye.
 */

import * as THREE from "three";

import { audio } from "../audio/audioManager";
import type { FighterIntent, TauntDir } from "./input";
import { MatchEngine } from "../match/engine";
import type { Fighter } from "../match/fighter";
import {
  DOWNED_STATES,
  emptyMatchInput,
  type DistanceBand,
  type Direction,
  type MatchEvent,
  type MatchInput,
  type MatchResult,
  type PositionState,
  type Region,
  type DamageLevel,
  type SpatialRelation,
} from "../match/types";
import { RING_HALF } from "../scene/ring";
import type { WrestlerView } from "../scene/wrestlers";

export type { DistanceBand, PositionState } from "../match/types";

export interface FighterDebug {
  id: string;
  label: string;
  position: PositionState;
  band: DistanceBand;
  facingDeg: number;
  speed: number;
  /** 0–100 remaining stamina. */
  stamina: number;
  /** 0–100, derived from localised damage rather than stored separately. */
  vitality: number;
  damage: Record<Region, number>;
  damageLevels: Record<Region, DamageLevel>;
  bleeding: boolean;
  /** Stored finisher icons (0–5). */
  icons: number;
  /** 0–1 progress toward the next icon. */
  iconCharge: number;
  /** Icon stored *and* the situational requirement met. */
  finisherReady: boolean;
  /** The situational requirement alone — the second HUD light (§10). */
  situationSatisfied: boolean;
  lastAction: string;
  pressed: string[];
}

export interface MatchHud {
  clock: number;
  live: boolean;
  fighters: FighterDebug[];
  pin: { attacker: 0 | 1; count: number; guaranteed: boolean } | null;
  submission: { attacker: 0 | 1; pressure: number; region: Region } | null;
  result: MatchResult | null;
}

/** One-frame presentation pulse, drained by the ring engine after each tick. */
export interface ImpactFeedback {
  hitStop: number;
  shake: number;
  rumble: number;
  rumbleSeconds: number;
}

function panFor(fighter: 0 | 1): number {
  return fighter === 0 ? -0.35 : 0.35;
}

const WALK_SPEED = 2.4;
const RUN_SPEED = 5.4;
const RING_MARGIN = 0.55;
const ACCEL = 10;
const DECEL = 14;
const TURN_WALK = 3.2;
const TURN_RUN = 2.4;
const TURN_PIVOT = 4.0;
const TURN_SLOW_ANGLE = 0.7;
/** How close two bodies stand once locked up. Phase 6b makes this contact real. */
const CLINCH_DISTANCE = 0.85;
/** Inside this of a rope, a submission hold gets broken (§9). */
const ROPE_ZONE = 0.75;

function bandFor(distance: number): DistanceBand {
  if (distance < 1.05) return "clinch";
  if (distance < 2.1) return "close";
  if (distance < 3.6) return "mid";
  return "far";
}

function pressedList(intent: FighterIntent): string[] {
  const list: string[] = [];
  if (intent.strike) list.push("strike");
  if (intent.grapple) list.push("grapple");
  if (intent.action) list.push("action");
  if (intent.finisher) list.push("finisher");
  if (intent.reverseStrike) list.push("revStrike");
  if (intent.reverseGrapple) list.push("revGrapple");
  if (intent.retarget) list.push("retarget");
  if (intent.taunt) list.push(`taunt:${intent.taunt}`);
  return list;
}

/** Previous-frame button state, so held keys do not re-fire every frame. */
interface EdgeState {
  strike: boolean;
  grapple: boolean;
  action: boolean;
  finisher: boolean;
  taunt: TauntDir;
  reverseStrike: boolean;
  reverseGrapple: boolean;
}

function makeEdges(): EdgeState {
  return {
    strike: false,
    grapple: false,
    action: false,
    finisher: false,
    taunt: null,
    reverseStrike: false,
    reverseGrapple: false,
  };
}

export class MatchControl {
  readonly engine = new MatchEngine();

  private readonly velocity = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly facing = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)];
  /**
   * Where each wrestler's head points while they are on the mat, fixed at the
   * moment they go down. It is the only thing that makes "standing near the
   * head" and "standing near the feet" different move tables (§3).
   */
  private readonly downHead = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)];
  private readonly edges = [makeEdges(), makeEdges()];
  private readonly camForward = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly spatial: [SpatialRelation, SpatialRelation] = [
    { distance: 99, band: "far", behind: false, groundSide: null, nearRopes: false },
    { distance: 99, band: "far", behind: false, groundSide: null, nearRopes: false },
  ];
  private lastEvents: MatchEvent[] = [];
  private pendingFeedback: ImpactFeedback = {
    hitStop: 0,
    shake: 0,
    rumble: 0,
    rumbleSeconds: 0.6,
  };

  /** Ring engine reads this once per frame and zeros it. */
  consumeFeedback(): ImpactFeedback {
    const pulse = this.pendingFeedback;
    this.pendingFeedback = { hitStop: 0, shake: 0, rumble: 0, rumbleSeconds: 0.6 };
    return pulse;
  }

  private addFeedback(partial: Partial<ImpactFeedback>): void {
    if (partial.hitStop)
      this.pendingFeedback.hitStop = Math.max(this.pendingFeedback.hitStop, partial.hitStop);
    if (partial.shake) this.pendingFeedback.shake += partial.shake;
    if (partial.rumble) {
      this.pendingFeedback.rumble = Math.max(this.pendingFeedback.rumble, partial.rumble);
      this.pendingFeedback.rumbleSeconds = Math.max(
        this.pendingFeedback.rumbleSeconds,
        partial.rumbleSeconds ?? 0.6,
      );
    }
  }

  // ------------------------------------------------------------ input glue

  /** Quantise the stick into the four directions the move tables read. */
  private directionOf(intent: FighterIntent): Direction {
    const { moveX, moveY } = intent;
    if (Math.abs(moveX) < 0.42 && Math.abs(moveY) < 0.42) return "neutral";
    if (Math.abs(moveY) >= Math.abs(moveX)) return moveY < 0 ? "up" : "down";
    return moveX < 0 ? "left" : "right";
  }

  private toMatchInput(index: 0 | 1, intent: FighterIntent): MatchInput {
    const edge = this.edges[index];
    const input = emptyMatchInput();

    input.direction = this.directionOf(intent);
    input.strike = intent.strike && !edge.strike;
    input.grapple = intent.grapple && !edge.grapple;
    input.action = intent.action && !edge.action;
    input.finisher = intent.finisher && !edge.finisher;
    input.taunt = !!intent.taunt && intent.taunt !== edge.taunt;
    input.tauntHeld = !!intent.taunt || intent.action;
    input.reverseStrike = intent.reverseStrike && !edge.reverseStrike;
    input.reverseGrapple = intent.reverseGrapple && !edge.reverseGrapple;
    input.run = intent.run;
    input.moving = Math.hypot(intent.moveX, intent.moveY) > 0.12;
    input.mash =
      input.strike || input.grapple || input.action || input.finisher || input.taunt;

    edge.strike = intent.strike;
    edge.grapple = intent.grapple;
    edge.action = intent.action;
    edge.finisher = intent.finisher;
    edge.taunt = intent.taunt;
    edge.reverseStrike = intent.reverseStrike;
    edge.reverseGrapple = intent.reverseGrapple;
    return input;
  }

  // -------------------------------------------------------------- geometry

  private updateSpatial(wrestlers: WrestlerView[]): void {
    const a = wrestlers[0].position;
    const b = wrestlers[1].position;
    const distance = a.distanceTo(b);
    const band = bandFor(distance);
    const limit = RING_HALF - RING_MARGIN;

    for (let i = 0; i < 2; i += 1) {
      const other = i ^ 1;
      const self = wrestlers[i].position;
      const target = wrestlers[other].position;
      const relation = this.spatial[i];
      relation.distance = distance;
      relation.band = band;

      // Behind them: we stand on the far side of the line they are facing.
      this.scratch.copy(self).sub(target).setY(0);
      relation.behind = this.scratch.dot(this.facing[other]) < -0.15 && distance < 2.2;

      const opponentDown = DOWNED_STATES.has(this.engine.fighters[other].state);
      relation.groundSide = opponentDown
        ? this.scratch.dot(this.downHead[other]) >= 0
          ? "head"
          : "feet"
        : null;

      relation.nearRopes =
        Math.abs(self.x) > limit - ROPE_ZONE || Math.abs(self.z) > limit - ROPE_ZONE;
    }
  }

  /**
   * Snap the two bodies into a lock-up. Placeholder contact until Phase 6b
   * builds the post-mixer IK layer — but the *positions* it produces are the
   * ones that layer will weld hands to, so getting them right now is not wasted.
   */
  private lockPositions(holder: number, wrestlers: WrestlerView[]): void {
    const held = holder ^ 1;
    this.scratch.copy(wrestlers[held].position).sub(wrestlers[holder].position).setY(0);
    if (this.scratch.lengthSq() < 1e-6) this.scratch.copy(this.facing[holder]);
    this.scratch.normalize();

    const limit = RING_HALF - RING_MARGIN;
    const target = wrestlers[held].position;
    target.x = THREE.MathUtils.clamp(
      wrestlers[holder].position.x + this.scratch.x * CLINCH_DISTANCE,
      -limit,
      limit,
    );
    target.z = THREE.MathUtils.clamp(
      wrestlers[holder].position.z + this.scratch.z * CLINCH_DISTANCE,
      -limit,
      limit,
    );

    this.facing[holder].copy(this.scratch);
    wrestlers[holder].setFacing(this.facing[holder]);
    const heldState = this.engine.fighters[held].state;
    // A rear grapple leaves the victim facing away; a front one faces them in.
    this.facing[held].copy(this.scratch).multiplyScalar(heldState === "rearHeld" ? 1 : -1);
    wrestlers[held].setFacing(this.facing[held]);
  }

  private shove(index: number, wrestlers: WrestlerView[], distance: number): void {
    const limit = RING_HALF - RING_MARGIN;
    const position = wrestlers[index].position;
    this.scratch.copy(this.facing[index ^ 1]).multiplyScalar(distance);
    position.x = THREE.MathUtils.clamp(position.x + this.scratch.x, -limit, limit);
    position.z = THREE.MathUtils.clamp(position.z + this.scratch.z, -limit, limit);
  }

  // --------------------------------------------------------------- animation

  /**
   * Turns engine events into clips. Six placeholder clips carry every move in
   * the library today, which is exactly the point of keeping `clip` a separate
   * field from `animation` on the move record: Phase 6a swaps the clips without
   * the systems layer noticing.
   */
  private applyEvents(events: MatchEvent[], wrestlers: WrestlerView[]): void {
    for (const event of events) {
      switch (event.type) {
        case "move:start": {
          const view = wrestlers[event.fighter];
          if (event.move.clip === "idle") view.playIdle(0.15);
          else view.playOneShot(event.move.clip);
          break;
        }
        case "move:impact": {
          const victimIdx = (event.fighter ^ 1) as 0 | 1;
          const victim = wrestlers[victimIdx];
          const strength = event.move.impactStrength;
          victim.sell(strength, this.facing[event.fighter]);
          if (strength >= 0.4) victim.stopMarch(0.08);
          if (event.move.resultingOpponentState !== "down") {
            this.shove(victimIdx, wrestlers, 0.16 + strength * 0.3);
          }
          this.addFeedback({
            hitStop: 0.018 + strength * 0.072,
            shake: 0.08 + strength * 0.38,
            rumble: strength >= 0.85 ? 0.3 + strength * 0.2 : 0,
            rumbleSeconds: strength >= 0.85 ? 0.75 + strength * 0.45 : 0.6,
          });
          audio.matchImpact(strength, panFor(victimIdx));
          if (event.move.category === "finisher") audio.crowdSwell(1, 2.8);
          break;
        }
        case "move:whiff": {
          wrestlers[event.fighter].lurch(0.35, this.facing[event.fighter]);
          audio.matchWhiff(panFor(event.fighter));
          this.addFeedback({ shake: 0.04 });
          break;
        }
        case "move:failed":
        case "action:empty": {
          wrestlers[event.fighter].lurch(0.22, this.facing[event.fighter]);
          audio.matchWhiff(panFor(event.fighter), event.type === "action:empty" ? 0.45 : 0.7);
          break;
        }
        case "reversal": {
          audio.crowdSwell(0.85, 2);
          this.addFeedback({ hitStop: 0.055, shake: 0.26 });
          break;
        }
        case "pin:count": {
          if (event.count >= 2) audio.crowdSwell(0.4 + event.count * 0.18, 1.5);
          break;
        }
        case "state": {
          const view = wrestlers[event.fighter];
          if (event.state === "down" || event.state === "ko") {
            // Remember which way the head points before the body is on the mat.
            this.downHead[event.fighter].copy(this.facing[event.fighter]).multiplyScalar(-1);
            this.velocity[event.fighter].set(0, 0, 0);
            view.playOneShot("knockdown");
            this.shove(event.fighter, wrestlers, 0.35);
            this.addFeedback({ shake: 0.22, rumble: 0.32, rumbleSeconds: 0.85 });
          } else if (event.state === "gettingUp") {
            view.playOneShot("getUp");
          } else if (event.state === "standing" && event.previous !== "running") {
            if (!view.isSelling) view.playIdle(0.2);
          }
          break;
        }
        case "grapple:break": {
          wrestlers[event.fighter].playIdle(0.2);
          wrestlers[event.fighter ^ 1].playIdle(0.2);
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ frame

  update(
    delta: number,
    wrestlers: WrestlerView[],
    intents: [FighterIntent, FighterIntent],
    camera: THREE.Camera,
  ): MatchHud {
    if (wrestlers.length < 2) {
      return { clock: 0, live: false, fighters: [], pin: null, submission: null, result: null };
    }

    this.camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.camForward.y = 0;
    if (this.camForward.lengthSq() < 1e-6) this.camForward.set(0, 0, -1);
    this.camForward.normalize();
    this.camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.camRight.y = 0;
    if (this.camRight.lengthSq() < 1e-6) this.camRight.set(1, 0, 0);
    this.camRight.normalize();

    this.updateSpatial(wrestlers);

    const inputs: [MatchInput, MatchInput] = [
      this.toMatchInput(0, intents[0]),
      this.toMatchInput(1, intents[1]),
    ];
    this.lastEvents = this.engine.tick(delta, inputs, this.spatial);
    this.applyEvents(this.lastEvents, wrestlers);

    const limit = RING_HALF - RING_MARGIN;
    const debug: FighterDebug[] = [];

    for (let i = 0; i < 2; i += 1) {
      const wrestler = wrestlers[i];
      const fighter = this.engine.fighters[i];
      const intent = intents[i];
      const other = i ^ 1;

      wrestler.setStrikeTilt(fighter.stamina < 20 ? 0.05 : 0);

      if (fighter.state === "grappleHolding" || fighter.state === "rearHolding") {
        this.velocity[i].set(0, 0, 0);
        wrestler.stopMarch(0.12);
        this.lockPositions(i, wrestlers);
      } else if (!fighter.mobile) {
        // Busy, held, down or pinned: the engine owns the body.
        this.velocity[i].multiplyScalar(Math.exp(-DECEL * 2 * delta));
        if (fighter.busy || fighter.state !== "standing") wrestler.stopMarch(0.14);
        if (fighter.busy && this.spatial[i].distance < 3) this.faceOpponent(i, other, wrestlers);
      } else {
        this.drive(i, delta, intent, wrestler, fighter);
      }

      const position = wrestler.position;
      position.x = THREE.MathUtils.clamp(position.x + this.velocity[i].x * delta, -limit, limit);
      position.z = THREE.MathUtils.clamp(position.z + this.velocity[i].z * delta, -limit, limit);

      const snapshot = fighter.snapshot(this.engine.fighters[other], this.spatial[i]);
      debug.push({
        id: wrestler.id,
        label: wrestler.skin.label,
        position: fighter.state,
        band: this.spatial[i].band,
        facingDeg: Math.round((Math.atan2(this.facing[i].x, this.facing[i].z) * 180) / Math.PI),
        speed: Number(this.velocity[i].length().toFixed(2)),
        stamina: Math.round(snapshot.stamina),
        vitality: Math.round(snapshot.vitality),
        damage: snapshot.damage,
        damageLevels: snapshot.damageLevels,
        bleeding: snapshot.bleeding,
        icons: snapshot.icons,
        iconCharge: snapshot.iconCharge,
        finisherReady: snapshot.finisherReady,
        situationSatisfied: snapshot.situationSatisfied,
        lastAction: snapshot.lastAction,
        pressed: pressedList(intent),
      });
    }

    const pin = this.engine.pinStatus;
    const submission = this.engine.submissionStatus;
    return {
      clock: this.engine.clock,
      live: this.engine.live,
      fighters: debug,
      pin: pin
        ? { attacker: pin.attacker, count: pin.count, guaranteed: pin.announcedGuaranteed }
        : null,
      submission: submission
        ? { attacker: submission.attacker, pressure: submission.pressure, region: submission.region }
        : null,
      result: this.engine.result,
    };
  }

  /** Locomotion for a wrestler the engine says is free to move. */
  private drive(
    i: number,
    delta: number,
    intent: FighterIntent,
    wrestler: WrestlerView,
    fighter: Fighter,
  ): void {
    this.wish
      .copy(this.camRight)
      .multiplyScalar(intent.moveX)
      .addScaledVector(this.camForward, -intent.moveY);

    const wishLength = this.wish.length();
    if (wishLength <= 1e-4) {
      this.velocity[i].multiplyScalar(Math.exp(-DECEL * delta));
      if (this.velocity[i].lengthSq() < 0.01) {
        this.velocity[i].set(0, 0, 0);
        wrestler.stopMarch();
      }
      return;
    }

    this.wish.multiplyScalar(1 / wishLength);
    const running = fighter.state === "running";
    const moving = this.velocity[i].lengthSq() > 0.04;
    const turnScale = 0.75 + fighter.skin.attributes.technique / 280;
    const turnCap = (running && moving ? TURN_RUN : moving ? TURN_WALK : TURN_PIVOT) * turnScale;
    const yawLeft = this.turnToward(this.facing[i], this.wish, turnCap, delta);
    wrestler.setFacing(this.facing[i]);

    const turnSlow =
      yawLeft > TURN_SLOW_ANGLE ? Math.max(0.15, 1 - (yawLeft - TURN_SLOW_ANGLE) / Math.PI) : 1;
    // Speed, and leg damage, and nothing else. Both are visible to the player
    // long before they read a number.
    const maxSpeed = (running ? RUN_SPEED : WALK_SPEED) * fighter.mobilityScale * turnSlow;
    const drive = Math.min(1, wishLength) * THREE.MathUtils.clamp(1 - yawLeft / 1.8, 0.2, 1);
    const target = this.scratch.copy(this.facing[i]).multiplyScalar(maxSpeed * drive);
    this.velocity[i].lerp(target, 1 - Math.exp(-ACCEL * delta));

    const speed = this.velocity[i].length();
    const stepRate = THREE.MathUtils.clamp(speed / 0.72, 1.2, 5.2);
    const clip = running && wrestler.hasClip("run") ? "run" : "walk";
    if (!wrestler.startMarch(clip, stepRate) && clip === "run") {
      wrestler.startMarch("walk", stepRate);
    }
  }

  private turnToward(
    facing: THREE.Vector3,
    target: THREE.Vector3,
    maxRadPerSec: number,
    delta: number,
  ): number {
    const cross = facing.x * target.z - facing.z * target.x;
    const dot = THREE.MathUtils.clamp(facing.x * target.x + facing.z * target.z, -1, 1);
    const angle = Math.atan2(cross, dot);
    const step = THREE.MathUtils.clamp(angle, -maxRadPerSec * delta, maxRadPerSec * delta);
    if (Math.abs(step) > 1e-5) {
      const cos = Math.cos(step);
      const sin = Math.sin(step);
      const x = facing.x * cos - facing.z * sin;
      const z = facing.x * sin + facing.z * cos;
      facing.set(x, 0, z).normalize();
    }
    return Math.abs(angle - step);
  }

  private faceOpponent(i: number, other: number, wrestlers: WrestlerView[]): void {
    this.scratch.copy(wrestlers[other].position).sub(wrestlers[i].position).setY(0);
    if (this.scratch.lengthSq() < 1e-6) return;
    this.scratch.normalize();
    this.facing[i].copy(this.scratch);
    wrestlers[i].setFacing(this.facing[i]);
  }

  /** Events from the last tick, for audio and camera work in Phase 9. */
  get events(): MatchEvent[] {
    return this.lastEvents;
  }

  place(index: number, x: number, z: number, wrestlers: WrestlerView[]): void {
    const wrestler = wrestlers[index];
    if (!wrestler) return;
    const limit = RING_HALF - RING_MARGIN;
    wrestler.setPosition(
      THREE.MathUtils.clamp(x, -limit, limit),
      THREE.MathUtils.clamp(z, -limit, limit),
    );
    this.velocity[index].set(0, 0, 0);
    wrestler.stopMarch();
  }

  face(index: number, forward: THREE.Vector3, wrestlers: WrestlerView[]): void {
    const wrestler = wrestlers[index];
    if (!wrestler) return;
    this.facing[index].copy(forward).setY(0).normalize();
    this.downHead[index].copy(this.facing[index]).multiplyScalar(-1);
    wrestler.setFacing(this.facing[index]);
  }
}
