import { statsModel } from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { cardService } from '#features/rpg/card.js';
import { calcDamage } from '#features/rpg/domain.js';
import { createGimmickRuntime } from '#features/rpg/raid-gimmicks.js';

/**
 * Durasi maksimal satu Raid Entry: 120 detik.
 * Engine memakai mapping Domain: 1 round = 1 detik virtual time,
 * jadi battle 120 detik = maksimal 120 round yang disimulasikan instan.
 */
export const RAID_MAX_SECONDS = 120;

/**
 * Snapshot build combat player untuk satu Raid Entry.
 *
 * - Stat diambil dari pipeline existing: stats base + Artifact + Main Card
 *   (artifactService.getPlayerStats) + buff aktif, sama seperti Battle/Domain.
 * - Raid selalu mulai dari MAX HP Profile, bukan Current HP Profile.
 *   Current HP Profile tidak dibaca dan tidak diubah oleh Raid.
 * - CardBattleState dibuat sekali di sini; instance ini (beserta referensi
 *   Main/Support Card yang dibekukan di dalamnya) dipakai sampai battle
 *   selesai, sehingga perubahan equipment setelah Entry dimulai tidak
 *   memengaruhi battle yang berjalan. Entry berikutnya mengambil snapshot
 *   terbaru.
 */
/**
 * Rakit fighter Raid dari data yang sudah di-snapshot. Murni (tanpa DB)
 * supaya aturan snapshot bisa dites langsung:
 * - HP awal = Final Max HP Profile (`profileStats.hp`), BUKAN Current HP.
 * - Buff ATK/DEF aktif ditambahkan seperti Battle/Domain.
 * - Crit Rate final (persen) dikonversi ke fraksi 0–0.95.
 */
export function assembleRaidFighter({
  jid,
  base,
  profileStats,
  cardBattleState,
  nowSec = Math.floor(Date.now() / 1000),
}) {
  const buffed = (base?.buff_expire ?? 0) > nowSec;
  const maxHp = profileStats.hp;
  return {
    jid,
    hp: maxHp,
    max_hp: maxHp,
    atk: buffed ? profileStats.atk + (base.buff_atk || 0) : profileStats.atk,
    def: buffed ? profileStats.def + (base.buff_def || 0) : profileStats.def,
    critRate: Math.max(0, Math.min(0.95, profileStats.critRate / 100)),
    cardBattleState,
  };
}

export async function buildRaidSnapshot(jid) {
  const base = await statsModel.ensure(jid);
  const [profileStats, cardBattleState] = await Promise.all([
    artifactService.getPlayerStats(jid),
    cardService.getBattleState(jid),
  ]);

  return assembleRaidFighter({ jid, base, profileStats, cardBattleState });
}

/**
 * Simulasi auto-battle Raid ala Domain:
 * - Player menyerang duluan, boss membalas (jika masih hidup).
 * - Damage memakai calcDamage Domain: cardTurnStats, crit (rate + cdm),
 *   modifier Card outgoing/incoming. Virtual clock 1 detik per round
 *   mem-drive durasi/cooldown pasif Card.
 * - Berhenti saat: player mati, boss mati, atau 120 detik (round) habis.
 * - Overkill damage tidak dihitung sebagai kontribusi
 *   (damage dibatasi sisa HP boss).
 * - Fighter input tidak dimutasi; murni simulasi in-memory tanpa DB.
 *
 * `gimmicks` adalah daftar gimmick config boss; diteruskan ke runtime
 * gimmick (raid-gimmicks.js). Type tak dikenal otomatis diabaikan.
 */
export function simulateRaidBattle(
  player,
  boss,
  { maxSeconds = RAID_MAX_SECONDS, gimmicks = [] } = {}
) {
  const runtime = createGimmickRuntime(gimmicks);
  const p = { ...player };
  const b = { ...boss };
  runtime.onBattleStart({ player: p, boss: b });

  let totalDamage = 0;
  let rounds = 0;
  let crits = 0;
  let maxHit = 0;
  let playerHits = 0;

  const startTime = Date.now();
  for (let i = 0; i < maxSeconds && p.hp > 0 && b.hp > 0; i++) {
    const turnNow = startTime + i * 1000;
    rounds = i + 1;

    const pOut = calcDamage(p, b, turnNow);
    let dmg = runtime.modifyAttack({
      side: 'player',
      round: rounds,
      now: turnNow,
      dmg: Math.min(pOut.dmg, b.hp),
      crit: pOut.crit,
    });
    dmg = Math.max(0, Math.min(Math.floor(dmg), b.hp));
    b.hp -= dmg;
    totalDamage += dmg;
    playerHits += 1;
    if (pOut.crit) crits += 1;
    if (dmg > maxHit) maxHit = dmg;
    if (dmg > 0) p.cardBattleState?.onHitDealt(turnNow);

    if (b.hp <= 0) break;

    const bOut = calcDamage(b, p, turnNow);
    let bossDmg = runtime.modifyAttack({
      side: 'boss',
      round: rounds,
      now: turnNow,
      dmg: bOut.dmg,
      crit: bOut.crit,
    });
    bossDmg = Math.max(0, Math.min(Math.floor(bossDmg), p.hp));
    p.hp -= bossDmg;
    if (bossDmg > 0) p.cardBattleState?.onHitReceived(turnNow);

    if (p.hp <= 0) break;
  }

  p.cardBattleState?.reset();

  const result = {
    totalDamage,
    rounds,
    durationSeconds: rounds,
    playerHp: Math.max(0, p.hp),
    bossHp: Math.max(0, b.hp),
    playerDefeated: p.hp <= 0,
    bossDefeated: b.hp <= 0,
    crits,
    maxHit,
    playerHits,
    gimmicks: runtime.count,
  };

  runtime.onBattleEnd({ player: p, boss: b, result });
  return result;
}
