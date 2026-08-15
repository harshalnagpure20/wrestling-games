/**
 * The match engine.
 *
 * Headless on purpose: it takes a delta, two intents and the spatial
 * relationship between the bodies, and returns a list of events. It never
 * touches three.js, the DOM or a clock, so `match.test.ts` can play a whole
 * match in a node process and assert on the result.
 *
 * What lives here is only the part that cannot live in data: the clocking of a
 * move through startup → impact → recovery, the reversal windows, the two mash
 * contests, and the arbitration between them. Everything about *what a move is*
 * lives in `library.ts`, and everything about *which move a button means* lives
 * in `resolve.ts`.
 */

import { WRESTLER_SKINS, type WrestlerId } from "../assets/generated";
import {
  applyDamage,
  attackScale,
  canBleed,
  damageFraction,
  shouldRecoil,
  submissionResistance,
} from "./damage";
import { Fighter, MAX_ICONS, type ActiveMove } from "./fighter";
import { moveForSlot } from "./movesets";
import { finisherResolution, resolve, type ResolveButton, type ResolveFailure } from "./resolve";
import {
  DEFAULT_RULES,
  FINISHER_CHARGE_RATE,
  GRAPPLE_FAMILY_BY_DIRECTION,
  REGIONS,
  emptyMatchInput,
  type Direction,
  type FighterSnapshot,
  type GrappleFamily,
  type MatchEvent,
  type MatchInput,
  type MatchResult,
  type MatchRules,
  type MoveDef,
  type Region,
  type ReversalChannel,
  type SpatialRelation,
} from "./types";
import {
  SINGLES_WIN_CONDITIONS,
  type PinStatus,
  type SubmissionStatus,
  type WinCondition,
} from "./winConditions";

/** How long an unconverted base grapple survives before it breaks. */
const GRAPPLE_HOLD_SECONDS = 2.6;
/** Bought by pressing a reverse button outside a window. */
const REVERSE_LOCKOUT = 0.65;
/** The window always shuts this long before the impact frame. */
const WINDOW_CLOSE_GAP = 0.06;
/** How groggy a reversed attacker is left — the legitimate finisher opening. */
const REVERSED_GROGGY_SECONDS = 2.4;
/** A human can just about sustain this; the guaranteed-pin tell assumes it. */
const MASH_CEILING_PER_SECOND = 9;

export interface PinContest extends PinStatus {
  timer: number;
  kickPower: number;
  announcedGuaranteed: boolean;
}

export interface SubmissionContest extends SubmissionStatus {
  region: Region;
  move: MoveDef;
  duration: number;
  maxDuration: number;
  ropeGrace: number;
  broken: boolean;
}

export interface MatchOptions {
  roster?: [WrestlerId, WrestlerId];
  rules?: Partial<MatchRules>;
  winConditions?: WinCondition[];
}

export interface MatchSnapshot {
  clock: number;
  live: boolean;
  fighters: [FighterSnapshot, FighterSnapshot];
  pin: PinStatus | null;
  submission: (SubmissionStatus & { region: Region }) | null;
  result: MatchResult | null;
}

function neutralSpatial(): SpatialRelation {
  return { distance: 99, band: "far", behind: false, groundSide: null, nearRopes: false };
}

export class MatchEngine {
  readonly fighters: [Fighter, Fighter];
  readonly rules: MatchRules;

  clock = 0;
  live = true;
  result: MatchResult | null = null;

  private pin: PinContest | null = null;
  private submission: SubmissionContest | null = null;
  private readonly winConditions: WinCondition[];
  private spatial: [SpatialRelation, SpatialRelation] = [neutralSpatial(), neutralSpatial()];
  private events: MatchEvent[] = [];

  constructor(options: MatchOptions = {}) {
    const [a, b] = options.roster ?? (["ironclad", "vanguard"] as [WrestlerId, WrestlerId]);
    this.fighters = [new Fighter(0, WRESTLER_SKINS[a]), new Fighter(1, WRESTLER_SKINS[b])];
    this.rules = { ...DEFAULT_RULES, ...options.rules };
    this.winConditions = options.winConditions ?? SINGLES_WIN_CONDITIONS;
  }

  // ------------------------------------------------------------- public API

  snapshot(): MatchSnapshot {
    return {
      clock: this.clock,
      live: this.live,
      fighters: [
        this.fighters[0].snapshot(this.fighters[1], this.spatial[0]),
        this.fighters[1].snapshot(this.fighters[0], this.spatial[1]),
      ],
      pin: this.pin ? { ...this.pin } : null,
      submission: this.submission
        ? {
            attacker: this.submission.attacker,
            defender: this.submission.defender,
            pressure: this.submission.pressure,
            tapped: this.submission.tapped,
            region: this.submission.region,
          }
        : null,
      result: this.result,
    };
  }

