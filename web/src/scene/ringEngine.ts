/**
 * The renderer, the scene and the frame loop.
 *
 * Replaces the chess fork's `sceneEngine`, which was a 5,000-line turn-based
 * board driver with nothing structurally in common with a real-time match.
 * What was worth keeping — the quality watchdog, the post pipeline, the
 * viewport solve and the spring-damped camera — is kept, and the rest is gone.
 *
 * The camera deserves a note. A wrestling camera is not an orbit control: it
 * frames two moving subjects, keeps both on screen, and tightens as they close.
 * So it tracks the midpoint of the two wrestlers and derives its distance from
 * their separation, critically damped so it never oscillates. Player orbit is
 * an offset applied on top, not the camera itself.
 */

import * as THREE from "three";

import { MatchControl, type FighterDebug } from "../core/control";
import { installHarness, uninstallHarness, type NamedState } from "../core/harness";
import { InputManager } from "../core/input";
import { ARENA_LOOKS, DEFAULT_ARENA, type ArenaTheme } from "./arena";
import { LightPool } from "./lightPool";
import { PostFX } from "./postfx";
import { QUALITY_SETTINGS, type QualityPreset, detectQualityPreset } from "./quality";
import { buildRing, RING_HEIGHT, type RingParts } from "./ring";
import { buildVenue, type Venue } from "./venue";
import { frameShot, lensCeiling, readViewport, RING_REACH } from "./viewport";
import { WrestlerFactory, type WrestlerView } from "./wrestlers";

/** Authored base shot: hard camera side, slightly above the top rope. */
const BASE_FOV = 46;
const BASE_ELEVATION = 3.4;
const MIN_ORBIT_DISTANCE = 6.2;
const MAX_ORBIT_DISTANCE = 15;

export interface EngineStats {
  fps: number;
  preset: QualityPreset;
  drawCalls: number;
  triangles: number;
}

export type RosterLoadState = "loading" | "ready" | "failed";

export interface RingEngineOptions {
  canvas: HTMLCanvasElement;
  theme?: ArenaTheme;
  onStats?: (stats: EngineStats) => void;
  onRoster?: (state: RosterLoadState) => void;
  onDebug?: (fighters: FighterDebug[]) => void;
}

