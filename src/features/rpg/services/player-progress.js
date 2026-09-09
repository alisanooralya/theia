/**
 * RPG 2.0 — shared player EXP grant (existing progression curve only).
 *
 * Same math as the domain reward path: accumulate EXP on the RPG player
 * row, leveling up along `expRequiredForLevel`. Runs inside the caller's
 * transaction next to the session-claim UPDATE, so coin + EXP commit or
 * roll back together — fixing the legacy split reward()/addExp() race.
 */
import { expRequiredForLevel } from '../config/stats-config.js';

/** Pure level accumulation over the existing curve. */
export function applyPlayerExp(level, exp, gained) {
  let total = exp + gained;
  let lv = level;
  for (;;) {
    const need = expRequiredForLevel(lv);
    if (total < need) break;
    total -= need;
    lv += 1;
  }
  return { level: lv, exp: total };
}

/**
 * Grant `gained` EXP to an ensured player. Returns
 * { leveledUp, newLevel }. Must run inside the caller's transaction.
 */
export async function grantPlayerExp(players, userId, gained, tx) {
  const player = await players.get(userId, tx);
  if (!player) throw new Error('RPG player belum ada.');
  // Snapshot first: some repos may mutate the returned row on write.
  const startLevel = player.level;
  const grown = applyPlayerExp(player.level, player.exp, gained);
  await players.setLevel(userId, grown.level, tx);
  await players.setExp(userId, grown.exp, tx);
  return { leveledUp: grown.level > startLevel, newLevel: grown.level };
}