  /** Current pin contest, for the HUD's referee count and blur tell. */
  get pinStatus(): PinContest | null {
    return this.pin;
  }

  get submissionStatus(): SubmissionContest | null {
    return this.submission;
  }

  reset(): void {
    for (const fighter of this.fighters) {
      fighter.setState("standing");
      fighter.damage = { head: 0, torso: 0, arms: 0, legs: 0 };
      fighter.bleeding = false;
      fighter.stamina = 100;
      fighter.icons = 0;
      fighter.iconCharge = 0;
      fighter.active = null;
      fighter.comboIndex = 0;
      fighter.comboTimer = 0;
      fighter.reverseLockout = 0;
      fighter.recoilTimer = 0;
      fighter.outsideTimer = 0;
      fighter.koCount = 0;
      fighter.koRecovery = 0;
      fighter.tapped = false;
      fighter.lastAction = "";
      fighter.actionFlash = 0;
    }
    this.pin = null;
    this.submission = null;
    this.clock = 0;
    this.live = true;
    this.result = null;
  }

  /**
   * One frame.
   *
   * `spatial[i]` describes fighter i's relationship *to their opponent* — the
   * presentation layer owns the geometry, the engine owns the rules.
   */
  tick(
    delta: number,
    inputs: [MatchInput, MatchInput] = [emptyMatchInput(), emptyMatchInput()],
    spatial: [SpatialRelation, SpatialRelation] = this.spatial,
  ): MatchEvent[] {
    this.events = [];
    this.spatial = spatial;
    if (!this.live) return this.events;

    this.clock += delta;

    for (let i = 0; i < 2; i += 1) this.tickTimers(this.fighters[i], inputs[i], delta);

    // Reversal presses are read against the windows as they stood at the top of
    // the frame, before any move advances — otherwise a move could cross its
    // own impact frame and the defender's press in the same tick.
    for (let i = 0; i < 2; i += 1) this.handleReversalInput(i as 0 | 1, inputs[i]);

    for (let i = 0; i < 2; i += 1) this.handleAction(i as 0 | 1, inputs[i], delta);

    for (let i = 0; i < 2; i += 1) this.advanceMove(i as 0 | 1, delta);

    this.tickPin(inputs, delta);
    this.tickSubmission(inputs, delta);
    this.tickKnockout(inputs, delta);
    this.evaluateWin();

    return this.events;
  }

  // ------------------------------------------------------------- per-frame

  private emit(event: MatchEvent): void {
    this.events.push(event);
  }

  private other(index: 0 | 1): Fighter {
    return this.fighters[index ^ 1];
  }

  private tickTimers(fighter: Fighter, input: MatchInput, delta: number): void {
    fighter.actionFlash = Math.max(0, fighter.actionFlash - delta);
    if (fighter.actionFlash <= 0) fighter.lastAction = "";
    fighter.reverseLockout = Math.max(0, fighter.reverseLockout - delta);
    fighter.recoilTimer = Math.max(0, fighter.recoilTimer - delta);

    fighter.comboTimer = Math.max(0, fighter.comboTimer - delta);
    if (fighter.comboTimer <= 0) fighter.comboIndex = 0;

    if (fighter.state === "outside") fighter.outsideTimer += delta;
    else fighter.outsideTimer = 0;

    // Stamina: spent by running, recovered by standing still. Exhaustion is a
    // pacing tool, not a second damage system (§18) — it never ends a match.
    if (fighter.state === "running") {
      fighter.stamina = Math.max(0, fighter.stamina - delta * 12);
      if (fighter.stamina <= 0) fighter.setState("standing");
    } else if (!fighter.busy) {
      const rest = fighter.state === "down" || fighter.state === "gettingUp" ? 11 : 7;
      fighter.stamina = Math.min(100, fighter.stamina + delta * rest);
    }

    // A base grapple nobody converts breaks on its own; the held wrestler can
    // mash to shorten it, which is their only agency inside the lock-up.
    if (fighter.state === "grappleHolding" || fighter.state === "rearHolding") {
      fighter.grappleTimer = Math.max(0, fighter.grappleTimer - delta);
      if (fighter.grappleTimer <= 0 && !fighter.busy) {
        this.breakGrapple(fighter.index);
      }
    }
    if ((fighter.state === "grappleHeld" || fighter.state === "rearHeld") && input.mash) {
      const holder = this.other(fighter.index);
      holder.grappleTimer = Math.max(0, holder.grappleTimer - 0.22);
    }

    if (fighter.stateTimer > 0) {
      // Mashing while down shortens the trip back to your feet a little.
      const urgency = input.mash && (fighter.state === "down" || fighter.state === "groggy") ? 0.12 : 0;
      fighter.stateTimer = Math.max(0, fighter.stateTimer - delta - urgency);
      if (fighter.stateTimer <= 0) this.expireState(fighter);
    }
  }

