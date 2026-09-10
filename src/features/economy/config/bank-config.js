export const BANK_CONFIG = Object.freeze({
  minDeposit: 50_000,
  minWithdraw: 50_000,
});

const DIGITS_ONLY = /^\d+$/;

export function parseBankAmount(raw, { min = 1 } = {}) {
  let amount = null;
  if (typeof raw === 'number') {
    if (Number.isInteger(raw)) amount = raw;
  } else if (typeof raw === 'string') {
    const text = raw.trim();
    if (DIGITS_ONLY.test(text)) amount = Number(text);
  }
  if (amount === null || !Number.isSafeInteger(amount)) {
    throw new RangeError('Jumlah tidak valid. Contoh: `.bank` deposit 50000');
  }
  if (amount < min) {
    throw new RangeError(`Minimal ${min.toLocaleString('en-US')}.`);
  }
  return amount;
}
