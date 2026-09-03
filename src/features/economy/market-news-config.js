/**
 * Konfigurasi Market News — bagian dari konfigurasi Virtual Market.
 *
 * Semua balancing berita ada di file ini: peluang muncul, cooldown,
 * probabilitas outcome (TRUE/PARTIAL/FALSE), kekuatan dampak, durasi,
 * bobot komoditas, dan teks berita. Service & engine tidak boleh
 * menghardcode angka balancing.
 */

// Peluang sebuah berita muncul pada satu tick market (1 tick = 1 jam).
export const NEWS_SPAWN_CHANCE = 0.32;

// Jarak minimal (tick) antar berita apa pun, supaya tidak spam.
export const NEWS_GLOBAL_COOLDOWN_TICKS = 2;

// Batas berita yang berpengaruh bersamaan.
export const NEWS_MAX_ACTIVE = 3;
export const NEWS_MAX_ACTIVE_PER_COMMODITY = 1;

// Jumlah berita yang diumumkan ke grup per siklus pengiriman.
export const NEWS_ANNOUNCE_PER_RUN = 1;

// Jeda antar grup saat mengirim pengumuman.
export const NEWS_DELIVERY_DELAY_MS = 1_500;

// Jumlah berita yang ditampilkan `.market news`.
export const NEWS_FEED_LIMIT = 5;

/**
 * Tipe berita.
 * - weight   : bobot pemilihan tipe saat berita muncul
 * - impact   : rentang kekuatan bias per tick (sebelum dikali outcome)
 * - swing    : rentang tambahan volatilitas
 * - duration : rentang lama efek (tick) setelah delay
 * - cooldown : jarak minimal (tick) antar berita dengan tipe yang sama
 * - footer   : catatan yang selalu ikut dikirim, tanpa bocorkan outcome
 */
export const NEWS_TYPES = {
  news: {
    id: 'news',
    emoji: '📰',
    label: 'MARKET NEWS',
    weight: 0.6,
    impact: [0.006, 0.016],
    swing: [1.0, 1.12],
    duration: [3, 5],
    cooldown: 2,
    footer:
      '_Informasi pasar — belum tentu berdampak seperti yang diperkirakan._',
  },
  rumor: {
    id: 'rumor',
    emoji: '❓',
    label: 'MARKET RUMOR',
    weight: 0.3,
    impact: [0.004, 0.018],
    swing: [1.05, 1.28],
    duration: [2, 4],
    cooldown: 4,
    footer: '_Kabar belum terverifikasi. Pertimbangkan sendiri sebelum masuk._',
  },
  breaking: {
    id: 'breaking',
    emoji: '🚨',
    label: 'BREAKING NEWS',
    weight: 0.1,
    impact: [0.016, 0.03],
    swing: [1.15, 1.35],
    duration: [4, 6],
    cooldown: 10,
    footer: '_Kabar besar, tapi arah harga tetap ditentukan pasar._',
  },
};

export const NEWS_TYPE_IDS = Object.keys(NEWS_TYPES);

export const NEWS_OUTCOMES = ['TRUE', 'PARTIAL', 'FALSE'];

/** Probabilitas hidden outcome per tipe. Rumor paling tidak bisa dipercaya. */
export const NEWS_OUTCOME_WEIGHTS = {
  news: { TRUE: 0.5, PARTIAL: 0.33, FALSE: 0.17 },
  rumor: { TRUE: 0.3, PARTIAL: 0.3, FALSE: 0.4 },
  breaking: { TRUE: 0.55, PARTIAL: 0.3, FALSE: 0.15 },
};

/** Pengali kekuatan dampak per outcome. FALSE hampir tidak berdampak. */
export const NEWS_OUTCOME_MULT = {
  TRUE: [0.85, 1.0],
  PARTIAL: [0.35, 0.6],
  FALSE: [0.0, 0.25],
};

/** Peluang arah dampak berbalik dari yang tersirat di beritanya. */
export const NEWS_REVERSE_CHANCE = {
  TRUE: 0,
  PARTIAL: 0.12,
  FALSE: 0.45,
};

/**
 * PARTIAL pada berita multi-komoditas: peluang sebuah komoditas tambahan
 * tidak ikut terdampak (efek "hanya sebagian benar").
 */
export const NEWS_PARTIAL_DROP_CHANCE = 0.35;

// Efek tidak langsung penuh: delay sebelum mulai, lalu naik bertahap.
export const NEWS_IMPACT_DELAY = [1, 2];
export const NEWS_IMPACT_RAMP = [2, 3];

// Porsi akhir masa berlaku yang dipakai untuk meredakan efek secara bertahap.
export const NEWS_FADE_PORTION = 0.5;

// Pagar total pengaruh semua berita, supaya tidak melebihi event ekonomi.
export const NEWS_TOTAL_BIAS_CLAMP = 0.04;
export const NEWS_TOTAL_SWING_CLAMP = 1.45;

