import { randomUUID } from 'crypto';
import { F } from '#helpers/index.js';
import { divergentUniverseService as du } from './divergent-universe.js';

const TYPE_ICON = { battle: '⚔', event: '🔮', treasure: '💎', elite: '🛡', boss: '☠' };
const TYPE_LABEL = { battle: 'Battle', event: 'Event', treasure: 'Treasure', elite: 'Elite', boss: 'Boss' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function totalEffects(state) {
  const effects = {};
  const owned = [
    ...state.blessings.map((id) => du.blessings.find((item) => item.id === id)),
    ...state.curios.map((id) => du.curios.find((item) => item.id === id)),
  ].filter(Boolean);
  for (const item of owned) {
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'number') effects[key] = (effects[key] || 0) + value;
      if (value === true) effects[key] = true;
    }
  }
  return effects;
}

function maxHp(state) {
  return Math.max(50, state.baseMaxHp + (totalEffects(state).maxHp || 0));
}

function statusLabel(status) {
  return status === 'active' ? 'AKTIF'
    : status === 'completed' ? 'SELESAI'
    : status === 'failed' ? 'GAGAL'
    : 'DITINGGALKAN';
}

function effectById(id) {
  return [...du.blessings, ...du.curios].find((item) => item.id === id);
}

function actionPills(run) {
  const state = run.state;
  if (run.status !== 'active') return ['.du start', '.du view'];
  const p = state.pending;
  if (!p) return ['.du explore', '.du view', '.du status'];
  if (p.type === 'path') return ['.du paths', '.du view'];
  if (p.type === 'blessing' || p.type === 'curio') {
    return p.options.slice(0, 3).map((_, i) => `.du choose ${i + 1}`);
  }
  if (p.type === 'event') {
    return p.options.slice(0, 3).map((_, i) => `.du choose ${i + 1}`);
  }
  return ['.du view', '.du status'];
}

