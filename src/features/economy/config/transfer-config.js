/**
 * Economy — Transfer config. Single source of truth for transfer tunables.
 *
 * Adapted from legacy (`commands/modules/economy/transfer.js`): kept the
 * command shape (`transfer`, aliases `tf`/`kirim`, `@tag <amount>` target
 * resolution, self-transfer rejection).
 *
 * DELIBERATELY DROPPED from legacy: the 5% transfer tax (sender paid
 * amount+tax while the receiver got only amount — a coin sink that breaks
 * conservation, same rationale as the removed bank fee). Transfer 2.0
 * moves the full amount: sender -X, receiver +X, nothing created or
 * burned. Also dropped: the `transactions` ledger row (no ledger in 2.0).
 */
export const TRANSFER_CONFIG = Object.freeze({
  minTransfer: 1,
});
