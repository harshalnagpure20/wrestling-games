/**
 * Localised damage, spec §8.
 *
 * Four regions, four levels, and — the part that makes the system feel alive —
 * damage cuts *both* ways. A worn region weakens the victim's attacks that use
 * it, lengthens their stun and drops their submission resistance; and executing
 * a move that loads your *own* hurt region makes you recoil after the move
 * lands. Attacking with a broken arm costs you.
 *
 * Everything here is pure arithmetic on plain records so it can be unit-tested
 * without a renderer or a clock.
 */

import type { AttributeBlock } from "../assets/generated";
import { REGIONS, type DamageLevel, type DamageState, type Region } from "./types";

/** Per-region damage runs 0–100; the four levels are quarters of that. */
export const REGION_MAX = 100;

/** Level thresholds. Blue → yellow → orange → red. */
const LEVEL_EDGES = [25, 50, 75];

export function freshDamage(): DamageState {
  return { head: 0, torso: 0, arms: 0, legs: 0 };
}

export function regionLevel(value: number): DamageLevel {
  if (value >= LEVEL_EDGES[2]) return 4;
  if (value >= LEVEL_EDGES[1]) return 3;
  if (value >= LEVEL_EDGES[0]) return 2;
  return 1;
}

export function damageLevels(damage: DamageState): Record<Region, DamageLevel> {
  return {
    head: regionLevel(damage.head),
    torso: regionLevel(damage.torso),
    arms: regionLevel(damage.arms),
    legs: regionLevel(damage.legs),
  };
}

/**
 * How close this wrestler is to being finished, 100 → 0.
 *
 * The head and torso carry the match; limbs hurt but do not end it. That
 * weighting is what keeps limb work a *setup* strategy for submissions rather
 * than a second route to a knockout.
 */
export function vitality(damage: DamageState): number {
  const weighted =
    damage.head * 0.34 + damage.torso * 0.34 + damage.arms * 0.16 + damage.legs * 0.16;
  return Math.max(0, 100 - weighted);
}

/** Total accumulated damage, 0–1. Feeds pin resolution. */
export function damageFraction(damage: DamageState): number {
  const sum = REGIONS.reduce((acc, region) => acc + damage[region], 0);
  return Math.min(1, sum / (REGION_MAX * REGIONS.length));
}

/**
 * Applies damage, scaled by the attacker's Strength and the victim's Endurance
 * (spec §12), and returns what actually landed.
 */
export function applyDamage(
  damage: DamageState,
  region: Region,
  amount: number,
  attacker: AttributeBlock,
  defender: AttributeBlock,
): number {
  const strength = 0.7 + attacker.strength / 100;
  const endurance = 1.2 - defender.endurance / 200;
  const dealt = Math.max(0, amount * strength * endurance);
  damage[region] = Math.min(REGION_MAX, damage[region] + dealt);
  return dealt;
}

/**
 * Output multiplier for a move that loads `region` of the *attacker's* body.
 * A red arm still throws the punch — it just does not land like it used to.
 */
export function attackScale(damage: DamageState, region: Region | undefined): number {
  if (!region) return 1;
  const level = regionLevel(damage[region]);
  return [1, 1, 0.88, 0.74, 0.6][level];
}

/** True when executing a move on this region should make the attacker recoil. */
export function shouldRecoil(damage: DamageState, region: Region | undefined): boolean {
  if (!region) return false;
  return regionLevel(damage[region]) >= 3;
}

/**
 * Stun and knockdown time multiplier. A wrestler with a red head stays down
 * noticeably longer, which is what makes head damage frightening before the
 * player has read a single number on the HUD.
 */
export function stunScale(damage: DamageState): number {
  const head = regionLevel(damage.head);
  const torso = regionLevel(damage.torso);
  return 1 + (head - 1) * 0.16 + (torso - 1) * 0.08;
}

/** Movement multiplier — legs damage is what the player feels while walking. */
export function mobilityScale(damage: DamageState): number {
  const legs = regionLevel(damage.legs);
  return [1, 1, 0.94, 0.85, 0.74][legs];
}

/**
 * Resistance in the submission contest, spec §9. The damage level of the
 * targeted region is one of the three governing inputs, alongside both
 * wrestlers' Submission attribute and mash rate.
 */
export function submissionResistance(damage: DamageState, region: Region): number {
  const level = regionLevel(damage[region]);
  return [1, 1, 0.82, 0.62, 0.42][level];
}

/**
 * Bleeding requires *both* the move's flag and a head already at maximum
 * (spec §6). Never one or the other.
 */
export function canBleed(damage: DamageState, moveCausesBleed: boolean): boolean {
  return moveCausesBleed && regionLevel(damage.head) >= 4;
}

/** The region a wrestler is hurting in most — what an AI should target (§13). */
export function weakestRegion(damage: DamageState): Region {
  return REGIONS.reduce((worst, region) => (damage[region] > damage[worst] ? region : worst), REGIONS[0]);
}
