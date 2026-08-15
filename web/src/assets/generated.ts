/**
 * The asset manifest.
 *
 * Everything is served from `web/public`, so the build has no third-party
 * runtime dependency. Models are loaded by GLTFLoader; audio is decoded by the
 * Web Audio mixer.
 *
 * The models here are PLACEHOLDERS inherited from the chess fork — medieval
 * soldiers wearing the wrong clothes and the wrong bodies. They exist so the
 * systems layer has rigged skeletons to drive from day one, and they are
 * replaced wholesale in Phase 6a of BUILD_STEPS.md by original wrestlers built
 * in MakeHuman and rigged through Mixamo. Nothing before that phase depends on
 * them looking right.
 *
 * Swapping in a real character is a one-line change per entry.
 */

const MODEL_BASE = "/models";
const AUDIO_BASE = "/audio";

/** Which way the source sculpts face in their own local space. */
export const MODEL_ORIENTATION = {
  localFrontAxis: "positiveZ",
  localUpAxis: "positiveY",
} as const;

// ---------------------------------------------------------------- wrestlers

export type WrestlerId = "ironclad" | "vanguard";

/**
 * Per-bone scaling applied at runtime to turn a neutral base mesh into a
 * specific physique. This is how the reference game's create-a-wrestler worked,
 * and it is why the source meshes are rigged at neutral proportions: Mixamo's
 * auto-rigger fails on heavily deformed geometry, so the deformation has to
 * happen after rigging rather than before it.
 *
 * Values are multipliers on the bound bone's local scale. Kept anatomically
 * plausible on purpose — the art direction is the reference game's grounded
 * physiques rendered with modern lighting, not cartoon exaggeration. Real
 * wrestlers span roughly 200 to 500 lb, and that range alone separates two
 * silhouettes at a glance.
 */
export interface MorphProfile {
  head: number;
  neck: number;
  shoulders: number;
  chest: number;
  arms: number;
  forearms: number;
  hands: number;
  abdomen: number;
  waist: number;
  thighs: number;
  legs: number;
  feet: number;
  /** Overall height multiplier, applied to the root. */
  stature: number;
}

/**
 * The five attributes from MECHANICS_SPEC.md §12, 0–100. Placeholder values
 * until the roster is real; they exist so the systems layer in Phase 5 has
 * something to read.
 */
export interface AttributeBlock {
  strength: number;
  submission: number;
  endurance: number;
  technique: number;
  speed: number;
}

export interface WrestlerClips {
  /** Rigged GLB — the visual. */
  rigged: string;
  /** Looping neutral stance. */
  idle?: string;
  /** Looping in-place walk. The container drives travel, not the clip. */
  walk?: string;
  /** Looping in-place run. */
  run?: string;
  /** One-shot strike. */
  strike?: string;
  /** One-shot knockdown — taking a slam. */
  knockdown?: string;
  /** One-shot get-up off the mat. */
  getUp?: string;
}

export interface WrestlerSkin {
  id: WrestlerId;
  label: string;
  note: string;
  /** Billed weight in pounds. Drives the weight-class rules in spec §12. */
  weight: number;
  clips: WrestlerClips;
  morph: MorphProfile;
  attributes: AttributeBlock;
}

const NEUTRAL_MORPH: MorphProfile = {
  head: 1,
  neck: 1,
  shoulders: 1,
  chest: 1,
  arms: 1,
  forearms: 1,
  hands: 1,
  abdomen: 1,
  waist: 1,
  thighs: 1,
  legs: 1,
  feet: 1,
  stature: 1,
};

