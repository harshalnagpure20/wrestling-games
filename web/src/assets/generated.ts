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
   * The super-heavyweight. Placeholder rig is the chess temple guardian, chosen
   * because full plate already reads as bulk and it carries a knockdown clip.
   */
  ironclad: {
    id: "ironclad",
    label: "Ironclad",
    note: "Super-heavyweight powerhouse — slow, enormous, hits like a truck",
    weight: 330,
    clips: {
      rigged: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-rigged.glb`,
      idle: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-combat-stance.glb`,
      walk: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-casual-walk-inplace.glb`,
      strike: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-heavy-hammer-swing.glb`,
      knockdown: `${MODEL_BASE}/211b0ba5-2c7f-44ff-8143-b625bca41df1-anim-knock-down.glb`,
      getUp: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-anim-kneeling-reload.glb`,
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
    attributes: { strength: 92, submission: 48, endurance: 74, technique: 52, speed: 38 },
  },

  /**
   * The cruiserweight. Placeholder rig is the chess knight, which carries both
   * a run and a strut and is the leanest silhouette in the inherited set.
   */
  vanguard: {
    id: "vanguard",
    label: "Vanguard",
    note: "Technical cruiserweight — fast, precise, reverses everything",
    weight: 215,
    clips: {
      rigged: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-rigged.glb`,
      idle: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-combat-stance.glb`,
      walk: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-confident-strut-inplace.glb`,
      run: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-standard-forward-charge-inplace.glb`,
      strike: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-charged-slash.glb`,
      knockdown: `${MODEL_BASE}/43f08150-5463-4112-9949-2e1a9a9a6bd2-anim-dying-backwards.glb`,
      getUp: `${MODEL_BASE}/044ccbd8-c9d3-452e-8524-4a47034b8fe2-anim-kneeling-reload.glb`,
    },
    morph: {
      ...NEUTRAL_MORPH,
      shoulders: 1.06,
      chest: 1.02,
      arms: 1.02,
      waist: 0.92,
      abdomen: 0.94,
      thighs: 1.04,
      legs: 1.04,
      stature: 0.96,
    },
    attributes: { strength: 58, submission: 78, endurance: 82, technique: 90, speed: 88 },
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
  ambience: `${AUDIO_BASE}/e62d5bb9-8c84-4464-8696-dbcf975f938b.mp3`,
  score: `${AUDIO_BASE}/3fbe58de-9d38-4d91-a002-794d0e979eb0.mp3`,
  tension: `${AUDIO_BASE}/00baae5a-fde3-478a-8190-b1ad14d2e96d.mp3`,
  place: `${AUDIO_BASE}/73f19d09-0275-4c4b-87cd-eeeed26a616b.mp3`,
  capture: `${AUDIO_BASE}/64ee8170-b796-413f-8249-f1deb7803393.mp3`,
  check: `${AUDIO_BASE}/20ebb41c-0b20-4b4b-8c75-5f78541722d3.mp3`,
  fanfare: `${AUDIO_BASE}/c89fa5ef-7904-4a5f-899e-e1973b13b30f.mp3`,
} as const;
