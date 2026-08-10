/**
 * Fitting the ring to the screen it is being played on.
 *
 * Camera shots are authored against a wide desktop window, and a perspective
 * camera's `fov` is its *vertical* angle. So the narrower the viewport, the
 * less of the ring's width fits in frame — on a phone held upright (aspect
 * ≈ 0.46) a 46° lens sees barely half the canvas.
 *
 * The answer is not "pull straight back". Past the barricades the camera ends
 * up behind the crowd, and then the crowd is what the player is looking at. So
 * the framing is solved rather than authored: work out the distance and lens
 * that hold the subject on the narrow axis, and take any extra distance as
 * *height* so the camera climbs over the barricade rather than reversing into
 * it.
 *
 * Inherited from the chess fork, where the same solve kept a colonnade from
 * cutting across the board.
 */

import * as THREE from "three";

/**
 * How far the camera may sit from ring centre on the ground plane before the
 * barricades and the front row start cutting across the action. Everything
 * beyond this has to be bought with height.
 */
export const ARENA_INNER_RADIUS = 11;

/** Half-width of the ring canvas, in world units. Set by `ring.ts`. */
export const RING_HALF = 3.6;

/**
 * Radius of the sphere a framing has to contain: the canvas corner to corner,
 * plus margin for two standing wrestlers and a raised arm.
 */
export const RING_REACH = RING_HALF * Math.SQRT2 + 0.9;

/** Widest lens the engine will ever open up to, however narrow the screen is. */
export const MAX_LENS_FOV = 78;

/** Steepest the camera may sit on a phone — portrait, then landscape. */
const HANDHELD_PORTRAIT_PHI = 0.86;
const HANDHELD_LANDSCAPE_PHI = 1.06;

export interface ViewportProfile {
  width: number;
  height: number;
  /** width / height of the drawing surface. */
  aspect: number;
  /** A coarse pointer on a hand-sized screen: phone, or a small tablet. */
  handheld: boolean;
  /** Taller than it is wide. */
  portrait: boolean;
}

export interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Vertical field of view, in degrees. */
  fov: number;
  /** Distance from `target` the framing settled on. */
  radius: number;
}

export interface FramingOptions {
  /** The lens the shot was authored with — the framing never goes tighter. */
  fov: number;
  /** The widest this framing is allowed to open the lens. */
  maxFov: number;
  /** Radius of the sphere that has to stay in frame. */
  reach?: number;
  /** How far back the camera may be sent. */
  maxDistance?: number;
}

/**
 * What the engine is drawing into. `handheld` is a real capability test — a
 * coarse pointer on a small screen — not a user-agent guess, so a phone in
 * desktop mode and a narrow desktop window are both handled honestly.
 */
export function readViewport(width: number, height: number): ViewportProfile {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const coarse =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
  const shortest = Math.min(safeWidth, safeHeight);
  return {
    width: safeWidth,
    height: safeHeight,
    aspect: safeWidth / safeHeight,
    handheld: coarse ? shortest <= 820 : safeWidth <= 620,
    portrait: safeWidth < safeHeight,
  };
}

/** Vertical fov (degrees) that holds `reach` at `distance` on *both* axes. */
export function fitFov(reach: number, distance: number, aspect: number): number {
  const half = reach / Math.max(0.001, distance);
  const forHeight = Math.atan(half);
  const forWidth = Math.atan(half / Math.max(0.05, aspect));
  return THREE.MathUtils.radToDeg(Math.max(forHeight, forWidth) * 2);
}

/** Distance at which `reach` fits inside a `fov` lens on this aspect. */
export function fitDistance(reach: number, fov: number, aspect: number): number {
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const halfWidth = halfHeight * aspect;
  return reach / Math.max(0.05, Math.min(halfHeight, halfWidth));
}

/**
 * The widest lens a viewport is allowed. A phone held upright needs the most,
 * because its narrow axis is the one the ring's width has to fit on; a normal
 * desktop window never reaches for any of this and keeps its authored lens.
 */
export function lensCeiling(view: ViewportProfile, base: number): number {
  if (view.handheld) return Math.max(base, view.portrait ? 68 : 58);
  return Math.max(base, view.aspect < 1 ? 62 : 52);
}

/**
 * Steepest polar angle (measured from straight up) at which a camera `radius`
 * from ring centre still stands inside the barricades.
 */
export function groundedPhi(radius: number): number {
  return Math.asin(THREE.MathUtils.clamp(ARENA_INNER_RADIUS / Math.max(0.001, radius), 0, 1));
}

/**
 * Re-solves an authored shot for the viewport actually on screen.
 *
 * The azimuth is never touched — whichever side of the ring the shot was
 * looking from, it keeps looking from there. Only distance, elevation and lens
 * are solved.
 */
export function frameShot(
  position: THREE.Vector3,
  target: THREE.Vector3,
  view: ViewportProfile,
  options: FramingOptions,
): Framing {
  const reach = options.reach ?? RING_REACH;
  const maxFov = Math.max(options.fov, options.maxFov);
  const spherical = new THREE.Spherical().setFromVector3(position.clone().sub(target));
  const authored = spherical.radius;

  const needed = fitDistance(reach, maxFov, view.aspect);
  spherical.radius = Math.min(Math.max(authored, needed), options.maxDistance ?? 21);

  // A phone reads the ring from higher up: the near wrestler stops hiding the
  // far one, and the canvas stays visible under both.
  if (view.handheld) {
    spherical.phi = Math.min(spherical.phi, view.portrait ? HANDHELD_PORTRAIT_PHI : HANDHELD_LANDSCAPE_PHI);
  }
  spherical.phi = Math.min(spherical.phi, groundedPhi(spherical.radius));
  spherical.makeSafe();

  return {
    position: new THREE.Vector3().setFromSpherical(spherical).add(target),
    target: target.clone(),
    fov: THREE.MathUtils.clamp(fitFov(reach, spherical.radius, view.aspect), options.fov, MAX_LENS_FOV),
    radius: spherical.radius,
  };
}
