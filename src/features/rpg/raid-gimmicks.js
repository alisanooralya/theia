import { logger } from '#helpers/logger.js';

/**
 * Registry gimmick boss Raid 2.0.
 *
 * Gimmick dideklarasikan di raid-period-config.js sebagai daftar objek:
 *   gimmicks: [{ type: 'example', value: 10 }]
 *
 * Handler didaftarkan lewat registerGimmick('example', handler) dengan
 * hook opsional berikut (semua menerima satu object context):
 *
 * - onBattleStart({ player, boss, params })
 *     Sekali di awal battle. Boleh memutasi fighter (stat modifier, dsb.).
 *
 * - modifyAttack({ side, round, now, dmg, crit, params })
 *     Dipanggil setiap serangan SEBELUM damage diterapkan ke HP.
 *     side: 'player' | 'boss'. Wajib me-return angka damage baru.
 *
 * - onBattleEnd({ player, boss, result, params })
 *     Sekali setelah battle selesai, sebelum result dikembalikan.
 *
 * Type yang belum terdaftar diabaikan dengan warning supaya config lama
 * tetap aman saat core engine di-upgrade.
 */

const handlers = new Map();

export function registerGimmick(type, handler) {
  if (!type || typeof type !== 'string') {
    throw new Error('Gimmick type tidak valid.');
  }
  if (!handler || typeof handler !== 'object') {
    throw new Error(`Gimmick handler untuk "${type}" tidak valid.`);
  }
  handlers.set(type, handler);
}

export function getGimmickHandler(type) {
  return handlers.get(type) ?? null;
}

export function listGimmickTypes() {
  return [...handlers.keys()];
}

/**
 * Runtime gimmick untuk satu battle. Menerima daftar gimmick dari config
 * boss, mengikatnya ke handler terdaftar, dan mengekspos hook yang aman
 * dipanggil engine. Tanpa gimmick, semua hook adalah no-op murah.
 */
export function createGimmickRuntime(gimmicks = []) {
  const active = [];
  for (const gimmick of gimmicks) {
    if (!gimmick || typeof gimmick !== 'object') continue;
    const handler = handlers.get(gimmick.type);
    if (!handler) {
      logger.warn(
        { type: gimmick.type },
        '[RaidGimmick] gimmick type tidak terdaftar, diabaikan'
      );
      continue;
    }
    active.push({ handler, params: gimmick });
  }

  const empty = active.length === 0;

  return {
    count: active.length,

    onBattleStart(context) {
      if (empty) return;
      for (const { handler, params } of active) {
        if (typeof handler.onBattleStart === 'function') {
          handler.onBattleStart({ ...context, params });
        }
      }
    },

    modifyAttack(context) {
      if (empty) return context.dmg;
      let dmg = context.dmg;
      for (const { handler, params } of active) {
        if (typeof handler.modifyAttack === 'function') {
          const next = handler.modifyAttack({ ...context, dmg, params });
          if (Number.isFinite(next)) dmg = Math.max(0, Math.floor(next));
        }
      }
      return dmg;
    },

    onBattleEnd(context) {
      if (empty) return;
      for (const { handler, params } of active) {
        if (typeof handler.onBattleEnd === 'function') {
          handler.onBattleEnd({ ...context, params });
        }
      }
    },
  };
}
