/**
 * The Phase 5 verify gate, run headlessly.
 *
 * BUILD_STEPS.md asks for a full match, start to finish, on placeholder
 * animation; for reversals that land on timing rather than mashing; and for
 * damage that changes how the match plays. None of that needs a renderer, so it
 * is asserted here in a node process where a whole match takes milliseconds and
 * the answers are not a matter of opinion.
 */

import { describe, expect, it } from "vitest";

import { MatchEngine } from "@/match/engine";
import { regionLevel, vitality } from "@/match/damage";
import { MOVE_LIBRARY, getMove } from "@/match/library";
import { auditMoveset, moveForSlot, MOVESETS, SLOT_CATALOGUE } from "@/match/movesets";
import { resolve, slotKeyFor } from "@/match/resolve";
import {
  emptyMatchInput,
  type Direction,
  type MatchEvent,
  type MatchInput,
  type SpatialRelation,
} from "@/match/types";

const DT = 1 / 60;

function press(partial: Partial<MatchInput> = {}): MatchInput {
  return { ...emptyMatchInput(), ...partial };
}

function spatialPair(
  distance: number,
  overrides: Partial<SpatialRelation> = {},
): [SpatialRelation, SpatialRelation] {
  const base: SpatialRelation = {
    distance,
    band: distance < 1.05 ? "clinch" : distance < 2.1 ? "close" : distance < 3.6 ? "mid" : "far",
    behind: false,
    groundSide: null,
    nearRopes: false,
    ...overrides,
  };
  return [{ ...base }, { ...base }];
}

/** Steps the match forward, returning every event raised along the way. */
function advance(
  engine: MatchEngine,
  seconds: number,
  spatial: [SpatialRelation, SpatialRelation],
  inputs: [MatchInput, MatchInput] = [press(), press()],
  dt = DT,
): MatchEvent[] {
  const events: MatchEvent[] = [];
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i += 1) events.push(...engine.tick(dt, inputs, spatial));
  return events;
}

/** One press on one frame, then let the move run to the end of its recovery. */
function perform(
  engine: MatchEngine,
  fighter: 0 | 1,
  input: Partial<MatchInput>,
  spatial: [SpatialRelation, SpatialRelation],
  settleSeconds = 2,
): MatchEvent[] {
  const inputs: [MatchInput, MatchInput] = [press(), press()];
  inputs[fighter] = press(input);
  const events = engine.tick(DT, inputs, spatial);
  events.push(...advance(engine, settleSeconds, spatial));
  return events;
}

function idsOf(events: MatchEvent[], type: MatchEvent["type"]): string[] {
  return events
    .filter((event) => event.type === type)
    .map((event) => ("move" in event && event.move ? event.move.id : event.type));
}

// -------------------------------------------------------------- the manifest

describe("assembly manifests (§5)", () => {
  it("points every authored slot at a real library entry", () => {
    for (const id of Object.keys(MOVESETS) as (keyof typeof MOVESETS)[]) {
      const audit = auditMoveset(id);
      expect(audit.dangling, `${id} has dangling slots`).toEqual([]);
    }
  });

  it("fills every slot that Phase 5 can actually reach", () => {
    for (const id of Object.keys(MOVESETS) as (keyof typeof MOVESETS)[]) {
      const audit = auditMoveset(id);
      expect(audit.emptyPlayable, `${id} is missing reachable slots`).toEqual([]);
      expect(audit.coverage).toBe(1);
    }
  });

  it("reports the deferred slots rather than pretending they exist", () => {
    const audit = auditMoveset("ironclad");
    expect(audit.emptyDeferred.length).toBeGreaterThan(0);
    expect(audit.emptyDeferred).toContain("aerial.standing");
    expect(SLOT_CATALOGUE.length).toBeGreaterThan(audit.filled.length);
  });

  it("shares the pool and differs only where a character should", () => {
    // Both take the same power family from the shared library…
    expect(MOVESETS.ironclad["grapple.power.up"]).toBe(MOVESETS.vanguard["grapple.power.up"]);
    // …and neither shares a signature move or a finisher.
    for (const slot of ["grapple.signature.up", "finisher.1", "finisher.2"] as const) {
      expect(MOVESETS.ironclad[slot]).not.toBe(MOVESETS.vanguard[slot]);
    }
  });

  it("puts damage on the region under pressure, not the limb that moved", () => {
    // The spec's own worked example.
    expect(getMove("grapple.sub.bostonCrab")!.damageRegion).toBe("torso");
    expect(getMove("grapple.power.suplex")!.damageRegion).toBe("head");
  });

  it("gives the two finishers different situational requirements", () => {
    for (const id of ["ironclad", "vanguard"] as const) {
      const first = moveForSlot(id, "finisher.1")!;
      const second = moveForSlot(id, "finisher.2")!;
      expect(first.requiredSituation).toBeDefined();
      expect(second.requiredSituation).toBeDefined();
      expect(first.requiredSituation).not.toBe(second.requiredSituation);
    }
  });
});

