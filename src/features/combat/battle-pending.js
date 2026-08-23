const pendingBattles = new Map()
const BATTLE_CONFIRM_TTL = 60_000

export function registerPendingBattle(confirmId, data) {
  pendingBattles.set(confirmId, { ...data, expires: data.expires ?? Date.now() + BATTLE_CONFIRM_TTL })
}

export function getPendingBattle(confirmId) {
  const data = pendingBattles.get(confirmId)
  if (!data) return null
  if (data.expires && Date.now() > data.expires) {
    pendingBattles.delete(confirmId)
    return null
  }
  return data
}

export function clearPendingBattle(confirmId) {
  pendingBattles.delete(confirmId)
}

export { BATTLE_CONFIRM_TTL }