function suggestionPillsLayout(items) {
  return {
    view_model: {
      primitives: items.map((t) => ({
        prompt_text: t,
        prompt_type: 'SUGGESTED_PROMPT',
        __typename: 'GenAIFollowUpSuggestionPillPrimitive',
      })),
      __typename: 'GenAIActionRowLayoutViewModel',
    },
  };
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

export function renderDuHtml(run) {
  const state = run.state;
  const totalNodes = state.nodes.length;
  const currentIndex = state.nodeIndex;
  const mhp = maxHp(state);
  const status = statusLabel(run.status);
  const pathName = state.path ? du.paths[state.path].name : 'Belum dipilih';
  const diffName = du.difficulty[state.difficulty]?.name || 'Medium';

  const hpPct = Math.max(0, Math.min(100, (state.hp / mhp) * 100));
  const hpColor = hpPct > 50 ? '#7ee787' : hpPct > 25 ? '#f0c040' : '#ff4d5a';

  const nodeTiles = state.nodes.map((n) => {
    const cleared = n.cleared;
    const current = n.position === currentIndex + 1;
    let icon, label;
    if (cleared) { icon = '✓'; label = ''; }
    else if (current) { icon = TYPE_ICON[n.type] || '·'; label = esc(n.name); }
    else { icon = n.type === 'boss' ? '☠' : n.type === 'elite' ? '🛡' : '·'; label = ''; }
    const cls = [];
    if (cleared) cls.push('nclear');
    if (current) cls.push('ncurrent');
    if (n.type === 'boss') cls.push('nboss');
    else if (n.type === 'elite') cls.push('nelite');
    return `<div class="ntile ${cls.join(' ')}">${icon}${label ? `<span class="nlabel">${label}</span>` : ''}</div>`;
  }).join('');

  const pendingHtml = (() => {
    const p = state.pending;
    if (!p) {
      if (run.status !== 'active') return '';
      return '<div class="hint">Ketik <code>.du explore</code> untuk memasuki node berikutnya.</div>';
    }
    if (p.type === 'path') {
      const items = Object.entries(du.paths).map(([id, path]) =>
        `<div class="pathItem" onclick="copy('.du path ${id}')">⬡ ${esc(path.name)}<span class="pmuted">${esc(path.description)}</span></div>`
      ).join('');
      return `<div class="sectionTitle">Pilih Path</div><div class="pathList">${items}</div>`;
    }
    const title = p.type === 'blessing' ? 'Pilih Blessing'
      : p.type === 'curio' ? 'Pilih Curio'
      : `Event: ${esc(p.eventName)}`;
    const items = p.options.map((opt, i) => {
      const item = typeof opt === 'string' ? effectById(opt) : opt;
      if (!item) return '';
      const pathTag = item.path ? ` <span class="tag">${esc(du.paths[item.path]?.name || '')}</span>` : '';
      const errTag = item.error ? ' <span class="err">ERROR</span>' : '';
      return `<div class="copt" onclick="copy('.du choose ${i + 1}')"><span class="cnum">${i + 1}</span><div class="ccont"><span class="cname">${esc(item.name)}${pathTag}${errTag}</span><span class="ctext">${esc(item.text)}</span></div></div>`;
    }).join('');
    return `<div class="sectionTitle">${esc(title)}</div><div class="choices">${items}</div>`;
  })();

  const rewardHtml = state.finalReward
    ? `<div class="reward">Reward: ${F.formatNumber(state.finalReward.cash)} cash + ${state.finalReward.exp} EXP</div>`
    : '';

  const tipsHtml = run.status === 'failed' || run.status === 'abandoned'
    ? '<div class="hint">Mulai run baru dengan <code>.du start</code></div>'
    : '';

  const lastResult = state.lastResult
    ? `<div class="lastResult">${esc(state.lastResult)}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0e0e0e;color:#e0e0e0;padding:10px;font-size:13px;line-height:1.4}
.wrap{max-width:360px;margin:0 auto;background:linear-gradient(145deg,#141414,#1e1e1e);border-radius:14px;padding:14px;border:1px solid rgba(255,255,255,.06)}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.title{font-size:17px;font-weight:700;color:#c0d9ff}
.status{font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px}
.status.active{background:#1a3a1a;color:#7ee787}
.status.completed{background:#1a2a3a;color:#64b5f6}
.status.failed{background:#3a1a1a;color:#ff4d5a}
.status.abandoned{background:#2a2a2a;color:#999}
.chips{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.chip{font-size:10px;font-weight:600;padding:3px 8px;border-radius:5px;background:#2a2a2a;color:#ccc}
.chip.path{background:#1a2a3a;color:#64b5f6}
.chip.diff{background:#2a1a1a;color:#f0c040}
.hpSec{margin-bottom:8px}
.hpLabel{display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;color:#aaa}
.hpBar{height:10px;background:#222;border-radius:5px;overflow:hidden}
.hpFill{height:100%;border-radius:5px;transition:width .3s}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:8px}
.statBox{background:#1a1a1a;border-radius:6px;padding:6px;text-align:center}
.statVal{font-size:14px;font-weight:700;color:#fff}
.statLbl{font-size:8px;color:#888;margin-top:1px}
.usage{margin-bottom:8px;font-size:9px;color:#888;text-align:center}
.map{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;justify-content:center}
.ntile{width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;background:#1a1a1a;color:#555;position:relative}
.ntile.nclear{background:#0f2a0f;color:#7ee787}
.ntile.ncurrent{background:#1a2a3a;color:#64b5f6;width:auto;min-width:20px;padding:0 4px;gap:2px;border:1px solid #64b5f6}
.ntile.nelite{background:#2a1a1a;color:#f0c040}
.ntile.nboss{background:#2a0a0a;color:#ff4d5a}
.nlabel{font-size:7px;white-space:nowrap;max-width:50px;overflow:hidden;text-overflow:ellipsis}
.lastResult{background:#1a1a1a;border-radius:6px;padding:8px;margin-bottom:8px;font-size:10px;color:#ccc;white-space:pre-wrap;word-break:break-word}
.reward{background:#0f2a0f;border-radius:6px;padding:6px;margin-bottom:8px;font-size:10px;font-weight:600;color:#7ee787;text-align:center}
.sectionTitle{font-size:11px;font-weight:700;color:#c0d9ff;margin-bottom:5px}
.pathList{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.pathItem{background:#1a1a1a;border-radius:6px;padding:7px;font-size:10px;font-weight:600;color:#ddd;display:flex;flex-direction:column;gap:2px;cursor:pointer;-webkit-user-select:none}
.pathItem:active{background:#2a2a2a;transform:scale(.97)}
.pmuted{font-size:9px;font-weight:400;color:#888}
.choices{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.copt{background:#1a1a1a;border-radius:6px;padding:7px;display:flex;gap:7px;align-items:start;cursor:pointer;-webkit-user-select:none}
.copt:active{background:#2a2a2a;transform:scale(.97)}
.cnum{font-size:12px;font-weight:700;color:#64b5f6;min-width:18px;text-align:center;line-height:1.6}
.ccont{flex:1;min-width:0}
.cname{font-size:10px;font-weight:600;color:#ddd;display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.ctext{font-size:9px;color:#888;margin-top:2px}
.tag{font-size:8px;font-weight:600;background:#1a2a3a;color:#64b5f6;padding:1px 5px;border-radius:3px}
.err{font-size:8px;font-weight:700;background:#3a1a1a;color:#ff4d5a;padding:1px 5px;border-radius:3px}
.hint{font-size:9px;color:#888;margin-bottom:8px;text-align:center}
.hint code{font-size:9px;background:#1a1a1a;padding:1px 4px;border-radius:3px;color:#64b5f6}
.footer{font-size:8px;color:#555;text-align:center;margin-top:6px}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;font-size:11px;padding:6px 14px;border-radius:8px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:99}
#toast.show{opacity:1}
</style>
<div class="wrap">
<div class="header">
<div class="title">⌁ DIVERGENT UNIVERSE</div>
<div class="status ${esc(run.status)}">${esc(status)}</div>
</div>
<div class="chips">
<span class="chip diff">${esc(diffName)}</span>
<span class="chip path">${esc(pathName)}</span>
</div>
<div class="hpSec">
<div class="hpLabel"><span>HP</span><span>${state.hp}/${mhp}</span></div>
<div class="hpBar"><div class="hpFill" style="width:${hpPct}%;background:${hpColor}"></div></div>
</div>
<div class="stats">
<div class="statBox"><div class="statVal">${F.formatNumber(state.fragments)}</div><div class="statLbl">Fragment</div></div>
<div class="statBox"><div class="statVal">${state.blessings.length}</div><div class="statLbl">Blessing</div></div>
<div class="statBox"><div class="statVal">${state.curios.length}</div><div class="statLbl">Curio</div></div>
</div>
<div class="map">${nodeTiles}</div>
${lastResult}
${rewardHtml}
${pendingHtml}
${tipsHtml}
<div class="footer">Ketuk pilihan untuk salin perintah</div>
</div>
<div id="toast"></div>
<script>
function copy(t){try{navigator.clipboard.writeText(t)}catch(e){};var d=document.getElementById('toast');d.textContent='Disalin: '+t;d.classList.add('show');setTimeout(function(){d.classList.remove('show')},1500)}
</script>
</html>`;

  return html;
}

export function suggestionPills(run) {
  return actionPills(run);
}

export async function sendDuHtml(ctx, run) {
  const responseId = randomUUID();
  const html = renderDuHtml(run);
  const pills = suggestionPills(run);
  const sections = [htmlLayout(html)];
  if (pills.length) {
    sections.push(suggestionPillsLayout(pills));
  }
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
          submessages: [
            { messageType: 2, messageText: 'Divergent Universe' },
          ],
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
}