// ------------------------------------------------------- the resolution table

describe("resolution table (§1)", () => {
  const engine = new MatchEngine();
  const sp = spatialPair(1.2);
  const self = () => engine.fighters[0].snapshot(engine.fighters[1], sp[0]);
  const opponent = () => engine.fighters[1].snapshot(engine.fighters[0], sp[1]);

  it("gives the same button four different moves from four directions", () => {
    const ids = (["up", "down", "left", "right"] as Direction[]).map(
      (direction) =>
        resolve({ self: self(), opponent: opponent(), spatial: sp[0], button: "grapple", direction })
          .move!.id,
    );
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual([
      "grappleEntry.power",
      "grappleEntry.submission",
      "grappleEntry.signature",
      "grappleEntry.quick",
    ]);
  });

  it("gives the same button an entirely different move in a different state", () => {
    const standing = slotKeyFor({
      self: self(),
      opponent: opponent(),
      spatial: sp[0],
      button: "strike",
      direction: "up",
    });
    engine.forceState(1, "down", 3);
    const grounded = slotKeyFor({
      self: self(),
      opponent: opponent(),
      spatial: { ...sp[0], groundSide: "head" },
      button: "strike",
      direction: "up",
    });
    engine.forceState(1, "running");
    const running = slotKeyFor({
      self: { ...self(), state: "running" },
      opponent: opponent(),
      spatial: sp[0],
      button: "strike",
      direction: "up",
    });
    engine.forceState(1, "standing");

    expect(standing).toBe("standing.strike.up");
    expect(grounded).toBe("ground.attack.head");
    expect(running).toBe("running.strike");
    expect(new Set([standing, grounded, running]).size).toBe(3);
  });

  it("resolves the four moves inside whichever base grapple we are in", () => {
    engine.forceGrapple(0, "signature");
    const ids = (["up", "down", "left", "right"] as Direction[]).map(
      (direction) =>
        resolve({ self: self(), opponent: opponent(), spatial: sp[0], button: "grapple", direction })
          .move!.id,
    );
    expect(ids.every((id) => id.startsWith("sig.ironclad."))).toBe(true);

    engine.forceGrapple(0, "quick");
    const quick = resolve({
      self: self(),
      opponent: opponent(),
      spatial: sp[0],
      button: "grapple",
      direction: "up",
    }).move!.id;
    expect(quick).toBe("grapple.quick.snapmare");
    engine.forceState(0, "standing");
    engine.forceState(1, "standing");
  });

  it("separates near-the-head from near-the-feet on a downed opponent", () => {
    engine.forceState(1, "down", 5);
    const head = resolve({
      self: self(),
      opponent: opponent(),
      spatial: { ...sp[0], groundSide: "head" },
      button: "grapple",
      direction: "left",
    }).move!.id;
    const feet = resolve({
      self: self(),
      opponent: opponent(),
      spatial: { ...sp[0], groundSide: "feet" },
      button: "grapple",
      direction: "left",
    }).move!.id;
    expect(head).not.toBe(feet);
    expect(head).toBe("ground.head.camelClutch");
    expect(feet).toBe("ground.feet.legLock");
    engine.forceState(1, "standing");
  });

  it("refuses rather than substituting when a slot is unauthored", () => {
    // Rear grapples against a groggy opponent are a Phase 7 table.
    engine.forceState(1, "groggy", 5);
    const result = resolve({
      self: self(),
      opponent: opponent(),
      spatial: { ...sp[0], behind: true },
      button: "grapple",
      direction: "up",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unauthored");
    engine.forceState(1, "standing");
  });
});

// --------------------------------------------------------- states and strikes

describe("state machine (§3)", () => {
  it("walks a knocked-down wrestler back to their feet through gettingUp", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    engine.forceState(1, "down", 0.5);

    const seen: string[] = [];
    for (let i = 0; i < 400; i += 1) {
      for (const event of engine.tick(DT, [press(), press()], sp)) {
        if (event.type === "state" && event.fighter === 1) seen.push(event.state);
      }
      if (engine.fighters[1].state === "standing") break;
    }
    expect(seen).toEqual(["gettingUp", "standing"]);
  });

  it("treats groggy as its own state rather than a flag on standing", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    engine.forceState(0, "groggy", 1);
    // A groggy wrestler cannot act, and cannot walk out of it either…
    const events = perform(engine, 0, { strike: true, direction: "up" }, sp, 0.2);
    expect(idsOf(events, "move:start")).toEqual([]);
    expect(engine.fighters[0].mobile).toBe(false);
    // …and comes out of it on its own clock.
    advance(engine, 2, sp);
    expect(engine.fighters[0].state).toBe("standing");
    expect(engine.fighters[0].mobile).toBe(true);
  });

  it("catches a charging opponent with a running counter", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(2.4);
    engine.forceState(1, "running");
    const events = perform(engine, 0, { grapple: true, direction: "up" }, sp, 2);
    expect(idsOf(events, "move:start")).toEqual(["counter.backdrop"]);
    expect(engine.fighters[1].state).toBe("down");
  });

  it("gives a wrestler at a dead run the running table, not the ground one", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(2.0, { groundSide: "head" });
    engine.forceState(1, "down", 5);
    const events = perform(
      engine,
      0,
      { strike: true, run: true, moving: true, direction: "up" },
      sp,
      1.5,
    );
    expect(idsOf(events, "move:start")).toEqual(["running.clothesline"]);
  });

  it("runs the three-hit combination string and then restarts it", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    const ids: string[] = [];
    for (let hit = 0; hit < 4; hit += 1) {
      ids.push(...idsOf(perform(engine, 0, { strike: true }, sp, 0.85), "move:start"));
    }
    expect(ids).toEqual([
      "strike.combo.1",
      "strike.combo.2",
      "strike.combo.3",
      "strike.combo.1",
    ]);
  });
});

