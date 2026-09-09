/**
 * Economy — Bank config. Single source of truth for Bank tunables.
 *
 * Adapted from legacy (`commands/modules/economy/bank.js`,
 * `storage/models/wallet.js`): legacy kept cash+bank in one wallet row,
 * validated deposit against cash and withdraw against bank, and used
 * subcommand aliases `tabung` (deposit) / `ambil` (withdraw) — all kept.
 *
 * DELIBERATELY DROPPED from legacy (Bank 2.0 = storage only):
 * - 0.8%/day interest accrual (`accrueBankInterest`, `bank interest` ledger)
 * - 5% deposit admin fee (legacy credited only the net amount, breaking
 *   coin conservation — deposit/withdraw here move the full amount)
 * - `bank_limit` cap + limit upgrades
 * - `transactions` ledger rows for bank ops
 * - level/EXP display on balance (levels no longer exist)
 */
export const BANK_CONFIG = Object.freeze({
  minDeposit: 1,
  minWithdraw: 1,
});

const DIGITS_ONLY = /^\d+$/;

/**
 * Strict integer amount parser. Rejects non-numeric input, decimals,
 * zero, and negatives — never silently truncates (legacy `parseInt`
 * accepted prefixes like `50k` as 50).
 */
export function parseBankAmount(raw, { min = 1 } = {}) {
  let amount = null;
  if (typeof raw === 'number') {
    if (Number.isInteger(raw)) amount = raw;
  } else if (typeof raw === 'string') {
    const text = raw.trim();
    if (DIGITS_ONLY.test(text)) amount = Number(text);
  }
  if (amount === null || !Number.isSafeInteger(amount)) {
    throw new RangeError('Jumlah tidak valid. Contoh: `.bank deposit 50000`');
  }
  if (amount < min) {
    throw new RangeError(`Minimal ${min.toLocaleString('en-US')}.`);
  }
  return amount;
}
