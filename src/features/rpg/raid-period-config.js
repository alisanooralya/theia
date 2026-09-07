/**
 * Konfigurasi Raid Period (Raid 2.0).
 *
 * Satu period = satu "season" Raid berisi 4 boss yang dikalahkan berurutan.
 * Konten Raid diganti lewat file ini tanpa menyentuh core engine
 * (src/features/rpg/raid.js, raid-battle.js, raid-gimmicks.js).
 *
 * Struktur period:
 * - id          : identifier unik period (PK di tabel raid_periods).
 * - name        : nama tampilan period.
 * - startAt/endAt: batas waktu period dalam epoch ms. Period aktif jika
 *                  startAt <= now < endAt. Jika beberapa period tumpang
 *                  tindih, yang paling baru (startAt terbesar) menang.
 * - entriesPerDay: jumlah Raid Entry per player per hari kalender.
 * - bosses      : daftar boss sesuai urutan progression.
 *
 * Struktur boss:
 * - id/name/emoji/level : identitas boss.
 * - maxHp/atk/def       : stat boss (critRate dalam fraksi, mis. 0.05 = 5%).
 * - gimmicks            : daftar gimmick boss (lihat raid-gimmicks.js).
 *                         Framework siap; type yang belum terdaftar diabaikan
 *                         dengan warning, tidak merusak battle.
 * - rewards             : reward dasar per boss, diskalakan berdasarkan
 *                         kontribusi damage player terhadap maxHp boss.
 *
 * Contoh menambah gimmick (jangan dianggap final):
 *   gimmicks: [
 *     { type: 'example', value: 10 },
 *   ]
 * lalu daftarkan handler-nya via registerGimmick('example', {...}) di
 * raid-gimmicks.js.
 *
 * Angka boss/reward di bawah adalah nilai awal yang masih perlu di-tuning
 * mengikuti ekonomi existing (Domain/Bounty memberi coin 6k-27k per run).
 */

const RAID_ENTRIES_PER_DAY = 3;

const RAID_PERIODS = [
  {
    id: 'period-1',
    name: 'Raid Period 1',
    startAt: 0,
    endAt: Number.MAX_SAFE_INTEGER,
    entriesPerDay: RAID_ENTRIES_PER_DAY,
    bosses: [
      {
        id: 'iron_sentinel',
        name: 'Iron Sentinel',
        emoji: '🛡️',
        level: 50,
        maxHp: 15_000,
        atk: 180,
        def: 150,
        critRate: 0.05,
        gimmicks: [],
        rewards: { cash: 12_000, exp: 80, raidCoin: 8 },
      },
      {
        id: 'crimson_behemoth',
        name: 'Crimson Behemoth',
        emoji: '🐗',
        level: 65,
        maxHp: 30_000,
        atk: 220,
        def: 200,
        critRate: 0.05,
        gimmicks: [],
        rewards: { cash: 18_000, exp: 120, raidCoin: 12 },
      },
      {
        id: 'storm_sovereign',
        name: 'Storm Sovereign',
        emoji: '⚡',
        level: 80,
        maxHp: 50_000,
        atk: 200,
        def: 260,
        critRate: 0.05,
        gimmicks: [],
        rewards: { cash: 25_000, exp: 180, raidCoin: 16 },
      },
      {
        id: 'void_emperor',
        name: 'Void Emperor',
        emoji: '👑',
        level: 99,
        maxHp: 80_000,
        atk: 340,
        def: 320,
        critRate: 0.08,
        gimmicks: [],
        rewards: { cash: 40_000, exp: 280, raidCoin: 24 },
      },
    ],
  },
];

/**
 * Period config yang aktif pada `now` (epoch ms), atau null.
 * Jika beberapa period tumpang tindih, ambil yang startAt-nya paling besar.
 * Murni — menerima daftar period apa pun supaya bisa dites.
 */
export function resolveActivePeriod(periods, now) {
  let active = null;
  for (const period of periods) {
    if (now < period.startAt || now >= period.endAt) continue;
    if (!active || period.startAt > active.startAt) active = period;
  }
  return active;
}

/**
 * Period yang paling baru saja berakhir (endAt <= now), atau null.
 * Murni — dipakai untuk `.raid claim` setelah period selesai.
 */
export function resolveLastEndedPeriod(periods, now) {
  let ended = null;
  for (const period of periods) {
    if (period.endAt > now) continue;
    if (!ended || period.endAt > ended.endAt) ended = period;
  }
  return ended;
}

/**
 * Period mendatang terdekat (untuk info "raid berikutnya"), atau null.
 * Murni.
 */
export function resolveUpcomingPeriod(periods, now) {
  let upcoming = null;
  for (const period of periods) {
    if (period.startAt <= now) continue;
    if (!upcoming || period.startAt < upcoming.startAt) upcoming = period;
  }
  return upcoming;
}

export function getActivePeriod(now = Date.now()) {
  return resolveActivePeriod(RAID_PERIODS, now);
}

export function getLastEndedPeriod(now = Date.now()) {
  return resolveLastEndedPeriod(RAID_PERIODS, now);
}

export function getUpcomingPeriod(now = Date.now()) {
  return resolveUpcomingPeriod(RAID_PERIODS, now);
}

export function getPeriodById(periodId) {
  return RAID_PERIODS.find((period) => period.id === periodId) ?? null;
}

export function bossConfig(period, bossIndex) {
  if (!period) return null;
  const boss = period.bosses[bossIndex];
  return boss ?? null;
}

export { RAID_PERIODS, RAID_ENTRIES_PER_DAY };
