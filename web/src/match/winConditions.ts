/**
 * Win conditions, spec §16.
 *
 * > Structure these as a `WinCondition` interface. That single abstraction
 * > covers nearly every match type in the source game.
 *
 * The singles match ships with pinfall, submission, count-out and knockout.
 * Later match types (first blood, table, last man standing, most falls) are new
 * entries in this file and a different array in the rules — the match engine
 * itself does not learn about them.
 *
 * Count-out is wired but dormant: nothing can currently leave the ring, because
 * ring exit is a Phase 7 state. The condition reads `outsideTimer`, which the
 * engine already ticks, so the day the apron exists this starts working without
 * being rewritten.
 */

import type { Fighter } from "./fighter";
import type { MatchResult, MatchRules } from "./types";

export interface PinStatus {
  attacker: 0 | 1;
  defender: 0 | 1;
  count: number;
  complete: boolean;
}

export interface SubmissionStatus {
  attacker: 0 | 1;
  defender: 0 | 1;
  pressure: number;
  tapped: boolean;
}

export interface WinConditionContext {
  fighters: [Fighter, Fighter];
  rules: MatchRules;
  /** Seconds since the opening bell. */
  clock: number;
  pin: PinStatus | null;
  submission: SubmissionStatus | null;
}

export interface WinCondition {
  id: string;
  label: string;
  evaluate(context: WinConditionContext): MatchResult | null;
}

function result(
  winner: 0 | 1,
  condition: string,
  label: string,
  clock: number,
): MatchResult {
  return { winner, loser: (winner ^ 1) as 0 | 1, condition, label, atSeconds: clock };
}

export const PINFALL: WinCondition = {
  id: "pinfall",
  label: "Pinfall",
  evaluate({ pin, clock }) {
    if (!pin?.complete) return null;
    return result(pin.attacker, "pinfall", "Wins by pinfall", clock);
  },
};

export const SUBMISSION: WinCondition = {
  id: "submission",
  label: "Submission",
  evaluate({ submission, rules, clock }) {
    if (!rules.tapOutsEnabled || !submission?.tapped) return null;
    return result(submission.attacker, "submission", "Wins by submission", clock);
  },
};

export const KNOCKOUT: WinCondition = {
  id: "knockout",
  label: "Knockout",
  evaluate({ fighters, rules, clock }) {
    if (!rules.koEnabled) return null;
    for (const fighter of fighters) {
      if (fighter.state === "ko" && fighter.koCount >= 10) {
        return result((fighter.index ^ 1) as 0 | 1, "knockout", "Wins by knockout", clock);
      }
    }
    return null;
  },
};

export const COUNT_OUT: WinCondition = {
  id: "countOut",
  label: "Count-out",
  evaluate({ fighters, rules, clock }) {
    if (!rules.ringOutCount) return null;
    for (const fighter of fighters) {
      if (fighter.outsideTimer >= rules.countOutSeconds) {
        return result((fighter.index ^ 1) as 0 | 1, "countOut", "Wins by count-out", clock);
      }
    }
    return null;
  },
};

export const TIME_LIMIT: WinCondition = {
  id: "timeLimit",
  label: "Time limit",
  evaluate({ rules, clock }) {
    if (rules.matchLengthSeconds <= 0 || clock < rules.matchLengthSeconds) return null;
    return {
      winner: null,
      loser: null,
      condition: "timeLimit",
      label: "Time-limit draw",
      atSeconds: clock,
    };
  },
};

/** The singles match. Order is precedence when two conditions land together. */
export const SINGLES_WIN_CONDITIONS: WinCondition[] = [
  PINFALL,
  SUBMISSION,
  KNOCKOUT,
  COUNT_OUT,
  TIME_LIMIT,
];
