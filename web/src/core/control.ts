/**
 * Turns intents into motion and combat on the canvas.
 *
 * Locomotion + a playable combat stub: strikes, grapples, action/taunt meter
 * fill, and finishers spent from SmackDown icons. Full grapple-matrix / reversal
 * systems land in Phase 5; this makes J/K/L/I actually do something and exposes
 * stamina + smack pips on the HUD.
 */

import * as THREE from "three";

import type { FighterIntent } from "./input";
import type { WrestlerView } from "../scene/wrestlers";
import { RING_HALF } from "../scene/ring";

export type PositionState =
  | "standing"
  | "walking"
  | "running"
  | "striking"
  | "grappling"
  | "finishing"
  | "down"
  | "getting_up"
  | "busy";

export type DistanceBand = "clinch" | "close" | "mid" | "far";

export interface FighterDebug {
  id: string;
  label: string;
  position: PositionState;
  band: DistanceBand;
  facingDeg: number;
  speed: number;
  /** 0–100 remaining stamina. */
  stamina: number;
  /** 0–100 health (inverse of accumulated damage). */
  health: number;
  /** Stored SmackDown icons (0–5). */
  smacks: number;
  /** 0–1 progress toward the next smack icon. */
  smackCharge: number;
  /** True when at least one smack is stored and a finisher can be attempted. */
  finisherReady: boolean;
  /** Last combat beat, for the HUD flash. */
  lastAction: string;
  pressed: string[];
}

interface FighterRuntime {
  stamina: number;
  health: number;
  smacks: number;
  smackCharge: number;
  busyUntil: number;
  downUntil: number;
  lastAction: string;
  actionFlash: number;
  prevStrike: boolean;
  prevGrapple: boolean;
  prevAction: boolean;
  prevFinisher: boolean;
  prevTaunt: boolean;
  combo: number;
  comboUntil: number;
}

const WALK_SPEED = 1.85;
const RUN_SPEED = 4.4;
const RING_MARGIN = 0.55;
const ACCEL = 10;
const DECEL = 14;
const TURN_WALK = 3.2;
const TURN_RUN = 2.4;
const TURN_PIVOT = 4.0;
const TURN_SLOW_ANGLE = 0.7;

const MAX_SMACKS = 5;
const STRIKE_RANGE = 2.15;
const GRAPPLE_RANGE = 1.55;
const FINISHER_RANGE = 2.4;

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

function makeRuntime(): FighterRuntime {
  return {
    stamina: 100,
    health: 100,
    smacks: 0,
    smackCharge: 0,
    busyUntil: 0,
    downUntil: 0,
    lastAction: "",
    actionFlash: 0,
    prevStrike: false,
    prevGrapple: false,
    prevAction: false,
    prevFinisher: false,
    prevTaunt: false,
    combo: 0,
    comboUntil: 0,
  };
}