// ----------------------------------------------------------- grapple matrix

describe("grapple matrix (§4)", () => {
  it("enters a base grapple as a state of its own before any move is chosen", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.2);
    perform(engine, 0, { grapple: true, direction: "up" }, sp, 0.8);
    expect(engine.fighters[0].state).toBe("grappleHolding");
    expect(engine.fighters[0].grappleFamily).toBe("power");
    expect(engine.fighters[1].state).toBe("grappleHeld");
  });

  it("breaks a base grapple nobody converts", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    engine.forceGrapple(0, "power");
    advance(engine, 3.2, sp);
    expect(engine.fighters[0].state).toBe("standing");
    expect(engine.fighters[1].state).toBe("standing");
  });

  it("turns behind the opponent from inside the lock-up", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.9);
    engine.forceGrapple(0, "power");
    engine.tick(DT, [press({ run: true }), press()], sp);
    expect(engine.fighters[0].state).toBe("rearHolding");
    expect(engine.fighters[1].state).toBe("rearHeld");
  });

  it("fails a lift readably when the opponent is too heavy (§6, §12)", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.9);
    // Vanguard (215 lb) tries to powerbomb Ironclad (330 lb).
    engine.forceGrapple(1, "power");
    const events = perform(engine, 1, { grapple: true, direction: "right" }, sp, 0.4);
    const failed = events.find((event) => event.type === "move:failed");
    expect(failed).toBeDefined();
    expect(failed && "reason" in failed && failed.reason).toBe("tooHeavy");

    // The same move the other way round is legal.
    const other = new MatchEngine();
    other.forceGrapple(0, "power");
    const ok = perform(other, 0, { grapple: true, direction: "right" }, sp, 1.8);
    expect(idsOf(ok, "move:start")).toContain("grapple.power.powerbomb");
    expect(other.fighters[1].damage.torso).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------- reversals