  private expireState(fighter: Fighter): void {
    const previous = fighter.state;
    switch (fighter.state) {
      case "down":
        fighter.setState("gettingUp", 0.75 * fighter.stunScale);
        break;
      case "grappleHeld":
      case "rearHeld":
        // Slipping the lock-up frees the holder too, or they stand there
        // gripping nothing.
        this.breakGrapple((fighter.index ^ 1) as 0 | 1);
        break;
      case "groggy":
      case "stunned":
      case "gettingUp":
        fighter.setState("standing");
        break;
      default:
        return;
    }
    this.emit({ type: "state", fighter: fighter.index, state: fighter.state, previous });
  }

  private breakGrapple(index: 0 | 1): void {
    const holder = this.fighters[index];
    const held = this.other(index);
    if (holder.state === "grappleHolding" || holder.state === "rearHolding") {
      holder.setState("standing");
    }
    if (held.state === "grappleHeld" || held.state === "rearHeld") {
      held.setState("standing");
    }
    this.emit({ type: "grapple:break", fighter: index });
  }

  // -------------------------------------------------------------- reversals

  /**
   * Three channels on three buttons (§7): L2 reverses strikes, R2 reverses
   * grapples, both together reverses a finisher.
   *
   * The rules that matter more than the plumbing:
   * - windows open on *startup* and shut before the impact frame;
   * - width scales with the defender's Technique;
   * - pressing with no window open buys a lockout, so mashing both triggers is
   *   strictly worse than timing one;
   * - a successful reversal leaves the original attacker groggy, which is the
   *   primary legitimate opening for a finisher;
   * - the reversal is itself a move, so it opens a window of its own and
   *   counter-to-a-counter falls out for free (capped at one level).
   */
  private handleReversalInput(index: 0 | 1, input: MatchInput): void {
    const defender = this.fighters[index];
    if (!input.reverseStrike && !input.reverseGrapple) return;
    // L1 + L2 with two icons is the finisher steal, not a reversal press.
    if (input.finisher && defender.icons >= 2) return;
    // Groggy is exactly the state in which you cannot save yourself.
    if (defender.state === "groggy" || defender.state === "stunned" || defender.state === "ko") return;

    const channel: ReversalChannel =
      input.reverseStrike && input.reverseGrapple
        ? "finisher"
        : input.reverseStrike
          ? "strike"
          : "grapple";

    if (defender.reverseLockout > 0) {
      // Every press during a lockout renews it. This is the whole reason
      // mashing both triggers is strictly worse than pressing one on time.
      defender.reverseLockout = REVERSE_LOCKOUT;
      this.emit({ type: "reversal:missed", fighter: index, channel });
      return;
    }

    const attacker = this.other(index);
    const active = attacker.active;
    const open =
      active !== null &&
      !active.reversed &&
      !active.impacted &&
      active.move.reversalType === channel &&
      active.elapsed >= active.windowOpensAt &&
      active.elapsed <= active.windowClosesAt;

    if (!open || !active) {
      defender.reverseLockout = REVERSE_LOCKOUT;
      this.emit({ type: "reversal:missed", fighter: index, channel });
      defender.note("reversal missed");
      return;
    }

    active.reversed = true;
    attacker.active = null;
    this.emit({ type: "reversal", fighter: index, channel, depth: active.depth, move: active.move });

    // Caught out, but not beaten yet — the counter still has to land, and until
    // it does the original attacker may reverse it in turn. Making them groggy
    // *here* instead would make counter-to-a-counter impossible, because groggy
    // is precisely the state in which you cannot save yourself.
    attacker.recoilTimer = 0.3;
    attacker.note(`reversed (${active.move.displayName})`);

    const slot = `reversal.${channel}`;
    const counter = moveForSlot(defender.skin.id, slot);
    if (!counter) {
      // Nothing authored to punish them with; fall back to the plain rule that
      // a successful reversal leaves the attacker open.
      attacker.setState("groggy", REVERSED_GROGGY_SECONDS * attacker.stunScale);
      defender.setState("standing");
      defender.note("reversal");
      return;
    }
    defender.note(`REVERSAL — ${counter.displayName}`);
    this.startMove(index, counter, slot, active.depth + 1);
  }

