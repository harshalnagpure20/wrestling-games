/**
 * Wrestler visuals — the skeletal animation layer ported from the chess fork's
 * `pieces.ts`, stripped of board, faction, badge and weapon concerns.
 *
 * Placement contract (unchanged from the chess code, because it is right):
 *   container  — ring placement and facing
 *   runtime    — per-frame corrections (root-motion lock, strike tilt later)
 *   visual     — one-time scale / orientation / morph of the sculpt
 *
 * The morph layer is why MakeHuman bodies will be rigged at neutral proportions
 * later: Mixamo's auto-rigger fails on heavily deformed meshes, so physique
 * differentiation has to happen after the skeleton exists.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import {
  MODEL_ORIENTATION,
  WRESTLER_ORDER,
  WRESTLER_SKINS,
  type MorphProfile,
  type WrestlerId,
  type WrestlerSkin,
} from "../assets/generated";
import { gaitCycle } from "../core/gait";
import { loadGltf } from "./gltfQueue";
import { RING_HEIGHT } from "./ring";
import { radialTexture } from "./textures";

/** Target standing height in metres before the stature morph. */
const BASE_HEIGHT = 1.9;

export type ClipName = "idle" | "walk" | "run" | "strike" | "knockdown" | "getUp";
export type MarchClip = "walk" | "run";

export type ClipBag = Partial<Record<ClipName, THREE.AnimationClip>>;

const CLIP_NAMES: ClipName[] = ["idle", "walk", "run", "strike", "knockdown", "getUp"];

const AXIS_VECTORS = {
  positiveX: new THREE.Vector3(1, 0, 0),
  negativeX: new THREE.Vector3(-1, 0, 0),
  positiveY: new THREE.Vector3(0, 1, 0),
  negativeY: new THREE.Vector3(0, -1, 0),
  positiveZ: new THREE.Vector3(0, 0, 1),
  negativeZ: new THREE.Vector3(0, 0, -1),
} as const;

type AxisName = keyof typeof AXIS_VECTORS;

function basisQuaternion(front: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const f = front.clone().normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f));
}

function orientationCorrection(desiredWorldForward: THREE.Vector3): THREE.Quaternion {
  const local = basisQuaternion(
    AXIS_VECTORS[MODEL_ORIENTATION.localFrontAxis as AxisName],
    AXIS_VECTORS[MODEL_ORIENTATION.localUpAxis as AxisName],
  );
  const world = basisQuaternion(desiredWorldForward, new THREE.Vector3(0, 1, 0));
  return world.multiply(local.invert());
}

/** Bounds as actually rendered, skinning-aware. */
function measureModel(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  const toRoot = new THREE.Matrix4();
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const skinned = node as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      skinned.skeleton.update();
      skinned.computeBoundingBox();
      childBox.copy(skinned.boundingBox ?? new THREE.Box3());
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      childBox.copy(mesh.geometry.boundingBox ?? new THREE.Box3());
    }
    toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    box.union(childBox.applyMatrix4(toRoot));
  });
  return box;
}

/**
 * Map a bone name onto a morph channel. Tolerant of Mixamo (`mixamorig:`) and
 * the chess fork's auto-rig naming.
 */
function morphKeyForBone(name: string): keyof MorphProfile | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (n.includes("head") && !n.includes("headtop") && !n.includes("end")) return "head";
  if (n.includes("neck")) return "neck";
  if (n.includes("clavicle") || n.includes("shoulder")) return "shoulders";
  if (n.includes("spine2") || n.includes("spine02") || n.includes("upperchest") || n.includes("chest")) {
    return "chest";
  }
  if (n.includes("spine1") || n.includes("spine01") || n === "spine") return "abdomen";
  if (n.includes("hips") || n.includes("pelvis") || (n.includes("hip") && !n.includes("thigh"))) return "waist";
  if (n.includes("forearm") || n.includes("lowerarm")) return "forearms";
  if (n.includes("upperarm") || (n.endsWith("arm") && !n.includes("fore") && !n.includes("hand"))) {
    return "arms";
  }
  if (n.includes("hand") && !n.includes("thumb") && !n.includes("index") && !n.includes("middle")) {
    return "hands";
  }
  if (n.includes("upleg") || n.includes("thigh") || n.includes("upperleg")) return "thighs";
  if ((n.includes("leg") || n.includes("calf") || n.includes("shin")) && !n.includes("up")) return "legs";
  if (n.includes("foot") || n.includes("toe")) return "feet";
  return null;
}

