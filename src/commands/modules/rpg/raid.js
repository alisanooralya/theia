import { raidService as raid } from '#features/rpg/raid.js';
import { raidModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { userModel } from '#storage/models/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const { raid, participants, remaining, isLive } = raidData;
  const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0);
  const status = participant?.status === 'stopped' ? 'Stopped'
    : participant?.status === 'breaktime' ? 'Breaktime'
      : 'Active';

  const nextSunday = new Date(Date.now() + remaining);
  const timeStr = nextSunday.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

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
    `Selesai: *${timeStr}*`,
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
    '`.raid attack` - Serang boss',
    '`.raid stop` - Berhenti menyerang (HP recovery)',
    '`.raid resume` - Lanjut menyerang',
    '`.raid claim` - Klaim reward (jika raid selesai)',
    '`.raid coin` - Lihat Raid Coin kamu',
    '',
    '*Info:*',
    '- Raid aktif setiap Minggu',
    '- HP kamu: 2400 (fixed)',
    '- Jika kalah, masuk Breaktime 1 jam',
    '- Reward berdasarkan kontribusi damage',
    '- Raid Coin bisa dipakai di Raid Shop',
  ].join('\n');
}

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

      if (sub === 'help') {
        return ctx.reply(helpText());
      }

      if (sub === 'coin') {
        const coins = raid.getRaidCoin(ctx.sender);
        return ctx.reply(`💠 *Raid Coin:* ${coins}`);
      }

      if (sub === 'join') {
        const { raid: raidData, participant } = raid.join(ctx.sender);
        return ctx.reply(`✅ Berhasil join Raid!\nGunakan \`.raid attack\` untuk menyerang boss.`);
      }

      if (sub === 'attack') {
        const result = raid.attack(ctx.sender);
        const lines = [
          '⚔️ *ATTACK RESULT*',
          '',
          `Damage: *${F.formatNumber(result.damage)}*${result.rounds[0]?.crit ? ' (CRIT!)' : ''}`,
          `HP Kamu: *${result.userHp}/2400*`,
          `Boss HP: *${F.formatNumber(result.bossHp)} / ${F.formatNumber(500000)}*`,
          `Total Damage: *${F.formatNumber(result.totalDamage)}*`,
        ];

        if (result.userDied) {
          lines.push('', '💔 HP habis! Masuk Breaktime 1 jam...');
        }
        if (result.bossDied) {
          lines.push('', '🎉 *RAID BOSS MATI! raid Selesai!*');
        }

        return ctx.reply(lines.join('\n'));
      }

      if (sub === 'stop') {
        raid.stop(ctx.sender);
        return ctx.reply('🛑 Raid dihentikan. HP akan recovery. Ketik `.raid resume` untuk lanjut.');
      }

      if (sub === 'resume') {
        raid.resume(ctx.sender);
        return ctx.reply('⚔️ Raid dilanjutkan! Ketik `.raid attack` untuk menyerang.');
      }

      if (sub === 'claim') {
        const result = raid.claimReward(ctx.sender);
        return ctx.reply([
          '🎁 *RAID REWARD*',
          '',
          `Contribution: *${F.formatNumber(result.contribution)}*`,
          `🪙 +${F.formatNumber(result.cash)} Cash`,
          `⭐ +${result.exp} EXP`,
          `💠 +${result.raidCoin} Raid Coin`,
        ].join('\n'));
      }

      const raidData = raid.getRaidInfo();
      if (!raidData || !raidData.isLive) {
        const now = new Date();
        const day = now.getDay();
        const diff = day === 0 ? 7 : 7 - day;
        const nextSunday = new Date(now);
        nextSunday.setDate(now.getDate() + diff);
        nextSunday.setHours(0, 0, 0, 0);
        const timeStr = nextSunday.toLocaleDateString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
        return ctx.reply(`⚔️ *RAID*\n\nTidak ada raid aktif.\nRaid berikutnya: *${timeStr}*\n\nKetik \`.raid help\` untuk info.`);
      }

      const participant = raidModel.getParticipant(raidData.raid.id, ctx.sender);
      return ctx.reply(statusText(raidData, participant));
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