  // ---------------------------------------------------------------- actions

  private canAct(fighter: Fighter): boolean {
    if (fighter.busy) return false;
    return (
      fighter.state === "standing" ||
      fighter.state === "running" ||
      fighter.state === "grappleHolding" ||
      fighter.state === "rearHolding"
    );
  }

  private handleAction(index: 0 | 1, input: MatchInput, delta: number): void {
    const fighter = this.fighters[index];

    // Running is a state, not a modifier — the resolution table reads it.
    if (this.canAct(fighter) && (fighter.state === "standing" || fighter.state === "running")) {
      const wantsRun = input.run && input.moving && fighter.stamina > 5;
      if (wantsRun && fighter.state !== "running") fighter.setState("running");
      else if (!wantsRun && fighter.state === "running") fighter.setState("standing");
    }

    if (!this.canAct(fighter)) return;

    // While locked in a base grapple, the run button turns you behind them (§4).
    if (input.run && (fighter.state === "grappleHolding" || fighter.state === "rearHolding")) {
      const opponent = this.other(index);
      const previous = fighter.state;
      fighter.setState(previous === "grappleHolding" ? "rearHolding" : "grappleHolding");
      fighter.grappleFamily = null;
      fighter.grappleTimer = GRAPPLE_HOLD_SECONDS;
      opponent.setState(previous === "grappleHolding" ? "rearHeld" : "grappleHeld", GRAPPLE_HOLD_SECONDS + 0.4);
      this.emit({ type: "state", fighter: index, state: fighter.state, previous });
      fighter.note(fighter.state === "rearHolding" ? "behind them" : "spun to the front");
      return;
    }

    // Taunting fills the meter while held, and longer means more (§10).
    if (input.tauntHeld && fighter.state === "standing") {
      const gained = fighter.addMeter(0.14 * this.chargeRate * delta);
      if (gained) this.emit({ type: "meter:icon", fighter: index, icons: fighter.icons });
    }

    let button: ResolveButton | null = null;
    if (input.finisher && input.reverseStrike && fighter.icons >= 2) {
      this.stealFinisher(index);
      return;
    }
    if (input.finisher) button = "finisher";
    else if (input.grapple) button = "grapple";
    else if (input.strike) button = "strike";
    else if (input.taunt) button = "taunt";
    if (!button) return;

    this.attempt(index, button, input.direction);
  }

  private attempt(index: 0 | 1, button: ResolveButton, direction: Direction): void {
    const fighter = this.fighters[index];
    const opponent = this.other(index);
    const request = {
      self: fighter.snapshot(opponent, this.spatial[index]),
      opponent: opponent.snapshot(fighter, this.spatial[index ^ 1]),
      spatial: this.spatial[index],
      button,
      direction,
    };

    const resolution = resolve(request);
    if (!resolution.ok || !resolution.move || !resolution.slot) {
      this.reportFailure(index, resolution.reason, resolution.move);
      return;
    }

    const move = resolution.move;
    const slot = resolution.slot;

    // Stamina gates the heavy end of the moveset (§18).
    if (fighter.stamina < move.staminaCost * 0.6) {
      this.emit({ type: "move:failed", fighter: index, move, reason: "tooTired" });
      fighter.note("too tired");
      return;
    }

    if (move.category === "finisher" && !fighter.spendIcon()) {
      fighter.note("no smack stored");
      return;
    }

    // The combination string only advances on a neutral press, and the third
    // hit ends it — the next press starts the string again rather than looping
    // on the heavy finish.
    if (move.category === "combo") {
      const next = fighter.comboIndex + 1;
      fighter.comboIndex = next >= 3 ? 0 : next;
      fighter.comboTimer = next >= 3 ? 0 : 1.15;
    } else {
      fighter.comboIndex = 0;
      fighter.comboTimer = 0;
    }

    this.startMove(index, move, slot, 0);
  }

  private reportFailure(index: 0 | 1, reason: ResolveFailure | undefined, move?: MoveDef): void {
    const fighter = this.fighters[index];
    switch (reason) {
      case "tooHeavy":
        // Must fail readably rather than clip (§6). The attempt costs you.
        if (move) this.emit({ type: "move:failed", fighter: index, move, reason: "tooHeavy" });
        fighter.note(`${move?.displayName ?? "lift"} — too heavy`);
        fighter.stamina = Math.max(0, fighter.stamina - 6);
        fighter.recoilTimer = 0.5;
        break;
      case "outOfRange":
        if (move) this.emit({ type: "move:failed", fighter: index, move, reason: "outOfRange" });
        fighter.note(`${move?.displayName ?? "move"} — out of range`);
        break;
      case "noSituation":
        fighter.note(move ? `${move.displayName} — wrong situation` : "wrong situation");
        break;
      case "noIcons":
        fighter.note("no smack stored");
        break;
      case "unauthored":
        fighter.note("slot empty");
        break;
      default:
        break;
    }
  }