function applyMorph(model: THREE.Object3D, morph: MorphProfile): void {
  model.traverse((node) => {
    const bone = node as THREE.Bone;
    if (!bone.isBone) return;
    const key = morphKeyForBone(bone.name);
    if (!key || key === "stature") return;
    const s = morph[key];
    if (Math.abs(s - 1) < 0.001) return;
    // Width/depth on XZ, length mostly on Y for limbs — a uniform scale is the
    // honest reading of the source game's morph sliders at this fidelity.
    bone.scale.setScalar(s);
  });
}

let shadowMap: THREE.CanvasTexture | null = null;
function sharedShadowTexture(): THREE.CanvasTexture {
  if (!shadowMap) shadowMap = radialTexture("rgba(0,0,0,0.7)", "rgba(0,0,0,0)");
  return shadowMap;
}

let discGeo: THREE.CircleGeometry | null = null;
function sharedDiscGeometry(): THREE.CircleGeometry {
  if (!discGeo) discGeo = new THREE.CircleGeometry(0.55, 28);
  return discGeo;
}

interface Template {
  scene: THREE.Object3D;
  scale: number;
  offset: THREE.Vector3;
  skinned: boolean;
  clips: ClipBag;
  skin: WrestlerSkin;
}

export interface WrestlerOptions {
  contactShadows?: boolean;
  idleAnimation?: boolean;
}

/**
 * One rendered wrestler. Owns its mixer and its contact shadow; the ring
 * engine places the container and calls {@link update} each frame.
 */
export class WrestlerView {
  readonly container = new THREE.Group();
  readonly runtime = new THREE.Group();
  readonly visual = new THREE.Group();
  readonly id: WrestlerId;
  readonly skin: WrestlerSkin;

  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private rootBone: THREE.Bone | null = null;
  private rootRest = new THREE.Vector3();
  private lockRootMotion = true;
  private idleWanted = true;
  private shadow: THREE.Mesh | null = null;
  private materials: THREE.MeshStandardMaterial[] = [];
  private strikeTilt = 0;
  private phase = Math.random() * Math.PI * 2;
  private marchLoop: MarchClip | null = null;

