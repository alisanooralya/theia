import { logger } from '#helpers/logger.js';

const BATTLE_TTL_MS = 120_000;

const activeBattles = new Map();
const battleMeta = new Map();

function newBattleId() {
  return `btl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function reapExpired() {
  const now = Date.now();
  for (const [id, meta] of battleMeta) {
    const stale =
      (meta.status === 'running' && now - meta.startedAt > BATTLE_TTL_MS) ||
      (meta.status === 'pending' &&
        now - meta.startedAt > BATTLE_TTL_MS + 60_000);
    if (stale) {
      if (meta.status === 'running') {
        logger.warn({ battleId: id }, '[BattleState] reaping stuck battle');
        releaseCombatants(id);
      }
      battleMeta.delete(id);
    }
  }
}

function releaseCombatants(id) {
  const meta = battleMeta.get(id);
  if (!meta) return;
  activeBattles.delete(meta.challenger);
  activeBattles.delete(meta.target);
}

export function isInBattle(jid) {
  reapExpired();
  return activeBattles.has(jid);
}

export function createBattle(challenger, target) {
  reapExpired();
  if (challenger === target)
    throw new Error('Tidak bisa battle dengan diri sendiri.');
  if (activeBattles.has(challenger))
    throw new Error('Kamu sedang berada dalam battle lain.');
  if (activeBattles.has(target))
    throw new Error('Lawan sedang berada dalam battle lain.');

  const id = newBattleId();
  const meta = {
    id,
    challenger,
    target,
    status: 'pending',
    startedAt: Date.now(),
  };
  battleMeta.set(id, meta);
  return id;
}

export function startBattle(id) {
  const meta = battleMeta.get(id);
  if (!meta) return false;
  if (meta.status === 'cancelled' || meta.status === 'finished') return false;
  if (activeBattles.has(meta.challenger) || activeBattles.has(meta.target)) {
    releaseCombatants(id);
    meta.status = 'cancelled';
    return false;
  }
  meta.status = 'running';
  meta.startedAt = Date.now();
  activeBattles.set(meta.challenger, id);
  activeBattles.set(meta.target, id);
  return true;
}

export function finishBattle(id) {
  const meta = battleMeta.get(id);
  if (!meta) return;
  meta.status = 'finished';
  releaseCombatants(id);
}

export function cancelBattle(id) {
  const meta = battleMeta.get(id);
  if (!meta) return;
  meta.status = 'cancelled';
  releaseCombatants(id);
}

export function getBattleStatus(id) {
  return battleMeta.get(id)?.status ?? null;
}

export { BATTLE_TTL_MS };