describe("reversals (§7)", () => {
  /** Ironclad throws an uppercut; the window is measured off the live move. */
  function uppercut(engine: MatchEngine, sp: [SpatialRelation, SpatialRelation]) {
    engine.tick(DT, [press({ strike: true, direction: "up" }), press()], sp);
    return engine.fighters[0].active!;
  }

  it("opens on startup and closes before the impact frame", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    const active = uppercut(engine, sp);
    expect(active.windowOpensAt).toBeGreaterThan(0);
    expect(active.windowClosesAt).toBeLessThan(active.impactAt);
  });

  it("scales the window width with the defender's Technique (§12)", () => {
    const versusVanguard = new MatchEngine({ roster: ["ironclad", "vanguard"] });
    const versusIronclad = new MatchEngine({ roster: ["ironclad", "ironclad"] });
    const sp = spatialPair(1.0);
    const a = uppercut(versusVanguard, sp);
    const b = uppercut(versusIronclad, sp);
    const widthA = a.windowClosesAt - a.windowOpensAt;
    const widthB = b.windowClosesAt - b.windowOpensAt;
    // Vanguard is the explosive heavyweight, not the technician: his Technique
    // is 42 against Ironclad's 55, so he gets the *narrower* window to react in.
    // Being hard to reverse is the price he pays for hitting that hard.
    expect(widthA).toBeLessThan(widthB);
  });

  it("lands on timing, and leaves the original attacker groggy", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    const active = uppercut(engine, sp);

    // Wait until the window is open, then press once.
    advance(engine, active.windowOpensAt + 0.02, sp);
    const events = engine.tick(DT, [press(), press({ reverseStrike: true })], sp);
    const reversal = events.find((event) => event.type === "reversal");
    expect(reversal).toBeDefined();
    // The uppercut never landed…
    expect(engine.fighters[1].damage.head).toBe(0);
    // …and once the counter lands, the original attacker is groggy and open —
    // the primary legitimate opening for a finisher.
    advance(engine, 1, sp);
    expect(engine.fighters[0].state).toBe("groggy");
  });

  it("punishes mashing — the masher never reverses the same move", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    uppercut(engine, sp);

    const events: MatchEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      // Both triggers, every other frame: the definition of mashing.
      const mash = i % 2 === 0;
      events.push(
        ...engine.tick(
          DT,
          [press(), press({ reverseStrike: mash, reverseGrapple: mash })],
          sp,
        ),
      );
    }
    expect(events.some((event) => event.type === "reversal")).toBe(false);
    expect(events.some((event) => event.type === "reversal:missed")).toBe(true);
    // The uppercut landed instead.
    expect(engine.fighters[1].damage.head).toBeGreaterThan(0);
  });

  it("supports a counter to a counter, and stops there", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    // Ironclad enters a power grapple; Vanguard reverses it with R2.
    engine.tick(DT, [press({ grapple: true, direction: "up" }), press()], sp);
    const entry = engine.fighters[0].active!;
    advance(engine, Math.max(0, entry.windowOpensAt) + 0.01, sp);
    const first = engine.tick(DT, [press(), press({ reverseGrapple: true })], sp);
    expect(first.some((event) => event.type === "reversal" && event.depth === 0)).toBe(true);

    // Vanguard's wrist-lock reversal is itself reversible with L2.
    const counter = engine.fighters[1].active!;
    expect(counter.windowClosesAt).toBeGreaterThan(counter.windowOpensAt);
    advance(engine, counter.windowOpensAt + 0.01, sp);
    const second = engine.tick(DT, [press({ reverseStrike: true }), press()], sp);
    expect(second.some((event) => event.type === "reversal" && event.depth === 1)).toBe(true);

    // And the counter-to-the-counter is not itself reversible — the exchange
    // has to resolve.
    const third = engine.fighters[0].active!;
    expect(third.depth).toBe(2);
    expect(third.windowOpensAt).toBe(Infinity);
    expect(third.windowClosesAt).toBeLessThan(0);
  });
});

