/**
 * Konfigurasi Virtual Market — semua angka balancing ada di file ini.
 * Ubah nilai di sini untuk tuning tanpa menyentuh engine.
 */

// Interval resmi perubahan harga (1 jam).
export const TICK_MS = 1 * 60 * 60 * 1000;

// Frekuensi scheduler mengecek apakah bucket jam sudah berganti.
export const CHECK_INTERVAL_MS = 60 * 1000;

// Jumlah titik history yang disimpan per komoditas.
export const HISTORY_LIMIT = 24;

// Minimal 10 perubahan terakhir dipakai untuk tampilan trend.
export const HISTORY_DISPLAY = 4;

// Batas transaksi supaya tidak ada overflow / order absurd.
export const MAX_ORDER_QTY = 100_000;

// Batas nilai satu transaksi & saldo (kolom cash/transactions bertipe INTEGER).
export const MAX_TRADE_VALUE = 2_000_000_000;

// Maksimal tick yang dikejar sekaligus setelah bot lama offline.
export const MAX_CATCHUP_TICKS = 6;

/**
 * Karakter per komoditas.
 * - basePrice  : harga awal & titik gravitasi jangka panjang
 * - drift      : kecenderungan naik/turun ringan per tick
 * - noise      : besaran random kecil per tick
 * - phaseScale : pengali kekuatan fase (growth/boom/bubble/crash)
 * - crashRisk  : pengali probabilitas pecahnya bubble
 * - gravity    : kekuatan tarik kembali ke basePrice (anti harga liar)
 * - floor/ceil : pagar harga relatif terhadap basePrice
 */
export const COMMODITIES = {
  rice: {
    id: 'rice',
    name: 'Rice',
    emoji: '🌾',
    character: 'stabil',
    basePrice: 1_500,
    drift: 0.002,
    noise: 0.0137,
    phaseScale: 0.385,
    crashRisk: 0.5,
    gravity: 0.09,
    floorMult: 0.55,
    ceilMult: 2.2,
  },
  coffee: {
    id: 'coffee',
    name: 'Coffee',
    emoji: '☕',
    character: 'medium',
    basePrice: 3_000,
    drift: 0.003,
    noise: 0.04,
    phaseScale: 0.935,
    crashRisk: 0.9,
    gravity: 0.07,
    floorMult: 0.4,
    ceilMult: 3.5,
  },
  oil: {
    id: 'oil',
    name: 'Oil',
    emoji: '🛢️',
    character: 'volatile',
    basePrice: 8_000,
    drift: 0.0,
    noise: 0.0685,
    phaseScale: 1.375,
    crashRisk: 1.25,
    gravity: 0.06,
    floorMult: 0.3,
    ceilMult: 4.5,
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    emoji: '🪙',
    character: 'aman',
    basePrice: 16_000,
    drift: 0.004,
    noise: 0.0183,
    phaseScale: 0.55,
    crashRisk: 0.35,
    gravity: 0.05,
    floorMult: 0.65,
    ceilMult: 2.6,
  },
  diamond: {
    id: 'diamond',
    name: 'Diamond',
    emoji: '💎',
    character: 'sangat volatile',
    basePrice: 23_000,
    drift: 0.0,
    noise: 0.097,
    phaseScale: 1.87,
    crashRisk: 1.6,
    gravity: 0.045,
    floorMult: 0.22,
    ceilMult: 6,
  },
};

export const COMMODITY_IDS = Object.keys(COMMODITIES);

// Alias input user -> id komoditas.
export const COMMODITY_ALIASES = {
  beras: 'rice',
  padi: 'rice',
  kopi: 'coffee',
  cof: 'coffee',
  minyak: 'oil',
  bbm: 'oil',
  emas: 'gold',
  au: 'gold',
  diamon: 'diamond',
  dia: 'diamond',
  intan: 'diamond',
};

/**
 * Siklus market tersembunyi.
 * - bias   : arah dasar harga saat fase aktif
 * - swing  : tambahan volatilitas saat fase aktif
 * - min/max: rentang durasi fase (dalam tick / jam)
 * - next   : kandidat fase berikutnya beserta bobotnya
 */
