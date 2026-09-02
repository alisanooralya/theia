import { raidModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { userModel } from '#storage/models/index.js';
import { formatRaidClock, formatRaidSchedule } from '#features/rpg/raid.js';

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
  const status =
    participant?.status === 'stopped'
      ? 'Stopped'
      : participant?.status === 'breaktime'
        ? 'Breaktime'
        : isAttacking(participant?.jid)
          ? 'Attacking'
          : 'Active';

  return [
    '⚔️ *RAID STATUS*',
    '',
    `Boss: *${raid.boss_name}*`,
    `HP: ${bar(raid.boss_hp, raid.boss_max_hp, 15)} *${F.formatNumber(raid.boss_hp)} / ${F.formatNumber(raid.boss_max_hp)}*`,
    '',
    participant
      ? [
          `HP Kamu: ${bar(participant.hp, 2400, 10)} *${participant.hp}/2400*`,
          `Damage: *${F.formatNumber(participant.damage)}*`,
          `Status: *${status}*`,
        ].join('\n')
      : 'Kamu belum join.',
    '',
    `Participant: *${participants.length}*`,
    `Total Damage: *${F.formatNumber(totalDamage)}*`,
    `Sisa Waktu: *${formatTime(remaining)}*`,
    `Selesai: *${formatRaidSchedule(raid.end_at)}*`,
  ].join('\n');
}

function helpText() {
  return [
    '⚔️ *RAID*',
    '',
    'Raid Boss! Serang boss bareng-bareng!',
    '',
    '`.raid` - Lihat status raid',
    '`.raid join` - Join raid',
    '`.raid attack` - Mulai serang boss',
    '`.raid stop` - Berhenti menyerang',
    '`.raid claim` - Klaim reward (jika raid selesai)',
    '',
    '*Info:*',
    '- Raid dijadwalkan manual oleh Owner',
    '- HP kamu: 2400 (fixed)',
    '- Jika kalah, masuk Breaktime 1 jam',
    '- Reward berdasarkan kontribusi damage',
    '- Raid Coin bisa dipakai di Raid Shop',
  ].join('\n');
}

let raidService = null;
let isAttacking = () => false;

export default {
  name: 'raid',
  aliases: ['raids'],
  category: 'rpg',
  description: 'Raid Boss',
  cooldown: 5_000,
  groupOnly: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'status';

    try {
      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (!raidService) {
        const mod = await import('#features/rpg/raid.js');
        raidService = mod.raidService;
        isAttacking = (jid) => raidService.isAttacking(jid);
      }

      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply(helpText());
      }

      if (sub === 'join') {
        await raidService.join(ctx.sender);
        return ctx.reply(
          `✅ Berhasil join Raid!\nGunakan \`.raid attack\` untuk mulai menyerang boss.`
        );
      }

      if (sub === 'attack' || sub === 'serang') {
        await raidService.startAttackLoop(ctx.sender, ctx.sock, ctx.jid);
        return ctx.reply(
          '⚔️ Menyerang boss!\nKetik `.raid stop` untuk berhenti.'
        );
      }

      if (sub === 'stop') {
        await raidService.stop(ctx.sender);
        return ctx.reply(
          '🛑 Penyerangan dihentikan. HP akan recovery. Ketik `.raid attack` untuk lanjut.'
        );
      }

      if (sub === 'claim') {
        const result = await raidService.claimReward(ctx.sender);
        return ctx.reply(
          [
            '🎁 *RAID REWARD*',
            '',
            `Contribution: *${F.formatNumber(result.contribution)}*`,
            `🪙 +${F.formatNumber(result.cash)} Cash`,
            `⭐ +${result.exp} EXP`,
            `💠 +${result.raidCoin} Raid Coin`,
          ].join('\n')
        );
      }

      const raidData = await raidService.getRaidInfo();
      if (!raidData || !raidData.isLive) {
        const sched = await raidService.getScheduleInfo();
        if (sched.status === 'scheduled') {
          return ctx.reply(
            [
              '⚔️ *RAID*',
              '',
              'Belum ada raid aktif.',
              `Raid berikutnya: *${formatRaidSchedule(sched.startAt)}*`,
              `Selesai: *${formatRaidClock(sched.endAt)}*`,
              '',
              'Ketik `.raid help` untuk info.',
            ].join('\n')
          );
        }
        return ctx.reply(
          '⚔️ *RAID*\n\nTidak ada raid aktif dan belum ada jadwal.\nTunggu Owner menjadwalkan raid berikutnya.\n\nKetik `.raid help` untuk info.'
        );
      }

      const participant = await raidModel.getParticipant(
        raidData.raid.id,
        ctx.sender
      );
      return ctx.reply(statusText(raidData, participant));
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
