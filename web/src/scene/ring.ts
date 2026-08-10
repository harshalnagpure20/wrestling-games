/**
 * The ring.
 *
 * Built as modular geometry rather than a single mesh, because almost every
 * part of it is load-bearing for gameplay later: the ropes deform and rebound,
 * the turnbuckles are three separate collision targets, the apron is a distinct
 * position state, and the posts are what a head gets driven into.
 *
 * Dimensions follow a real 20-foot ring, scaled so one world unit is roughly a
 * metre. A wrestler stands about 1.9 units tall, which is what the canvas, rope
 * heights and camera framing are all sized against.
 */

import * as THREE from "three";

import type { ArenaLook } from "./arena";
import {
  canvasNormalTexture,
  canvasTexture,
  floorMatTexture,
  ropeTexture,
  steelTexture,
  vinylTexture,
} from "./ringTextures";

/** Half-width of the canvas. A 20ft ring is ~6.1m square, so 3.05 per side. */
export const RING_HALF = 3.6;
/** Height of the canvas above the arena floor. */
export const RING_HEIGHT = 1.0;
/** Rope heights above the canvas, bottom to top. */
export const ROPE_HEIGHTS = [0.42, 0.82, 1.24];
/** How far in from the corner the posts stand. */
const POST_INSET = 0.06;
const POST_RADIUS = 0.085;
const POST_HEIGHT = 1.62;
const ROPE_RADIUS = 0.035;

export interface RingParts {
  group: THREE.Group;
  canvas: THREE.Mesh;
  /** [side][index] — four sides, three ropes each, in rebound order. */
  ropes: THREE.Mesh[][];
  posts: THREE.Mesh[];
  turnbuckles: THREE.Mesh[][];
  dispose(): void;
}

/** Corner positions, counter-clockwise from the near-right post. */
export function cornerPositions(): THREE.Vector3[] {
  const d = RING_HALF - POST_INSET;
  return [
    new THREE.Vector3(d, 0, d),
    new THREE.Vector3(-d, 0, d),
    new THREE.Vector3(-d, 0, -d),
    new THREE.Vector3(d, 0, -d),
  ];
}

