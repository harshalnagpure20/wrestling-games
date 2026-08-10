/**
 * Capture harness — mounts the live shell inside Vitest's browser runner,
 * waits for the roster, forces named states and pulls stills off the canvas.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { GameShell } from "@/ui/GameShell";

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