  constructor(skin: WrestlerSkin, model: THREE.Object3D, clips: ClipBag, options: WrestlerOptions) {
    this.id = skin.id;
    this.skin = skin;
    this.idleWanted = options.idleAnimation !== false;

    this.container.name = `wrestler_${skin.id}`;
    this.container.add(this.runtime);
    this.runtime.add(this.visual);
    this.visual.add(model);
    this.container.userData.wrestler = this;

    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const source = mesh.material as THREE.MeshStandardMaterial;
      if (source && "clone" in source) {
        const material = source.clone();
        mesh.material = material;
        if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          this.materials.push(material as THREE.MeshStandardMaterial);
        }
      }
    });

    applyMorph(model, skin.morph);

    if (options.contactShadows !== false) {
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: sharedShadowTexture(),
        color: 0x000000,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      this.shadow = new THREE.Mesh(sharedDiscGeometry(), shadowMaterial);
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.008;
      this.shadow.scale.setScalar(0.95 + (skin.weight - 200) / 400);
      this.shadow.renderOrder = 1;
      this.container.add(this.shadow);
    }

    this.setupAnimations(model, clips);
  }

  private setupAnimations(model: THREE.Object3D, clips: ClipBag): void {
    let rigged = false;
    model.traverse((node) => {
      const bone = node as THREE.Bone;
      if (bone.isBone) {
        rigged = true;
        if (!this.rootBone) {
          this.rootBone = bone;
          this.rootRest.copy(bone.position);
        }
      }
      const skinned = node as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) {
        rigged = true;
        skinned.frustumCulled = false;
      }
    });

    if (!rigged) return;

    this.mixer = new THREE.AnimationMixer(model);
    for (const name of CLIP_NAMES) {
      const clip = clips[name];
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(name, action);
    }

    this.mixer.addEventListener("finished", (event) => {
      const action = (event as unknown as { action: THREE.AnimationAction }).action;
      const strike = this.actions.get("strike");
      const getUp = this.actions.get("getUp");
      if (action === strike || action === getUp) {
        this.playIdle(0.2);
      }
    });

    this.playIdle(0);
  }

  installClip(name: ClipName, clip: THREE.AnimationClip): void {
    if (!this.mixer || this.actions.has(name)) return;
    const action = this.mixer.clipAction(clip);
    action.enabled = true;
    this.actions.set(name, action);
    if (name === "idle" && this.idleWanted) this.playIdle(0.35);
  }

  hasClip(name: ClipName): boolean {
    return this.actions.has(name);
  }

  playIdle(fade = 0.25): void {
    if (!this.idleWanted) return;
    const action = this.actions.get("idle");
    if (!action || !this.mixer) return;
    this.marchLoop = null;
    for (const [name, other] of this.actions) {
      if (name === "idle") continue;
      other.fadeOut(fade);
    }
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.enabled = true;
    action.timeScale = 1;
    action.fadeIn(fade);
    action.play();
  }

  /**
   * Puts the wrestler on a locomotion loop. `stepRate` is footfalls per second;
   * the clip is one gait cycle (two steps), retimed through {@link gaitCycle}.
   */
  startMarch(name: MarchClip, stepRate: number): boolean {
    const action = this.actions.get(name);
    if (!action || !this.mixer) return false;
    const clip = action.getClip();
    const cycles = Math.max(0.15, stepRate * 0.5);
    const timeScale = THREE.MathUtils.clamp(cycles * gaitCycle(clip), 0.4, 2.9);

    if (this.marchLoop === name) {
      action.timeScale = timeScale;
      return true;
    }

    for (const [key, other] of this.actions) {
      if (key !== name) other.fadeOut(0.16);
    }
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.enabled = true;
    action.timeScale = timeScale;
    action.fadeIn(0.16);
    action.play();
    this.marchLoop = name;
    return true;
  }

  stopMarch(fade = 0.22): void {
    if (!this.marchLoop) return;
    this.marchLoop = null;
    this.playIdle(fade);
  }

  get isMarching(): boolean {
    return this.marchLoop !== null;
  }

  /** One-shot for the harness / Phase 5. Returns duration or 0 if missing. */
  playOneShot(name: ClipName, fade = 0.12): number {
    const action = this.actions.get(name);
    if (!action || !this.mixer) return 0;
    this.marchLoop = null;
    for (const [key, other] of this.actions) {
      if (key !== name) other.fadeOut(fade);
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.timeScale = 1;
    action.fadeIn(fade);
    action.play();
    return action.getClip().duration;
  }

  /** World-space position of the feet (container origin on the canvas). */
  get position(): THREE.Vector3 {
    return this.container.position;
  }

  setPosition(x: number, z: number, y = RING_HEIGHT): void {
    this.container.position.set(x, y, z);
  }

  setFacing(forward: THREE.Vector3): void {
    this.visual.quaternion.copy(orientationCorrection(forward));
  }

  /** Post-mixer tilt reserved for procedural strikes (Phase 5+). */
  setStrikeTilt(tilt: number): void {
    this.strikeTilt = tilt;
  }

  update(delta: number, elapsed: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
      if (this.rootBone && this.lockRootMotion) {
        this.rootBone.position.x = this.rootRest.x;
        this.rootBone.position.z = this.rootRest.z;
      }
      this.runtime.rotation.x = this.strikeTilt;
    } else {
      // Unrigged fallback: a quiet breath so the body still feels alive.
      const breath = Math.sin(elapsed * 1.1 + this.phase);
      this.runtime.position.y = breath * 0.008;
      this.runtime.rotation.x = breath * 0.01 + this.strikeTilt;
    }
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot() as THREE.Object3D);
      this.mixer = null;
    }
    this.actions.clear();
    for (const material of this.materials) material.dispose();
    this.materials = [];
    if (this.shadow) {
      (this.shadow.material as THREE.Material).dispose();
      this.shadow = null;
    }
    this.container.removeFromParent();
  }
}