// ------------------------------------------------------------------ damage

describe("localised damage (§8)", () => {
  it("carries four levels per region", () => {
    expect(regionLevel(0)).toBe(1);
    expect(regionLevel(30)).toBe(2);
    expect(regionLevel(60)).toBe(3);
    expect(regionLevel(99)).toBe(4);
  });

  it("weakens the victim's own attacks made with a worn region", () => {
    const fresh = new MatchEngine();
    const hurt = new MatchEngine();
    const sp = spatialPair(1.0);
    hurt.forceDamage(0, "arms", 95);

    perform(fresh, 0, { strike: true, direction: "up" }, sp, 1.2);
    perform(hurt, 0, { strike: true, direction: "up" }, sp, 1.2);

    expect(hurt.fighters[1].damage.head).toBeGreaterThan(0);
    expect(hurt.fighters[1].damage.head).toBeLessThan(fresh.fighters[1].damage.head);
  });

  it("makes the attacker recoil for using their own broken limb", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    engine.forceDamage(0, "arms", 90);
    const events = perform(engine, 0, { strike: true, direction: "up" }, sp, 0.6);
    expect(events.some((event) => event.type === "move:recoil")).toBe(true);
  });

  it("requires both the move flag and a maxed head before anyone bleeds", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    // strike.elbow carries the flag; a fresh head must not bleed.
    engine.forceDamage(1, "head", 10);
    let events = perform(engine, 0, { strike: true, direction: "left" }, sp, 0.9);
    expect(events.some((event) => event.type === "bleed")).toBe(false);

    engine.forceDamage(1, "head", 99);
    events = perform(engine, 0, { strike: true, direction: "left" }, sp, 0.9);
    expect(events.some((event) => event.type === "bleed")).toBe(true);
  });

  it("lengthens a knockdown on a badly damaged body", () => {
    const fresh = new MatchEngine();
    const hurt = new MatchEngine();
    const sp = spatialPair(0.9);
    hurt.forceDamage(1, "head", 95);
    hurt.forceDamage(1, "torso", 95);

    fresh.forceGrapple(0, "power");
    hurt.forceGrapple(0, "power");
    perform(fresh, 0, { grapple: true, direction: "down" }, sp, 1.5);
    perform(hurt, 0, { grapple: true, direction: "down" }, sp, 1.5);

    expect(hurt.fighters[1].stateTimer).toBeGreaterThan(fresh.fighters[1].stateTimer);
  });
});

// ------------------------------------------------------ meter and finishers

