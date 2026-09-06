import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Optional: register a font that supports the glyphs you use (recommended for
// consistent look across servers). If you skip this, canvas falls back to a
// default system font.
// GlobalFonts.registerFromPath(join(__dirname, 'fonts', 'Poppins-Bold.ttf'), 'Poppins Bold');
// GlobalFonts.registerFromPath(join(__dirname, 'fonts', 'Poppins-Regular.ttf'), 'Poppins');

const W = 720;
const H = 1080;

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
    ctx.bezierCurveTo(
      cx,
      cy,
      cx - s * 0.5,
      cy - s * 0.1,
      cx - s * 0.5,
      cy - s * 0.35
    );
    ctx.bezierCurveTo(
      cx - s * 0.5,
      cy - s * 0.6,
      cx,
      cy - s * 0.6,
      cx,
      cy - s * 0.35
    );
    ctx.bezierCurveTo(
      cx,
      cy - s * 0.6,
      cx + s * 0.5,
      cy - s * 0.6,
      cx + s * 0.5,
      cy - s * 0.35
    );
    ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.1, cx, cy, cx, cy + s * 0.3);
    ctx.fill();
  },
  sword(ctx, cx, cy, s, color) {
    // Proper sword silhouette: blade + guard + grip + pommel, tilted diagonal.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = color;
    const u = s / 2;
    // Blade (tapered to a tip at the top)
    ctx.beginPath();
    ctx.moveTo(0, -u);
    ctx.lineTo(u * 0.16, -u * 0.5);
    ctx.lineTo(u * 0.16, u * 0.1);
    ctx.lineTo(-u * 0.16, u * 0.1);
    ctx.lineTo(-u * 0.16, -u * 0.5);
    ctx.closePath();
    ctx.fill();
    // Crossguard
    roundRect(ctx, -u * 0.36, u * 0.1, u * 0.72, u * 0.16, u * 0.08);
    ctx.fill();
    // Grip
    ctx.fillRect(-u * 0.07, u * 0.26, u * 0.14, u * 0.34);
    // Pommel
    ctx.beginPath();
    ctx.arc(0, u * 0.6 + u * 0.12, u * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  shield(ctx, cx, cy, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.4, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.1);
    ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.45, cx, cy + s * 0.55);
    ctx.quadraticCurveTo(
      cx - s * 0.4,
      cy + s * 0.45,
      cx - s * 0.4,
      cy + s * 0.1
    );
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
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(20,16,32,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Explicit text state: callers leave textBaseline on 'top',
  // which would push the value text against the chip bottom edge.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const cy = y + h / 2;
  const textX = x + 60;
  iconFn(ctx, x + 30, cy, 32, accent);

  ctx.font = 'bold 19px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(label, textX, cy - 13, w - 60 - 12);

  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(value), textX, cy + 23, w - 60 - 12);
}

function cardSlot(ctx, x, y, w, h, label, card, accent) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = 'rgba(20,16,32,0.55)';
  ctx.fill();
  ctx.strokeStyle = accent + '55';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textBaseline = 'top';
  ctx.fillText(label.toUpperCase(), x + 18, y + 12, w - 36);

  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(card?.name ?? '-', x + 18, y + 34, w - 36);

  if (card?.level) {
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(`Lv. ${card.level}`, x + 18, y + h - 24);
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
  const R = 28; // outer corner radius
  const pad = 24; // side padding for panel content

  // Base fill (shows if art fails to load)
  ctx.fillStyle = '#1a1233';
  ctx.fillRect(0, 0, W, H);

  roundRect(ctx, 0, 0, W, H, R);
  ctx.save();
  ctx.clip();

  // ---- Full-bleed character artwork on top ----
  if (artPath) {
    try {
      const img = await loadImage(artPath);
      const scale = Math.max(W / img.width, H / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, (W - iw) / 2, 0, iw, ih);
    } catch {
      ctx.fillStyle = '#3a2550';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#3a2550';
    ctx.fillRect(0, 0, W, H);
  }

  // ---- Bottom panel geometry ----
  const panelH = 432; // height of the stats panel
  const panelY = H - panelH;

  // Soft fade where art meets the panel
  const fade = ctx.createLinearGradient(0, panelY - 150, 0, panelY + 10);
  fade.addColorStop(0, 'rgba(24,17,41,0)');
  fade.addColorStop(1, 'rgba(24,17,41,0.97)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, panelY - 150, W, 160);

  // Solid panel body
  ctx.fillStyle = 'rgba(24,17,41,0.94)';
  ctx.fillRect(0, panelY + 10, W, panelH - 10);

  ctx.restore();

  // Outer border
  roundRect(ctx, 0, 0, W, H, R);
  ctx.strokeStyle = 'rgba(255,215,120,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ---- Panel content (compact rhythm) ----
  const px = pad;
  const contentW = W - pad * 2;
  let y = panelY + 24;

  // Name
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.fillText(name, px, y, contentW);
  y += 48;

  // Level
  ctx.font = 'bold 21px sans-serif';
  ctx.fillStyle = '#ffd97a';
  ctx.fillText(`Lv. ${level}`, px, y, contentW);
  y += 32;

  // EXP bar
  const expPct = expNeeded > 0 ? exp / expNeeded : 0;
  statBar(ctx, px, y, contentW, 13, expPct, ['#ffd97a', '#ff9d4d']);
  y += 19;
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`${exp}/${expNeeded} EXP`, px, y, contentW);
  y += 30;

  // HP row
  ICONS.heart(ctx, px + 10, y + 10, 22, '#ff5f6d');
  ctx.font = '19px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('HP', px + 28, y + 2);
  ctx.font = 'bold 19px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${hp}/${maxHp}`, px + contentW, y + 2);
  ctx.textAlign = 'left';
  y += 26;
  statBar(ctx, px, y, contentW, 18, maxHp > 0 ? hp / maxHp : 0, [
    '#ff5f6d',
    '#ff9966',
  ]);
  y += 38;

  // Stat chips: ATK, DEF, CR
  const chipH = 88;
  const gap = 12;
  const chipW = (contentW - gap * 2) / 3;
  statChip(ctx, px, y, chipW, chipH, ICONS.sword, 'ATK', atk, '#ff8a5c');
  statChip(
    ctx,
    px + chipW + gap,
    y,
    chipW,
    chipH,
    ICONS.shield,
    'DEF',
    def,
    '#6cc4ff'
  );
  statChip(
    ctx,
    px + (chipW + gap) * 2,
    y,
    chipW,
    chipH,
    ICONS.bolt,
    'CRIT RATE',
    `${critRate.toFixed(0)}%`,
    '#ffd15c'
  );
  y += chipH + 14;

  // Card slots: main + support
  const cardH = 88;
  const cardGap = 12;
  const cardW = (contentW - cardGap) / 2;
  cardSlot(ctx, px, y, cardW, cardH, 'Main Card', mainCard, '#ff8a5c');
  cardSlot(
    ctx,
    px + cardW + cardGap,
    y,
    cardW,
    cardH,
    'Support Card',
    supportCard,
    '#6cc4ff'
  );

  return canvas.encode('png');
}
