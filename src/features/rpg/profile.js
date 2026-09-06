import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Optional: register a font that supports the glyphs you use (recommended for
// consistent look across servers). If you skip this, canvas falls back to a
// default system font.
// GlobalFonts.registerFromPath(join(__dirname, 'fonts', 'Poppins-Bold.ttf'), 'Poppins Bold');
// GlobalFonts.registerFromPath(join(__dirname, 'fonts', 'Poppins-Regular.ttf'), 'Poppins');

const W = 1000;
const H = 560;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function statBar(ctx, x, y, w, h, pct, color) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  const fillW = Math.max(h, w * Math.min(pct, 1));
  roundRect(ctx, x, y, fillW, h, h / 2);
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, color[0]);
  grad.addColorStop(1, color[1]);
  ctx.fillStyle = grad;
  ctx.fill();
}

// Simple vector icons drawn with canvas paths (no emoji font dependency)
const ICONS = {
  heart(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.3);
    ctx.bezierCurveTo(cx, cy, cx - s * 0.5, cy - s * 0.1, cx - s * 0.5, cy - s * 0.35);
    ctx.bezierCurveTo(cx - s * 0.5, cy - s * 0.6, cx, cy - s * 0.6, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx, cy - s * 0.6, cx + s * 0.5, cy - s * 0.6, cx + s * 0.5, cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.1, cx, cy, cx, cy + s * 0.3);
    ctx.fill();
  },
  sword(ctx, cx, cy, s, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = s * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.35, cy + s * 0.35);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.15, cy + s * 0.15);
    ctx.lineTo(cx - s * 0.4, cy + s * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - s * 0.4, cy + s * 0.4, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  },
  shield(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.4, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.1);
    ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.45, cx, cy + s * 0.55);
    ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.45, cx - s * 0.4, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.4, cy - s * 0.3);
    ctx.closePath();
    ctx.fill();
  },
  bolt(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.05, cy - s * 0.5);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.05, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.15, cy + s * 0.5);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.15);
    ctx.lineTo(cx + s * 0.05, cy - s * 0.15);
    ctx.closePath();
    ctx.fill();
  },
};

function statChip(ctx, x, y, w, h, iconFn, label, value, accent) {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(20,16,32,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  iconFn(ctx, x + 28, y + h / 2, 26, accent);

  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(label, x + 54, y + h / 2 - 12);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(value), x + 54, y + h / 2 + 12);
}

function cardSlot(ctx, x, y, w, h, label, card, accent) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(20,16,32,0.55)';
  ctx.fill();
  ctx.strokeStyle = accent + '55';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textBaseline = 'top';
  ctx.fillText(label.toUpperCase(), x + 16, y + 12);

  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(card?.name ?? '-', x + 16, y + 34);

  if (card?.level) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(`Lv. ${card.level}`, x + 16, y + h - 26);
  }
}

/**
 * Render an RPG profile card as a PNG buffer.
 * @param {object} data
 * @param {string} data.name
 * @param {number} data.level
 * @param {number} data.exp
 * @param {number} data.expNeeded
 * @param {number} data.hp
 * @param {number} data.maxHp
 * @param {number} data.atk
 * @param {number} data.def
 * @param {number} data.critRate
 * @param {{name:string, level?:number}} [data.mainCard]
 * @param {{name:string, level?:number}} [data.supportCard]
 * @param {string} [data.artPath] - path or URL to character artwork
 */
export async function renderProfileCard(data) {
  const {
    name = 'Unknown',
    level = 1,
    exp = 0,
    expNeeded = 100,
    hp = 0,
    maxHp = 1,
    atk = 0,
    def = 0,
    critRate = 0,
    mainCard = null,
    supportCard = null,
    artPath = null,
  } = data;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#1a1233');
  bgGrad.addColorStop(1, '#2b1738');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Outer panel
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.save();
  ctx.clip();

  // Character art panel (left ~38%)
  const artW = 380;
  if (artPath) {
    try {
      const img = await loadImage(artPath);
      // cover-fit into the art panel
      const scale = Math.max(artW / img.width, H / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, (artW - iw) / 2, (H - ih) / 2, iw, ih);
    } catch {
      ctx.fillStyle = '#3a2550';
      ctx.fillRect(0, 0, artW, H);
    }
  } else {
    ctx.fillStyle = '#3a2550';
    ctx.fillRect(0, 0, artW, H);
  }

  // Fade art into panel
  const fade = ctx.createLinearGradient(artW - 140, 0, artW + 20, 0);
  fade.addColorStop(0, 'rgba(26,18,51,0)');
  fade.addColorStop(1, 'rgba(26,18,51,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(artW - 140, 0, 160, H);

  ctx.restore();

  roundRect(ctx, 0, 0, W, H, 28);
  ctx.strokeStyle = 'rgba(255,215,120,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Right content area
  const px = artW + 30;
  const rightW = W - px - 30;

  // Name + level
  ctx.font = 'bold 34px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.fillText(name, px, 34);

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffd97a';
  ctx.fillText(`Lv. ${level}`, px, 78);

  // EXP bar
  const expPct = expNeeded > 0 ? exp / expNeeded : 0;
  statBar(ctx, px, 106, rightW, 12, expPct, ['#ffd97a', '#ff9d4d']);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`${exp}/${expNeeded} EXP`, px, 122);

  // HP bar (big, its own row)
  const hpY = 156;
  ICONS.heart(ctx, px + 8, hpY + 6, 18, '#ff5f6d');
  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('HP', px + 22, hpY);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${hp}/${maxHp}`, px + rightW, hpY);
  ctx.textAlign = 'left';
  statBar(ctx, px, hpY + 22, rightW, 16, maxHp > 0 ? hp / maxHp : 0, ['#ff5f6d', '#ff9966']);

  // Stat chips: ATK, DEF, CR
  const chipY = hpY + 60;
  const chipH = 68;
  const gap = 14;
  const chipW = (rightW - gap * 2) / 3;
  statChip(ctx, px, chipY, chipW, chipH, ICONS.sword, 'ATK', atk, '#ff8a5c');
  statChip(ctx, px + chipW + gap, chipY, chipW, chipH, ICONS.shield, 'DEF', def, '#6cc4ff');
  statChip(ctx, px + (chipW + gap) * 2, chipY, chipW, chipH, ICONS.bolt, 'CRIT RATE', `${critRate.toFixed(0)}%`, '#ffd15c');

  // Card slots: main + support
  const cardY = chipY + chipH + 26;
  const cardH = 96;
  const cardGap = 14;
  const cardW = (rightW - cardGap) / 2;
  cardSlot(ctx, px, cardY, cardW, cardH, 'Main Card', mainCard, '#ff8a5c');
  cardSlot(ctx, px + cardW + cardGap, cardY, cardW, cardH, 'Support Card', supportCard, '#6cc4ff');

  // Footer divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(px, cardY + cardH + 24);
  ctx.lineTo(px + rightW, cardY + cardH + 24);
  ctx.stroke();

  return canvas.encode('png');
}
