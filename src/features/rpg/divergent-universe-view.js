import { randomUUID } from 'crypto';
import { F } from '#helpers/index.js';
import { divergentUniverseService as du } from './divergent-universe.js';
import { DU_ENGINE_SOURCE } from './divergent-universe-engine.js';

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

const CLIENT_APP = String.raw`
(function(){
  var C = window.__DU__ || {};
  var data = C.data, seed = C.seed, init = C.init;
  if (!data || !DUEngine) { return; }
  var game = DUEngine.makeDU(data).create(seed, init);
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function pathById(id) { return data.paths[id]; }
  function findBlessing(id) { for (var i=0;i<data.blessings.length;i++){ if (data.blessings[i].id===id) return data.blessings[i]; } return null; }
  function findCurio(id) { for (var i=0;i<data.curios.length;i++){ if (data.curios[i].id===id) return data.curios[i]; } return null; }

  function statusLabel() {
    if (game.status === 'completed') return { t: 'SELESAI', c: 'ok' };
    if (game.status === 'failed') return { t: 'GAGAL', c: 'bad' };
    return { t: 'AKTIF', c: 'run' };
  }
  function maxHp() { return game.getMaxHp(); }
  function hpPct() { var m = maxHp(); return Math.max(0, Math.min(100, (game.state.hp / m) * 100)); }
  function hpColor() { var p = hpPct(); return p > 50 ? '#7ee787' : p > 25 ? '#f0c040' : '#ff4d5a'; }

  function nodeMap() {
    return game.state.nodes.map(function (n) {
      var cleared = n.cleared, cur = n.position === game.state.nodeIndex + 1;
      var cls = 'ntile';
      var icon;
      if (cleared) { cls += ' nclear'; icon = '✓'; }
      else if (cur) { cls += ' ncur'; icon = n.type === 'battle' ? '⚔' : n.type === 'event' ? '◆' : n.type === 'treasure' ? '◆' : n.type === 'elite' ? 'E' : 'B'; }
      else if (n.type === 'boss') { cls += ' nboss'; icon = 'B'; }
      else if (n.type === 'elite') { cls += ' nelite'; icon = 'E'; }
      else { icon = '·'; }
      return '<div class="' + cls + '">' + icon + '</div>';
    }).join('');
  }

  function header() {
    var st = statusLabel();
    var pathName = game.state.path ? pathById(game.state.path).name : 'Belum dipilih';
    return '<div class="hd"><div class="tt">⌁ DIVERGENT UNIVERSE</div><div class="st ' + st.c + '">' + st.t + '</div></div>' +
      '<div class="chips"><span class="chip">' + esc(String(game.state.difficulty || '').toUpperCase()) + '</span><span class="chip">' + esc(pathName) + '</span></div>';
  }

  function hud() {
    var s = game.state, m = maxHp();
    return '<div class="hpwrap"><div class="hplab"><span>HP</span><span>' + s.hp + '/' + m + '</span></div>' +
      '<div class="hpbar"><div class="hpfill" style="width:' + hpPct() + '%;background:' + hpColor() + '"></div></div></div>' +
      '<div class="stats"><div class="stat"><b>' + fmt(s.fragments) + '</b><span>Fragment</span></div>' +
      '<div class="stat"><b>' + s.blessings.length + '</b><span>Blessing</span></div>' +
      '<div class="stat"><b>' + s.curios.length + '</b><span>Curio</span></div></div>' +
      '<div class="map">' + nodeMap() + '</div>';
  }

  function choiceCards(list) {
    return list.map(function (it, i) {
      var tag = it.path ? '<span class="tag">' + esc(pathById(it.path).name) + '</span>' : '';
      var err = it.error ? '<span class="err">ERROR</span>' : '';
      return '<button class="copt" onclick="duChoose(' + i + ')"><span class="cnum">' + (i + 1) + '</span>' +
        '<span class="ctext">' + esc(it.name) + tag + err + '<br><small>' + esc(it.text) + '</small></span></button>';
    }).join('');
  }

  function pendingView() {
    var p = game.state.pending;
    if (!p) return '';
    if (p.type === 'path') {
      return '<div class="sec">PILIH PATH</div>' + Object.keys(data.paths).map(function (id) {
        var pt = data.paths[id];
        return '<button class="popt" onclick="duPath(\'' + id + '\')"><b>' + esc(pt.name) + '</b><br><small>' + esc(pt.description) + '</small></button>';
      }).join('');
    }
    if (p.type === 'blessing') {
      return '<div class="sec">PILIH BLESSING</div>' + choiceCards(p.options.map(function (id) { return findBlessing(id); }).filter(Boolean));
    }
    if (p.type === 'curio') {
      return '<div class="sec">PILIH CURIO</div>' + choiceCards(p.options.map(function (id) { return findCurio(id); }).filter(Boolean));
    }
    if (p.type === 'event') {
      return '<div class="sec">EVENT: ' + esc(p.eventName) + '</div>' + choiceCards(p.options);
    }
    return '';
  }

  function finishView() {
    var s = game.state;
    var isWin = game.status === 'completed';
    var title = isWin ? '🏆 RUN SELESAI' : '💀 RUN GAGAL';
    var sub = s.lastResult ? esc(s.lastResult) : '';
    var reward = '';
    if (isWin) {
      var r = game.computeReward();
      reward = '<div class="reward">Reward: ' + fmt(r.cash) + ' cash • ' + fmt(r.exp) + ' EXP • ' + r.cerelia + ' Cerelia</div>';
    }
    var token = makeToken();
    var cmd = '.du finish ' + token;
    return '<div class="fin">' + title + '</div>' + reward + '<div class="lastr">' + sub + '</div>' +
      '<div class="toklab">Salin perintah lalu kirim ke bot:</div>' +
      '<div class="cmd" id="cmd" onclick="duCopy()">' + esc(cmd) + '</div>' +
      '<button class="copybtn" onclick="duCopy()">📋 SALIN PERINTAH</button>' +
      '<div class="hint">Setelah kirim, bot akan memvalidasi dan memberikan reward.</div>';
  }

  function exploreView() {
    var s = game.state;
    var last = s.lastResult ? '<div class="lastr">' + esc(s.lastResult) + '</div>' : '';
    var label = s.nodes[s.nodeIndex] ? 'EXPLORE NODE ' + (s.nodeIndex + 1) : 'EXPLORE';
    return last + '<button class="explore" onclick="duExplore()">⚔ ' + label + '</button>';
  }

  function render() {
    var content;
    if (game.status !== 'active') content = finishView();
    else if (game.state.pending) content = pendingView();
    else content = exploreView();
    document.getElementById('app').innerHTML = header() + hud() + '<div id="content">' + content + '</div>' +
      '<div class="foot">Main langsung di sini • hasil diverifikasi server</div>';
  }

  function makeToken() {
    var acts = game.actions.map(function (a) {
      if (a.t === 'path') return 'p:' + a.v;
      if (a.t === 'explore') return 'e';
      return 'c:' + a.v;
    });
    var payload = { v: 1, seed: seed, difficulty: game.state.difficulty, actions: acts };
    return btoa(JSON.stringify(payload));
  }

  window.duPath = function (id) {
    if (busy) return;
    try { game.actPath(id); } catch (e) { flash(e.message); }
    render();
  };
  window.duChoose = function (i) {
    if (busy) return;
    try { game.actChoose(i); } catch (e) { flash(e.message); }
    render();
  };
  window.duExplore = function () {
    if (busy) return;
    busy = true;
    var res;
    try { res = game.actExplore(); } catch (e) { busy = false; flash(e.message); render(); return; }
    var battle = res && res.battle && res.battle.length ? res.battle : null;
    if (!battle) { busy = false; render(); return; }
    playBattle(battle);
  };
  function playBattle(battle) {
    var idx = 0;
    var content = document.getElementById('content');
    content.innerHTML = '<div class="battle"><div class="btitle">⚔ BATTLE</div><div id="blog"></div></div>';
    var blog = document.getElementById('blog');
    var timer = setInterval(function () {
      if (idx >= battle.length) {
        clearInterval(timer);
        busy = false;
        render();
        return;
      }
      var r = battle[idx++];
      var line = '<div class="bline">Ronde ' + r.round + (r.crit ? ' • <b class="crit">CRIT</b>' : '') +
        (r.hit ? ' • -' + r.damage + ' HP' : ' • <b class="dodge">DODGE</b>') + ' • HP ' + r.hp + '</div>';
      blog.innerHTML += line;
    }, 220);
  }

  function flash(msg) {
    var t = document.createElement('div');
    t.className = 'flash';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }
  window.duCopy = function () {
    var el = document.getElementById('cmd');
    if (!el) return;
    var txt = el.textContent;
    function done() { flash('Perintah disalin. Kirim ke bot ya!'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(el, txt, done); });
    } else { fallbackCopy(el, txt, done); }
  };
  function fallbackCopy(el, txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { flash('Gagal menyalin. Tekan lama teks untuk salin.'); }
    ta.remove();
  }

  render();
})();
`;

