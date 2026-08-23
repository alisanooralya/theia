/**
 * Economy tools — reuse existing walletModel; the AI never decides balances.
 * All mutations are validated server-side and executed via the model.
 */
import { walletModel } from '#storage/models/index.js'
import { phoneToJid } from '#helpers/identifier.js'

// Mirrors src/commands/modules/economy/transfer.js
const TAX_RATE = 0.05

export const economyTools = [
  {
    name: 'transfer_money',
    description:
      'Transfer uang (cash) dari user yang sedang chat ke nomor WhatsApp lain. ' +
      'Parameter toPhone adalah nomor tujuan (hanya angka, dengan atau tanpa awalan negara). Pajak 5% ditanggung pengirim.',
    permission: 'user',
    parameters: {
      type: 'object',
      properties: {
        toPhone: { type: 'string', description: 'Nomor WhatsApp tujuan, contoh: 6281234567890' },
        amount: { type: 'number', description: 'Jumlah uang yang ditransfer (angka bulat positif)' },
      },
      required: ['toPhone', 'amount'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      const amount = Math.floor(Number(args.amount))
      const phone = String(args.toPhone ?? '').replace(/\D/g, '')

      if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, error: 'Jumlah transfer harus angka bulat positif.' }
      }
      if (!phone || phone.length < 8 || phone.length > 15) {
        return { success: false, error: 'Nomor tujuan tidak valid.' }
      }

      const targetJid = phoneToJid(phone)
      if (targetJid === ctx.userId) {
        return { success: false, error: 'Tidak bisa transfer ke diri sendiri.' }
      }

      try {
        const tax = Math.floor(amount * TAX_RATE)
        const total = amount + tax
        walletModel.transfer(ctx.userId, targetJid, total, 'agent-transfer')
        return {
          success: true,
          message: `Transfer ${amount} ke ${phone} berhasil (pajak ${tax}).`,
          data: { amount, tax, total, to: phone },
        }
      } catch (err) {
        return { success: false, error: err.message || 'Transfer gagal.' }
      }
    },
  },
]