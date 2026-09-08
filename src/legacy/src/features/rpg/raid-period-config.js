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
 * - startAt/endAt: batas waktu period permanen dalam epoch ms. Period aktif
 *                  jika startAt <= now < endAt. Jika beberapa period
 *                  tumpang tindih, yang paling baru (startAt terbesar) menang.
 * - dailyWindow (alternatif startAt/endAt): window harian berulang, mis.
 *                  { start: '08:00', end: '18:00', timeZone: 'Asia/Jakarta' }.
 *                  Period hanya aktif dalam window tsb SETIAP HARI
 *                  (08:00 <= now < 18:00). Boss progression, kontribusi, dan
 *                  entry harian tetap utuh antar hari (id period sama);
 *                  di luar window `.raid attack` ditolak. Window yang
 *                  melewati tengah malam (end <= start) juga didukung.
 * - schedule (opsional, format mudah edit): umur period — kapan dibuka
 *                  pertama kali dan kapan berakhir permanen:
 *                  { start: '2026-09-08 08:00', end: '2026-09-14 18:00',
 *                    timeZone: 'Asia/Jakarta' }.
 *                  Format: 'YYYY-MM-DD HH:MM' sesuai zona waktu di timeZone
 *                  (bukan epoch ms). Gabungan dengan dailyWindow berarti:
 *                  raid buka tiap hari 08:00–18:00 selama rentang tanggal
 *                  tsb; setelah `end` lewat, period tamat permanen dan
 *                  period berikutnya (id baru) bisa dimulai.
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
const DEFAULT_WINDOW_TZ = 'Asia/Jakarta';

