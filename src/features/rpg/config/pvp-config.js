/**
 * RPG 2.0 — PvP config. Single source of truth for `.pvp` balancing.
 *
 * Migrated from legacy (`features/combat/battle.js`, `commands/modules/rpg/battle.js`,
 * `features/combat/battle-state.js`, `battle-pending.js`): same reward numbers,
 * same confirm TTL, same cooldown, same duel structure (auto-sim up to 10
 * rounds then timer/draw). Only storage/architecture changed.
 */
export const PVP_CONFIG = Object.freeze({
  // Legacy `.battle` command cooldown (5 minutes per player).
  cooldownMs: 300_000,
  // Legacy battle-pending confirm window (60 seconds).
  confirmTtlMs: 60_000,
  // Legacy `BATTLE_TTL_MS`: a running battle is reaped after 2 minutes.
  // Used to sweep stale rows on challenge so a failed run never traps a player.
  battleTtlMs: 120_000,
  // Legacy `_simulate` loop bound (rounds). Engine uses this as maxRounds.
  maxRounds: 10,
  // Legacy reward table.
  rewardCoin: 2_000,
  loserLoss: 1_500,
  expWin: 80,
  expLose: 20,
  // Legacy win-streak multiplier: 1 + streak*0.5, capped at 3x.
  streakMultStep: 0.5,
  streakMultMax: 3,
  // Legacy winner heals 20% of max HP after a win.
  winnerHealPct: 0.2,
});

/** Round-based pacing for the message edits (legacy ~2.7s/snapshot). */
export const PVP_SNAPSHOT_DELAY_MS = 2_700;
