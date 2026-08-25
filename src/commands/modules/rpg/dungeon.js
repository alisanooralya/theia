import { dungeonService } from '#features/combat/dungeon.js';
import { statsModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const HP_LEN = 8;
const bar = (cur, max) => {
  const f = Math.round((cur / max) * HP_LEN);
  return '█'.repeat(f) + '░'.repeat(HP_LEN - f);
};

function nodeProgress(run) {
  if (!run) return '';
  const filled = Math.max(
    0,
    Math.min(run.total_nodes, Math.round((run.current_node / run.total_nodes) * 10))
  );
  return `🗺️ *Node ${run.current_node}/${run.total_nodes}* [${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]`;
}

function renderBlessingOptions(optionIds) {
  let text = '✨ *Pilih Blessing:*\n\n';
  optionIds.forEach((id, i) => {
    const b = dungeonService.getBlessingInfo(id);
    text += `${i + 1}. ${b.emoji} *${b.name}* — ${b.desc}\n`;
  });
  text += '\n_Ketik `!dungeon choose <angka>`_';
  return text;
}

function renderCombat(result) {
  const { monster, rounds, won, finalHp, rewardCash, rewardExp, drop, revived, cleared, nodeType, pendingChoice, run } = result;

  const shown = rounds.slice(0, 2);
  const roundLog = shown
    .map((r, i) => {
      const p = r.events.find((e) => e.by === 'player');
      const m = r.events.find((e) => e.by === 'monster');
      return `  R${i + 1}: ⚔️${F.formatNumber(p?.dmg ?? 0)}${p?.crit ? '💥' : ''} 💢${F.formatNumber(m?.dmg ?? 0)} ❤️${r.pHp}👾${r.mHp}`;
    })
    .join('\n');
  const moreRounds = rounds.length - shown.length;

  const label = nodeType === 'boss' ? 'BOSS' : nodeType === 'elite' ? 'ELITE' : 'COMBAT';
  let text = `${nodeProgress(run)}\n\n${monster.emoji} *${label} — ${monster.name}*\n${roundLog}${moreRounds > 0 ? `\n  _...${moreRounds} ronde lagi..._` : ''}\n\n`;

  if (won) {
    text += cleared ? '🏆🎉 *BOSS TUMBANG! DUNGEON CLEAR!*' : '🏆 *MENANG!*';
    text += `\n❤️ HP: [${bar(finalHp, statsModel.find(result.run?.jid)?.max_hp ?? finalHp)}] ${finalHp}`;
    text += `\n\n🎁 *Reward:*\n  🪙 +${F.formatNumber(rewardCash)}\n  ⭐ +${rewardExp} EXP`;
    if (drop) text += `\n  📦 Drop: *${drop}*`;

    if (cleared) {
      text += `\n\n✨ *Total run:* 🪙 ${F.formatNumber(run.total_cash)} · ⭐ ${run.total_exp} EXP`;
      text += '\n_Ketik `!dungeon start` untuk mulai run baru._';
    } else if (pendingChoice) {
      text += `\n\n${renderBlessingOptions(pendingChoice.optionIds)}`;
    }
  } else if (revived) {
    text += `💫 *Lonceng Bertahan berbunyi...* kamu selamat di ${finalHp} HP!\n_Node ini gagal, tidak ada reward. Ketik \`!dungeon\` untuk lanjut ke node berikutnya._`;
  } else {
    text += `💀 *KALAH! Run berakhir.*\n❤️ HP: ${finalHp}\n⭐ EXP konsolasi sudah masuk.\n\n_Reward yang sudah kamu kumpulkan sepanjang run tetap aman. Ketik \`!dungeon start\` untuk mulai run baru._`;
  }
  return text;
}

function renderTreasure(result) {
  const { cash, curioId, run } = result;
  let text = `${nodeProgress(run)}\n\n📦 *Treasure!*\n\n🪙 +${F.formatNumber(cash)}`;
  if (curioId) {
    const c = dungeonService.getCurioInfo(curioId);
    text += `\n🔮 Curio baru: *${c.name}* — ${c.desc}`;
  }
  text += '\n\n_Ketik `!dungeon` untuk lanjut ke node berikutnya._';
  return text;
}

function renderAwaitingChoice(result) {
  const { pendingChoice, run } = result;

  if (pendingChoice.kind === 'blessing') return `${nodeProgress(run)}\n\n${renderBlessingOptions(pendingChoice.optionIds)}`;

  let text = `${nodeProgress(run)}\n\n${pendingChoice.text}\n\n`;
  pendingChoice.options.forEach((label, i) => {
    text += `${i + 1}. ${label}\n`;
  });
  text += '\n_Ketik `!dungeon choose <angka>`_';
  return text;
}

function renderBlessingPicked(result) {
  const { picked, run } = result;
  return `${nodeProgress(run)}\n\n${picked.emoji} Kamu memilih *${picked.name}*!\n_${picked.desc}_\n\nKetik \`!dungeon\` untuk lanjut ke node berikutnya.`;
}

function renderRestPicked(result) {
  const { picked, grantedBlessingId, run } = result;
  if (picked.type === 'heal') {
    return `${nodeProgress(run)}\n\n💤 Kamu beristirahat, HP kamu pulih!\n\nKetik \`!dungeon\` untuk lanjut ke node berikutnya.`;
  }
  const b = dungeonService.getBlessingInfo(grantedBlessingId);
  return `${nodeProgress(run)}\n\n🧘 Meditasi selesai. Kamu mendapat blessing ${b.emoji} *${b.name}* — ${b.desc}\n\nKetik \`!dungeon\` untuk lanjut ke node berikutnya.`;
}

function renderEventResolved(result) {
  const { outcome, fightResult, defeated, run } = result;
  let text = `${nodeProgress(run)}\n\n${outcome.text ?? ''}`;

  if (outcome.cashDelta) text += `\n🪙 +${F.formatNumber(outcome.cashDelta)}`;
  if (outcome.expDelta) text += `\n⭐ +${outcome.expDelta} EXP`;
  if (outcome.hpDeltaPct) text += `\n❤️ HP ${outcome.hpDeltaPct > 0 ? '+' : ''}${Math.round(outcome.hpDeltaPct * 100)}%`;
  if (outcome.blessingRandom || outcome.blessingId) text += '\n✨ Dapat blessing baru!';
  if (outcome.curioRandom || outcome.curioId) text += '\n🔮 Dapat curio baru!';

  if (fightResult) {
    text += `\n\n${renderCombat(fightResult)}`;
  } else if (defeated) {
    text += '\n\n💀 *Run berakhir!* Reward yang sudah kamu dapat sepanjang run tetap aman.\n_Ketik `!dungeon start` untuk mulai run baru._';
  } else {
    text += '\n\n_Ketik `!dungeon` untuk lanjut ke node berikutnya._';
  }
  return text;
}

function renderResult(result) {
  if (result.monster) return renderCombat(result);
  if (result.nodeType === 'treasure') return renderTreasure(result);
  if (result.awaitingChoice) return renderAwaitingChoice(result);
  if (result.kind === 'blessing') return renderBlessingPicked(result);
  if (result.kind === 'rest') return renderRestPicked(result);
  if (result.kind === 'event') return renderEventResolved(result);
  return '✅ Berhasil.';
}

export default {
  name: 'dungeon',
  aliases: ['dg', 'explore', 'pve'],
  category: 'rpg',
  description: 'Masuki dungeon run (mini roguelike) dan lawan monster PvE',
  cooldown: 5_000,
  isProblem: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'monsters' || sub === 'list') {
      const monsters = dungeonService.getMonsters();
      let text = '👾 *Daftar Monster*\n\n';
      monsters.forEach((m) => {
        text += `${m.emoji} *${m.name}* _(${m.rarity})_\n  ❤️${m.hp} ⚔️${m.atk} 🛡️${m.def}\n  💰 ${F.formatNumber(m.reward[0])}–${F.formatNumber(m.reward[1])} · ⭐${m.exp} EXP\n`;
      });
      return ctx.reply(text.trimEnd());
    }

    if (sub === 'quick') return this._handleQuick(ctx);
    if (sub === 'start') return this._handleStart(ctx);
    if (sub === 'abandon' || sub === 'cancel') return this._handleAbandon(ctx);
    if (sub === 'choose' || sub === 'pilih') return this._handleChoose(ctx);

    return this._handleAdvance(ctx);
  },

  async _handleStart(ctx) {
    await ctx.react('🗺️');
    try {
      const result = dungeonService.startRun(ctx.sender);
      await ctx.reply(`🗺️ *Dungeon run dimulai!*\n\n${renderResult(result)}`);
      await ctx.react(result.won === false && !result.revived ? '💀' : '✅');
    } catch (err) {
      await ctx.react('❌');
      await ctx.reply(`❌ ${err.message}`);
    }
  },

  async _handleAdvance(ctx) {
    await ctx.typing();
    try {
      const result = dungeonService.advance(ctx.sender);
      await ctx.reply(renderResult(result));
      if (result.monster) await ctx.react(result.won ? (result.cleared ? '🏆' : '✅') : (result.revived ? '💫' : '💀'));
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },

  async _handleChoose(ctx) {
    const idxRaw = ctx.args[1];
    const idx = parseInt(idxRaw, 10) - 1;
    if (Number.isNaN(idx) || idx < 0) {
      return ctx.reply('❌ Format salah. Contoh: `!dungeon choose 1`');
    }
    try {
      const result = dungeonService.chooseOption(ctx.sender, idx);
      await ctx.reply(renderResult(result));
      if (result.fightResult) {
        await ctx.react(result.fightResult.won ? '✅' : '💀');
      }
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },

  async _handleAbandon(ctx) {
    try {
      const run = dungeonService.abandonRun(ctx.sender);
      await ctx.reply(`🏳️ Dungeon run dibatalkan.\n\n✨ Total yang tersimpan: 🪙 ${F.formatNumber(run.total_cash)} · ⭐ ${run.total_exp} EXP\n_Ketik \`!dungeon start\` kapan saja untuk mulai run baru._`);
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },

  // Mode fight cepat lama (1x battle, tanpa node/blessing) — tetap dipertahankan untuk yang mau main santai.
  async _handleQuick(ctx) {
    const pStats = statsModel.ensure(ctx.sender);
    if (pStats.hp <= 0) return ctx.reply('❤️ HP kamu 0! Pakai `!heal` dulu.');

    await ctx.react('⚔️');
    await ctx.typing();

    try {
      const result = dungeonService.explore(ctx.sender);
      const { monster, rounds, won, rewardCash, rewardExp, drop, finalHp } = result;

      const roundLog = rounds
        .slice(0, 4)
        .map((r) => {
          const p = r.events.find((e) => e.by === 'player');
          const m = r.events.find((e) => e.by === 'monster');
          return [
            p && `  ⚔️ Kamu hit *${F.formatNumber(p.dmg)}*`,
            m && `  💢 ${monster.emoji} hit *${F.formatNumber(m.dmg)}*`,
            `  ❤️ ${r.pHp} vs 👾 ${r.mHp}`,
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n');

      const newStats = statsModel.find(ctx.sender);
      const hpBar = bar(finalHp, newStats?.max_hp ?? 100);

      let text = `${monster.emoji} *DUNGEON — ${monster.name}*\n\n${roundLog}${rounds.length > 4 ? `\n  _...${rounds.length - 4} ronde lagi..._` : ''}\n\n${won ? '🏆 *MENANG!*' : '💀 *KALAH!*'}\n❤️ HP: [${hpBar}] ${finalHp}`;
      if (won) {
        text += `\n\n🎁 *Reward:*\n  🪙 +${F.formatNumber(rewardCash)}\n  ⭐ +${rewardExp} EXP`;
        if (drop) text += `\n  📦 Drop: *${drop}*`;
      } else {
        text += `\n⭐ +${rewardExp} EXP (consolation)`;
      }

      await ctx.reply(text);
      await ctx.react(won ? '✅' : '💀');
    } catch (err) {
      await ctx.react('❌');
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
