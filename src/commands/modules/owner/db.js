import { raidModel } from '#storage/models/index.js';
import { raidService as raid } from '#features/rpg/raid.js';
import { db } from '#storage/connection.js';
import { F } from '#helpers/index.js';

export default {
  name: 'db',
  aliases: ['database', 'db'],
  category: 'owner',
  description: 'Database tools untuk testing',
  ownerOnly: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    try {
      if (sub === 'raid') {
        const action = ctx.args[1]?.toLowerCase();

        if (action === 'create' || action === 'start') {
          const newRaid = raid.startRaid();
          return ctx.reply(`✅ Raid dibuat!\nID: ${newRaid.id}\nBoss: ${newRaid.boss_name}\nHP: ${F.formatNumber(newRaid.boss_hp)}`);
        }

        if (action === 'status') {
          const active = raidModel.getActive();
          if (!active) return ctx.reply('❌ Tidak ada raid aktif.');
          const participants = raidModel.getParticipants(active.id);
          const totalDmg = participants.reduce((s, p) => s + p.damage, 0);
          return ctx.reply([
            `⚔️ *RAID #${active.id}*`,
            `Status: ${active.status}`,
            `Boss: ${active.boss_name}`,
            `HP: ${F.formatNumber(active.boss_hp)} / ${F.formatNumber(active.boss_max_hp)}`,
            `Participants: ${participants.length}`,
            `Total Damage: ${F.formatNumber(totalDmg)}`,
            `Start: ${new Date(active.start_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
            `End: ${new Date(active.end_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
          ].join('\n'));
        }

        if (action === 'end' || action === 'stop') {
          const ended = await raid.endRaid(ctx.sock, ctx.jid);
          if (!ended) return ctx.reply('❌ Tidak ada raid aktif.');
          return ctx.reply(`✅ Raid #${ended.id} diakhiri.`);
        }

        if (action === 'reset') {
          db.prepare("UPDATE raids SET status = 'ended' WHERE status = 'active'").run();
          return ctx.reply('✅ Semua active raid diakhiri.');
        }

        if (action === 'hp' && ctx.args[2]) {
          const hp = parseInt(ctx.args[2]);
          if (!hp || hp < 1) return ctx.reply('❌ HP tidak valid.');
          const active = raidModel.getActive();
          if (!active) return ctx.reply('❌ Tidak ada raid aktif.');
          raidModel.updateBoss(active.id, hp, active.status);
          return ctx.reply(`✅ Boss HP diubah ke ${F.formatNumber(hp)}`);
        }

        if (action === ' participants') {
          const active = raidModel.getActive();
          if (!active) return ctx.reply('❌ Tidak ada raid aktif.');
          const list = raidModel.getParticipants(active.id);
          if (!list.length) return ctx.reply('Tidak ada participant.');
          const lines = list.map((p, i) => `${i + 1}. ${p.jid.split('@')[0]} - DMG: ${F.formatNumber(p.damage)} - HP: ${p.hp}/2400 - ${p.status}`);
          return ctx.reply(lines.join('\n'));
        }

        if (action === 'clear') {
          db.prepare("DELETE FROM raid_participants").run();
          db.prepare("DELETE FROM raids").run();
          return ctx.reply('✅ Semua raid data dihapus.');
        }

        return ctx.reply([
          '⚔️ *DB RAID TOOLS*',
          '',
          '`!db raid create` - Buat raid baru',
          '`!db raid status` - Lihat status raid',
          '`!db raid end` - Akhiri raid',
          '`!db raid reset` - Akhiri semua active raid',
          '`!db raid hp <jumlah>` - Set boss HP',
          '`!db raid participants` - Lihat participant',
          '`!db raid clear` - Hapus semua raid data',
        ].join('\n'));
      }

      if (sub === 'raidcoin') {
        const target = ctx.args[1];
        const amount = parseInt(ctx.args[2]);
        if (!target || !amount) {
          return ctx.reply('Usage: `!db raidcoin @user <jumlah>`');
        }
        const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;
        raidModel.addRaidCoin(jid, amount);
        const current = raidModel.getRaidCoin(jid);
        return ctx.reply(`✅ +${amount} Raid Coin ke ${jid.split('@')[0]}\nTotal: ${current}`);
      }

      return ctx.reply([
        '🛠️ *DATABASE TOOLS*',
        '',
        '`!db raid` - Raid tools',
        '`!db raidcoin @user <jumlah>` - Tambah Raid Coin',
      ].join('\n'));

    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