  /**
   * L1 + L2 with two icons stored performs the *opponent's* finisher (§2, §10).
   * It reads their manifest, not ours, which is only possible because a
   * wrestler is data.
   */
  private stealFinisher(index: 0 | 1): void {
    const fighter = this.fighters[index];
    const opponent = this.other(index);
    const request = {
      self: fighter.snapshot(opponent, this.spatial[index]),
      opponent: opponent.snapshot(fighter, this.spatial[index ^ 1]),
      spatial: this.spatial[index],
      button: "finisher" as const,
      direction: "neutral" as Direction,
    };
    const stolen = finisherResolution(request, opponent.skin.id);
    if (!stolen.ok || !stolen.move || !stolen.slot) {
      this.reportFailure(index, stolen.reason, stolen.move);
      return;
    }
    fighter.spendIcon();
    fighter.spendIcon();
    fighter.note(`STOLEN — ${stolen.move.displayName}`);
    this.startMove(index, stolen.move, stolen.slot, 0);
  }

  // ------------------------------------------------------------ move clocking

  private startMove(index: 0 | 1, move: MoveDef, slot: string, depth: number): void {
    const fighter = this.fighters[index];
    const opponent = this.other(index);

    fighter.stamina = Math.max(0, fighter.stamina - move.staminaCost);

    // Exhaustion and a hurt body both make you slower to the impact frame.
    const fatigue = fighter.stamina < 25 ? 1.22 : 1;
    const impactAt = move.startup * fatigue;
    const recovery = move.recovery * fatigue;

    // Deeper counters are not themselves reversible — one level of
    // counter-to-a-counter, then the exchange resolves (§7).
    const reversible = depth < 2 && move.reversalType !== "none";
    const width = reversible ? move.reversalWindow * opponent.techniqueScale : 0;

    const active: ActiveMove = {
      move,
      slot,
      elapsed: 0,
      impactAt,
      endsAt: impactAt + recovery,
      impacted: false,
      reversed: false,
      // An unreversible move gets an empty window rather than a zero-width one,
      // so "no window" and "a window you were too slow for" never look alike.
      windowOpensAt: reversible ? Math.max(0, impactAt - width) : Infinity,
      windowClosesAt: reversible ? Math.max(0, impactAt - WINDOW_CLOSE_GAP) : -1,
      depth,
    };
    fighter.active = active;
    this.emit({ type: "move:start", fighter: index, move });
  }

  private advanceMove(index: 0 | 1, delta: number): void {
    const fighter = this.fighters[index];
    const active = fighter.active;
    if (!active) return;

    active.elapsed += delta;

    if (!active.impacted && active.elapsed >= active.impactAt) {
      active.impacted = true;
      this.applyImpact(index, active);
    }

    // The impact frame is the authority on where both bodies end up; recovery
    // only decides when the attacker is free again.
    if (active.elapsed >= active.endsAt) fighter.active = null;
  }

