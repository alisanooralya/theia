import { F } from '#helpers/index.js';
import { orbitalService } from '#features/rpg/services/orbital-service.js';

function signalLine(state) {
  const base = `📡 Signal: ${state.signal}/${state.signalMax}`;
  if (state.signal >= state.signalMax) return `${base} (penuh)`;
  return `${base}\n⏳ Next Signal: ${F.formatDuration(state.nextSignalInMs)}`;
}

function statusView(state) {
  const lines = ['🛗 *ORBITAL LIFT*', ''];
  if (state.done) {
    lines.push('🏆 Semua floor selesai! Tunggu season berikutnya.');
  } else {
    lines.push(
      `🚪 Floor saat ini: *${state.floor}*${state.boss ? ' 👹 *BOSS*' : ''}`,
      `👾 Musuh: *${state.enemy.name}* (HP ${F.formatNumber(state.enemy.stats.maxHp)} • ATK ${state.enemy.stats.atk} • DEF ${state.enemy.stats.def})`,
      `🎟️ Cost: ${state.cost} Signal`,
      signalLine(state),
      '',
      'Masuk: `.orbital enter`'
    );
  }
  return lines.join('\n');
}

export default {
  name: 'orbital',
  aliases: ['orbit'],
  category: 'rpg',
  description: 'Naiki Orbital Lift floor demi floor',
  cooldown: 5_000,

  async execute(ctx) {
    const [subRaw] = ctx.args ?? [];
    const sub = (subRaw ?? '').toLowerCase();
    try {
      if (sub === 'enter') {
        const result = await orbitalService.enter(ctx.sender);
        if (!result.won) {
          return ctx.reply(
            [
              `💀 Kalah di Floor *${result.floor}*.`,
              `Sisa HP: ${F.formatNumber(Math.max(0, result.playerHp))}`,
            ].join('\n')
          );
        }
        const lines = [
          `✅ Floor *${result.floor}* clear!`,
          `🚪 Lanjut ke Floor *${result.newFloor}*`,
          '',
          '🎁 Reward',
          `🪙 +${F.formatNumber(result.rewards.coin)} Coin`,
          `⭐ +${result.rewards.exp} EXP`,
          `🧪 +${result.rewards.cerelia} Cerelia`,
        ];
        return ctx.reply(lines.join('\n'));
      }
      if (sub && sub !== 'status') {
        return ctx.fail('Pakai: `.orbital`, `.orbital` enter');
      }
      const state = await orbitalService.status(ctx.sender);
      return ctx.reply(statusView(state));
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
