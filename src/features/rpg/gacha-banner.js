/**
 * Gacha Character Banner — render template banner karakter sebagai PNG buffer.
 * Diadaptasi dari template standalone (canvas 1000x660) menjadi modul ESM
 * agar bisa dipakai langsung oleh command `.gacha`.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';

// ---------------------------------------------------------------------------
// Canvas + palette — grounded in the artwork (violet night, gold accents)
// ---------------------------------------------------------------------------
const W = 1000;
const H = 660;

const PALETTE = {
  bgTop: '#140a24',
  bgBottom: '#2a1450',
  glow: '#7c4dff',
  magenta: '#c026a0',
  gold: '#e8b84b',
  goldLight: '#f6d98a',
  ink: '#120a1f',
  lavender: '#cbb8e8',
  cream: '#efe6ff',
};

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seededRandom(7);

/**
 * Render banner gacha.
 * @param {object} data
 * @param {string} [data.name] - nama karakter
 * @param {string} [data.subtitle] - sub-judul (mis. role card)
 * @param {string} [data.eraLabel] - label koleksi
 * @param {string} [data.rateUpText] - teks ribbon
 * @param {string} [data.description] - deskripsi (mis. passive card)
 * @param {string} [data.artPath] - path file artwork karakter
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function renderGachaBanner(data = {}) {
  const {
    name = 'GACHA',
    subtitle = 'Standard Banner',
    eraLabel = 'MYSTIC VIOLET',
    rateUpText = 'RATE UP  ·  1%',
    description = 'Pull untuk mendapatkan Main Card dan Support Card.',
    artPath = null,
  } = data;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // --- 1. Background vertical gradient ---------------------------------
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, PALETTE.bgTop);
  bgGrad.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // --- 2. Soft radial glows ---------------------------------------------
  drawRadialGlow(ctx, 760, 210, 430, PALETTE.glow, 0.55);
  drawRadialGlow(ctx, 810, 560, 300, PALETTE.magenta, 0.35);

  // --- 3. Scattered sparkles --------------------------------------------
  drawSparkles(ctx);

  // --- 4. Character art, zoomed in (feathered on left + bottom edges) --
  if (artPath) {
    try {
      await drawCharacter(ctx, artPath);
    } catch {
      // Artwork gagal dimuat: lanjutkan tanpa karakter.
    }
  }

  // --- 5. Ground shadow ---------------------------------------------------
  ctx.save();
  ctx.fillStyle = 'rgba(5,2,15,0.45)';
  ctx.beginPath();
  ctx.ellipse(805, 648, 185, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- 6. Bottom + left vignette for text legibility --------------------
  drawVignette(ctx);

  // --- 7. Rate-up ribbon ---------------------------------------------------
  drawRibbon(ctx, 60, 55, 285, 52, rateUpText);

  // --- 8. Title lockup -----------------------------------------------------
  drawTitle(ctx, 60, eraLabel, name, subtitle);

  // --- 9. Description panel ------------------------------------------------
  drawDescription(ctx, 60, 400, description);

  // --- 10. Outer hairline frame --------------------------------------------
  drawFrame(ctx);

  return canvas.encode('png');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawRadialGlow(ctx, cx, cy, r, color, strength) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, hexToRgba(color, strength));
  grad.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawSparkles(ctx) {
  const colors = [PALETTE.goldLight, PALETTE.lavender, '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.65;
    const s = 0.6 + rand() * 1.8;
    const a = 0.15 + rand() * 0.5;
    ctx.fillStyle = hexToRgba(colors[Math.floor(rand() * colors.length)], a);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function drawCharacter(ctx, artPath) {
  const img = await loadImage(artPath);
  const targetH = 820; // zoomed in: taller than the canvas, cropping top/feet
  const scale = targetH / img.height;
  const targetW = img.width * scale;
  const x = W - targetW + 15; // shifted more toward center
  const y = -15; // lowered so the head isn't cropped

  // Render the character to an offscreen canvas first so we can feather
  // its left/bottom edges into the background without affecting anything
  // already drawn on the main canvas.
  const off = createCanvas(targetW, targetH);
  const offCtx = off.getContext('2d');
  offCtx.drawImage(img, 0, 0, targetW, targetH);

  // Left-edge feather: fades the character into the backdrop.
  const featherW = 210;
  const mask = offCtx.createLinearGradient(0, 0, featherW, 0);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(1, 'rgba(0,0,0,1)');
  offCtx.save();
  offCtx.globalCompositeOperation = 'destination-in';
  offCtx.fillStyle = mask;
  offCtx.fillRect(0, 0, featherW, targetH);
  // keep everything to the right of the feather fully opaque
  offCtx.fillStyle = 'rgba(0,0,0,1)';
  offCtx.fillRect(featherW, 0, targetW - featherW, targetH);
  offCtx.restore();

  // Bottom-edge feather: lets the feet melt into the ground shadow.
  const featherH = 60;
  const maskB = offCtx.createLinearGradient(0, targetH - featherH, 0, targetH);
  maskB.addColorStop(0, 'rgba(0,0,0,1)');
  maskB.addColorStop(1, 'rgba(0,0,0,0.15)');
  offCtx.save();
  offCtx.globalCompositeOperation = 'destination-in';
  offCtx.fillStyle = 'rgba(0,0,0,1)';
  offCtx.fillRect(0, 0, targetW, targetH - featherH);
  offCtx.fillStyle = maskB;
  offCtx.fillRect(0, targetH - featherH, targetW, featherH);
  offCtx.restore();

  ctx.drawImage(off, x, y);
}

function drawVignette(ctx) {
  // Bottom fade
  const bottomGrad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  bottomGrad.addColorStop(0, hexToRgba(PALETTE.ink, 0));
  bottomGrad.addColorStop(1, hexToRgba(PALETTE.ink, 0.88));
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, 0, W, H);

  // Left fade (keeps the text block readable over the artwork)
  const leftGrad = ctx.createLinearGradient(0, 0, W * 0.62, 0);
  leftGrad.addColorStop(0, hexToRgba(PALETTE.ink, 0.55));
  leftGrad.addColorStop(1, hexToRgba(PALETTE.ink, 0));
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W, H);
}

function drawRibbon(ctx, x, y, w, h, text) {
  const notch = 18;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w + notch, y + h / 2);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + notch, y + h / 2);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(PALETTE.magenta, 0.92);
  ctx.fill();
  ctx.strokeStyle = PALETTE.goldLight;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = PALETTE.cream;
  ctx.font = "bold 23px 'DejaVu Sans', sans-serif";
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 32, y + h / 2 + 2, w - 40);
  ctx.textBaseline = 'alphabetic';
}

function drawTitle(ctx, mx, era, name, subtitle) {
  // Era / collection label, tracked caps
  ctx.fillStyle = PALETTE.lavender;
  ctx.font = "24px 'DejaVu Sans', sans-serif";
  const eraY = 148;
  drawTrackedText(ctx, mx, eraY, era, 7);

  // Title drop shadow
  const titleY = 178;
  ctx.font = "bold 112px 'DejaVu Serif', serif";
  ctx.fillStyle = 'rgba(10,4,20,0.7)';
  ctx.fillText(name, mx + 3, titleY + 3, 880);

  // Title
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(name, mx, titleY, 880);

  // Subtitle
  const subY = titleY + 122;
  ctx.font = "bold 32px 'DejaVu Serif', serif";
  ctx.fillStyle = PALETTE.lavender;
  ctx.fillText(subtitle, mx, subY, 560);

  // Rule
  const ruleY = subY + 52;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx, ruleY);
  ctx.lineTo(mx + 400, ruleY);
  ctx.stroke();
}

function drawTrackedText(ctx, x, y, text, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

function drawDescription(ctx, mx, startY, text) {
  ctx.fillStyle = PALETTE.cream;
  ctx.font = "23px 'DejaVu Sans', sans-serif";
  const maxWidth = 470;
  const lineHeight = 32;
  const words = String(text).split(' ');
  let line = '';
  let y = startY;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, mx, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, mx, y);
}

function drawFrame(ctx) {
  const inset = 16;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset);

  const s = 20;
  ctx.strokeStyle = PALETTE.goldLight;
  ctx.lineWidth = 3;
  const corners = [
    [inset, inset, 1, 1],
    [W - inset, inset, -1, 1],
    [inset, H - inset, 1, -1],
    [W - inset, H - inset, -1, -1],
  ];
  for (const [x, y, fx, fy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * fy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + s * fx, y);
    ctx.stroke();
  }
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