  private applyImpact(index: 0 | 1, active: ActiveMove): void {
    const fighter = this.fighters[index];
    const opponent = this.other(index);
    const move = active.move;

    if (move.category === "taunt") {
      const gained = fighter.addMeter(move.meterGain * this.chargeRate);
      if (gained) this.emit({ type: "meter:icon", fighter: index, icons: fighter.icons });
      fighter.note(move.displayName);
      return;
    }

    // Recompute reach at the impact frame — they may have walked out of it.
    const spatial = this.spatial[index];
    const contact =
      move.category === "grappleMove" ||
      move.category === "submission" ||
      move.category === "reversal" ||
      spatial.distance <= 2.6;
    if (!contact) {
      this.emit({ type: "move:whiff", fighter: index, move });
      fighter.note(`${move.displayName} — whiff`);
      fighter.addMeter(0.02);
      return;
    }

    // Damage, scaled by the attacker's own condition (§8) and stamina.
    const condition = attackScale(fighter.damage, move.selfLoad);
    const fatigue = fighter.stamina < 25 ? 0.85 : 1;
    const dealt = applyDamage(
      opponent.damage,
      move.damageRegion,
      move.damage * condition * fatigue,
      fighter.skin.attributes,
      opponent.skin.attributes,
    );

    if (dealt > 0) {
      this.emit({
        type: "move:impact",
        fighter: index,
        move,
        damage: dealt,
        region: move.damageRegion,
      });
    }

    if (!opponent.bleeding && canBleed(opponent.damage, move.causesBleed)) {
      opponent.bleeding = true;
      this.emit({ type: "bleed", fighter: opponent.index });
    }

    const gained = fighter.addMeter(move.meterGain * this.chargeRate);
    if (gained) this.emit({ type: "meter:icon", fighter: index, icons: fighter.icons });
    fighter.note(move.displayName);

    // Attacker's own state.
    const previousSelf = fighter.state;
    if (move.resultingSelfState !== previousSelf) {
      fighter.setState(move.resultingSelfState);
      if (move.category === "grappleEntry") {
        fighter.grappleFamily = this.familyForSlot(active.slot);
        fighter.grappleTimer = GRAPPLE_HOLD_SECONDS;
        this.emit({ type: "grapple:enter", fighter: index, family: fighter.grappleFamily });
      }
      this.emit({
        type: "state",
        fighter: index,
        state: fighter.state,
        previous: previousSelf,
      });
    }

    // Defender's state.
    const previousOpponent = opponent.state;
    const seconds = (move.opponentStateSeconds ?? 0) * opponent.stunScale;
    if (move.resultingOpponentState !== previousOpponent || seconds > 0) {
      opponent.active = null;
      opponent.setState(move.resultingOpponentState, seconds);
      if (move.resultingOpponentState === "grappleHeld" || move.resultingOpponentState === "rearHeld") {
        opponent.stateTimer = GRAPPLE_HOLD_SECONDS + 0.4;
      }
      this.emit({
        type: "state",
        fighter: opponent.index,
        state: opponent.state,
        previous: previousOpponent,
      });
    }

    // A slam ends whatever hold either of them was in.
    if (move.resultingOpponentState === "down" && previousSelf === "grappleHolding") {
      fighter.grappleFamily = null;
    }

    if (move.causesPin) this.startPin(index);
    if (move.causesSubmission) this.startSubmission(index, move);

    // The second direction of the damage system: loading your own broken limb
    // costs you the moment the move finishes (§8).
    if (shouldRecoil(fighter.damage, move.selfLoad)) {
      fighter.recoilTimer = 0.65;
      this.emit({ type: "move:recoil", fighter: index, region: move.selfLoad as Region });
    }

    this.checkKnockout(opponent);
  }

  private familyForSlot(slot: string): GrappleFamily {
    const direction = slot.split(".").pop() as Exclude<Direction, "neutral"> | undefined;
    if (direction && direction in GRAPPLE_FAMILY_BY_DIRECTION) {
      return GRAPPLE_FAMILY_BY_DIRECTION[direction];
    }
    return "quick";
  }

  private get chargeRate(): number {
    return FINISHER_CHARGE_RATE[this.rules.finisherCharge];
  }

  // --------------------------------------------------------------- contests

  private startPin(index: 0 | 1): void {
    const defender = (index ^ 1) as 0 | 1;
    this.pin = {
      attacker: index,
      defender,
      count: 0,
      complete: false,
      timer: 0,
      kickPower: 0,
      announcedGuaranteed: false,
    };
    this.fighters[index].setState("pinning");
    this.fighters[defender].setState("pinned");
    this.emit({ type: "pin:start", fighter: index });
  }

  /**
   * Pin resolution, §11. Accumulated damage plus the defender's kick-out
   * inputs, and — the detail worth copying exactly — an honest, readable tell
   * when the pin can no longer be escaped, so a near-fall reads as drama rather
   * than as randomness. The source game blurred the screen; we emit
   * `pin:guaranteed` and the HUD does the same thing.
   */
  private tickPin(inputs: [MatchInput, MatchInput], delta: number): void {
    const pin = this.pin;
    if (!pin || pin.complete) return;

    const defender = this.fighters[pin.defender];
    const attacker = this.fighters[pin.attacker];
    pin.timer += delta;

    const gainPerMash = this.kickoutGain(defender);
    if (inputs[pin.defender].mash) pin.kickPower += gainPerMash;

    // Referee slaps the mat roughly once a second.
    const reached = Math.min(3, Math.floor(pin.timer / 0.95));
    if (reached > pin.count && reached >= 1) {
      pin.count = reached;
      this.emit({ type: "pin:count", fighter: pin.attacker, count: reached as 1 | 2 | 3 });
    }

    if (pin.kickPower >= 1) {
      this.emit({ type: "pin:kickout", fighter: pin.defender, atCount: pin.count });
      defender.setState("down", 0.7 * defender.stunScale);
      attacker.setState("standing");
      attacker.recoilTimer = 0.4;
      defender.note(`KICK OUT at ${pin.count}`);
      this.pin = null;
      return;
    }

    if (!pin.announcedGuaranteed) {
      const remaining = Math.max(0, 2.85 - pin.timer);
      const best = remaining * MASH_CEILING_PER_SECOND * gainPerMash;
      if (pin.kickPower + best < 1) {
        pin.announcedGuaranteed = true;
        this.emit({ type: "pin:guaranteed", fighter: pin.attacker });
      }
    }

    if (pin.count >= 3) {
      pin.complete = true;
    }
  }