export class MatchControl {
  private readonly velocity = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly facing = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)];
  private readonly states: PositionState[] = ["standing", "standing"];
  private readonly runtime = [makeRuntime(), makeRuntime()];
  private readonly camForward = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private elapsed = 0;

  private turnToward(facing: THREE.Vector3, target: THREE.Vector3, maxRadPerSec: number, delta: number): number {
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

  private fillSmacks(rt: FighterRuntime, amount: number): void {
    if (rt.smacks >= MAX_SMACKS) {
      rt.smackCharge = 1;
      return;
    }
    rt.smackCharge += amount;
    while (rt.smackCharge >= 1 && rt.smacks < MAX_SMACKS) {
      rt.smackCharge -= 1;
      rt.smacks += 1;
    }
    if (rt.smacks >= MAX_SMACKS) rt.smackCharge = 1;
  }

  private note(rt: FighterRuntime, action: string): void {
    rt.lastAction = action;
    rt.actionFlash = 1.4;
  }

  private faceOpponent(i: number, other: number, wrestlers: WrestlerView[]): void {
    this.scratch.copy(wrestlers[other].position).sub(wrestlers[i].position).setY(0);
    if (this.scratch.lengthSq() < 1e-6) return;
    this.scratch.normalize();
    this.facing[i].copy(this.scratch);
    wrestlers[i].setFacing(this.facing[i]);
  }

  private tryStrike(i: number, other: number, wrestlers: WrestlerView[]): void {
    const rt = this.runtime[i];
    const victim = this.runtime[other];
    if (this.elapsed < rt.busyUntil || this.elapsed < rt.downUntil) return;
    if (rt.stamina < 6) {
      this.note(rt, "too tired");
      return;
    }

    const dist = wrestlers[i].position.distanceTo(wrestlers[other].position);
    this.faceOpponent(i, other, wrestlers);
    this.velocity[i].set(0, 0, 0);
    wrestlers[i].stopMarch(0.08);

    const comboFresh = this.elapsed < rt.comboUntil;
    rt.combo = comboFresh ? Math.min(3, rt.combo + 1) : 1;
    rt.comboUntil = this.elapsed + 1.1;

    const dur = wrestlers[i].playOneShot("strike");
    const lock = dur > 0 ? dur : 0.55;
    rt.busyUntil = this.elapsed + lock;
    this.states[i] = "striking";
    rt.stamina = Math.max(0, rt.stamina - (8 + rt.combo * 2));

    if (dist > STRIKE_RANGE) {
      this.note(rt, `strike ${rt.combo}/3 (whiff)`);
      this.fillSmacks(rt, 0.04);
      return;
    }

    const strength = wrestlers[i].skin.attributes.strength / 100;
    const endurance = wrestlers[other].skin.attributes.endurance / 100;
    const dmg = (7 + rt.combo * 3) * (0.7 + strength) * (1.15 - endurance * 0.5);
    victim.health = Math.max(0, victim.health - dmg);
    victim.stamina = Math.max(0, victim.stamina - 4);
    this.fillSmacks(rt, 0.18 + rt.combo * 0.04);
    this.note(rt, `strike ${rt.combo}/3`);

    // Light shove on hit.
    this.scratch.copy(this.facing[i]).multiplyScalar(0.35);
    const limit = RING_HALF - RING_MARGIN;
    const vp = wrestlers[other].position;
    vp.x = THREE.MathUtils.clamp(vp.x + this.scratch.x, -limit, limit);
    vp.z = THREE.MathUtils.clamp(vp.z + this.scratch.z, -limit, limit);

    if (victim.health <= 0) {
      this.knockDown(other, wrestlers, 2.8);
    } else if (dmg > 14 && Math.random() < 0.35) {
      this.knockDown(other, wrestlers, 1.6);
    } else {
      wrestlers[other].setStrikeTilt(-0.12);
    }
  }

  private tryGrapple(i: number, other: number, wrestlers: WrestlerView[]): void {
    const rt = this.runtime[i];
    const victim = this.runtime[other];
    if (this.elapsed < rt.busyUntil || this.elapsed < rt.downUntil) return;
    if (rt.stamina < 12) {
      this.note(rt, "too tired");
      return;
    }

    const dist = wrestlers[i].position.distanceTo(wrestlers[other].position);
    this.faceOpponent(i, other, wrestlers);
    this.velocity[i].set(0, 0, 0);
    wrestlers[i].stopMarch(0.08);

    if (dist > GRAPPLE_RANGE) {
      rt.busyUntil = this.elapsed + 0.35;
      this.states[i] = "busy";
      this.note(rt, "grapple (too far)");
      return;
    }

    // Lock → slam proxy (strike clip) until real two-body grapples exist.
    const dur = wrestlers[i].playOneShot("strike");
    const lock = Math.max(0.85, dur > 0 ? dur : 0.85);
    rt.busyUntil = this.elapsed + lock;
    this.states[i] = "grappling";
    rt.stamina = Math.max(0, rt.stamina - 14);
    rt.combo = 0;

    const strength = wrestlers[i].skin.attributes.strength / 100;
    const endurance = wrestlers[other].skin.attributes.endurance / 100;
    const dmg = 14 * (0.75 + strength) * (1.1 - endurance * 0.4);
    victim.health = Math.max(0, victim.health - dmg);
    victim.stamina = Math.max(0, victim.stamina - 8);
    this.fillSmacks(rt, 0.12);
    this.note(rt, "grapple slam");

    this.knockDown(other, wrestlers, 1.9);
  }

  private tryAction(i: number, wrestlers: WrestlerView[]): void {
    const rt = this.runtime[i];
    if (this.elapsed < rt.busyUntil || this.elapsed < rt.downUntil) return;

    // Action / taunt: fill the SmackDown meter (showboating is the mechanic).
    this.velocity[i].set(0, 0, 0);
    wrestlers[i].stopMarch(0.1);
    rt.busyUntil = this.elapsed + 0.7;
    this.states[i] = "busy";
    this.fillSmacks(rt, 0.28);
    rt.stamina = Math.min(100, rt.stamina + 4);
    this.note(rt, rt.smacks >= MAX_SMACKS ? "taunt (meter full)" : "taunt — meter up");
  }

  private tryFinisher(i: number, other: number, wrestlers: WrestlerView[]): void {
    const rt = this.runtime[i];
    const victim = this.runtime[other];
    if (this.elapsed < rt.busyUntil || this.elapsed < rt.downUntil) return;
    if (rt.smacks < 1) {
      this.note(rt, "no smacks");
      return;
    }

    const dist = wrestlers[i].position.distanceTo(wrestlers[other].position);
    if (dist > FINISHER_RANGE) {
      this.note(rt, "finisher (too far)");
      return;
    }

    this.faceOpponent(i, other, wrestlers);
    this.velocity[i].set(0, 0, 0);
    wrestlers[i].stopMarch(0.08);
    rt.smacks -= 1;
    if (rt.smacks < MAX_SMACKS && rt.smackCharge >= 1) rt.smackCharge = 0.85;

    const dur = wrestlers[i].playOneShot("strike");
    rt.busyUntil = this.elapsed + Math.max(1.1, dur || 1.1);
    this.states[i] = "finishing";
    rt.stamina = Math.max(0, rt.stamina - 18);

    const strength = wrestlers[i].skin.attributes.strength / 100;
    const dmg = 28 * (0.8 + strength);
    victim.health = Math.max(0, victim.health - dmg);
    this.note(rt, `FINISHER (−1 smack, ${rt.smacks} left)`);
    this.knockDown(other, wrestlers, 2.6);
  }

  private knockDown(i: number, wrestlers: WrestlerView[], seconds: number): void {
    const rt = this.runtime[i];
    this.velocity[i].set(0, 0, 0);
    wrestlers[i].stopMarch(0.05);
    const down = wrestlers[i].playOneShot("knockdown");
    const hold = Math.max(seconds, down > 0 ? down * 0.85 : seconds);
    rt.downUntil = this.elapsed + hold;
    rt.busyUntil = rt.downUntil;
    this.states[i] = "down";
    this.note(rt, "down");
  }

  private tickDowned(i: number, wrestlers: WrestlerView[]): void {
    const rt = this.runtime[i];
    if (this.elapsed < rt.downUntil) {
      this.states[i] = "down";
      return;
    }
    if (this.states[i] === "down" || this.states[i] === "getting_up") {
      if (this.states[i] === "down") {
        const dur = wrestlers[i].playOneShot("getUp");
        const speed = wrestlers[i].skin.attributes.speed / 100;
        const lock = Math.max(0.45, (dur > 0 ? dur : 0.9) * (1.15 - speed * 0.4));
        rt.busyUntil = this.elapsed + lock;
        this.states[i] = "getting_up";
        this.note(rt, "getting up");
      } else if (this.elapsed >= rt.busyUntil) {
        this.states[i] = "standing";
        wrestlers[i].playIdle(0.15);
      }
    }
  }

  update(
    delta: number,
    wrestlers: WrestlerView[],
    intents: [FighterIntent, FighterIntent],
    camera: THREE.Camera,
  ): FighterDebug[] {
    if (wrestlers.length < 2) return [];
    this.elapsed += delta;

    this.camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.camForward.y = 0;
    if (this.camForward.lengthSq() < 1e-6) this.camForward.set(0, 0, -1);
    this.camForward.normalize();
    this.camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.camRight.y = 0;
    if (this.camRight.lengthSq() < 1e-6) this.camRight.set(1, 0, 0);
    this.camRight.normalize();

    const debug: FighterDebug[] = [];
    const limit = RING_HALF - RING_MARGIN;

    for (let i = 0; i < 2; i += 1) {
      const wrestler = wrestlers[i];
      const intent = intents[i];
      const rt = this.runtime[i];
      const other = i ^ 1;
      rt.actionFlash = Math.max(0, rt.actionFlash - delta);
      if (rt.actionFlash <= 0) rt.lastAction = "";

      // Passive stamina regen when not sprinting / busy.
      if (this.elapsed >= rt.busyUntil && !intent.run) {
        rt.stamina = Math.min(100, rt.stamina + delta * 7);
      }

      this.tickDowned(i, wrestlers);
      const locked = this.elapsed < rt.busyUntil || this.elapsed < rt.downUntil;

      // Edge-triggered combat — held keys do not spam every frame.
      const hasTaunt = !!intent.taunt;
      const strikeEdge = intent.strike && !rt.prevStrike;
      const grappleEdge = intent.grapple && !rt.prevGrapple;
      const actionEdge = intent.action && !rt.prevAction;
      const finisherEdge = intent.finisher && !rt.prevFinisher;
      const tauntEdge = hasTaunt && !rt.prevTaunt;
      rt.prevStrike = intent.strike;
      rt.prevGrapple = intent.grapple;
      rt.prevAction = intent.action;
      rt.prevFinisher = intent.finisher;
      rt.prevTaunt = hasTaunt;

      if (!locked) {
        if (finisherEdge) this.tryFinisher(i, other, wrestlers);
        else if (grappleEdge) this.tryGrapple(i, other, wrestlers);
        else if (strikeEdge) this.tryStrike(i, other, wrestlers);
        else if (actionEdge || tauntEdge) this.tryAction(i, wrestlers);
      }

      const stillLocked = this.elapsed < rt.busyUntil || this.elapsed < rt.downUntil;
      const attrSpeed = wrestler.skin.attributes.speed / 70;
      const turnScale = 0.75 + wrestler.skin.attributes.technique / 280;

      this.wish
        .copy(this.camRight)
        .multiplyScalar(intent.moveX)
        .addScaledVector(this.camForward, -intent.moveY);

      const wishLen = this.wish.length();
      if (!stillLocked && wishLen > 1e-4) {
        this.wish.multiplyScalar(1 / wishLen);

        const moving = this.velocity[i].lengthSq() > 0.04;
        const turnCap = (intent.run && moving ? TURN_RUN : moving ? TURN_WALK : TURN_PIVOT) * turnScale;
        const yawLeft = this.turnToward(this.facing[i], this.wish, turnCap, delta);
        wrestler.setFacing(this.facing[i]);

        const turnSlow = yawLeft > TURN_SLOW_ANGLE ? Math.max(0.15, 1 - (yawLeft - TURN_SLOW_ANGLE) / Math.PI) : 1;
        const maxSpeed = (intent.run ? RUN_SPEED : WALK_SPEED) * attrSpeed * turnSlow;
        if (intent.run) rt.stamina = Math.max(0, rt.stamina - delta * 12);

        const drive = Math.min(1, wishLen) * THREE.MathUtils.clamp(1 - yawLeft / 1.8, 0.2, 1);
        const target = this.scratch.copy(this.facing[i]).multiplyScalar(maxSpeed * drive);
        this.velocity[i].lerp(target, 1 - Math.exp(-ACCEL * delta));

        const speed = this.velocity[i].length();
        const running = intent.run && speed > WALK_SPEED * attrSpeed * 0.85 && yawLeft < 0.9;
        if (this.states[i] !== "striking" && this.states[i] !== "grappling" && this.states[i] !== "finishing") {
          this.states[i] = running ? "running" : "walking";
        }

        const stepRate = THREE.MathUtils.clamp(speed / 0.72, 1.2, 5.2);
        const clip = running && wrestler.hasClip("run") ? "run" : "walk";
        if (!wrestler.startMarch(clip, stepRate) && clip === "run") {
          wrestler.startMarch("walk", stepRate);
        }
      } else if (!stillLocked) {
        this.velocity[i].multiplyScalar(Math.exp(-DECEL * delta));
        if (this.velocity[i].lengthSq() < 0.01) {
          this.velocity[i].set(0, 0, 0);
          if (
            this.states[i] === "walking" ||
            this.states[i] === "running" ||
            this.states[i] === "standing"
          ) {
            this.states[i] = "standing";
            wrestler.stopMarch();
          }
        }
      } else {
        this.velocity[i].multiplyScalar(Math.exp(-DECEL * 2 * delta));
      }

      // Clear procedural hit lean.
      wrestler.setStrikeTilt(0);

      const pos = wrestler.position;
      pos.x = THREE.MathUtils.clamp(pos.x + this.velocity[i].x * delta, -limit, limit);
      pos.z = THREE.MathUtils.clamp(pos.z + this.velocity[i].z * delta, -limit, limit);

      const dist = wrestler.position.distanceTo(wrestlers[other].position);
      debug.push({
        id: wrestler.id,
        label: wrestler.skin.label,
        position: this.states[i],
        band: bandFor(dist),
        facingDeg: Math.round((Math.atan2(this.facing[i].x, this.facing[i].z) * 180) / Math.PI),
        speed: Number(this.velocity[i].length().toFixed(2)),
        stamina: Math.round(rt.stamina),
        health: Math.round(rt.health),
        smacks: rt.smacks,
        smackCharge: rt.smackCharge,
        finisherReady: rt.smacks >= 1,
        lastAction: rt.lastAction,
        pressed: pressedList(intent),
      });
    }

    const dist = wrestlers[0].position.distanceTo(wrestlers[1].position);
    const band = bandFor(dist);
    debug[0].band = band;
    debug[1].band = band;
    return debug;
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
    this.states[index] = "standing";
    this.runtime[index].busyUntil = 0;
    this.runtime[index].downUntil = 0;
    wrestler.stopMarch();
  }

  face(index: number, forward: THREE.Vector3, wrestlers: WrestlerView[]): void {
    const wrestler = wrestlers[index];
    if (!wrestler) return;
    this.facing[index].copy(forward).setY(0).normalize();
    wrestler.setFacing(this.facing[index]);
  }
}
