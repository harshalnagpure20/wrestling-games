/**
 * Capture harness surface.
 *
 * Playwright (and a human with the console) drive the match by name without
 * touching private engine fields. Phase 5 adds the states the systems layer
 * made real — base grapples, groggy, pins, submissions, a loaded finisher —
 * so a still or a clip of any of them can be produced on command.
 */

import type { FighterDebug, MatchHud } from "./control";
import type { RosterLoadState } from "../scene/ringEngine";

export type NamedState =
  | "idle"
  | "walk"
  | "run"
  | "strike"
  | "knockdown"
  | "getUp"
  | "corners"
  | "clinch"
  // Phase 5 — the systems layer.
  | "grapple"
  | "rearGrapple"
  | "groggy"
  | "down"
  | "pin"
  | "submission"
  | "finisherReady"
  | "hurt";

export interface HarnessSnapshot {
  roster: RosterLoadState;
  fighters: FighterDebug[];
  fps: number;
  theme: string;
  preset: string;
  /** Seconds since the opening bell. */
  clock: number;
  live: boolean;
  pin: MatchHud["pin"];
  submission: MatchHud["submission"];
  result: MatchHud["result"];
}

export interface WrestlingHarness {
  ready(): boolean;
  snapshot(): HarnessSnapshot;
  /** Force a named pose / placement. Returns false if the roster is not up. */
  forceState(state: NamedState, fighter?: 0 | 1): boolean;
  /** Wait until the roster reports ready (or timeout). */
  waitReady(timeoutMs?: number): Promise<boolean>;
  /** Capture the canvas as a PNG data URL. */
  captureStill(): string | null;
  /** Restart the match with both wrestlers fresh. */
  resetMatch(): void;
}

declare global {
  interface Window {
    __WRESTLING__?: WrestlingHarness;
  }
}

export function installHarness(api: WrestlingHarness): void {
  if (typeof window === "undefined") return;
  window.__WRESTLING__ = api;
}

export function uninstallHarness(): void {
  if (typeof window === "undefined") return;
  delete window.__WRESTLING__;
}