  /** One mash of kick-out progress. Damage is what makes a pin stick. */
  private kickoutGain(defender: Fighter): number {
    const endurance = 0.5 + defender.skin.attributes.endurance / 200;
    const stamina = 0.4 + defender.stamina / 200;
    const life = 0.25 + (1 - damageFraction(defender.damage)) * 0.85;
    return 0.16 * endurance * stamina * life;
  }

  private startSubmission(index: 0 | 1, move: MoveDef): void {
    const defender = (index ^ 1) as 0 | 1;
    const region = move.submissionRegion ?? move.damageRegion;
    const attacker = this.fighters[index];
    this.submission = {
      attacker: index,
      defender,
      region,
      move,
      pressure: 0.3,
      tapped: false,
      duration: 0,
      // The Submission attribute caps how long the hold can be held at all (§9).
      maxDuration: 4 + (attacker.skin.attributes.submission / 100) * 7,
      ropeGrace: 0.6,
      broken: false,
    };
    this.fighters[index].setState("submissionHolding");
    this.fighters[defender].setState("submissionCaught");
    this.emit({ type: "submission:start", fighter: index, region });
  }

  /**
   * The submission contest, §9. Both players mash: the attacker pushes toward
   * the tap-out, the defender pushes back toward escape. The three governing
   * inputs are both Submission attributes, the damage level of the targeted
   * region, and mash rate.
   */
  private tickSubmission(inputs: [MatchInput, MatchInput], delta: number): void {
    const hold = this.submission;
    if (!hold || hold.tapped || hold.broken) return;

    const attacker = this.fighters[hold.attacker];
    const defender = this.fighters[hold.defender];
    hold.duration += delta;

    // Rope break — which is why dragging someone to the centre of the ring
    // before applying a hold is real strategy.
    if (this.rules.ropeBreaks && this.spatial[hold.defender].nearRopes) {
      hold.ropeGrace -= delta;
      if (hold.ropeGrace <= 0) {
        this.endSubmission(false, "rope break");
        return;
      }
    }

    const resistance = submissionResistance(defender.damage, hold.region);
    const attackRate =
      0.1 * (0.55 + (attacker.skin.attributes.submission / 100) * 0.9) * (2 - resistance);
    hold.pressure += attackRate * delta;

    if (inputs[hold.defender].mash) {
      const relief =
        0.05 * (0.5 + (defender.skin.attributes.submission / 100) * 0.8) * (0.4 + defender.stamina / 200);
      hold.pressure -= relief;
    }

    // A hold wears the region down the whole time it is applied.
    applyDamage(
      defender.damage,
      hold.region,
      hold.move.damage * delta * 0.55,
      attacker.skin.attributes,
      defender.skin.attributes,
    );
    attacker.stamina = Math.max(0, attacker.stamina - delta * 4);
    defender.stamina = Math.max(0, defender.stamina - delta * 6);

    if (hold.pressure >= 1) {
      if (!this.rules.tapOutsEnabled) {
        // Tap-outs off: the hold still wrings them out, it just cannot end the
        // match. The damage it did on the way stays.
        this.endSubmission(false, "wrung out");
        return;
      }
      hold.tapped = true;
      defender.tapped = true;
      this.emit({ type: "submission:end", fighter: hold.attacker, tapped: true });
      return;
    }
    if (hold.pressure <= 0 || hold.duration >= hold.maxDuration) {
      this.endSubmission(false, hold.pressure <= 0 ? "escaped" : "hold expired");
    }
  }

  private endSubmission(tapped: boolean, note: string): void {
    const hold = this.submission;
    if (!hold) return;
    const attacker = this.fighters[hold.attacker];
    const defender = this.fighters[hold.defender];
    hold.broken = true;
    attacker.setState("standing");
    attacker.recoilTimer = 0.45;
    attacker.note(note);
    defender.setState("down", 0.8 * defender.stunScale);
    this.emit({ type: "submission:end", fighter: hold.attacker, tapped });
    this.submission = null;
    this.checkKnockout(defender);
  }