/**
 * Loads the two MVP skins, normalises them onto the canvas, and clones a
 * skinned instance per wrestler. Templates are shared; skeletons are not.
 */
export class WrestlerFactory {
  private readonly loader = new GLTFLoader();
  private readonly templates = new Map<WrestlerId, Template>();
  private loaded = false;

  get isLoaded(): boolean {
    return this.loaded;
  }

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const ids = WRESTLER_ORDER;
    let done = 0;
    const total = ids.length;
    await Promise.all(
      ids.map(async (id) => {
        try {
          this.templates.set(id, await this.loadSkin(WRESTLER_SKINS[id]));
        } catch (error) {
          console.warn(`[wrestlers] failed to load "${id}"`, error);
        } finally {
          done += 1;
          onProgress?.(done, total);
        }
      }),
    );
    this.loaded = this.templates.size > 0;
  }

  private async loadSkin(skin: WrestlerSkin): Promise<Template> {
    const set = skin.clips;
    const rigged = await loadGltf(this.loader, set.rigged, 5);
    const clips: ClipBag = {};
    await Promise.all(
      CLIP_NAMES.map(async (name) => {
        const url = set[name];
        if (!url) return;
        const clip = await this.fetchClip(url, name);
        if (clip) clips[name] = clip;
      }),
    );
    // Opening must have an idle. Prefer idle; fall back to nothing and stand.
    return this.normalize(rigged.scene, skin, clips);
  }

  private async fetchClip(url: string, name: ClipName): Promise<THREE.AnimationClip | null> {
    try {
      const gltf = await loadGltf(this.loader, url, 5);
      const source = gltf.animations[0];
      if (!source) return null;
      const clip = source.clone();
      clip.name = name;
      return clip;
    } catch (error) {
      console.warn(`[wrestlers] clip "${name}" unavailable (${url})`, error);
      return null;
    }
  }

  private normalize(scene: THREE.Object3D, skin: WrestlerSkin, clips: ClipBag): Template {
    const box = measureModel(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = Math.max(0.0001, size.y);
    const target = BASE_HEIGHT * skin.morph.stature;
    const scale = target / height;

    const centre = new THREE.Vector3();
    box.getCenter(centre);
    const offset = new THREE.Vector3(-centre.x * scale, -box.min.y * scale, -centre.z * scale);

    let skinned = false;
    scene.traverse((node) => {
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    });

    return { scene, scale, offset, skinned, clips, skin };
  }

  create(id: WrestlerId, options: WrestlerOptions = {}): WrestlerView {
    const template = this.templates.get(id);
    if (!template) throw new Error(`wrestler template "${id}" not loaded`);

    const model = template.skinned
      ? (SkeletonUtils.clone(template.scene) as THREE.Object3D)
      : template.scene.clone(true);
    model.scale.setScalar(template.scale);
    model.position.copy(template.offset);

    return new WrestlerView(template.skin, model, template.clips, options);
  }

  dispose(): void {
    const seen = new Set<THREE.Object3D>();
    for (const template of this.templates.values()) {
      if (seen.has(template.scene)) continue;
      seen.add(template.scene);
      template.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material.dispose();
      });
    }
    this.templates.clear();
    this.loaded = false;
  }
}
