/**
 * Owner tools — safe whitelist ONLY.
 *
 * Forbidden for the AI Agent: eval, shell execution, raw SQL, filesystem access.
 * Every tool is double-gated:
 *   1. `permission: 'owner'` in the registry (checked by the agent loop), and
 *   2. server-side `assertOwner(ctx)` inside execute() (defense in depth).
 */
import { db } from '#storage/connection.js'
import { userModel } from '#storage/models/index.js'
import { phoneToJid } from '#helpers/identifier.js'
import { F } from '#helpers/index.js'

function assertOwner(ctx) {
  if (!ctx?.isOwner) throw new Error('Akses ditolak: hanya owner bot yang dapat menggunakan tool ini.')
}

const startedAt = Date.now()

export const ownerTools = [
  {
    name: 'owner_get_stats',
    description: 'Lihat statistik database bot (jumlah user, group, premium, banned, transaksi, dll).',
    permission: 'owner',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      assertOwner(ctx)
      const counts = {
        users: db.prepare('SELECT COUNT(*) as c FROM users').get()?.c ?? 0,
        groups: db.prepare('SELECT COUNT(*) as c FROM groups').get()?.c ?? 0,
        premium: db.prepare('SELECT COUNT(*) as c FROM users WHERE premium = 1').get()?.c ?? 0,
        banned: db.prepare('SELECT COUNT(*) as c FROM users WHERE banned = 1').get()?.c ?? 0,
        transactions: db.prepare('SELECT COUNT(*) as c FROM transactions').get()?.c ?? 0,
        items: db.prepare('SELECT COUNT(*) as c FROM items').get()?.c ?? 0,
        quests: db.prepare('SELECT COUNT(*) as c FROM quests').get()?.c ?? 0,
      }
      return { success: true, data: counts }
    },
  },
  {
    name: 'owner_set_premium',
    description: 'Berikan atau cabut status premium untuk nomor WhatsApp tertentu (khusus owner).',
    permission: 'owner',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Nomor WhatsApp target, contoh: 6281234567890' },
        action: { type: 'string', enum: ['add', 'remove'], description: 'add = berikan premium, remove = cabut premium' },
        days: { type: 'number', description: 'Durasi premium dalam hari (default 30, hanya untuk action=add)' },
      },
      required: ['phone', 'action'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      assertOwner(ctx)
      const phone = String(args.phone ?? '').replace(/\D/g, '')
      if (!phone || phone.length < 8 || phone.length > 15) {
        return { success: false, error: 'Nomor target tidak valid.' }
      }
      const targetJid = phoneToJid(phone)
      if (args.action === 'remove') {
        userModel.removePremium(targetJid)
        return { success: true, message: `Premium ${phone} dicabut.`, data: { phone, action: 'remove' } }
      }
      if (args.action === 'add') {
        const days = Math.max(1, Math.floor(Number(args.days) || 30))
        userModel.ensure(targetJid)
        userModel.setPremium(targetJid, days * 24 * 60 * 60 * 1000)
        return { success: true, message: `Premium ${phone} aktif selama ${days} hari.`, data: { phone, action: 'add', days } }
      }
      return { success: false, error: 'Action harus add atau remove.' }
    },
  },
  {
    name: 'owner_ban_user',
    description: 'Ban atau unban nomor WhatsApp dari penggunaan bot (khusus owner).',
    permission: 'owner',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Nomor WhatsApp target, contoh: 6281234567890' },
        action: { type: 'string', enum: ['ban', 'unban'], description: 'ban atau unban' },
      },
      required: ['phone', 'action'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      assertOwner(ctx)
      const phone = String(args.phone ?? '').replace(/\D/g, '')
      if (!phone || phone.length < 8 || phone.length > 15) {
        return { success: false, error: 'Nomor target tidak valid.' }
      }
      const targetJid = phoneToJid(phone)
      if (targetJid === ctx.userId) return { success: false, error: 'Tidak bisa ban diri sendiri.' }
      if (args.action === 'unban') {
        userModel.unban(targetJid)
        return { success: true, message: `${phone} berhasil di-unban.`, data: { phone, action: 'unban' } }
      }
      if (args.action === 'ban') {
        userModel.ensure(targetJid)
        userModel.ban(targetJid)
        return { success: true, message: `${phone} berhasil di-ban.`, data: { phone, action: 'ban' } }
      }
      return { success: false, error: 'Action harus ban atau unban.' }
    },
  },
  {
    name: 'owner_get_bot_info',
    description: 'Lihat info sistem bot (uptime, versi Node, platform, penggunaan memori).',
    permission: 'owner',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      assertOwner(ctx)
      const mem = process.memoryUsage()
      return {
        success: true,
        data: {
          uptime: F.formatDuration(Date.now() - startedAt),
          node: process.version,
          platform: `${process.platform} ${process.arch}`,
          pid: process.pid,
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
      }
    },
  },
]