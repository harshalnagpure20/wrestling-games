/**
 * Capture harness — mounts the live shell inside Vitest's browser runner,
 * waits for the roster, forces named states and pulls stills off the canvas.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { GameShell } from "@/ui/GameShell";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function keyDown(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
}

function keyUp(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
}

async function waitForHarness(timeoutMs = 25000): Promise<boolean> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (window.__WRESTLING__?.ready()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return window.__WRESTLING__?.ready() ?? false;
}

describe("capture harness", () => {
  beforeEach(async () => {
    // Full-viewport shell needs a sized host — vitest's default root is tiny.
    document.documentElement.style.height = "100%";
    document.body.style.height = "100%";
    document.body.style.margin = "0";
    const root = document.getElementById("root") ?? document.body;
    (root as HTMLElement).style.height = "720px";
    (root as HTMLElement).style.width = "1280px";
    await render(<GameShell />);
  });

  afterEach(() => {
    window.__WRESTLING__?.forceState("idle");
  });

  it("boots the roster and exposes the harness API", async () => {
    const ready = await waitForHarness();
    expect(ready).toBe(true);

    const snap = window.__WRESTLING__!.snapshot();
    expect(snap.roster).toBe("ready");
    expect(snap.fighters.length).toBe(2);
    expect(snap.fighters.map((f) => f.id).sort()).toEqual(["ironclad", "vanguard"]);
  });

  it("forces idle and captures a still", async () => {
    expect(await waitForHarness()).toBe(true);

    expect(window.__WRESTLING__!.forceState("idle")).toBe(true);
    await new Promise((r) => setTimeout(r, 250));

    const still = window.__WRESTLING__!.captureStill();
    expect(still).toBeTruthy();
    expect(still!.startsWith("data:image/png")).toBe(true);
    expect(still!.length).toBeGreaterThan(8000);
  });

  it("forces every Phase 5 systems state and captures each one", async () => {
    expect(await waitForHarness()).toBe(true);

    const states = [
      "grapple",
      "rearGrapple",
      "groggy",
      "down",
      "pin",
      "submission",
      "finisherReady",
      "hurt",
    ] as const;

    for (const state of states) {
      expect(window.__WRESTLING__!.forceState(state, 0), state).toBe(true);
      await new Promise((r) => setTimeout(r, 120));
      const still = window.__WRESTLING__!.captureStill();
      expect(still, state).toBeTruthy();
      expect(still!.length, state).toBeGreaterThan(8000);
    }

    // The systems layer really is running behind those stills.
    window.__WRESTLING__!.forceState("pin", 0);
    await new Promise((r) => setTimeout(r, 1200));
    const pinned = window.__WRESTLING__!.snapshot();
    expect(pinned.pin).not.toBeNull();
    expect(pinned.pin!.count).toBeGreaterThanOrEqual(1);

    window.__WRESTLING__!.forceState("hurt", 0);
    await new Promise((r) => setTimeout(r, 150));
    const hurt = window.__WRESTLING__!.snapshot();
    expect(hurt.fighters[1].damageLevels.head).toBe(4);
    expect(hurt.fighters[1].vitality).toBeLessThan(50);

    window.__WRESTLING__!.resetMatch();
  });

  /**
   * The one thing the headless engine tests cannot cover: the keyboard →
   * intent → edge-detection → resolution-table path, driven by real key events
   * against the live shell.
   */
  it("plays the grapple matrix through the real input pipeline", async () => {
    expect(await waitForHarness()).toBe(true);
    window.__WRESTLING__!.resetMatch();
    window.__WRESTLING__!.forceState("clinch");
    await wait(120);

    // Direction + grapple: up chooses the power base grapple.
    keyDown("KeyW");
    keyDown("KeyK");
    await wait(120);
    keyUp("KeyK");
    await wait(700);

    let snapshot = window.__WRESTLING__!.snapshot();
    expect(snapshot.fighters[0].position).toBe("grappleHolding");
    expect(snapshot.fighters[1].position).toBe("grappleHeld");

    // Step two: the same button, still holding up, runs that family's move.
    keyDown("KeyK");
    await wait(120);
    keyUp("KeyK");
    keyUp("KeyW");
    await wait(1200);

    snapshot = window.__WRESTLING__!.snapshot();
    // A vertical suplex loads the head and neck, not the back that threw it.
    expect(snapshot.fighters[1].damage.head).toBeGreaterThan(0);
    expect(snapshot.fighters[1].vitality).toBeLessThan(100);
    expect(snapshot.fighters[0].iconCharge).toBeGreaterThan(0);

    window.__WRESTLING__!.resetMatch();
  });

  it("forces clinch and walk named states", async () => {
    expect(await waitForHarness()).toBe(true);

    expect(window.__WRESTLING__!.forceState("clinch")).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    const clinch = window.__WRESTLING__!.snapshot();
    expect(["clinch", "close"]).toContain(clinch.fighters[0].band);

    expect(window.__WRESTLING__!.forceState("walk", 0)).toBe(true);
    const walk = window.__WRESTLING__!.snapshot();
    expect(walk.roster).toBe("ready");
  });
});
