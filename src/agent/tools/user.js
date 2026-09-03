/**
 * User-scoped tools — read the CALLER's own data only.
 * No tool accepts a userId parameter; the agent context supplies it.
 */
import {
  userModel,
  walletModel,
  inventoryModel,
} from '#storage/models/index.js';

export const userTools = [
  {
    name: 'get_user_info',
    description:
      'Ambil info user yang sedang chat (nama, level, exp, status banned).',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const user = await userModel.findById(ctx.userId);
      if (!user)
        return { success: false, error: 'User belum terdaftar di database.' };
      return {
        success: true,
        data: {
          pushName: user.push_name || null,
          level: user.level,
          exp: user.exp,
          banned: user.banned === 1,
        },
      };
    },
  },
  {
    name: 'get_balance',
    description: 'Cek saldo uang (coin dan bank) user yang sedang chat.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const wallet = await walletModel.find(ctx.userId);
      if (!wallet)
        return { success: false, error: 'Wallet user belum terdaftar.' };
      return {
        success: true,
        data: {
          cash: wallet.cash,
          bank: wallet.bank,
          bankLimit: wallet.bank_limit,
        },
      };
    },
  },
  {
    name: 'get_inventory',
    description: 'Lihat item yang dimiliki user yang sedang chat.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const items = await inventoryModel.getAll(ctx.userId);
      return {
        success: true,
        data: {
          count: items.length,
          items: items.map((i) => ({
            name: i.name,
            category: i.category,
            rarity: i.rarity,
            quantity: i.quantity,
          })),
        },
      };
    },
  },
];
