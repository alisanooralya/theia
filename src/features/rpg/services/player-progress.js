import { expRequiredForLevel } from '../config/stats-config.js';

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

export async function grantPlayerExp(players, userId, gained, tx) {
  const player = await players.get(userId, tx);
  if (!player) throw new Error('RPG player belum ada.');
  const startLevel = player.level;
  const grown = applyPlayerExp(player.level, player.exp, gained);
  await players.setLevel(userId, grown.level, tx);
  await players.setExp(userId, grown.exp, tx);
  return { leveledUp: grown.level > startLevel, newLevel: grown.level };
}
