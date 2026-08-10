/**
 * Arena looks — the venues a match can be staged in.
 *
 * Every value here is read by the lighting rig, the ring, the crowd and the
 * colour grade, so a look is a complete relight rather than a brightness
 * slider: exposure, haze, truss colour, canvas tint and the film grade all move
 * together.
 *
 * Art direction is the reference game's own, executed with modern rendering.
 * Grounded and televisual, not stylised: warm key, cool rim, real shadows, and
 * a crowd that reads as a dark mass with catchlights rather than as geometry.
 * Restraint is the point — the ring has to stay legible during a fast exchange.
 */

export type ArenaTheme = "primetime" | "spotlight" | "smallhall";

export interface ArenaLook {
  id: ArenaTheme;
  label: string;
  note: string;

  // ------------------------------------------------------------ renderer
  exposure: number;
  background: number;
  /** Arena haze. Thin — it catches the truss beams without fogging the ring. */
  fog: { color: number; density: number };
  environment: {
    top: number;
    bottom: number;
    glow: number;
    warm: number;
    cool: number;
    intensity: number;
  };

  // ------------------------------------------------------------- lighting
  hemi: { sky: number; ground: number; intensity: number };
  /** The hard overhead key. Wrestling light comes from directly above. */
  keyLight: { color: number; intensity: number; position: [number, number, number] };
  fill: { color: number; intensity: number; position: [number, number, number] };
  /** Camera-mounted lamp so the near wrestler never falls into silhouette. */
  lamp: { color: number; intensity: number };
  /**
   * Coloured truss spots ringing the arena. Each entry is one lamp: hue, cone
   * strength and where on the truss circle it hangs, in radians.
   */
  truss: { color: number; intensity: number; angle: number }[];
  /** Beam volume caught in the haze. */
  shaft: { color: number; opacity: number };

  // ----------------------------------------------------------------- ring
  ring: {
    canvas: number;
    canvasLogo: number;
    apron: number;
    skirt: number;
    post: number;
    rope: number;
    turnbuckle: number;
    mat: number;
    barricade: number;
  };

  // ---------------------------------------------------------------- crowd
  crowd: { base: number; accent: number; density: number; flash: number };

  // ---------------------------------------------------------------- grade
  bloom: { strength: number; threshold: number; radius: number };
  grade: { vignette: number; grain: number; lift: number; strength: number };
  /** Screen-space CSS vignette strength (0–1). */
  screenVignette: number;
}

