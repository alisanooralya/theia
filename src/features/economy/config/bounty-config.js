export const BOUNTY_CONFIG = Object.freeze({
  minBountyPercent: 0.2,
  maxBountyPercent: 0.3,
  durationMs: 4 * 60 * 60 * 1000,
  hunterCooldownMs: 15 * 60 * 1000,
  maxRounds: 50,
  boardLimit: 20,
});

export function rollBountyPercent(random = Math.random) {
  const { minBountyPercent, maxBountyPercent } = BOUNTY_CONFIG;
  return minBountyPercent + random() * (maxBountyPercent - minBountyPercent);
}

export function calcBountySplit(reward, percent) {
  if (!Number.isInteger(reward) || reward < 1) {
    throw new RangeError('reward must be a positive integer');
  }
  const clamped = Math.min(
    BOUNTY_CONFIG.maxBountyPercent,
    Math.max(BOUNTY_CONFIG.minBountyPercent, percent)
  );
  const bountyCoin = Math.max(1, Math.floor(reward * clamped));
  const walletCoin = reward - bountyCoin;
  return { bountyCoin, walletCoin, percent: clamped };
}

export function bountyExpiresAt(createdAtMs) {
  return createdAtMs + BOUNTY_CONFIG.durationMs;
}

export function formatBountyRemaining(ms) {
  if (ms <= 0) return '0m 0s';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function snapshotStatsLine(snapshot) {
  if (!snapshot) return '';
  return `HP ${snapshot.maxHp} • ATK ${snapshot.atk} • DEF ${snapshot.def}`;
}