export function buildRing(look: ArenaLook): RingParts {
  const group = new THREE.Group();
  group.name = "ring";
  const disposables: { dispose(): void }[] = [];

  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // ------------------------------------------------------------ arena floor
  const floorMap = track(floorMatTexture(look.ring.mat));
  floorMap.repeat.set(14, 14);
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(60, 60)),
    track(new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.94, metalness: 0.02 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "arena_floor";
  group.add(floor);

  // ----------------------------------------------------------------- canvas
  const canvasMap = track(canvasTexture(look.ring.canvas));
  // Kept near 1:1. Tiling the scuffs three times across a seven-metre square
  // made the repeat obvious from the hard camera.
  canvasMap.repeat.set(1, 1);
  const canvasNormal = track(canvasNormalTexture());
  canvasNormal.repeat.set(18, 18);
  const canvasMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(RING_HALF * 2, 0.09, RING_HALF * 2)),
    track(
      new THREE.MeshStandardMaterial({
        map: canvasMap,
        normalMap: canvasNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.88,
        metalness: 0.0,
      }),
    ),
  );
  canvasMesh.position.y = RING_HEIGHT;
  canvasMesh.receiveShadow = true;
  canvasMesh.castShadow = false;
  canvasMesh.name = "ring_canvas";
  group.add(canvasMesh);

  // ------------------------------------------------------------ apron frame
  const apronMat = track(
    new THREE.MeshStandardMaterial({ color: look.ring.apron, roughness: 0.7, metalness: 0.1 }),
  );
  const apronGeo = track(new THREE.BoxGeometry(RING_HALF * 2 + 0.5, 0.16, RING_HALF * 2 + 0.5));
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = RING_HEIGHT - 0.09;
  apron.receiveShadow = true;
  apron.castShadow = true;
  apron.name = "ring_apron";
  group.add(apron);

  // Skirt: the fabric hanging from the apron down to the floor.
  const skirtMat = track(
    new THREE.MeshStandardMaterial({
      color: look.ring.skirt,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  const skirtGeo = track(new THREE.PlaneGeometry(RING_HALF * 2 + 0.5, RING_HEIGHT - 0.17));
  for (let side = 0; side < 4; side += 1) {
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    const angle = (side * Math.PI) / 2;
    skirt.position.set(
      Math.sin(angle) * (RING_HALF + 0.25),
      (RING_HEIGHT - 0.17) / 2,
      Math.cos(angle) * (RING_HALF + 0.25),
    );
    skirt.rotation.y = angle;
    skirt.receiveShadow = true;
    skirt.name = `ring_skirt_${side}`;
    group.add(skirt);
  }

  // ------------------------------------------------------------------ posts
  const steelMap = track(steelTexture(look.ring.post));
  steelMap.repeat.set(1, 3);
  const postMat = track(
    new THREE.MeshStandardMaterial({ map: steelMap, color: look.ring.post, roughness: 0.42, metalness: 0.55 }),
  );
  const postGeo = track(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS * 1.15, POST_HEIGHT, 16));
  const capGeo = track(new THREE.SphereGeometry(POST_RADIUS * 1.2, 16, 12));

  const posts: THREE.Mesh[] = [];
  const corners = cornerPositions();
  for (const [i, corner] of corners.entries()) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(corner.x, RING_HEIGHT + POST_HEIGHT / 2, corner.z);
    post.castShadow = true;
    post.receiveShadow = true;
    post.name = `ring_post_${i}`;
    group.add(post);
    posts.push(post);

    const cap = new THREE.Mesh(capGeo, postMat);
    cap.position.set(corner.x, RING_HEIGHT + POST_HEIGHT, corner.z);
    cap.castShadow = true;
    cap.name = `ring_post_cap_${i}`;
    group.add(cap);
  }

  // ------------------------------------------------------------------ ropes
  const ropeMap = track(ropeTexture(look.ring.rope));
  ropeMap.repeat.set(60, 1);
  const ropeMat = track(
    new THREE.MeshStandardMaterial({ map: ropeMap, color: look.ring.rope, roughness: 0.72, metalness: 0.05 }),
  );
  const ropeGeo = track(new THREE.CylinderGeometry(ROPE_RADIUS, ROPE_RADIUS, 1, 10, 12));

  const ropes: THREE.Mesh[][] = [];
  for (let side = 0; side < 4; side += 1) {
    const a = corners[side];
    const b = corners[(side + 1) % 4];
    const sideRopes: THREE.Mesh[] = [];
    for (const [level, height] of ROPE_HEIGHTS.entries()) {
      const rope = new THREE.Mesh(ropeGeo, ropeMat);
      const start = new THREE.Vector3(a.x, RING_HEIGHT + height, a.z);
      const end = new THREE.Vector3(b.x, RING_HEIGHT + height, b.z);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const length = start.distanceTo(end);
      rope.position.copy(mid);
      rope.scale.set(1, length, 1);
      // Cylinder is authored along +Y. Point that axis along the span.
      const axis = new THREE.Vector3().subVectors(end, start).normalize();
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      rope.castShadow = true;
      rope.name = `ring_rope_${side}_${level}`;
      group.add(rope);
      sideRopes.push(rope);
    }
    ropes.push(sideRopes);
  }

  // ------------------------------------------------------------ turnbuckles
  const vinylMap = track(vinylTexture(look.ring.turnbuckle));
  const vinylMat = track(
    new THREE.MeshStandardMaterial({
      map: vinylMap,
      color: look.ring.turnbuckle,
      roughness: 0.36,
      metalness: 0.06,
    }),
  );
  /**
   * One tall pad per corner, facing diagonally into the ring, covering all
   * three rope anchors.
   *
   * The first pass modelled each rope's buckle as its own small cylinder, which
   * from any distance read as a stack of red cans balanced on the post. A
   * single wrapped cover is both what a modern ring actually uses and the
   * clearer silhouette — and the corner needs to read instantly, because it is
   * a distinct position state and three separate move sets hang off it.
   */
  const padGeo = track(new THREE.BoxGeometry(0.34, ROPE_HEIGHTS[2] - ROPE_HEIGHTS[0] + 0.42, 0.2));

  const turnbuckles: THREE.Mesh[][] = [];
  for (const [i, corner] of corners.entries()) {
    const midHeight = (ROPE_HEIGHTS[0] + ROPE_HEIGHTS[2]) / 2;
    const pad = new THREE.Mesh(padGeo, vinylMat);
    pad.position.set(corner.x * 0.965, RING_HEIGHT + midHeight, corner.z * 0.965);
    // Square the pad to the diagonal so both rope faces meet it flush.
    pad.rotation.y = Math.atan2(-corner.x, -corner.z);
    pad.castShadow = true;
    pad.receiveShadow = true;
    pad.name = `ring_turnbuckle_${i}`;
    group.add(pad);
    turnbuckles.push([pad]);
  }

  // -------------------------------------------------------------- barricade
  const barricadeMap = track(steelTexture(look.ring.barricade));
  barricadeMap.repeat.set(8, 1);
  const barricadeMat = track(
    new THREE.MeshStandardMaterial({
      map: barricadeMap,
      color: look.ring.barricade,
      roughness: 0.5,
      metalness: 0.45,
    }),
  );
  const barricadeGeo = track(new THREE.BoxGeometry(24, 1.1, 0.12));
  for (let side = 0; side < 4; side += 1) {
    const barricade = new THREE.Mesh(barricadeGeo, barricadeMat);
    const angle = (side * Math.PI) / 2;
    barricade.position.set(Math.sin(angle) * 11.5, 0.55, Math.cos(angle) * 11.5);
    barricade.rotation.y = angle;
    barricade.castShadow = true;
    barricade.receiveShadow = true;
    barricade.name = `barricade_${side}`;
    group.add(barricade);
  }

  return {
    group,
    canvas: canvasMesh,
    ropes,
    posts,
    turnbuckles,
    dispose() {
      for (const item of disposables) item.dispose();
      group.removeFromParent();
    },
  };
}
