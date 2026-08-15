/**
 * One wrestler's runtime state — the position/condition state machine of
 * spec §3, plus stamina and the finisher meter.
 *
 * Timers are countdowns ticked by delta rather than deadlines read off a clock,
 * so a test can step the whole match forward by hand in fixed increments and
 * get the same answer the renderer would.
 *
 * Groggy is a **state**, not a flag. A large fraction of the game's setup play
 * exists to move an opponent into groggy, because the strongest grapples and
 * most finishers are gated behind it, so it needs its own posture, its own idle
 * sway and its own readable silhouette — none of which is expressible as a
 * boolean hanging off "standing".
 */

import type { WrestlerSkin } from "../assets/generated";
import {
  damageLevels,
  freshDamage,
  mobilityScale,
  stunScale,
  vitality,
} from "./damage";
import { situationSatisfied } from "./resolve";
import { moveForSlot } from "./movesets";
import {
  FREE_STATES,
  type DamageState,
  type FighterSnapshot,
  type GrappleFamily,
  type MoveDef,
  type PositionState,
  type SpatialRelation,
} from "./types";

export const MAX_ICONS = 5;

/** A move in flight, with its impact frame and the defender's window on it. */
export interface ActiveMove {
  move: MoveDef;
  slot: string;
  elapsed: number;
  /** Seconds from start to the impact frame, after stamina/damage scaling. */
  impactAt: number;
  /** Seconds from start to the attacker being free again. */
  endsAt: number;
  impacted: boolean;
  reversed: boolean;
  windowOpensAt: number;
  windowClosesAt: number;
  /** 0 = an ordinary move, 1 = a reversal, 2 = a counter to a counter. */
  depth: number;
}

export class Fighter {
  readonly index: 0 | 1;
  readonly skin: WrestlerSkin;

  state: PositionState = "standing";
  /** Countdown on the current transient state (groggy / down / gettingUp). */
  stateTimer = 0;

  damage: DamageState = freshDamage();
  bleeding = false;
  stamina = 100;

  icons = 0;
  iconCharge = 0;

  active: ActiveMove | null = null;
  grappleFamily: GrappleFamily | null = null;
  /** A base grapple that nobody converts breaks on its own. */
  grappleTimer = 0;

  comboIndex = 0;
  comboTimer = 0;

  /**
   * Reversal lockout. Pressing a reverse button when no window is open buys
   * this, and while it runs every reversal fails. It is the entire reason
   * mashing is strictly worse than timing (§7).
   */
  reverseLockout = 0;

  /** Recoil from loading your own broken limb (§8) — extra recovery. */
  recoilTimer = 0;

  /** Seconds spent outside the ring, for the count-out (Phase 7 fills this). */
  outsideTimer = 0;

  /** The ten-count when knocked out. */
  koCount = 0;
  koRecovery = 0;

  tapped = false;
  lastAction = "";
  actionFlash = 0;

  constructor(index: 0 | 1, skin: WrestlerSkin) {
    this.index = index;
    this.skin = skin;
  }

  get busy(): boolean {
    return this.active !== null || this.recoilTimer > 0;
  }

  /** Free to walk around the canvas under player control. */
  get mobile(): boolean {
    return !this.busy && FREE_STATES.has(this.state);
  }

  get vitality(): number {
    return vitality(this.damage);
  }

  /** Walk/run multiplier from Speed and leg damage (§12, §8). */
  get mobilityScale(): number {
    return mobilityScale(this.damage) * (0.72 + this.skin.attributes.speed / 200);
  }

  /**
   * Reversal windows scale with Technique: higher Technique means the button
   * may be pressed *earlier* and still register (§7).
   */
  get techniqueScale(): number {
    return 0.65 + (this.skin.attributes.technique / 100) * 0.7;
  }

  /** How long knockdowns and stuns last on this body right now. */
  get stunScale(): number {
    // Speed governs recovery from a knockdown — the sleeper stat (§12).
    return stunScale(this.damage) * (1.32 - this.skin.attributes.speed / 250);
  }

  setState(next: PositionState, seconds = 0): PositionState {
    const previous = this.state;
    this.state = next;
    this.stateTimer = seconds;
    if (next !== "grappleHolding" && next !== "rearHolding") {
      this.grappleFamily = null;
      this.grappleTimer = 0;
    }
    return previous;
  }

  note(action: string): void {
    this.lastAction = action;
    this.actionFlash = 1.5;
  }

  /** Adds meter, returning the number of whole icons gained. */
  addMeter(amount: number): number {
    if (this.icons >= MAX_ICONS) {
      this.iconCharge = 1;
      return 0;
    }
    this.iconCharge += amount;
    let gained = 0;
    while (this.iconCharge >= 1 && this.icons < MAX_ICONS) {
      this.iconCharge -= 1;
      this.icons += 1;
      gained += 1;
    }
    if (this.icons >= MAX_ICONS) this.iconCharge = 1;
    return gained;
  }

  spendIcon(): boolean {
    if (this.icons < 1) return false;
    this.icons -= 1;
    if (this.iconCharge >= 1) this.iconCharge = 0.9;
    return true;
  }

  /** Everything the resolution table reads, with the two HUD lights unset. */
  private baseSnapshot(): FighterSnapshot {
    return {
      index: this.index,
      id: this.skin.id,
      label: this.skin.label,
      weight: this.skin.weight,
      attributes: this.skin.attributes,
      state: this.state,
      grappleFamily: this.grappleFamily,
      damage: { ...this.damage },
      damageLevels: damageLevels(this.damage),
      bleeding: this.bleeding,
      stamina: this.stamina,
      vitality: this.vitality,
      icons: this.icons,
      iconCharge: this.iconCharge,
      comboIndex: this.comboIndex,
      busy: this.busy,
      finisherReady: false,
      situationSatisfied: false,
      activeMove: this.active?.move.displayName ?? null,
      lastAction: this.lastAction,
    };
  }

  snapshot(opponent: Fighter, spatial: SpatialRelation): FighterSnapshot {
    const self = this.baseSnapshot();
    // The two HUD readouts the spec insists stay separate: "finisher available"
    // and "situation currently satisfied".
    self.situationSatisfied = this.anyFinisherSituation(self, opponent.baseSnapshot(), spatial);
    self.finisherReady = this.icons >= 1 && self.situationSatisfied;
    return self;
  }

  private anyFinisherSituation(
    self: FighterSnapshot,
    opponent: FighterSnapshot,
    spatial: SpatialRelation,
  ): boolean {
    for (const slot of ["finisher.1", "finisher.2"] as const) {
      const move = moveForSlot(this.skin.id, slot);
      if (!move) continue;
      if (move.requiredOpponentPosition && !move.requiredOpponentPosition.includes(opponent.state)) {
        continue;
      }
      if (situationSatisfied(move.requiredSituation, self, opponent, spatial)) return true;
    }
    return false;
  }
}