  // -------------------------------------------------------------- knockout

  private checkKnockout(fighter: Fighter): void {
    if (!this.rules.koEnabled) return;
    if (fighter.vitality > 0) return;
    if (fighter.state === "ko" || fighter.state === "pinned" || fighter.state === "submissionCaught") {
      return;
    }
    const previous = fighter.state;
    fighter.setState("ko");
    fighter.koCount = 0;
    fighter.koRecovery = 0;
    fighter.note("KNOCKED OUT");
    this.emit({ type: "state", fighter: fighter.index, state: "ko", previous });
  }

  /**
   * The ten-count. Mashing beats it — a knocked-out wrestler who answers the
   * count rises with a sliver of health back, which is this project's version
   * of the second wind the source game gets from its damage curve alone.
   */
  private tickKnockout(inputs: [MatchInput, MatchInput], delta: number): void {
    for (const fighter of this.fighters) {
      if (fighter.state !== "ko") continue;
      const before = Math.floor(fighter.koCount);
      fighter.koCount += delta;
      const now = Math.floor(fighter.koCount);
      if (now > before && now <= 10) {
        this.emit({ type: "count:tick", fighter: fighter.index, count: now });
      }
      if (inputs[fighter.index].mash) {
        fighter.koRecovery += 0.06 * (0.5 + fighter.skin.attributes.endurance / 150);
      }
      if (fighter.koRecovery >= 1 && fighter.koCount < 10) {
        for (const region of REGIONS) fighter.damage[region] *= 0.86;
        fighter.stamina = Math.max(fighter.stamina, 25);
        fighter.setState("down", 1.2);
        fighter.note("BEATS THE COUNT");
        this.emit({ type: "state", fighter: fighter.index, state: "down", previous: "ko" });
      }
    }
  }

  // ------------------------------------------------------------ win / result

  private evaluateWin(): void {
    const context = {
      fighters: this.fighters,
      rules: this.rules,
      clock: this.clock,
      pin: this.pin,
      submission: this.submission,
    };
    for (const condition of this.winConditions) {
      const outcome = condition.evaluate(context);
      if (!outcome) continue;
      this.live = false;
      this.result = outcome;
      this.emit({ type: "match:end", result: outcome });
      return;
    }
  }

  // ---------------------------------------------------------------- testing

  /** Force a state. Used by the capture harness and by tests. */
  forceState(index: 0 | 1, state: Fighter["state"], seconds = 0): void {
    const fighter = this.fighters[index];
    fighter.active = null;
    fighter.setState(state, seconds);
    if (state !== "pinning" && state !== "pinned" && this.pin) {
      if (this.pin.attacker === index || this.pin.defender === index) this.pin = null;
    }
    if (state !== "submissionHolding" && state !== "submissionCaught" && this.submission) {
      if (this.submission.attacker === index || this.submission.defender === index) {
        this.submission = null;
      }
    }
  }

  /** Force damage on a region, for harness scenarios. */
  forceDamage(index: 0 | 1, region: Region, value: number): void {
    this.fighters[index].damage[region] = Math.max(0, Math.min(100, value));
  }

  /** Hand a fighter finisher icons directly. */
  forceIcons(index: 0 | 1, icons: number): void {
    this.fighters[index].icons = Math.max(0, Math.min(MAX_ICONS, icons));
  }

  /** Drop straight into a base grapple, skipping the entry move. */
  forceGrapple(attacker: 0 | 1, family: GrappleFamily, rear = false): void {
    const defender = (attacker ^ 1) as 0 | 1;
    this.fighters[attacker].active = null;
    this.fighters[defender].active = null;
    this.fighters[attacker].setState(rear ? "rearHolding" : "grappleHolding");
    this.fighters[attacker].grappleFamily = family;
    this.fighters[attacker].grappleTimer = GRAPPLE_HOLD_SECONDS;
    this.fighters[defender].setState(rear ? "rearHeld" : "grappleHeld", GRAPPLE_HOLD_SECONDS + 0.4);
    this.emit({ type: "grapple:enter", fighter: attacker, family });
  }

  /** Open a pin without having to land the move that causes one. */
  forcePin(attacker: 0 | 1): void {
    this.fighters[attacker].active = null;
    this.startPin(attacker);
  }

  /** Open a submission hold using this wrestler's own authored hold. */
  forceSubmission(attacker: 0 | 1, slot = "grapple.submission.down"): boolean {
    const move = moveForSlot(this.fighters[attacker].skin.id, slot);
    if (!move || !move.causesSubmission) return false;
    this.fighters[attacker].active = null;
    this.startSubmission(attacker, move);
    return true;
  }
}
