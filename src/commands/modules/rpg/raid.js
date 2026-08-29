import { raidService as raid } from '#features/rpg/raid.js';
import { raidModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { userModel } from '#storage/models/index.js';

function bar(value, max, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function formatTime(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}j ${minutes}m`;
}

function statusText(raidData, participant) {
  const { raid, participants, remaining } = raidData;
  const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0);
  const status = participant?.status === 'stopped' ? 'Stopped'
    : participant?.status === 'breaktime' ? 'Breaktime'
      : raidService.isAttacking(participant?.jid) ? 'Attacking'
        : 'Active';

  const endDate = new Date(raid.end_at);
  const timeStr = endDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dateStr = endDate.toLocaleDateString('id-ID', { weekday: 'long' });

  return [
    '⚔️ *RAID STATUS*',
    '',
    `Boss: *${raid.boss_name}*`,
    `HP: ${bar(raid.boss_hp, raid.boss_max_hp, 15)} *${F.formatNumber(raid.boss_hp)} / ${F.formatNumber(raid.boss_max_hp)}*`,
    '',
    participant ? [
      `HP Kamu: ${bar(participant.hp, 2400, 10)} *${participant.hp}/2400*`,
      `Damage: *${F.formatNumber(participant.damage)}*`,
      `Status: *${status}*`,
    ].join('\n') : 'Kamu belum join.',
    '',
    `Participant: *${participants.length}*`,
    `Total Damage: *${F.formatNumber(totalDamage)}*`,
    `Sisa Waktu: *${formatTime(remaining)}*`,
    `Selesai: *${dateStr} ${timeStr}*`,
  ].join('\n');
}

function helpText() {
  return [
    '⚔️ *RAID*',
    '',
    'Raid Boss mingguan! Serang boss bareng-bareng!',
    '',
    '`.raid` - Lihat status raid',
    '`.raid join` - Join raid',
    '`.raid attack` - Mulai serang boss (looping tiap 30 detik)',
    '`.raid stop` - Berhenti menyerang',
    '`.raid resume` - Lanjut menyerang',
    '`.raid claim` - Klaim reward (jika raid selesai)',
    '`.raid coin` - Lihat Raid Coin kamu',
    '',
    '*Info:*',
    '- Raid aktif setiap Minggu',
    '- HP kamu: 2400 (fixed)',
    '- Attack looping tiap 30 detik sampai HP habis atau stop',
    '- Jika kalah, masuk Breaktime 1 jam',
    '- Reward berdasarkan kontribusi damage',
    '- Raid Coin bisa dipakai di Raid Shop',
  ].join('\n');
}

let raidService = null;

export default {
  name: 'raid',
  aliases: ['raids'],
  category: 'rpg',
  description: 'Raid Boss mingguan',
  cooldown: 3_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'status';

    try {
      userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (!raidService) {
        const mod = await import('#features/rpg/raid.js');
        raidService = mod.raidService;
      }

      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply(helpText());
      }

      if (sub === 'coin') {
        const coins = raidService.getRaidCoin(ctx.sender);
        return ctx.reply(`💠 *Raid Coin:* ${coins}`);
      }

      if (sub === 'join') {
        const { raid: raidData, participant } = raidService.join(ctx.sender);
        return ctx.reply(`✅ Berhasil join Raid!\nGunakan \`.raid attack\` untuk mulai menyerang boss.`);
      }

      if (sub === 'attack' || sub === 'serang') {
        raidService.startAttackLoop(ctx.sender, ctx.sock, ctx.jid);
        return ctx.reply('⚔️ Menyerang boss! Damage akan muncul tiap 30 detik.\nKetik `.raid stop` untuk berhenti.');
      }

      if (sub === 'stop') {
        raidService.stop(ctx.sender);
        return ctx.reply('🛑 Penyerangan dihentikan. HP akan recovery. Ketik `.raid attack` untuk lanjut.');
      }

      if (sub === 'resume') {
        raidService.resume(ctx.sender);
        return ctx.reply('⚔️ Raid dilanjutkan! Ketik `.raid attack` untuk mulai menyerang.');
      }

      if (sub === 'claim') {
        const result = raidService.claimReward(ctx.sender);
        return ctx.reply([
          '🎁 *RAID REWARD*',
          '',
          `Contribution: *${F.formatNumber(result.contribution)}*`,
          `🪙 +${F.formatNumber(result.cash)} Cash`,
          `⭐ +${result.exp} EXP`,
          `💠 +${result.raidCoin} Raid Coin`,
        ].join('\n'));
      }

      const raidData = raidService.getRaidInfo();
      if (!raidData || !raidData.isLive) {
        return ctx.reply(`⚔️ *RAID*\n\nTidak ada raid aktif.\nRaid berikutnya: *Minggu 00:00*\n\nKetik \`.raid help\` untuk info.`);
      }

      const participant = raidModel.getParticipant(raidData.raid.id, ctx.sender);
      return ctx.reply(statusText(raidData, participant));
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
