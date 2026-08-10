/**
 * Procedural textures for the ring and the arena.
 *
 * Painted into canvases at boot, so the game ships without texture downloads
 * and still gets canvas weave, rope twist, scuffed vinyl and brushed steel.
 *
 * These are deliberately subtle. The art direction is a televised arena, and
 * on television a wrestling canvas is nearly flat white — the weave only shows
 * where the light rakes across it. Anything louder here fights the wrestlers
 * for attention, and the wrestlers have to win.
 */

import * as THREE from "three";

function createCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function grain(ctx: CanvasRenderingContext2D, size: number, amount: number): void {
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(image, 0, 0);
}

/**
 * Ring canvas: a tight woven duck cloth with scuffs and a faint dirt gradient
 * toward the corners, where boots actually land.
 */
export function canvasTexture(base: number): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);

  // Weave: alternating warp and weft at a couple of pixels, kept very low
  // contrast so it reads as texture under raking light and vanishes head-on.
  const pitch = 4;
  ctx.globalAlpha = 0.05;
  for (let x = 0; x < size; x += pitch) {
    ctx.fillStyle = x % (pitch * 2) === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(x, 0, pitch / 2, size);
  }
  for (let y = 0; y < size; y += pitch) {
    ctx.fillStyle = y % (pitch * 2) === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(0, y, size, pitch / 2);
  }
  ctx.globalAlpha = 1;

  // Broad soiling. Heaviest in the corners and along the rope lines.
  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 60 + Math.random() * 220;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, "rgba(70,64,58,0.05)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scuff marks: short arcs where a boot has dragged.
  ctx.strokeStyle = "rgba(60,54,48,0.14)";
  for (let i = 0; i < 60; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 20 + Math.random() * 90;
    const angle = Math.random() * Math.PI * 2;
    ctx.lineWidth = 0.8 + Math.random() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * len * 0.5 + (Math.random() - 0.5) * 18,
      y + Math.sin(angle) * len * 0.5 + (Math.random() - 0.5) * 18,
      x + Math.cos(angle) * len,
      y + Math.sin(angle) * len,
    );
    ctx.stroke();
  }

  grain(ctx, size, 8);
  return toTexture(canvas);
}

/** Normal map for the canvas weave, so the raking key light has something to catch. */
export function canvasNormalTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, size, size);

  const pitch = 4;
  for (let x = 0; x < size; x += pitch) {
    ctx.fillStyle = x % (pitch * 2) === 0 ? "#9a80ff" : "#6680ff";
    ctx.fillRect(x, 0, pitch / 2, size);
  }
  ctx.globalAlpha = 0.5;
  for (let y = 0; y < size; y += pitch) {
    ctx.fillStyle = y % (pitch * 2) === 0 ? "#809aff" : "#8066ff";
    ctx.fillRect(0, y, size, pitch / 2);
  }
  ctx.globalAlpha = 1;

  const texture = toTexture(canvas, 1, false);
  return texture;
}

/**
 * Rope: three strands laid up in a spiral, running along the length of the
 * cylinder. Repeat it hard along U and the twist reads as real cordage.
 */
export function ropeTexture(base: number): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);

  // Diagonal strand bands with a soft shaded edge on each.
  const strands = 3;
  const band = size / strands;
  for (let s = 0; s < strands; s += 1) {
    const gradient = ctx.createLinearGradient(0, s * band, 0, (s + 1) * band);
    gradient.addColorStop(0, "rgba(0,0,0,0.34)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.16)");
    gradient.addColorStop(0.65, "rgba(255,255,255,0.1)");
    gradient.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.save();
    ctx.translate(0, s * band);
    ctx.transform(1, 0, 0.45, 1, 0, 0);
    ctx.fillStyle = gradient;
    ctx.fillRect(-size, 0, size * 3, band);
    ctx.restore();
  }

  grain(ctx, size, 12);
  const texture = toTexture(canvas);
  texture.repeat.set(1, 1);
  return texture;
}

/** Turnbuckle pad: heavy vinyl with a quilted seam and a scuffed face. */
export function vinylTexture(base: number): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);

  // Sheen down the middle — vinyl is glossier than anything else in the ring.
  const sheen = ctx.createLinearGradient(0, 0, 0, size);
  sheen.addColorStop(0, "rgba(255,255,255,0.16)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0.04)");
  sheen.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // Stitched seams top and bottom.
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  for (const y of [size * 0.16, size * 0.84]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Scuffs from a hundred back-first collisions.
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 30; i += 1) {
    const x = Math.random() * size;
    const y = size * 0.2 + Math.random() * size * 0.6;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }

  grain(ctx, size, 10);
  return toTexture(canvas);
}

/** Brushed steel for posts and barricades. */
export function steelTexture(base: number): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);

  // Vertical brushing.
  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 10 + Math.random() * 60;
    const light = Math.random() > 0.5;
    ctx.strokeStyle = light ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    ctx.lineWidth = 0.5 + Math.random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len);
    ctx.stroke();
  }

  grain(ctx, size, 8);
  return toTexture(canvas);
}

/** Rubberised arena floor around the ring. */
export function floorMatTexture(base: number): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);

  // Interlocking mat seams.
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    const p = (i / 4) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Speckle.
  for (let i = 0; i < 3000; i += 1) {
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.06)";
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  grain(ctx, size, 10);
  return toTexture(canvas);
}

/**
 * The crowd, as a single texture applied to a cylinder: thousands of dim
 * head-and-shoulder blobs with occasional catchlights.
 *
 * A crowd is geometry you can never afford and never need. At the distance the
 * camera keeps, all that survives is a dark speckled mass that moves slightly
 * and flashes — so that is exactly what gets built.
 */
export function crowdTexture(base: number, accent: number, density: number): THREE.CanvasTexture {
  const size = 1024;
  const { canvas, ctx } = createCanvas(size);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);

  // Tiered rake: rows get tighter toward the top of the texture, which maps to
  // the back of the arena.
  const rows = 26;
  for (let row = 0; row < rows; row += 1) {
    const t = row / rows;
    const y = size - t * size;
    const scale = 1 - t * 0.55;
    const count = Math.floor((44 + t * 40) * density);
    for (let i = 0; i < count; i += 1) {
      const x = (i / count) * size + (Math.random() - 0.5) * 14;
      const headR = (5 + Math.random() * 3) * scale;

      // Shoulders.
      ctx.fillStyle = Math.random() > 0.82 ? hex(accent) : "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.ellipse(x, y - headR * 0.4, headR * 1.9, headR * 1.5, 0, Math.PI, 0);
      ctx.fill();

      // Head.
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.beginPath();
      ctx.arc(x, y - headR * 2, headR, 0, Math.PI * 2);
      ctx.fill();

      // Occasional lit face or phone screen.
      if (Math.random() > 0.94) {
        ctx.fillStyle = "rgba(255,236,190,0.5)";
        ctx.beginPath();
        ctx.arc(x + headR * 0.6, y - headR * 1.4, headR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Overall darkening toward the top so the back of the hall falls away.
  const fade = ctx.createLinearGradient(0, 0, 0, size);
  fade.addColorStop(0, "rgba(0,0,0,0.72)");
  fade.addColorStop(1, "rgba(0,0,0,0.1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);

  return toTexture(canvas);
}
