import {
  userModel,
  walletModel,
  statsModel,
  artifactModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { cardService } from '#features/rpg/card.js';
import { F } from '#helpers/index.js';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CARD_DIR = join(__dirname, '..', '..', '..', '..', 'temp', 'card');

const CARD_IMAGE_MAP = {
  girgas: 'girgas.webp',
  lena: 'lena.webp',
  ameris: 'ameris.webp',
  daisy: 'daisy.webp',
};

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function htmlLayout(html) {
  return {
    view_model: {
      primitive: {
        __typename: 'GenAIaeacdsnwHtmlPrimitive',
        payload: html,
        trusted_sources: [],
      },
      __typename: 'GenAISingleLayoutViewModel',
    },
  };
}

function renderProfileHtml(user, wallet, stats, finalStats, equippedCards, expNeeded, expPct, cardImageB64, inv, artifactModelRef) {
  const cardsByType = Object.fromEntries(
    equippedCards.map((card) => [card.type, card])
  );
  const mainCardName = cardsByType.main?.name ?? '-';
  const mainCardLv = cardsByType.main?.level ?? '-';
  const supportCardName = cardsByType.support?.name ?? '-';
  const winRate =
    stats.win + stats.loss > 0
      ? Math.round((stats.win / (stats.win + stats.loss)) * 100)
      : 0;
  const totalWealth = (wallet?.cash ?? 0) + (wallet?.bank ?? 0);

  const SLOT_EMOJI = { flower: '🌸', feather: '🪶', sands: '⏳', goblet: '🏆', circlet: '👑' };
  const SLOT_ORDER = ['flower', 'feather', 'sands', 'goblet', 'circlet'];

  const artifactRows = SLOT_ORDER.map((slot) => {
    const emoji = SLOT_EMOJI[slot];
    const artifactId = inv?.[`${slot}_id`];
    const name = artifactId ? '-' : '-';
    return `<div class="artRow"><span class="artEmoji">${emoji}</span><span class="artName">${esc(name)}</span></div>`;
  }).join('');

  const hpPct = finalStats.hp > 0 ? Math.round((stats.hp / finalStats.hp) * 100) : 0;
  const hpColor = hpPct > 60 ? '#7ee787' : hpPct > 30 ? '#f0c040' : '#ff4d5a';
  const expBarPct = expNeeded > 0 ? Math.round((user.exp / expNeeded) * 100) : 0;

  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  return `<!DOCTYPE html>
<html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0a0a12;color:#e8ecf4;padding:10px;font-size:13px;line-height:1.4}
.wrap{max-width:380px;margin:0 auto;background:linear-gradient(160deg,#111827,#0f172a);border-radius:18px;padding:0;overflow:hidden;border:1px solid rgba(255,255,255,.06)}
.hero{position:relative;background:linear-gradient(135deg,#1e1b4b,#312e81,#1e1b4b);padding:20px 16px 16px;text-align:center}
.heroImg{width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid rgba(139,92,246,.6);box-shadow:0 0 20px rgba(139,92,246,.3);margin-bottom:10px}
.heroName{font-size:18px;font-weight:800;color:#e0e7ff;letter-spacing:.3px}
.heroLv{font-size:11px;color:#a5b4fc;margin-top:3px;font-weight:600}
.expWrap{margin-top:8px}
.expLabel{display:flex;justify-content:space-between;font-size:9px;color:#818cf8;margin-bottom:3px}
.expBar{height:6px;background:rgba(99,102,241,.2);border-radius:3px;overflow:hidden}
.expFill{height:100%;background:linear-gradient(90deg,#6366f1,#a78bfa);border-radius:3px;transition:width .4s}
.body{padding:12px 14px}
.section{margin-bottom:12px}
.secTitle{font-size:10px;font-weight:800;color:#818cf8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;display:flex;align-items:center;gap:5px}
.secTitle::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(129,140,248,.3),transparent)}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.statBox{background:rgba(30,27,75,.5);border:1px solid rgba(139,92,246,.15);border-radius:10px;padding:8px 10px}
.statIcon{font-size:14px;margin-bottom:2px}
.statVal{font-size:16px;font-weight:800;color:#fff}
.statLbl{font-size:8px;color:#818cf8;text-transform:uppercase;letter-spacing:.5px}
.statBar{height:4px;background:rgba(99,102,241,.2);border-radius:2px;margin-top:4px;overflow:hidden}
.statBarFill{height:100%;border-radius:2px}
.cardBox{background:rgba(30,27,75,.5);border:1px solid rgba(139,92,246,.15);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px}
.cardIcon{font-size:20px}
.cardInfo{flex:1;min-width:0}
.cardName{font-size:12px;font-weight:700;color:#e0e7ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cardSub{font-size:9px;color:#818cf8}
.cardTag{font-size:8px;font-weight:700;background:rgba(139,92,246,.2);color:#a78bfa;padding:2px 7px;border-radius:4px;margin-left:auto;flex-shrink:0}
.artGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.artItem{background:rgba(30,27,75,.5);border:1px solid rgba(139,92,246,.12);border-radius:8px;padding:7px 6px;text-align:center}
.artEmoji{font-size:16px;display:block;margin-bottom:2px}
.artName{font-size:8px;color:#818cf8;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.artRow{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(139,92,246,.08)}
.artRow:last-child{border-bottom:none}
.econGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.econBox{background:rgba(30,27,75,.5);border:1px solid rgba(139,92,246,.12);border-radius:10px;padding:8px;text-align:center}
.econIcon{font-size:14px}
.econVal{font-size:14px;font-weight:800;color:#fff;margin-top:2px}
.econLbl{font-size:8px;color:#818cf8;text-transform:uppercase;letter-spacing:.5px}
.recordBar{display:flex;gap:6px;margin-top:6px}
.recordFill{flex:1;height:6px;border-radius:3px;background:rgba(99,102,241,.2);overflow:hidden}
.recordFillOk{height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);border-radius:3px}
.recordFillNo{height:100%;background:linear-gradient(90deg,#ef4444,#f87171);border-radius:3px}
.footer{text-align:center;padding:8px 14px 12px;font-size:8px;color:#475569;letter-spacing:.3px}
.badge{display:inline-flex;align-items:center;gap:4px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.25);border-radius:6px;padding:2px 8px;font-size:9px;font-weight:700;color:#a78bfa}
</style>
<div class="wrap">
  <div class="hero">
    ${cardImageB64 ? `<img class="heroImg" src="data:image/webp;base64,${cardImageB64}" />` : '<div class="heroImg" style="background:#1e1b4b;display:flex;align-items:center;justify-content:center;font-size:36px">⚔</div>'}
    <div class="heroName">${esc(user.push_name || 'Unknown')}</div>
    <div class="heroLv">⭐ Level ${user.level} &nbsp;·&nbsp; ${expPct}% to next</div>
    <div class="expWrap">
      <div class="expLabel"><span>EXP ${F.formatNumber(user.exp)}</span><span>${F.formatNumber(expNeeded)}</span></div>
      <div class="expBar"><div class="expFill" style="width:${expBarPct}%"></div></div>
    </div>
  </div>
  <div class="body">

    <div class="section">
      <div class="secTitle">⚔ Combat Stats</div>
      <div class="stats">
        <div class="statBox">
          <div class="statIcon">❤️</div>
          <div class="statVal">${F.formatNumber(stats.hp)}<span style="font-size:10px;color:#818cf8">/${F.formatNumber(finalStats.hp)}</span></div>
          <div class="statLbl">HP</div>
          <div class="statBar"><div class="statBarFill" style="width:${hpPct}%;background:${hpColor}"></div></div>
        </div>
        <div class="statBox">
          <div class="statIcon">⚔️</div>
          <div class="statVal">${F.formatNumber(finalStats.atk)}</div>
          <div class="statLbl">ATK</div>
        </div>
        <div class="statBox">
          <div class="statIcon">🛡️</div>
          <div class="statVal">${F.formatNumber(finalStats.def)}</div>
          <div class="statLbl">DEF</div>
        </div>
        <div class="statBox">
          <div class="statIcon">💥</div>
          <div class="statVal">${finalStats.critRate.toFixed(0)}%</div>
          <div class="statLbl">CRIT Rate</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="secTitle">🃏 Equipped Cards</div>
      <div class="cardBox">
        <div class="cardIcon">🃏</div>
        <div class="cardInfo">
          <div class="cardName">${esc(mainCardName)}</div>
          <div class="cardSub">Main Card</div>
        </div>
        <span class="cardTag">Lv.${mainCardLv}</span>
      </div>
      <div class="cardBox" style="margin-top:6px">
        <div class="cardIcon">🎴</div>
        <div class="cardInfo">
          <div class="cardName">${esc(supportCardName)}</div>
          <div class="cardSub">Support Card</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="secTitle">💎 Artifacts</div>
      <div style="background:rgba(30,27,75,.5);border:1px solid rgba(139,92,246,.12);border-radius:10px;padding:8px 10px">
        ${artifactRows}
      </div>
    </div>

    <div class="section">
      <div class="secTitle">📊 Battle Record</div>
      <div class="econGrid">
        <div class="econBox">
          <div class="econIcon">🏆</div>
          <div class="econVal">${stats.win}W / ${stats.loss}L</div>
          <div class="econLbl">${winRate}% Win Rate</div>
        </div>
        <div class="econBox">
          <div class="econIcon">🔥</div>
          <div class="econVal">${user.daily_streak || 0}</div>
          <div class="econLbl">Day Streak</div>
        </div>
      </div>
      <div class="recordBar">
        <div class="recordFill"><div class="recordFillOk" style="width:${winRate}%"></div></div>
        <div class="recordFill"><div class="recordFillNo" style="width:${100 - winRate}%"></div></div>
      </div>
    </div>

    <div class="section">
      <div class="secTitle">💰 Economy</div>
      <div class="econGrid">
        <div class="econBox">
          <div class="econIcon">🪙</div>
          <div class="econVal">${F.formatNumber(wallet?.cash ?? 0)}</div>
          <div class="econLbl">Wallet</div>
        </div>
        <div class="econBox">
          <div class="econIcon">🏦</div>
          <div class="econVal">${F.formatNumber(wallet?.bank ?? 0)}</div>
          <div class="econLbl">Bank</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:6px">
        <span class="badge">💰 Total: ${F.formatNumber(totalWealth)}</span>
      </div>
    </div>

  </div>
  <div class="footer">${esc(now)}</div>
</div>
</html>`;
}

export default {
  name: 'profile',
  aliases: ['profil', 'rpg', 'char', 'character'],
  category: 'rpg',
  description: 'Lihat profil RPG kamu',
  cooldown: 5_000,

  async execute(ctx) {
    const jid = ctx.mentions[0] ?? ctx.sender;
    const [user, wallet, stats] = await Promise.all([
      userModel.ensure(jid, { pushName: ctx.pushName }),
      walletModel.find(jid),
      statsModel.ensure(jid),
    ]);

    const [finalStats, equippedCards] = await Promise.all([
      artifactService.getPlayerStats(jid),
      cardService.getEquipped(jid),
    ]);
    const expNeeded = await userModel.expForLevel(user.level + 1);
    const expPct = Math.round((user.exp / expNeeded) * 100);

    const inv = await artifactService.getInventory(jid);

    const cardsByType = Object.fromEntries(
      equippedCards.map((card) => [card.type, card])
    );

    const cardFileName =
      CARD_IMAGE_MAP[cardsByType.main?.card_id] ?? 'girgas.webp';
    const cardPath = join(CARD_DIR, cardFileName);

    let cardImageB64 = '';
    try {
      const buf = readFileSync(cardPath);
      cardImageB64 = buf.toString('base64');
    } catch {}

    const html = renderProfileHtml(
      user, wallet, stats, finalStats, equippedCards,
      expNeeded, expPct, cardImageB64, inv, artifactModel
    );

    const responseId = randomUUID();
    const sections = [htmlLayout(html)];
    const msg = {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: {
          messageDisclaimerText: '',
          botResponseId: responseId,
        },
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: [{ messageType: 2, messageText: `${user.push_name || 'Unknown'} - Profile` }],
            unifiedResponse: {
              data: Buffer.from(
                JSON.stringify({
                  response_id: responseId,
                  sections,
                })
              ).toString('base64'),
            },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: {
                botJid: '867051314767696@bot',
              },
              forwardOrigin: 4,
            },
          },
        },
      },
    };
    return ctx.sock.relayMessage(ctx.jid, msg, { messageId: responseId });
  },
};