/** Bobot komoditas sebagai bahan berita. */
export const NEWS_COMMODITY_WEIGHTS = {
  rice: 1.0,
  coffee: 1.2,
  oil: 1.2,
  gold: 1.0,
  diamond: 1.1,
};

/**
 * Template berita.
 * - type      : tipe berita (menentukan kekuatan & frekuensi)
 * - targets   : komoditas yang disebut di beritanya
 * - direction : arah yang *tersirat* di berita (1 naik, -1 turun).
 *               Arah nyata tetap ditentukan hidden outcome.
 * - strength  : pengali kekuatan khusus template (opsional)
 * - weight    : bobot pemilihan template (opsional)
 */
export const NEWS_TEMPLATES = [
  // --- Rice: panen, cuaca, distribusi ---
  {
    id: 'rice_dry_season',
    type: 'news',
    targets: ['rice'],
    direction: 1,
    title: 'Musim Kering',
    message:
      'Musim kering diperkirakan memperlambat masa tanam padi tahun ini.',
  },
  {
    id: 'rice_harvest',
    type: 'news',
    targets: ['rice'],
    direction: -1,
    title: 'Panen Lancar',
    message:
      'Panen padi dilaporkan berjalan lancar di sentra produksi utama.',
  },
  {
    id: 'rice_logistics',
    type: 'news',
    targets: ['rice'],
    direction: -1,
    title: 'Distribusi Normal',
    message:
      'Jalur distribusi pangan kembali normal setelah perbaikan akses.',
  },
  {
    id: 'rice_reserve',
    type: 'rumor',
    targets: ['rice'],
    direction: -1,
    title: 'Cadangan Beras',
    message:
      'Beredar kabar cadangan beras akan dilepas ke pasar dalam jumlah besar.',
  },
  {
    id: 'rice_hoarding',
    type: 'rumor',
    targets: ['rice'],
    direction: 1,
    title: 'Penimbunan Stok',
    message:
      'Ada kabar penimbunan beras di tingkat distributor mulai terjadi.',
  },
  {
    id: 'rice_flood',
    type: 'breaking',
    targets: ['rice'],
    direction: 1,
    title: 'Banjir Lahan Padi',
    message:
      'Banjir dilaporkan merusak lahan padi di wilayah produksi utama.',
  },

  // --- Coffee: festival, panen, cuaca, ekspor ---
  {
    id: 'coffee_festival',
    type: 'news',
    targets: ['coffee'],
    direction: 1,
    title: 'Coffee Festival',
    message:
      'Permintaan Coffee diperkirakan meningkat setelah festival nasional.',
  },
  {
    id: 'coffee_export',
    type: 'news',
    targets: ['coffee'],
    direction: 1,
    title: 'Ekspor Menguat',
    message:
      'Permintaan ekspor Coffee dilaporkan menguat dari pembeli luar negeri.',
  },
  {
    id: 'coffee_harvest',
    type: 'news',
    targets: ['coffee'],
    direction: -1,
    title: 'Panen Melimpah',
    message: 'Panen Coffee tahun ini diperkirakan di atas rata-rata.',
  },
  {
    id: 'coffee_frost',
    type: 'rumor',
    targets: ['coffee'],
    direction: 1,
    title: 'Cuaca Ekstrem',
    message:
      'Beredar kabar cuaca ekstrem melanda kebun Coffee di dataran tinggi.',
  },
  {
    id: 'coffee_substitute',
    type: 'rumor',
    targets: ['coffee'],
    direction: -1,
    title: 'Selera Bergeser',
    message:
      'Ada kabar konsumen mulai beralih ke minuman alternatif selain Coffee.',
  },
  {
    id: 'coffee_warehouse',
    type: 'breaking',
    targets: ['coffee'],
    direction: -1,
    title: 'Stok Menumpuk',
    message:
      'Stok Coffee di gudang eksportir dilaporkan menumpuk melewati kapasitas.',
  },

  // --- Oil: produksi, oversupply, demand industri, distribusi ---
  {
    id: 'oil_capacity',
    type: 'news',
    targets: ['oil'],
    direction: -1,
    title: 'Kapasitas Produksi',
    message:
      'Beberapa produsen mengumumkan penambahan kapasitas produksi Oil.',
  },
  {
    id: 'oil_industry',
    type: 'news',
    targets: ['oil'],
    direction: 1,
    title: 'Demand Industri',
    message:
      'Aktivitas industri meningkat dan konsumsi Oil ikut terdorong naik.',
  },
  {
    id: 'oil_pipeline',
    type: 'rumor',
    targets: ['oil'],
    direction: 1,
    title: 'Gangguan Distribusi',
    message: 'Beredar kabar gangguan pada jalur distribusi Oil antarwilayah.',
  },
  {
    id: 'oil_quota',
    type: 'rumor',
    targets: ['oil'],
    direction: -1,
    title: 'Pelonggaran Kuota',
    message: 'Ada kabar pelonggaran kuota produksi Oil akan segera berlaku.',
  },
  {
    id: 'oil_surge',
    type: 'breaking',
    targets: ['oil'],
    direction: -1,
    title: 'Produksi Melonjak',
    message: 'Produksi Oil dilaporkan meningkat tajam di beberapa wilayah.',
  },
  {
    id: 'oil_outage',
    type: 'breaking',
    targets: ['oil'],
    direction: 1,
    title: 'Kilang Berhenti',
    message:
      'Fasilitas pengolahan Oil dilaporkan berhenti operasi secara mendadak.',
  },

  // --- Gold: ekonomi, investor, safe haven ---
  {
    id: 'gold_safe_haven',
    type: 'news',
    targets: ['gold'],
    direction: 1,
    title: 'Safe Haven',
    message: 'Investor dilaporkan mulai memindahkan dana ke aset aman.',
  },
  {
    id: 'gold_yield',
    type: 'news',
    targets: ['gold'],
    direction: -1,
    title: 'Imbal Hasil Naik',
    message:
      'Imbal hasil instrumen lain menguat dan minat pada Gold ikut melemah.',
  },
  {
    id: 'gold_central_bank',
    type: 'rumor',
    targets: ['gold'],
    direction: 1,
    title: 'Cadangan Bank Sentral',
    message: 'Beredar kabar bank sentral kembali menambah cadangan Gold.',
  },
  {
    id: 'gold_turmoil',
    type: 'breaking',
    targets: ['gold'],
    direction: 1,
    title: 'Gejolak Ekonomi',
    message:
      'Gejolak ekonomi global dilaporkan memicu perpindahan dana ke Gold.',
  },

  // --- Diamond: luxury demand, tren, pasokan ---
  {
    id: 'diamond_trend',
    type: 'news',
    targets: ['diamond'],
    direction: 1,
    title: 'Tren Mode',
    message: 'Diamond kembali menjadi sorotan di panggung mode musim ini.',
  },
  {
    id: 'diamond_luxury',
    type: 'news',
    targets: ['diamond'],
    direction: -1,
    title: 'Permintaan Melandai',
    message: 'Permintaan barang mewah dilaporkan melandai beberapa pekan ini.',
  },
  {
    id: 'diamond_supply',
    type: 'rumor',
    targets: ['diamond'],
    direction: 1,
    title: 'Pasokan Terganggu',
    message:
      'Beredar kabar bahwa pasokan Diamond akan mengalami gangguan panjang.',
  },
  {
    id: 'diamond_synthetic',
    type: 'rumor',
    targets: ['diamond'],
    direction: -1,
    title: 'Diamond Sintetis',
    message:
      'Ada kabar pasokan Diamond sintetis membanjiri pasar kelas menengah.',
  },
  {
    id: 'diamond_release',
    type: 'breaking',
    targets: ['diamond'],
    direction: -1,
    title: 'Pelepasan Cadangan',
    message:
      'Cadangan Diamond dalam jumlah besar dilaporkan dilepas ke pasar.',
  },

  // --- Multi komoditas ---
  {
    id: 'global_slowdown',
    type: 'news',
    targets: ['coffee', 'oil', 'diamond'],
    direction: -1,
    title: 'Ekonomi Melambat',
    message: 'Aktivitas ekonomi global dilaporkan melambat dari perkiraan.',
    weight: 0.8,
  },
  {
    id: 'trade_pact',
    type: 'news',
    targets: ['coffee', 'oil', 'gold'],
    direction: 1,
    title: 'Kesepakatan Dagang',
    message:
      'Kesepakatan dagang baru diperkirakan mendorong volume perdagangan.',
    weight: 0.8,
  },
  {
    id: 'inflation_rumor',
    type: 'rumor',
    targets: ['gold', 'rice'],
    direction: 1,
    title: 'Tekanan Inflasi',
    message: 'Beredar kabar tekanan inflasi masih akan berlanjut tahun ini.',
    weight: 0.8,
  },
  {
    id: 'shipping_crisis',
    type: 'breaking',
    targets: ['coffee', 'oil', 'diamond'],
    direction: 1,
    title: 'Krisis Pengiriman',
    message:
      'Krisis pengiriman global dilaporkan mengganggu rantai pasok komoditas.',
    weight: 0.7,
    strength: 0.85,
  },
  {
    id: 'demand_shock',
    type: 'breaking',
    targets: ['oil', 'diamond'],
    direction: -1,
    title: 'Permintaan Anjlok',
    message:
      'Permintaan industri dan barang mewah dilaporkan turun cukup tajam.',
    weight: 0.7,
    strength: 0.85,
  },
];

export const NEWS_TEMPLATE_MAP = Object.fromEntries(
  NEWS_TEMPLATES.map((t) => [t.id, t])
);