export const PHASES = {
  normal: {
    bias: 0.0,
    swing: 0.6,
    min: 3,
    max: 7,
    next: [
      ['growth', 0.55],
      ['normal', 0.3],
      ['recovery', 0.15],
    ],
  },
  growth: {
    bias: 0.022,
    swing: 0.8,
    min: 3,
    max: 6,
    next: [
      ['boom', 0.5],
      ['normal', 0.35],
      ['crash', 0.15],
    ],
  },
  boom: {
    bias: 0.045,
    swing: 1.0,
    min: 2,
    max: 5,
    next: [
      ['bubble', 0.5],
      ['normal', 0.3],
      ['crash', 0.2],
    ],
  },
  bubble: {
    bias: 0.075,
    swing: 1.3,
    min: 2,
    max: 5,
    // Bubble hampir selalu berakhir crash, tapi tidak pasti.
    next: [
      ['crash', 0.75],
      ['normal', 0.25],
    ],
    // Peluang dasar bubble pecah lebih awal setiap tick.
    popChance: 0.22,
  },
  crash: {
    bias: -0.085,
    swing: 1.15,
    min: 2,
    max: 4,
    next: [
      ['recovery', 0.8],
      ['normal', 0.2],
    ],
  },
  recovery: {
    bias: 0.02,
    swing: 0.7,
    min: 2,
    max: 5,
    next: [
      ['normal', 0.6],
      ['growth', 0.4],
    ],
  },
};

export const DEFAULT_PHASE = 'normal';

// Momentum membuat pergerakan harga tidak acak per jam (ada kelanjutan tren).
export const MOMENTUM_DECAY = 0.55;
export const MOMENTUM_GAIN = 0.4;
export const MOMENTUM_CLAMP = 0.09;

// Pagar keras perubahan harga per tick supaya tidak melonjak ekstrem.
export const MAX_TICK_CHANGE = 0.35;

// Peluang sebuah event ekonomi baru muncul pada satu tick.
export const EVENT_CHANCE = 0.14;

/**
 * Event ekonomi global. Hanya memberi petunjuk arah, bukan kepastian.
 * - targets : komoditas yang terpengaruh
 * - bias    : dorongan arah harga per tick selama event
 * - swing   : tambahan volatilitas
 * - min/max : durasi event dalam tick
 */
export const EVENTS = [
  {
    id: 'coffee_festival',
    emoji: '☕',
    title: 'Coffee Festival',
    hint: 'Permintaan kopi meningkat.',
    targets: ['coffee'],
    bias: 0.03,
    swing: 1.1,
    min: 2,
    max: 4,
  },
  {
    id: 'oil_oversupply',
    emoji: '🛢️',
    title: 'Oil Oversupply',
    hint: 'Produksi minyak meningkat.',
    targets: ['oil'],
    bias: -0.035,
    swing: 1.1,
    min: 2,
    max: 4,
  },
  {
    id: 'luxury_trend',
    emoji: '💎',
    title: 'Luxury Trend',
    hint: 'Diamond menjadi incaran pasar.',
    targets: ['diamond'],
    bias: 0.04,
    swing: 1.25,
    min: 2,
    max: 4,
  },
  {
    id: 'harvest_season',
    emoji: '🌾',
    title: 'Harvest Season',
    hint: 'Panen melimpah menekan harga pangan.',
    targets: ['rice'],
    bias: -0.018,
    swing: 0.9,
    min: 2,
    max: 5,
  },
  {
    id: 'safe_haven',
    emoji: '🪙',
    title: 'Safe Haven Rush',
    hint: 'Investor lari ke aset aman.',
    targets: ['gold'],
    bias: 0.025,
    swing: 0.9,
    min: 2,
    max: 4,
  },
  {
    id: 'global_recession',
    emoji: '📉',
    title: 'Global Recession',
    hint: 'Ekonomi global melemah.',
    targets: ['coffee', 'oil', 'diamond'],
    bias: -0.03,
    swing: 1.15,
    min: 2,
    max: 4,
  },
  {
    id: 'trade_boom',
    emoji: '📈',
    title: 'Trade Boom',
    hint: 'Perdagangan dunia sedang panas.',
    targets: ['coffee', 'oil', 'gold'],
    bias: 0.025,
    swing: 1.1,
    min: 2,
    max: 4,
  },
];

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