const RAID_PERIODS = [
  {
    id: 'period-1',
    name: 'Raid Period 1',
    // Window harian: raid buka 08:00–18:00 WIB setiap hari.
    dailyWindow: { start: '08:00', end: '18:00', timeZone: DEFAULT_WINDOW_TZ },
    // Umur period (gampang edit, zona WIB — bukan epoch ms):
    // dibuka 8 Sep 2026 jam 08:00, berakhir permanen 14 Sep 2026 jam 18:00.
    schedule: {
      start: '2026-09-08 08:00',
      end: '2026-09-14 18:00',
      timeZone: DEFAULT_WINDOW_TZ,
    },
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

// -----------------------------------------------------------------
// Resolver window harian (dailyWindow)
// -----------------------------------------------------------------

function parseClock(input) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(input ?? '').trim());
  if (!match) throw new Error(`Format jam window raid tidak valid: ${input}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59)
    throw new Error(`Jam window raid tidak valid: ${input}`);
  return { hour, minute };
}

function zonedParts(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return Object.fromEntries(
    fmt
      .formatToParts(new Date(ms))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
}

function zonedOffset(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

function zonedToMs(year, month, day, hour, minute, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = wall - zonedOffset(wall, timeZone);
  return wall - zonedOffset(guess, timeZone);
}

/**
 * Hitung window harian untuk `now` (epoch ms). Return:
 * - active        : true kalau now berada dalam window hari ini.
 * - startAt/endAt : batas window yang relevan — window aktif kalau aktif,
 *                   window BERIKUTNYA kalau tidak aktif.
 * - lastEndAt     : akhir window terakhir yang sudah lewat (null saat aktif).
 * Murni — tidak menyentuh config/DB.
 */
function dailyWindowState(window, now) {
  const tz = window.timeZone || DEFAULT_WINDOW_TZ;
  const start = parseClock(window.start);
  const end = parseClock(window.end);
  const p = zonedParts(now, tz);

  const startAt0 = zonedToMs(
    p.year,
    p.month,
    p.day,
    start.hour,
    start.minute,
    tz
  );
  const endAt0 = zonedToMs(p.year, p.month, p.day, end.hour, end.minute, tz);

  if (endAt0 > startAt0) {
    // Window sehari (mis. 08:00–18:00).
    if (now >= startAt0 && now < endAt0) {
      return {
        active: true,
        startAt: startAt0,
        endAt: endAt0,
        lastEndAt: null,
      };
    }
    if (now < startAt0) {
      const lastEndAt = zonedToMs(
        p.year,
        p.month,
        p.day - 1,
        end.hour,
        end.minute,
        tz
      );
      return { active: false, startAt: startAt0, endAt: endAt0, lastEndAt };
    }
    // Setelah tutup: window berikutnya besok.
    const nextStartAt = zonedToMs(
      p.year,
      p.month,
      p.day + 1,
      start.hour,
      start.minute,
      tz
    );
    const nextEndAt = zonedToMs(
      p.year,
      p.month,
      p.day + 1,
      end.hour,
      end.minute,
      tz
    );
    return {
      active: false,
      startAt: nextStartAt,
      endAt: nextEndAt,
      lastEndAt: endAt0,
    };
  }

  // Window lewat tengah malam (mis. 20:00–02:00): mulai hari ini, selesai besok.
  const windowEnd = zonedToMs(
    p.year,
    p.month,
    p.day + 1,
    end.hour,
    end.minute,
    tz
  );
  if (now >= startAt0 && now < windowEnd) {
    return {
      active: true,
      startAt: startAt0,
      endAt: windowEnd,
      lastEndAt: null,
    };
  }
  // Dini hari / siang sebelum buka: window kemarin selesai di endAt0 hari ini.
  return {
    active: false,
    startAt: startAt0,
    endAt: windowEnd,
    lastEndAt: endAt0,
  };
}

/**
 * Parse jadwal 'YYYY-MM-DD HH:MM' menjadi epoch ms sesuai zona waktu.
 * Murni.
 */
function parseDateTime(input, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(
    String(input ?? '').trim()
  );
  if (!match) {
    throw new Error(
      `Format jadwal raid tidak valid (gunakan 'YYYY-MM-DD HH:MM'): ${input}`
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    throw new Error(`Jadwal raid tidak valid: ${input}`);
  }
  return zonedToMs(year, month, day, hour, minute, timeZone);
}

/**
 * Rentang umur period (epoch ms) dari `schedule` ({start, end, timeZone}),
 * atau dari startAt/endAt angka bila schedule tidak ada.
 * null = tidak dibatasi (terbuka).
 * Murni.
 */
function lifespanOf(period) {
  if (period.schedule) {
    const tz = period.schedule.timeZone || DEFAULT_WINDOW_TZ;
    const start = parseDateTime(period.schedule.start, tz);
    const end = parseDateTime(period.schedule.end, tz);
    if (end <= start) {
      throw new Error(`Jadwal raid berakhir sebelum dimulai: ${period.id}`);
    }
    return { start, end };
  }
  return {
    start: typeof period.startAt === 'number' ? period.startAt : null,
    end: typeof period.endAt === 'number' ? period.endAt : null,
  };
}

/**
 * Status satu period pada `now`:
 * - { mode: 'active', startAt, endAt, recurring }      raid dibuka
 * - { mode: 'upcoming', startAt, endAt, lastEndAt, recurring }
 *   belum dibuka (awal schedule / window berikutnya)
 * - { mode: 'ended', endAt, recurring: false }        berakhir permanen
 * Murni — tidak menyentuh DB.
 */
function periodWindowState(period, now) {
  const { start: lifeStart, end: lifeEnd } = lifespanOf(period);

  if (lifeStart !== null && now < lifeStart) {
    return {
      mode: 'upcoming',
      startAt: lifeStart,
      endAt: lifeEnd ?? lifeStart,
      lastEndAt: null,
      recurring: false,
    };
  }
  if (lifeEnd !== null && now >= lifeEnd) {
    return { mode: 'ended', endAt: lifeEnd, recurring: false };
  }
  if (period.dailyWindow) {
    const state = dailyWindowState(period.dailyWindow, now);
    if (state.active) {
      return {
        mode: 'active',
        startAt: state.startAt,
        endAt: state.endAt,
        recurring: true,
      };
    }
    return {
      mode: 'upcoming',
      startAt: state.startAt,
      endAt: state.endAt,
      lastEndAt: state.lastEndAt,
      recurring: true,
    };
  }
  return {
    mode: 'active',
    startAt: lifeStart ?? 0,
    endAt: lifeEnd ?? Number.MAX_SAFE_INTEGER,
    recurring: false,
  };
}

// -----------------------------------------------------------------
// Resolver murni untuk daftar period statis (tanpa dailyWindow)
// -----------------------------------------------------------------

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

// -----------------------------------------------------------------
// Resolver utama — gabungkan period permanen + dailyWindow
// -----------------------------------------------------------------

export function getActivePeriod(now = Date.now()) {
  let active = null;
  for (const period of RAID_PERIODS) {
    const state = periodWindowState(period, now);
    if (state.mode !== 'active') continue;
    const candidate = {
      ...period,
      startAt: state.startAt,
      endAt: state.endAt,
      recurring: !!state.recurring,
    };
    if (!active || candidate.startAt > active.startAt) active = candidate;
  }
  return active;
}

export function getUpcomingPeriod(now = Date.now()) {
  let upcoming = null;
  for (const period of RAID_PERIODS) {
    const state = periodWindowState(period, now);
    if (state.mode !== 'upcoming' || !(state.startAt > now)) continue;
    const candidate = {
      ...period,
      startAt: state.startAt,
      endAt: state.endAt,
      recurring: !!state.recurring,
    };
    if (!upcoming || candidate.startAt < upcoming.startAt) {
      upcoming = candidate;
    }
  }
  return upcoming;
}

/**
 * Period terakhir yang sudah "selesai". Untuk period dailyWindow yang
 * window-nya tutup (tapi umurnya belum habis), yang dikembalikan adalah
 * clone dengan endAt = akhir window terakhir + flag `recurring: true` —
 * period TIDAK benar-benar tamat (maintain() tidak memfinalisasinya),
 * dipakai agar `.raid claim` tetap bisa diakses di luar window.
 */
export function getLastEndedPeriod(now = Date.now()) {
  let ended = null;
  for (const period of RAID_PERIODS) {
    const state = periodWindowState(period, now);
    let candidate = null;
    if (state.mode === 'ended') {
      candidate = {
        ...period,
        startAt: 0,
        endAt: state.endAt,
        recurring: false,
      };
    } else if (
      state.mode === 'upcoming' &&
      state.recurring &&
      state.lastEndAt !== null &&
      state.lastEndAt <= now
    ) {
      const { start: lifeStart } = lifespanOf(period);
      if (state.lastEndAt >= (lifeStart ?? 0)) {
        candidate = {
          ...period,
          startAt: 0,
          endAt: state.lastEndAt,
          recurring: true,
        };
      }
    }
    if (candidate && (!ended || candidate.endAt > ended.endAt)) {
      ended = candidate;
    }
  }
  return ended;
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