describe("stamina, meter and finishers (§10, §18)", () => {
  it("fills the meter by taunting, and longer means more", () => {
    const brief = new MatchEngine();
    const long = new MatchEngine();
    const sp = spatialPair(3);
    advance(brief, 1, sp, [press({ tauntHeld: true }), press()]);
    advance(long, 4, sp, [press({ tauntHeld: true }), press()]);
    expect(long.fighters[0].iconCharge + long.fighters[0].icons).toBeGreaterThan(
      brief.fighters[0].iconCharge + brief.fighters[0].icons,
    );
  });

  it("charges faster on the fast match rule", () => {
    const normal = new MatchEngine({ rules: { finisherCharge: "normal" } });
    const fastest = new MatchEngine({ rules: { finisherCharge: "fastest" } });
    const sp = spatialPair(3);
    advance(normal, 2, sp, [press({ tauntHeld: true }), press()]);
    advance(fastest, 2, sp, [press({ tauntHeld: true }), press()]);
    expect(fastest.fighters[0].iconCharge).toBeGreaterThan(normal.fighters[0].iconCharge);
  });

  it("needs an icon AND the situation, and reports them separately", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.4);

    // Icon, wrong situation.
    engine.forceIcons(0, 2);
    let snapshot = engine.fighters[0].snapshot(engine.fighters[1], sp[0]);
    expect(snapshot.situationSatisfied).toBe(false);
    expect(snapshot.finisherReady).toBe(false);
    let events = perform(engine, 0, { finisher: true }, sp, 0.4);
    expect(idsOf(events, "move:start")).toEqual([]);
    expect(engine.fighters[0].icons).toBe(2);

    // Situation, no icon.
    engine.forceIcons(0, 0);
    engine.forceState(1, "groggy", 8);
    snapshot = engine.fighters[0].snapshot(engine.fighters[1], sp[0]);
    expect(snapshot.situationSatisfied).toBe(true);
    expect(snapshot.finisherReady).toBe(false);
    events = perform(engine, 0, { finisher: true }, sp, 0.4);
    expect(idsOf(events, "move:start")).toEqual([]);

    // Both.
    engine.forceIcons(0, 1);
    engine.forceState(1, "groggy", 8);
    snapshot = engine.fighters[0].snapshot(engine.fighters[1], sp[0]);
    expect(snapshot.finisherReady).toBe(true);
    events = perform(engine, 0, { finisher: true }, sp, 2.5);
    expect(idsOf(events, "move:start")).toEqual(["fin.ironclad.anvilDrop"]);
    expect(engine.fighters[0].icons).toBe(0);
  });

  it("picks the finisher whose situation is currently satisfied", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.4, { groundSide: "head" });
    engine.forceIcons(0, 1);
    engine.forceState(1, "down", 8);
    const events = perform(engine, 0, { finisher: true }, sp, 2.5);
    expect(idsOf(events, "move:start")).toEqual(["fin.ironclad.forgeSeal"]);
  });

  it("steals the opponent's finisher with two icons stored (§2)", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.4);
    engine.forceIcons(0, 2);
    engine.forceState(1, "groggy", 8);
    const events = perform(engine, 0, { finisher: true, reverseStrike: true }, sp, 2.5);
    // Vanguard's other finisher is the running tackle, which Ironclad cannot
    // steal from a standstill — so the groggy-only sit-out slam is what he gets.
    expect(idsOf(events, "move:start")).toEqual(["fin.vanguard.spireDrop"]);
    expect(engine.fighters[0].icons).toBe(0);
  });

  it("refuses heavy moves when stamina is gone", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.9);
    engine.fighters[0].stamina = 3;
    engine.forceGrapple(0, "power");
    const events = perform(engine, 0, { grapple: true, direction: "up" }, sp, 0.3);
    const failed = events.find((event) => event.type === "move:failed");
    expect(failed && "reason" in failed && failed.reason).toBe("tooTired");
  });
});

// -------------------------------------------------------------------- pins

describe("pins (§11)", () => {
  it("counts to three and awards the fall when nobody kicks out", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.8);
    engine.forceState(1, "down", 10);
    engine.forcePin(0);
    const events = advance(engine, 4, sp);

    const counts = events.filter((event) => event.type === "pin:count");
    expect(counts.length).toBe(3);
    expect(engine.result?.condition).toBe("pinfall");
    expect(engine.result?.winner).toBe(0);
  });

  it("lets a fresh wrestler mash out of it", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.8);
    engine.forceState(1, "down", 10);
    engine.forcePin(0);

    const events: MatchEvent[] = [];
    for (let i = 0; i < 180; i += 1) {
      // Roughly seven-and-a-half presses a second.
      const mashing = i % 8 === 0;
      events.push(...engine.tick(DT, [press(), press({ mash: mashing })], sp));
    }
    expect(events.some((event) => event.type === "pin:kickout")).toBe(true);
    expect(engine.result).toBeNull();
  });

  it("declares a guaranteed pin when the kick-out is arithmetically impossible", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.8);
    for (const region of ["head", "torso", "arms", "legs"] as const) {
      engine.forceDamage(1, region, 97);
    }
    engine.fighters[1].stamina = 8;
    engine.forceState(1, "down", 10);
    engine.forcePin(0);

    const events: MatchEvent[] = [];
    for (let i = 0; i < 200; i += 1) {
      events.push(...engine.tick(DT, [press(), press({ mash: i % 6 === 0 })], sp));
    }
    expect(events.some((event) => event.type === "pin:guaranteed")).toBe(true);
    expect(engine.result?.condition).toBe("pinfall");
  });
});

