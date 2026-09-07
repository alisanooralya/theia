import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'temp',
  'fonts'
);
for (const [file, alias] of [
  ['SourceSans3-Regular.ttf', 'Banner Sans'],
  ['SourceSans3-Bold.ttf', 'Banner Sans'],
  ['NotoSerif-Regular.ttf', 'Banner Serif'],
  ['NotoSerif-Bold.ttf', 'Banner Serif'],
]) {
  const fontPath = join(FONT_DIR, file);
  if (existsSync(fontPath)) {
    try {
      GlobalFonts.registerFromPath(fontPath, alias);
    } catch {
      // Abaikan font rusak — fallback ke font sistem di bawah.
    }
  }
}

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

const SANS = '"Banner Sans", "Source Sans Pro", "Roboto", sans-serif';
const SERIF = '"Banner Serif", "Noto Serif", serif';

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seededRandom(7);

export async function renderGachaBanner(data = {}) {
  const {
    name = '',
    subtitle = '',
    eraLabel = '',
    rateUpText = '',
    description = '',
    artPath = null,
  } = data;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, PALETTE.bgTop);
  bgGrad.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  drawRadialGlow(ctx, 760, 210, 430, PALETTE.glow, 0.55);
  drawRadialGlow(ctx, 810, 560, 300, PALETTE.magenta, 0.35);

  drawSparkles(ctx);

  if (artPath) {
    try {
      await drawCharacter(ctx, artPath);
    } catch {
      // ignore
    }
  }

  ctx.save();
  ctx.fillStyle = 'rgba(5,2,15,0.45)';
  ctx.beginPath();
  ctx.ellipse(805, 648, 185, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawVignette(ctx);
  drawRibbon(ctx, 60, 48, 300, 56, rateUpText);
  drawTitle(ctx, 60, eraLabel, name, subtitle);
  drawDescription(ctx, 60, 360, description);
  drawFrame(ctx);

  return canvas.encode('png');
}

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
  const targetH = 820;
  const scale = targetH / img.height;
  const targetW = Math.round(img.width * scale);
  const x = W - targetW + 15;
  const y = -15;

  const off = createCanvas(targetW, targetH);
  const offCtx = off.getContext('2d');

  offCtx.drawImage(img, 0, 0, targetW, targetH);
  featherAlpha(offCtx, targetW, targetH, 210, 60);
  ctx.drawImage(off, x, y);
}

function featherAlpha(offCtx, w, h, featherW, featherH) {
  const img = offCtx.getImageData(0, 0, w, h);
  const { data, width, height } = img;
  const fw = Math.min(featherW, width);
  const fh = Math.min(featherH, height);
  for (let py = 0; py < height; py++) {
    const bottomRamp =
      py < height - fh
        ? 1
        : 0.15 + (0.85 * (height - 1 - py)) / Math.max(1, fh - 1);
    for (let px = 0; px < width; px++) {
      const leftRamp = px >= fw ? 1 : px / fw;
      data[(py * width + px) * 4 + 3] *= leftRamp * bottomRamp;
    }
  }
  offCtx.putImageData(img, 0, 0);
}

function drawVignette(ctx) {
  const bottomGrad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  bottomGrad.addColorStop(0, hexToRgba(PALETTE.ink, 0));
  bottomGrad.addColorStop(1, hexToRgba(PALETTE.ink, 0.88));
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, 0, W, H);

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
  ctx.font = `bold 26px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 32, y + h / 2 + 2, w - 48);
  ctx.textBaseline = 'alphabetic';
}

function drawTitle(ctx, mx, era, name, subtitle) {
  ctx.textBaseline = 'top';

  ctx.fillStyle = PALETTE.lavender;
  ctx.font = `30px ${SANS}`;
  const eraY = 128;
  drawTrackedText(ctx, mx, eraY, era, 8);

  let titleSize = 128;
  ctx.font = `bold ${titleSize}px ${SERIF}`;
  const nameMax = 560;
  while (titleSize > 64 && ctx.measureText(name).width > nameMax) {
    titleSize -= 8;
    ctx.font = `bold ${titleSize}px ${SERIF}`;
  }
  const titleY = 164;
  ctx.fillStyle = 'rgba(10,4,20,0.7)';
  ctx.fillText(name, mx + 3, titleY + 3, nameMax);

  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(name, mx, titleY, nameMax);

  const subY = titleY + titleSize;
  ctx.font = `bold 38px ${SERIF}`;
  ctx.fillStyle = PALETTE.lavender;
  ctx.fillText(subtitle, mx, subY, nameMax);

  const ruleY = subY + 52;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx, ruleY);
  ctx.lineTo(mx + 400, ruleY);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
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
  ctx.font = `27px ${SANS}`;
  ctx.textBaseline = 'top';
  const maxWidth = 480;
  const lineHeight = 37;
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
