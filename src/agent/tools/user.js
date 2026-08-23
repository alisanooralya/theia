/**
 * User-scoped tools — read the CALLER's own data only.
 * No tool accepts a userId parameter; the agent context supplies it.
 */
import { userModel, walletModel, inventoryModel } from '#storage/models/index.js'

export const userTools = [
  {
    name: 'get_user_info',
    description: 'Ambil info user yang sedang chat (nama, level, exp, status premium, status banned).',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const user = userModel.findById(ctx.userId)
      if (!user) return { success: false, error: 'User belum terdaftar di database.' }
      return {
        success: true,
        data: {
          pushName: user.push_name || null,
          level: user.level,
          exp: user.exp,
          premium: user.premium === 1,
          banned: user.banned === 1,
        },
      }
    },
  },
  {
    name: 'check_premium',
    description: 'Cek status premium user yang sedang chat (aktif/tidak + tanggal kedaluwarsa).',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      userModel.checkPremiumExpiry(ctx.userId)
      const user = userModel.findById(ctx.userId)
      if (!user) return { success: false, error: 'User belum terdaftar di database.' }
      const active = user.premium === 1
      return {
        success: true,
        data: {
          premium: active,
          expiresAt: active && user.premium_exp > 0 ? new Date(user.premium_exp * 1000).toISOString() : null,
        },
      }
    },
  },
  {
    name: 'get_balance',
    description: 'Cek saldo uang (cash dan bank) user yang sedang chat.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const wallet = walletModel.find(ctx.userId)
      if (!wallet) return { success: false, error: 'Wallet user belum terdaftar.' }
      return {
        success: true,
        data: { cash: wallet.cash, bank: wallet.bank, bankLimit: wallet.bank_limit },
      }
    },
  },
  {
    name: 'get_inventory',
    description: 'Lihat item yang dimiliki user yang sedang chat.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const items = inventoryModel.getAll(ctx.userId)
      return {
        success: true,
        data: {
          count: items.length,
          items: items.map(i => ({ name: i.name, category: i.category, rarity: i.rarity, quantity: i.quantity })),
        },
      }
    },
  },
]