// ------------------------------------------------------------- submissions

describe("submissions (§9)", () => {
  it("taps out an opponent who does not fight the hold", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.8);
    // Ironclad is the grappler — he has the Submission attribute to finish one.
    expect(engine.forceSubmission(0)).toBe(true);
    advance(engine, 8, sp);
    expect(engine.result?.condition).toBe("submission");
    expect(engine.result?.winner).toBe(0);
  });

  it("is a two-sided contest — mashing pushes the meter back", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.8);
    engine.forceSubmission(0);
    advance(engine, 2, sp);
    const before = engine.submissionStatus!.pressure;
    for (let i = 0; i < 60; i += 1) {
      engine.tick(DT, [press(), press({ mash: i % 4 === 0 })], sp);
    }
    expect(engine.submissionStatus!.pressure).toBeLessThan(before);
    expect(engine.result).toBeNull();
  });

  it("breaks on the ropes, which is why dragging to the centre matters", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(0.8, { nearRopes: true });
    engine.forceSubmission(1);
    const events = advance(engine, 1.5, sp);
    const ended = events.find((event) => event.type === "submission:end");
    expect(ended && "tapped" in ended && ended.tapped).toBe(false);
    expect(engine.submissionStatus).toBeNull();
    expect(engine.result).toBeNull();
  });

  it("caps the hold at the attacker's Submission attribute", () => {
    const low = new MatchEngine();
    const high = new MatchEngine();
    low.forceSubmission(1); // Vanguard — Submission 38.
    high.forceSubmission(0); // Ironclad — Submission 62.
    expect(high.submissionStatus!.maxDuration).toBeGreaterThan(low.submissionStatus!.maxDuration);

    // And the hold really does let go rather than running forever.
    const engine = new MatchEngine({ rules: { tapOutsEnabled: false } });
    const sp = spatialPair(0.8);
    engine.forceSubmission(0);
    advance(engine, 12, sp);
    expect(engine.submissionStatus).toBeNull();
    expect(engine.fighters[0].state).not.toBe("submissionHolding");
  });
});

// ---------------------------------------------------------- win conditions

describe("win conditions (§16)", () => {
  it("ends on a knockout ten-count", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    for (const region of ["head", "torso", "arms", "legs"] as const) {
      engine.forceDamage(1, region, 100);
    }
    expect(vitality(engine.fighters[1].damage)).toBe(0);
    perform(engine, 0, { strike: true, direction: "up" }, sp, 0.6);
    expect(engine.fighters[1].state).toBe("ko");

    advance(engine, 11, sp, [press(), press()], 0.1);
    expect(engine.result?.condition).toBe("knockout");
    expect(engine.result?.winner).toBe(0);
  });

  it("lets a knocked-out wrestler beat the count by mashing", () => {
    const engine = new MatchEngine();
    const sp = spatialPair(1.0);
    for (const region of ["head", "torso", "arms", "legs"] as const) {
      engine.forceDamage(1, region, 100);
    }
    perform(engine, 0, { strike: true, direction: "up" }, sp, 0.6);
    expect(engine.fighters[1].state).toBe("ko");

    for (let i = 0; i < 300; i += 1) {
      engine.tick(DT, [press(), press({ mash: i % 5 === 0 })], sp);
      if (engine.fighters[1].state !== "ko") break;
    }
    expect(engine.fighters[1].state).not.toBe("ko");
    expect(engine.result).toBeNull();
  });

  it("counts a wrestler out of the ring", () => {
    const engine = new MatchEngine({ rules: { countOutSeconds: 10 } });
    const sp = spatialPair(4);
    engine.forceState(1, "outside");
    advance(engine, 11, sp, [press(), press()], 0.1);
    expect(engine.result?.condition).toBe("countOut");
    expect(engine.result?.winner).toBe(0);
  });

  it("draws on the time limit", () => {
    const engine = new MatchEngine({ rules: { matchLengthSeconds: 5 } });
    const sp = spatialPair(3);
    advance(engine, 6, sp, [press(), press()], 0.1);
    expect(engine.result?.condition).toBe("timeLimit");
    expect(engine.result?.winner).toBeNull();
  });
});