export const ARENA_LOOKS: Record<ArenaTheme, ArenaLook> = {
  /**
   * Sold-out television arena, house lights up. The default because it is the
   * honest test of the models: nothing hides in shadow, and any weakness in a
   * silhouette or a contact point is fully lit.
   */
  primetime: {
    id: "primetime",
    label: "Primetime",
    note: "Sold-out TV arena, house lights up — the clearest read of both wrestlers",
    exposure: 0.92,
    background: 0x0b0f16,
    fog: { color: 0x141c28, density: 0.008 },
    environment: {
      top: 0x4a5a72,
      bottom: 0x1a1a1e,
      glow: 0xffd9a0,
      warm: 0xfff0d4,
      cool: 0x7fa8d8,
      intensity: 0.9,
    },
    // Four spots and a key all converge on one near-white canvas, so these are
    // much lower than they look. Anything higher clips the middle of the ring
    // to flat white and takes the weave, the scuffs and the wrestlers' contact
    // shadows with it.
    hemi: { sky: 0x9fb6d4, ground: 0x2a2622, intensity: 0.42 },
    keyLight: { color: 0xfff4e0, intensity: 1.55, position: [0, 22, 2] },
    fill: { color: 0x8fb0d8, intensity: 0.34, position: [-10, 9, -11] },
    lamp: { color: 0xffeed8, intensity: 0.16 },
    truss: [
      { color: 0xffffff, intensity: 0.75, angle: 0 },
      { color: 0xffe9c0, intensity: 0.62, angle: Math.PI / 2 },
      { color: 0xffffff, intensity: 0.75, angle: Math.PI },
      { color: 0xcfe2ff, intensity: 0.62, angle: -Math.PI / 2 },
    ],
    // House lights up: the beams barely register. Anything stronger reads as
    // frosted glass slabs standing between the camera and the match.
    shaft: { color: 0xfff0cc, opacity: 0.012 },
    ring: {
      canvas: 0xd8d4c8,
      canvasLogo: 0xc4362f,
      apron: 0x1d2634,
      skirt: 0x161d28,
      post: 0xb4232a,
      rope: 0xe8e4da,
      turnbuckle: 0xc4362f,
      mat: 0x2b2f36,
      barricade: 0x1a1f28,
    },
    crowd: { base: 0x10141c, accent: 0x2a3448, density: 1, flash: 0.35 },
    bloom: { strength: 0.3, threshold: 0.88, radius: 0.6 },
    grade: { vignette: 0.5, grain: 0.016, lift: 0.008, strength: 0.62 },
    screenVignette: 0.22,
  },

  /**
   * House lights down, ring lit from the truss alone. The dramatic look — used
   * for entrances and finishes. Kept honest by the camera lamp: a wrestler must
   * never become an unreadable black shape mid-exchange.
   */
  spotlight: {
    id: "spotlight",
    label: "Spotlight",
    note: "House lights down, truss only — dramatic, for entrances and finishes",
    exposure: 1.08,
    background: 0x04050a,
    fog: { color: 0x0a0d16, density: 0.016 },
    environment: {
      top: 0x1c2436,
      bottom: 0x0a0a0e,
      glow: 0xff9d4a,
      warm: 0xffd9a8,
      cool: 0x4a6fb0,
      intensity: 0.7,
    },
    hemi: { sky: 0x3a4a68, ground: 0x0d0c0f, intensity: 0.2 },
    keyLight: { color: 0xffe8c4, intensity: 1.7, position: [0, 20, 1] },
    fill: { color: 0x5878b8, intensity: 0.22, position: [-9, 8, -10] },
    lamp: { color: 0xffe4c0, intensity: 0.24 },
    truss: [
      { color: 0xff4d3d, intensity: 1.1, angle: 0.4 },
      { color: 0x3d8bff, intensity: 1.1, angle: Math.PI - 0.4 },
      { color: 0xffffff, intensity: 1.3, angle: Math.PI + 0.5 },
      { color: 0xffc24d, intensity: 0.9, angle: -0.7 },
    ],
    shaft: { color: 0xffffff, opacity: 0.075 },
    ring: {
      canvas: 0xc8c4ba,
      canvasLogo: 0x9e2820,
      apron: 0x10161f,
      skirt: 0x0b0f16,
      post: 0x8e1c22,
      rope: 0xd6d2c8,
      turnbuckle: 0x9e2820,
      mat: 0x1a1d22,
      barricade: 0x0e1219,
    },
    crowd: { base: 0x070910, accent: 0x1d2740, density: 1, flash: 0.7 },
    bloom: { strength: 0.58, threshold: 0.74, radius: 0.72 },
    grade: { vignette: 0.95, grain: 0.034, lift: 0.016, strength: 0.92 },
    screenVignette: 0.46,
  },

  /**
   * Small hall: low ceiling, fluorescent wash, crowd close enough to touch the
   * apron. Flatter and grubbier, and a useful worst case — if the wrestlers
   * read here, they read anywhere.
   */
  smallhall: {
    id: "smallhall",
    label: "Small Hall",
    note: "Low ceiling and fluorescent wash — flat, grubby, crowd on top of the ring",
    exposure: 0.94,
    background: 0x14161a,
    fog: { color: 0x1c1f24, density: 0.011 },
    environment: {
      top: 0x5a6068,
      bottom: 0x26241f,
      glow: 0xd8d4c0,
      warm: 0xeceadc,
      cool: 0x9aa4b0,
      intensity: 0.82,
    },
    hemi: { sky: 0xaab2bc, ground: 0x35302a, intensity: 0.62 },
    keyLight: { color: 0xf4f6f0, intensity: 1.25, position: [3, 14, 4] },
    fill: { color: 0xa8b0ba, intensity: 0.44, position: [-7, 7, -8] },
    lamp: { color: 0xf0f0e8, intensity: 0.12 },
    truss: [
      { color: 0xf6f8f0, intensity: 0.5, angle: 0.8 },
      { color: 0xf6f8f0, intensity: 0.5, angle: Math.PI - 0.8 },
    ],
    shaft: { color: 0xe8ecdc, opacity: 0.035 },
    ring: {
      canvas: 0xc6bfa8,
      canvasLogo: 0x3f5a86,
      apron: 0x2a2d31,
      skirt: 0x23262a,
      post: 0x3f5a86,
      rope: 0xd8cfae,
      turnbuckle: 0x3f5a86,
      mat: 0x33352f,
      barricade: 0x2c2f33,
    },
    crowd: { base: 0x1a1d22, accent: 0x3a4048, density: 0.6, flash: 0.12 },
    bloom: { strength: 0.18, threshold: 0.95, radius: 0.55 },
    grade: { vignette: 0.42, grain: 0.026, lift: 0.012, strength: 0.54 },
    screenVignette: 0.18,
  },
};

export const ARENA_ORDER: ArenaTheme[] = ["primetime", "spotlight", "smallhall"];

export const DEFAULT_ARENA: ArenaTheme = "primetime";