function relayHtmlMessage(ctx, html, submessageText = 'Divergent Universe') {
  const responseId = randomUUID();
  const sections = [
    htmlLayout(html),
    suggestionPillsLayout(['.du status', '.du view', '.du abandon']),
  ];
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
            { messageType: 2, messageText: submessageText },
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

export function renderDuPlayHtml(run) {
  const data = du.getEngineData();
  const init = { ...run.state };
  delete init.seed;
  delete init.actions;
  const seed = run.state.seed;
  const payload = { seed, data, init };
  return `<!DOCTYPE html>
<html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0f0b;color:#e6e6e6;font-size:13px;line-height:1.45;padding:10px;overflow-x:hidden}
.wrap{max-width:360px;margin:0 auto;background:linear-gradient(160deg,#101710,#171f17);border-radius:16px;padding:14px;border:1px solid rgba(126,231,135,.15)}
.hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
.tt{font-size:16px;font-weight:800;color:#b7f7c0;letter-spacing:.3px}
.st{font-size:9px;font-weight:800;padding:3px 9px;border-radius:999px}
.st.ok{background:#123;color:#64b5f6}.st.bad{background:#331111;color:#ff4d5a}.st.run{background:#0f2a0f;color:#7ee787}
.chips{display:flex;gap:6px;margin-bottom:9px}
.chip{font-size:9px;font-weight:700;background:#1c261c;color:#9ee0a6;padding:3px 8px;border-radius:6px;border:1px solid rgba(126,231,135,.2)}
.hpwrap{margin-bottom:9px}
.hplab{display:flex;justify-content:space-between;font-size:9px;color:#9fd9a7;margin-bottom:3px}
.hpbar{height:12px;background:#111a11;border-radius:6px;overflow:hidden;border:1px solid rgba(126,231,135,.15)}
.hpfill{height:100%;border-radius:6px;transition:width .4s ease}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:9px}
.stat{background:#111a11;border:1px solid rgba(126,231,135,.12);border-radius:9px;padding:7px;text-align:center}
.stat b{display:block;font-size:15px;color:#fff}
.stat span{font-size:8px;color:#8fb896;text-transform:uppercase;letter-spacing:.5px}
.map{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin-bottom:10px}
.ntile{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;background:#0f140f;color:#4c5a4c;border:1px solid #1c261c}
.ntile.nclear{background:#0d2b0d;color:#7ee787;border-color:#2a6b2a}
.ntile.ncur{background:#1b3a6b;color:#fff;border-color:#64b5f6;box-shadow:0 0 6px rgba(100,181,246,.5)}
.ntile.nboss{background:#4a1111;color:#ff6b6b;border-color:#ff4d5a}
.ntile.nelite{background:#3d2811;color:#ffb36b;border-color:#f0a040}
.sec{font-size:10px;font-weight:800;color:#b7f7c0;margin:8px 0 6px;text-transform:uppercase;letter-spacing:.5px}
.lastr{background:#111a11;border:1px solid rgba(126,231,135,.12);border-radius:9px;padding:8px;font-size:10px;color:#cdebd2;white-space:pre-wrap;margin-bottom:8px}
.explore{width:100%;padding:14px;border:0;border-radius:11px;background:linear-gradient(135deg,#2f8f46,#3faf5b);color:#fff;font-size:14px;font-weight:800;box-shadow:0 3px 0 #1c522b, inset 0 1px 0 rgba(255,255,255,.15);margin-top:4px}
.explore:active{transform:translateY(2px);box-shadow:0 1px 0 #1c522b}
.popt,.copt{width:100%;text-align:left;padding:10px 12px;border:1px solid #2a372a;border-radius:10px;background:#111a11;color:#e6e6e6;font-size:11px;margin-bottom:6px}
.popt:active,.copt:active{background:#1a291a;transform:scale(.985)}
.popt b{color:#b7f7c0;font-size:12px}
.copt{display:flex;align-items:flex-start;gap:9px}
.cnum{font-size:13px;font-weight:800;color:#64b5f6;min-width:16px}
.ctext{font-size:11px;color:#d8eadb}
.ctext small{color:#8fb896}
.tag{font-size:8px;background:#123;color:#64b5f6;padding:1px 5px;border-radius:4px;margin-left:5px}
.err{font-size:8px;background:#331111;color:#ff4d5a;padding:1px 5px;border-radius:4px;margin-left:5px}
.battle{background:#0c120c;border:1px solid rgba(126,231,135,.2);border-radius:11px;padding:12px;min-height:120px}
.btitle{font-size:13px;font-weight:800;color:#b7f7c0;margin-bottom:8px;text-align:center}
.bline{font-size:10px;color:#d8eadb;padding:3px 0;border-bottom:1px dashed #1c261c}
.crit{color:#ffd166}.dodge{color:#64b5f6}
.fin{font-size:15px;font-weight:800;text-align:center;margin:6px 0 8px;color:#b7f7c0}
.reward{background:#0d2b0d;border:1px solid #2a6b2a;border-radius:9px;padding:9px;font-size:11px;font-weight:700;color:#7ee787;text-align:center;margin-bottom:8px}
.toklab{font-size:9px;color:#8fb896;margin:8px 0 4px}
.cmd{background:#0a0f0a;border:1px solid #2a372a;border-radius:8px;padding:9px;font-size:9px;color:#9fd9a7;word-break:break-all;font-family:monospace;margin-bottom:8px}
.copybtn{width:100%;padding:12px;border:0;border-radius:10px;background:linear-gradient(135deg,#1b6bb0,#2f8fd6);color:#fff;font-size:13px;font-weight:800;box-shadow:0 3px 0 #123a63}
.copybtn:active{transform:translateY(2px)}
.hint{font-size:8px;color:#7f9a84;text-align:center;margin-top:8px}
.foot{font-size:8px;color:#5d745f;text-align:center;margin-top:10px}
.flash{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#2a372a;color:#fff;font-size:11px;padding:8px 14px;border-radius:8px;z-index:99;box-shadow:0 4px 14px rgba(0,0,0,.4)}
</style>
<div class="wrap" id="app">Memuat...</div>
<script>${DU_ENGINE_SOURCE}</script>
<script>window.__DU__ = ${JSON.stringify(payload)};</script>
<script>${CLIENT_APP}</script>
</html>`;
}

export async function sendDuPlay(ctx, run) {
  const html = renderDuPlayHtml(run);
  return relayHtmlMessage(ctx, html, 'Divergent Universe - Main');
}