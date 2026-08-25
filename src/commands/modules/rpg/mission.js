import { questModel, userModel } from '#storage/models/index.js';

export default {
  name: 'mission',
  aliases: ['mission', 'misi', 'tugas'],
  category: 'rpg',
  description: 'Lihat progres quest & klaim reward',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    if (sub === 'claim' && ctx.args[1]) {
      const questId = ctx.args[1];
      const progress = questModel.getProgress(ctx.sender, questId);
      if (!progress)
        return ctx.reply('Quest tidak ditemukan atau belum dimulai.');
      if (!progress.completed) return ctx.reply('Quest belum selesai.');
      if (progress.claimed) return ctx.reply('Quest sudah di-claim!');

      questModel.claim(ctx.sender, questId);
      const quest = questModel.findQuest(questId);
      if (quest.rewardCash > 0 || quest.rewardExp > 0) {
        const { walletModel } = await import('#storage/models/index.js');
        if (quest.rewardCash > 0)
          walletModel.reward(ctx.sender, quest.rewardCash, `quest: ${questId}`);
        if (quest.rewardExp > 0) userModel.addExp(ctx.sender, quest.rewardExp);
      }
      return ctx.reply(
        `✅ Quest *${quest?.name || questId}* selesai! Reward sudah diklaim.`
      );
    }

    const allProgress = questModel.getAllProgress(ctx.sender);
    if (!allProgress.length) return ctx.reply('📋 Belum ada quest.');

    let text = '📋 *Quest Progress*\n\n';
    let shown = 0;
    for (const q of allProgress) {
      if (q.claimed) continue;
      shown++;
      const badge = q.completed ? '⭐' : '📌';
      const progressBar =
        '█'.repeat(Math.round((q.progress / q.goal) * 10)) +
        '░'.repeat(10 - Math.round((q.progress / q.goal) * 10));
      text += `${badge} *${q.name}*\n  ${progressBar} ${q.progress}/${q.goal}\n  _${q.description}_\n\n`;
    }

    if (!shown)
      return ctx.reply(
        '🎉 Semua quest sudah diklaim! Cek lagi setelah reset harian/mingguan.'
      );

    await ctx.reply(
      `${text.trimEnd()}\n\nKetik \`!mission claim <id>\` untuk klaim reward.`
    );
  },
};