export const WRESTLER_SKINS: Record<WrestlerId, WrestlerSkin> = {
  /**
   * The super-heavyweight. Original wrestler built with Meshy, rigged with
   * Mixamo-compatible bones. Grounded early-2000s arcade proportions.
   */
  ironclad: {
    id: "ironclad",
    label: "Ironclad",
    note: "Super-heavyweight powerhouse — slow, enormous, hits like a truck",
    weight: 330,
    clips: {
      rigged: `${MODEL_BASE}/44e81400-8076-427a-8cca-e5a79fb6a878-rigged.glb`,
      idle: `${MODEL_BASE}/44e81400-8076-427a-8cca-e5a79fb6a878-anim-combat-stance.glb`,
      walk: `${MODEL_BASE}/44e81400-8076-427a-8cca-e5a79fb6a878-anim-casual-walk-inplace.glb`,
      strike: `${MODEL_BASE}/44e81400-8076-427a-8cca-e5a79fb6a878-anim-heavy-hammer-swing.glb`,
      knockdown: `${MODEL_BASE}/44e81400-8076-427a-8cca-e5a79fb6a878-anim-knock-down.glb`,
      getUp: `${MODEL_BASE}/44e81400-8076-427a-8cca-e5a79fb6a878-anim-kneeling-reload.glb`,
    },
    morph: {
      ...NEUTRAL_MORPH,
      neck: 1.18,
      shoulders: 1.22,
      chest: 1.2,
      arms: 1.16,
      forearms: 1.12,
      hands: 1.08,
      abdomen: 1.18,
      waist: 1.14,
      thighs: 1.16,
      legs: 1.08,
      stature: 1.08,
    },
    // The grappler's spread: he owns Strength outright and Submission clearly
    // (his second finisher is an arm lock), holds enough Technique to punish a
    // careless opponent, and is the slowest man in the game by a distance.
    attributes: { strength: 92, submission: 62, endurance: 74, technique: 55, speed: 34 },
  },

  /**
   * The explosive heavyweight. Original wrestler built with Meshy, rigged with
   * Mixamo-compatible bones. Grounded early-2000s arcade proportions.
   *
   * Retuned away from the original cruiserweight read: this is a 280 lb power
   * athlete who moves, not a technician. He is *faster* than Ironclad and hits
   * nearly as hard, and he pays for both with technique — his reversal windows
   * are narrow and his stamina burns in bursts rather than lasting a war.
   */
  vanguard: {
    id: "vanguard",
    label: "Vanguard",
    note: "Explosive heavyweight — short violent bursts, runs people over",
    weight: 280,
    clips: {
      rigged: `${MODEL_BASE}/28d508e6-da69-45f3-bdb6-030cb6974ea8-rigged.glb`,
      idle: `${MODEL_BASE}/28d508e6-da69-45f3-bdb6-030cb6974ea8-anim-combat-stance.glb`,
      walk: `${MODEL_BASE}/28d508e6-da69-45f3-bdb6-030cb6974ea8-anim-confident-strut-inplace.glb`,
      run: `${MODEL_BASE}/28d508e6-da69-45f3-bdb6-030cb6974ea8-anim-standard-forward-charge-inplace.glb`,
      strike: `${MODEL_BASE}/28d508e6-da69-45f3-bdb6-030cb6974ea8-anim-charged-slash.glb`,
      knockdown: `${MODEL_BASE}/28d508e6-da69-45f3-bdb6-030cb6974ea8-anim-dying-backwards.glb`,
      getUp: `${MODEL_BASE}/28d508e6-da69-45f3-bdb6-030cb6974ea8-anim-kneeling-reload.glb`,
    },
    // Broad and thick, but tapered where Ironclad is square — a sprinter's
    // legs under a heavyweight's chest. The silhouette has to read "explosive
    // power" at a glance, not "cruiserweight".
    morph: {
      ...NEUTRAL_MORPH,
      neck: 1.1,
      shoulders: 1.16,
      chest: 1.13,
      arms: 1.1,
      forearms: 1.06,
      abdomen: 1.04,
      waist: 1.0,
      thighs: 1.14,
      legs: 1.09,
      stature: 1.02,
    },
    // Nearly Ironclad's strength at more than twice his speed — and he pays for
    // both in Technique and Submission. He cannot out-wrestle anyone and cannot
    // hold a limb; he has to run people over before they read him.
    attributes: { strength: 84, submission: 38, endurance: 76, technique: 42, speed: 78 },
  },
};

export const WRESTLER_ORDER: WrestlerId[] = ["ironclad", "vanguard"];

// -------------------------------------------------------------------- audio

/**
 * Recorded impact takes, played with a measured onset offset so the sound lands
 * on the contact frame rather than a few frames late.
 *
 * These are inherited chess clips standing in for wrestling impacts — a musket
 * crack is not a chair shot. Replaced in Phase 9. The machinery around them is
 * what matters: the mixer finds each take's true onset at decode time, which is
 * exactly what a chair shot or a table break needs.
 */
export type ImpactVoice = "light" | "medium" | "heavy" | "weapon";

export const IMPACT_TAKE_URLS: Record<ImpactVoice | "body", string> = {
  light: `${AUDIO_BASE}/a8cbcada-acce-4a51-8690-974d0e50a68a.mp3`,
  medium: `${AUDIO_BASE}/b042be28-3bb5-48e8-b0a5-ef7a1fbec2d5.mp3`,
  heavy: `${AUDIO_BASE}/65e94019-873c-478d-a688-e76d01bb73a3.mp3`,
  weapon: `${AUDIO_BASE}/9ab8b947-9b2c-4cfc-8b26-653be55a6451.mp3`,
  body: `${AUDIO_BASE}/a0f8c443-5140-41f8-b21c-770450ae9751.mp3`,
};

/**
 * Per-wrestler vocalisations, keyed by an arbitrary voice id. Empty until the
 * roster is real — the mixer treats a missing clip as silence and carries on.
 */
export const VOICE_CLIPS: Record<string, string> = {};

export const AUDIO_URLS = {
  ambience: `${AUDIO_BASE}/5a5fe9ab-26b3-4d3e-99a8-e78c152c8043.mp3`,
  score: `${AUDIO_BASE}/05ce3025-df03-48b5-9fce-4d98c22f7f09.mp3`,
  tension: `${AUDIO_BASE}/b6e838f0-8687-446a-bdbe-99ce598ca8c1.mp3`,
  place: `${AUDIO_BASE}/73f19d09-0275-4c4b-87cd-eeeed26a616b.mp3`,
  capture: `${AUDIO_BASE}/64ee8170-b796-413f-8249-f1deb7803393.mp3`,
  check: `${AUDIO_BASE}/20ebb41c-0b20-4b4b-8c75-5f78541722d3.mp3`,
  fanfare: `${AUDIO_BASE}/be72bb3f-0f92-4928-a918-6492b4820898.mp3`,
} as const;