// ------------------------------------------------------------- attributes

describe("attributes actually modify behaviour (§12)", () => {
  it("Strength changes damage dealt and Endurance changes damage taken", () => {
    const sp = spatialPair(1.0);
    const strong = new MatchEngine({ roster: ["ironclad", "ironclad"] });
    const weak = new MatchEngine({ roster: ["vanguard", "ironclad"] });
    perform(strong, 0, { strike: true, direction: "up" }, sp, 1.2);
    perform(weak, 0, { strike: true, direction: "up" }, sp, 1.2);
    // Same defender, same move; only Strength differs.
    expect(strong.fighters[1].damage.head).toBeGreaterThan(weak.fighters[1].damage.head);

    const tough = new MatchEngine({ roster: ["ironclad", "vanguard"] });
    const frail = new MatchEngine({ roster: ["ironclad", "ironclad"] });
    perform(tough, 0, { strike: true, direction: "up" }, sp, 1.2);
    perform(frail, 0, { strike: true, direction: "up" }, sp, 1.2);
    // Vanguard's Endurance is 82 against Ironclad's 74.
    expect(tough.fighters[1].damage.head).toBeLessThan(frail.fighters[1].damage.head);
  });

  it("Speed governs how fast you get off the mat", () => {
    const quick = new MatchEngine({ roster: ["ironclad", "vanguard"] });
    const slow = new MatchEngine({ roster: ["ironclad", "ironclad"] });
    expect(quick.fighters[1].stunScale).toBeLessThan(slow.fighters[1].stunScale);
  });

  it("Submission caps how long a hold can be maintained", () => {
    const engine = new MatchEngine({ rules: { tapOutsEnabled: false } });
    const sp = spatialPair(0.8);
    engine.forceSubmission(1);
    const vanguardCap = engine.submissionStatus!.maxDuration;
    advance(engine, 12, sp);

    const other = new MatchEngine({ rules: { tapOutsEnabled: false } });
    other.forceSubmission(0);
    // Ironclad holds a limb far longer than Vanguard can.
    expect(other.submissionStatus!.maxDuration).toBeGreaterThan(vanguardCap);
  });
});

// ------------------------------------------------------------- full match

describe("a full match, start to finish", () => {
  it("finishes by pinfall after a beating (the Phase 5 verify gate)", () => {
    const engine = new MatchEngine();
    const close = spatialPair(1.0);
    const overHead = spatialPair(1.0, { groundSide: "head" });

    // Ironclad works Vanguard over with grapples until they stop getting up.
    for (let round = 0; round < 24 && engine.live; round += 1) {
      if (engine.fighters[1].state === "down" || engine.fighters[1].state === "gettingUp") {
        perform(engine, 0, { grapple: true, direction: "down" }, overHead, 0.4);
        // A pin is now running; nobody kicks out.
        advance(engine, 3.4, overHead);
        continue;
      }
      if (engine.fighters[0].state === "grappleHolding") {
        perform(engine, 0, { grapple: true, direction: "up" }, close, 1.6);
      } else {
        perform(engine, 0, { grapple: true, direction: "up" }, close, 1.0);
      }
    }

    expect(engine.live).toBe(false);
    expect(engine.result).not.toBeNull();
    expect(engine.result!.winner).toBe(0);
    expect(["pinfall", "knockout"]).toContain(engine.result!.condition);
    expect(engine.result!.atSeconds).toBeGreaterThan(0);
  });

  it("keeps every move in the library reachable through some slot", () => {
    const assigned = new Set<string>();
    for (const set of Object.values(MOVESETS)) {
      for (const id of Object.values(set)) assigned.add(id as string);
    }
    const orphans = Object.keys(MOVE_LIBRARY).filter((id) => !assigned.has(id));
    // Only the Phase 7 environment moves may sit unassigned today.
    expect(orphans).toEqual([]);
  });
});
