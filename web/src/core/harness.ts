/**
 * Capture harness surface.
 *
 * Playwright (and a human with the console) drive the match by name without
 * touching private engine fields. Named states are the ones Phase 4 can force
 * honestly — full grapple/pin states arrive with Phase 5.
 */

import type { FighterDebug } from "./control";
import type { RosterLoadState } from "../scene/ringEngine";

export type NamedState =
  | "idle"
  | "walk"
  | "run"
  | "strike"
  | "knockdown"
  | "getUp"
  | "corners"
  | "clinch";

export interface HarnessSnapshot {
  roster: RosterLoadState;
  fighters: FighterDebug[];
  fps: number;
  theme: string;
  preset: string;
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