export class RingEngine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly postfx: PostFX;
  private readonly lights: LightPool;
  private ring: RingParts;
  private venue: Venue;
  private readonly factory = new WrestlerFactory();
  private wrestlers: WrestlerView[] = [];
  private readonly input = new InputManager();
  private readonly control = new MatchControl();
  private rosterState: RosterLoadState = "loading";
  private fighterDebug: FighterDebug[] = [];
  private lastFps = 0;

  private preset: QualityPreset;
  private theme: ArenaTheme;
  private frameHandle = 0;
  private disposed = false;
  private elapsed = 0;

  /** Where the camera is looking, and where it wants to look. */
  private readonly focus = new THREE.Vector3(0, RING_HEIGHT + 1.1, 0);
  private readonly desiredFocus = new THREE.Vector3(0, RING_HEIGHT + 1.1, 0);
  private orbitAzimuth = 0;
  private desiredAzimuth = 0;
  private distance = 11;
  private desiredDistance = 11;

  /** Tracked subjects — wrestler roots once the roster is up. */
  private readonly subjects: THREE.Vector3[] = [
    new THREE.Vector3(-1.35, RING_HEIGHT, 0),
    new THREE.Vector3(1.35, RING_HEIGHT, 0),
  ];

  // Frame-rate watchdog.
  private frameTimes: number[] = [];
  private lastStatsAt = 0;
  private steppedDown = false;

  private readonly onStats?: (stats: EngineStats) => void;
  private readonly onRoster?: (state: RosterLoadState) => void;
  private readonly onDebug?: (fighters: FighterDebug[]) => void;
  private readonly canvas: HTMLCanvasElement;

  constructor(options: RingEngineOptions) {
    this.onStats = options.onStats;
    this.onRoster = options.onRoster;
    this.onDebug = options.onDebug;
    this.canvas = options.canvas;
    this.theme = options.theme ?? DEFAULT_ARENA;
    this.preset = detectQualityPreset();
    const look = ARENA_LOOKS[this.theme];
    const settings = QUALITY_SETTINGS[this.preset];

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: settings.msaaSamples > 0,
      powerPreference: "high-performance",
      stencil: false,
      // Non-negotiable for this project: without it the drawing buffer is
      // cleared before an external screenshot can read it, and every capture
      // comes back blank white. The whole quality process — Playwright stills,
      // frame sequences, A/B against reference footage — reads this surface, so
      // the small cost of keeping it around buys the entire review loop.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // The composer renders several passes per frame and each one resets the
    // counters, so an automatic reset leaves us reading the final fullscreen
    // quad: one draw call and no triangles, whatever the scene actually cost.
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = look.exposure;

    this.scene.background = new THREE.Color(look.background);
    this.scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 200);
    this.camera.position.set(0, BASE_ELEVATION, 11);
    this.scene.add(this.camera);

    this.ring = buildRing(look);
    this.scene.add(this.ring.group);

    this.venue = buildVenue(look, settings);
    this.scene.add(this.venue.group);
    this.camera.add(this.venue.lamp);

    this.lights = new LightPool(this.scene, 6);

    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.postfx.setPreset(this.preset);
    this.postfx.setGrade(look.grade);
    this.postfx.setBloom(look.bloom);

    this.input.attach();
    this.installCaptureApi();
    this.resize();
    this.loop();
    void this.loadRoster();
  }

  private setRoster(state: RosterLoadState): void {
    this.rosterState = state;
    this.onRoster?.(state);
  }

  private async loadRoster(): Promise<void> {
    this.setRoster("loading");
    try {
      const idleWanted = QUALITY_SETTINGS[this.preset].idleAnimations;
      await this.factory.load();
      if (this.disposed) return;

      const ironclad = this.factory.create("ironclad", {
        contactShadows: QUALITY_SETTINGS[this.preset].contactShadows,
        idleAnimation: idleWanted,
      });
      const vanguard = this.factory.create("vanguard", {
        contactShadows: QUALITY_SETTINGS[this.preset].contactShadows,
        idleAnimation: idleWanted,
      });

      ironclad.setPosition(-1.35, 0);
      ironclad.setFacing(new THREE.Vector3(1, 0, 0));
      vanguard.setPosition(1.35, 0);
      vanguard.setFacing(new THREE.Vector3(-1, 0, 0));

      this.scene.add(ironclad.container);
      this.scene.add(vanguard.container);
      this.wrestlers = [ironclad, vanguard];
      this.subjects[0].copy(ironclad.position);
      this.subjects[1].copy(vanguard.position);
      this.control.face(0, new THREE.Vector3(1, 0, 0), this.wrestlers);
      this.control.face(1, new THREE.Vector3(-1, 0, 0), this.wrestlers);
      this.setRoster("ready");
    } catch (error) {
      console.warn("[ring] roster failed to load", error);
      this.setRoster("failed");
    }
  }

  private installCaptureApi(): void {
    installHarness({
      ready: () => this.rosterState === "ready" && this.wrestlers.length >= 2,
      snapshot: () => ({
        roster: this.rosterState,
        fighters: this.fighterDebug,
        fps: this.lastFps,
        theme: this.theme,
        preset: this.preset,
      }),
      forceState: (state, fighter = 0) => this.forceState(state, fighter),
      waitReady: async (timeoutMs = 20000) => {
        const start = performance.now();
        while (performance.now() - start < timeoutMs) {
          if (this.rosterState === "ready" && this.wrestlers.length >= 2) return true;
          if (this.rosterState === "failed") return false;
          await new Promise((r) => setTimeout(r, 50));
        }
        return this.rosterState === "ready";
      },
      captureStill: () => {
        try {
          return this.canvas.toDataURL("image/png");
        } catch {
          return null;
        }
      },
    });
  }

  /** Named-state forcing for the capture harness. */
  forceState(state: NamedState, fighter: 0 | 1 = 0): boolean {
    if (this.wrestlers.length < 2) return false;
    const other = (fighter ^ 1) as 0 | 1;

    switch (state) {
      case "idle":
        this.control.place(0, -1.35, 0, this.wrestlers);
        this.control.place(1, 1.35, 0, this.wrestlers);
        this.control.face(0, new THREE.Vector3(1, 0, 0), this.wrestlers);
        this.control.face(1, new THREE.Vector3(-1, 0, 0), this.wrestlers);
        this.wrestlers[0].playIdle(0);
        this.wrestlers[1].playIdle(0);
        return true;
      case "corners":
        this.control.place(0, -2.6, -2.6, this.wrestlers);
        this.control.place(1, 2.6, 2.6, this.wrestlers);
        this.control.face(0, new THREE.Vector3(1, 0, 1).normalize(), this.wrestlers);
        this.control.face(1, new THREE.Vector3(-1, 0, -1).normalize(), this.wrestlers);
        this.wrestlers[0].playIdle(0);
        this.wrestlers[1].playIdle(0);
        return true;
      case "clinch":
        this.control.place(0, -0.45, 0, this.wrestlers);
        this.control.place(1, 0.45, 0, this.wrestlers);
        this.control.face(0, new THREE.Vector3(1, 0, 0), this.wrestlers);
        this.control.face(1, new THREE.Vector3(-1, 0, 0), this.wrestlers);
        this.wrestlers[0].playIdle(0);
        this.wrestlers[1].playIdle(0);
        return true;
      case "walk":
        this.control.place(fighter, -1.5, 0, this.wrestlers);
        this.control.face(fighter, new THREE.Vector3(1, 0, 0), this.wrestlers);
        return this.wrestlers[fighter].startMarch("walk", 2.4);
      case "run":
        this.control.place(fighter, -1.5, 0, this.wrestlers);
        this.control.face(fighter, new THREE.Vector3(1, 0, 0), this.wrestlers);
        return (
          this.wrestlers[fighter].startMarch("run", 4.2) ||
          this.wrestlers[fighter].startMarch("walk", 4.2)
        );
      case "strike":
      case "knockdown":
      case "getUp":
        this.control.place(fighter, -1.0, 0, this.wrestlers);
        this.control.place(other, 1.0, 0, this.wrestlers);
        this.control.face(fighter, new THREE.Vector3(1, 0, 0), this.wrestlers);
        this.control.face(other, new THREE.Vector3(-1, 0, 0), this.wrestlers);
        return this.wrestlers[fighter].playOneShot(state) > 0;
      default:
        return false;
    }
  }

  /** Borrow a pooled point light for an impact flash. */
  get lightPool(): LightPool {
    return this.lights;
  }

  get currentPreset(): QualityPreset {
    return this.preset;
  }

  /**
   * Moves a tracked subject. Phase 3 hands this the wrestler root positions
   * every frame; until then it is driven by the demo orbit.
   */
  setSubject(index: number, position: THREE.Vector3): void {
    this.subjects[index]?.copy(position);
  }

  /** Player camera orbit, in radians, applied on top of the tracking shot. */
  orbitBy(radians: number): void {
    this.desiredAzimuth += radians;
  }

  setTheme(theme: ArenaTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    const look = ARENA_LOOKS[theme];
    const settings = QUALITY_SETTINGS[this.preset];

    this.ring.dispose();
    this.venue.dispose();
    this.ring = buildRing(look);
    this.scene.add(this.ring.group);
    this.venue = buildVenue(look, settings);
    this.scene.add(this.venue.group);
    this.camera.add(this.venue.lamp);

    this.renderer.toneMappingExposure = look.exposure;
    (this.scene.background as THREE.Color).setHex(look.background);
    (this.scene.fog as THREE.FogExp2).color.setHex(look.fog.color);
    (this.scene.fog as THREE.FogExp2).density = look.fog.density;
    this.postfx.setGrade(look.grade);
    this.postfx.setBloom(look.bloom);
  }

  setPreset(preset: QualityPreset): void {
    this.preset = preset;
    const settings = QUALITY_SETTINGS[preset];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.maxPixelRatio));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.venue.key.castShadow = settings.shadows;
    this.postfx.setPreset(preset);
    this.postfx.setGrade(ARENA_LOOKS[this.theme].grade);
    this.postfx.setBloom(ARENA_LOOKS[this.theme].bloom);
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(width, height);
  }

  /**
   * Re-solves the shot for the two subjects and the viewport.
   *
   * Distance comes from how far apart the wrestlers are: locked up chest to
   * chest the camera is close, at opposite corners it is wide. Both ends are
   * clamped, because a camera that tracks separation without limits ends up
   * inside a wrestler at one extreme and behind the crowd at the other.
   */
  private solveCamera(delta: number): void {
    const [a, b] = this.subjects;
    this.desiredFocus.copy(a).add(b).multiplyScalar(0.5);
    this.desiredFocus.y = RING_HEIGHT + 1.15;

    const separation = a.distanceTo(b);
    this.desiredDistance = THREE.MathUtils.clamp(
      MIN_ORBIT_DISTANCE + separation * 0.85,
      MIN_ORBIT_DISTANCE,
      MAX_ORBIT_DISTANCE,
    );

    // Critically damped follow. Frame-rate independent, so a slow frame does
    // not snap the camera.
    const lerp = 1 - Math.exp(-6 * delta);
    this.focus.lerp(this.desiredFocus, lerp);
    this.distance += (this.desiredDistance - this.distance) * lerp;
    this.orbitAzimuth += (this.desiredAzimuth - this.orbitAzimuth) * lerp;

    const view = readViewport(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
    const authored = new THREE.Vector3(
      Math.sin(this.orbitAzimuth) * this.distance,
      BASE_ELEVATION,
      Math.cos(this.orbitAzimuth) * this.distance,
    ).add(this.focus);

    const framing = frameShot(authored, this.focus, view, {
      fov: BASE_FOV,
      maxFov: lensCeiling(view, BASE_FOV),
      reach: RING_REACH,
      maxDistance: MAX_ORBIT_DISTANCE + 4,
    });

    this.camera.position.copy(framing.position);
    this.camera.lookAt(framing.target);
    if (Math.abs(this.camera.fov - framing.fov) > 0.01) {
      this.camera.fov = framing.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Steps the preset down once if the machine cannot hold the frame rate.
   * Only ever downward, and only once, so the picture never oscillates between
   * presets while the player is trying to read a match.
   */
  private watchdog(now: number, delta: number): void {
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    if (now - this.lastStatsAt < 1000) return;
    this.lastStatsAt = now;

    const mean = this.frameTimes.reduce((sum, t) => sum + t, 0) / Math.max(1, this.frameTimes.length);
    const fps = mean > 0 ? 1 / mean : 0;

    this.lastFps = fps;
    this.onStats?.({
      fps,
      preset: this.preset,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    });

    if (!this.steppedDown && this.frameTimes.length >= 120 && fps < 45) {
      const order: QualityPreset[] = ["low", "medium", "high", "ultra"];
      const index = order.indexOf(this.preset);
      if (index > 0) {
        this.steppedDown = true;
        this.setPreset(order[index - 1]);
      }
    }
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.loop);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += delta;

    this.renderer.info.reset();

    if (this.wrestlers.length >= 2) {
      const intents = this.input.sample();
      this.fighterDebug = this.control.update(delta, this.wrestlers, intents, this.camera);
      this.onDebug?.(this.fighterDebug);
      this.subjects[0].copy(this.wrestlers[0].position);
      this.subjects[1].copy(this.wrestlers[1].position);
    }

    for (const wrestler of this.wrestlers) {
      wrestler.update(delta, this.elapsed);
    }

    this.solveCamera(delta);
    this.venue.update(this.elapsed, 0.4);

    this.postfx.render(delta);
    this.watchdog(performance.now(), delta);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    uninstallHarness();
    this.input.detach();
    for (const wrestler of this.wrestlers) wrestler.dispose();
    this.wrestlers = [];
    this.factory.dispose();
    this.postfx.dispose();
    this.lights.dispose();
    this.ring.dispose();
    this.venue.dispose();
    this.renderer.dispose();
  }
}
