import {
  raidService,
  formatRaidClock,
  formatRaidSchedule,
} from '#features/rpg/raid.js';

const USAGE = [
  '⚔️ *RAID START*',
  '',
  'Usage: `.raidstart <jam_mulai> <jam_selesai>`',
  'Contoh: `.raidstart 19:00 22:00`',
  '',
  'Format waktu `HH:MM` (24 jam).',
  '`.raidstart info` - Lihat jadwal aktif',
  '`.raidstart cancel` - Batalkan jadwal',
].join('\n');

export default {
  name: 'raidstart',
  aliases: ['raidschedule'],
  category: 'owner',
  description: 'Jadwalkan raid secara manual',
  cooldown: 0,
  ownerOnly: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    try {
      if (sub === 'cancel' || sub === 'batal') {
        const cancelled = await raidService.cancelScheduledRaid();
        if (!cancelled) {
          return ctx.reply('Tidak ada raid dengan status *scheduled*.');
        }
        return ctx.reply(
          `🗑️ Jadwal raid ${formatRaidSchedule(cancelled.start_at)} dibatalkan.`
        );
      }

      if (sub === 'info' || sub === 'status') {
        const sched = await raidService.getScheduleInfo();
        if (sched.status === 'none') {
          return ctx.reply('Tidak ada raid *scheduled* maupun *active*.');
        }
        return ctx.reply(
          [
            '⚔️ *RAID SCHEDULE*',
            '',
            `Status : *${sched.status}*`,
            `🕐 Start : ${formatRaidSchedule(sched.startAt)}`,
            `🕚 End   : ${formatRaidSchedule(sched.endAt)}`,
          ].join('\n')
        );
      }

      if (ctx.args.length < 2) {
        return ctx.reply(USAGE);
      }

      const raid = await raidService.scheduleRaid(ctx.args[0], ctx.args[1]);

      return ctx.reply(
        [
          '⚔️ *RAID SCHEDULED!*',
          '',
          `🕐 Start : ${formatRaidClock(raid.start_at)}`,
          `🕚 End   : ${formatRaidClock(raid.end_at)}`,
          '',
          `Tanggal: *${formatRaidSchedule(raid.start_at)}*`,
          '',
          'Raid akan dimulai otomatis pada',
          'waktu yang telah ditentukan.',
        ].join('\n')
      );
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
