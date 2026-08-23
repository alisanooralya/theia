import { questModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'
import SETTINGS from '#environment/settings.js'

export default {
  name: 'quests',
  aliases: ['quest', 'qlist'],
  category: 'economy',
  description: 'Lihat daftar quest & reward',
  cooldown: 3000,
  async execute(ctx) {
    const quests = questModel.allQuests()
    if (!quests.length) return ctx.reply('Belum ada quest. Hubungi owner untuk seed.')
    const progress = questModel.getAllProgress(ctx.sender)
    const progMap = new Map(progress.map(p => [p.quest_id, p]))
    const typeLabel = { daily: 'Harian', weekly: 'Mingguan', story: 'Story' }
    const lines = quests.slice(0, 5).map(q => {
      const p = progMap.get(q.id)
      const cur = p ? `${p.progress}/${q.goal}` : `0/${q.goal}`
      const done = p?.completed ? '✅' : '⏳'
      return `${done} *${q.name}* \`${q.id}\`\n  ${q.description} (${cur}) · ${typeLabel[q.type] ?? q.type} · 🎁 ${F.formatNumber(q.reward_cash)}`
    })
    await ctx.reply(
      `*Daftar Quest*\n\n${lines.join('\n\n')}\n\n` +
      `Ketik \`${SETTINGS.prefix}mission claim <id>\` untuk klaim reward.`
    )
  },
}
