/**
 * A fixed set of point lights, added to the scene once and lent out.
 *
 * three.js keys its shader programs on the number of visible lights, so adding
 * or removing a single light forces every material in the scene — skinned
 * wrestlers with custom shaders among them — to recompile. Doing that on each
 * impact flash stalls the frame loop for whole seconds and can take the WebGL
 * context down with it.
 *
 * So the count never moves. Borrowers change colour, position and intensity,
 * all of which are plain uniforms. Releasing a slot only darkens it. When every
 * slot is out on loan the caller runs unlit rather than growing the set.
 *
 * Inherited from the chess fork's spell system, where the same constraint
 * applied to a sorceress' volley.
 */

import * as THREE from "three";

/** One point light borrowed from the pool for the length of a single effect. */
export class PooledLight {
  private released = false;

  constructor(
    private readonly light: THREE.PointLight,
    private readonly onRelease: () => void,
  ) {}

  set(position: THREE.Vector3, intensity: number): void {
    if (this.released) return;
    this.light.position.copy(position);
    this.light.intensity = Math.max(0, intensity);
  }

  /** Hands the slot back, dark. */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.light.intensity = 0;
    this.onRelease();
  }
}

export class LightPool {
  private readonly lights: THREE.PointLight[] = [];
  private readonly free: number[] = [];

  constructor(parent: THREE.Object3D, count: number) {
    for (let i = 0; i < count; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 5.2, 2);
      light.name = `pooled_light_${i}`;
      // Never hidden: an invisible light is dropped from the render state,
      // which changes the light count exactly as removing it would.
      light.visible = true;
      light.castShadow = false;
      parent.add(light);
      this.lights.push(light);
      this.free.push(i);
    }
  }

  get size(): number {
    return this.lights.length;
  }

  acquire(color: number, distance = 5.2): PooledLight | null {
    const index = this.free.pop();
    if (index === undefined) return null;
    const light = this.lights[index];
    light.color.setHex(color);
    light.distance = distance;
    light.intensity = 0;
    return new PooledLight(light, () => {
      this.free.push(index);
    });
  }

  dispose(): void {
    for (const light of this.lights) {
      light.removeFromParent();
      light.dispose();
    }
    this.lights.length = 0;
    this.free.length = 0;
  }
}
