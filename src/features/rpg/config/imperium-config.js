import { MAIN_CARDS } from './card-config.js';

export const IMPERIUM_MIN_LEVEL = 18;
export const IMPERIUM_DIFF_LIST = Object.freeze([1, 2, 3, 4, 5]);
export const IMPERIUM_OPTION_KEYS = Object.freeze(['A', 'B', 'C']);
export const IMPERIUM_QUESTION_CHAMBERS = Object.freeze([1, 2]);
export const IMPERIUM_CHAMBER_COUNT = 3;
export const IMPERIUM_BOSS_CHAMBER = 3;
export const IMPERIUM_QUESTIONS_PER_CHAMBER = 2;
export const IMPERIUM_RUN_TTL_SEC = 15 * 60;
export const IMPERIUM_ATTEMPT_COOLDOWN_MS = 30_000;
export const IMPERIUM_MAX_ROUNDS = 30;

export const IMPERIUM_OUTCOMES = Object.freeze({
  correct: 'correct',
  tolerable: 'tolerable',
  critical: 'critical',
});

export const IMPERIUM_OUTCOME_META = Object.freeze({
  correct: Object.freeze({ label: 'Blessing', emoji: '*Blessing*' }),
  tolerable: Object.freeze({
    label: 'Tolerable Mistake',
    emoji: '*Tolerable Mistake*',
  }),
  critical: Object.freeze({
    label: 'Critical Mistake',
    emoji: '*Critical Mistake*',
  }),
});

function effect(id, label, kind, severity, trigger, modifiers) {
  for (const [key, value] of Object.entries(modifiers)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`imperium effect ${id} needs numeric ${key}`);
    }
  }
  if (severity === 0) {
    throw new RangeError(`imperium effect ${id} needs a non-zero severity`);
  }
  if ((kind === 'blessing') !== severity < 0) {
    throw new RangeError(
      `imperium effect ${id} blessing must have negative severity`
    );
  }
  return Object.freeze({
    id,
    label,
    kind,
    severity,
    passive: Object.freeze({
      name: label,
      source: kind === 'blessing' ? 'imperium-blessing' : 'imperium-curse',
      trigger,
      modifiers: Object.freeze({ ...modifiers }),
      effects: Object.freeze([]),
    }),
  });
}

export const IMPERIUM_EFFECTS = Object.freeze({
  blessing_keen_edge: effect(
    'blessing_keen_edge',
    'Sharpened Edge',
    'blessing',
    -3,
    'attack',
    { damageMult: 1.15 }
  ),
  blessing_iron_ward: effect(
    'blessing_iron_ward',
    'Iron Ward',
    'blessing',
    -2,
    'defend',
    { guardMult: 0.88 }
  ),
  blessing_titan_core: effect(
    'blessing_titan_core',
    'Titan Core',
    'blessing',
    -2,
    'battle_start',
    { maxHpMult: 1.12 }
  ),
  blessing_deadly_tempo: effect(
    'blessing_deadly_tempo',
    'Deadly Tempo',
    'blessing',
    -1,
    'attack',
    { critRateBonus: 0.1 }
  ),
  tolerable_heavy_step: effect(
    'tolerable_heavy_step',
    'Heavy Step',
    'curse',
    1,
    'attack',
    { damageMult: 0.94 }
  ),
  tolerable_cracked_ward: effect(
    'tolerable_cracked_ward',
    'Cracked Ward',
    'curse',
    1,
    'defend',
    { guardMult: 1.08 }
  ),
  tolerable_hollow_core: effect(
    'tolerable_hollow_core',
    'Hollow Core',
    'curse',
    2,
    'battle_start',
    { maxHpMult: 0.94 }
  ),
  tolerable_dulled_edge: effect(
    'tolerable_dulled_edge',
    'Dulled Edge',
    'curse',
    1,
    'attack',
    { critDmgBonus: -0.25 }
  ),
  critical_broken_edge: effect(
    'critical_broken_edge',
    'Broken Edge',
    'curse',
    5,
    'attack',
    { damageMult: 0.75 }
  ),
  critical_shattered_ward: effect(
    'critical_shattered_ward',
    'Shattered Ward',
    'curse',
    5,
    'defend',
    { guardMult: 1.25 }
  ),
  critical_withered_core: effect(
    'critical_withered_core',
    'Withered Core',
    'curse',
    6,
    'battle_start',
    { maxHpMult: 0.82 }
  ),
  critical_dull_fortune: effect(
    'critical_dull_fortune',
    'Dull Fortune',
    'curse',
    4,
    'attack',
    { critDmgBonus: -0.6 }
  ),
  critical_cursed_flux: effect(
    'critical_cursed_flux',
    'Cursed Flux',
    'curse',
    4,
    'defend',
    { guardMult: 1.15 }
  ),
});

export const IMPERIUM_ANSWER_BOSS_MODIFIERS = Object.freeze({
  atkPerCritical: 0.06,
  maxHpPerCritical: 0.04,
  defAllCorrect: 0.08,
});

export const IMPERIUM_WEEKLY = Object.freeze({
  epochMs: Date.UTC(2024, 0, 1),
  weekMs: 7 * 24 * 60 * 60 * 1000,
  rotation: Object.freeze(Object.keys(MAIN_CARDS)),
});

function option(key, text, outcome, effects) {
  if (!IMPERIUM_OPTION_KEYS.includes(key)) {
    throw new RangeError(`imperium option needs key A/B/C, got ${key}`);
  }
  if (!IMPERIUM_OUTCOMES[outcome]) {
    throw new RangeError(`imperium option has unknown outcome: ${outcome}`);
  }
  if (!Array.isArray(effects) || !effects.length) {
    throw new RangeError('imperium option needs at least one effect');
  }
  for (const id of effects) {
    if (!IMPERIUM_EFFECTS[id]) {
      throw new RangeError(`imperium option references unknown effect: ${id}`);
    }
  }
  return Object.freeze({
    key,
    text,
    outcome,
    effects: Object.freeze([...effects]),
  });
}

function optionSeverity(opt) {
  return opt.effects.reduce(
    (total, id) => total + IMPERIUM_EFFECTS[id].severity,
    0
  );
}

function question(id, chamber, prompt, lore, options) {
  if (!IMPERIUM_QUESTION_CHAMBERS.includes(chamber)) {
    throw new RangeError(`imperium question ${id} needs chamber 1 or 2`);
  }
  if (options.length !== IMPERIUM_OPTION_KEYS.length) {
    throw new RangeError(
      `imperium question ${id} needs exactly ${IMPERIUM_OPTION_KEYS.length} options`
    );
  }
  if (new Set(options.map((o) => o.key)).size !== options.length) {
    throw new RangeError(`imperium question ${id} has duplicate option keys`);
  }

  const byOutcome = {};
  for (const outcome of Object.keys(IMPERIUM_OUTCOMES)) {
    const matching = options.filter((o) => o.outcome === outcome);
    if (matching.length !== 1) {
      throw new RangeError(
        `imperium question ${id} needs exactly one ${outcome} option`
      );
    }
    byOutcome[outcome] = matching[0];
  }

  const correct = optionSeverity(byOutcome.correct);
  const tolerable = optionSeverity(byOutcome.tolerable);
  const critical = optionSeverity(byOutcome.critical);
  if (!(correct < tolerable)) {
    throw new RangeError(
      `imperium question ${id}: correct must beat tolerable in severity`
    );
  }
  if (!(tolerable < critical)) {
    throw new RangeError(
      `imperium question ${id}: critical must be worse than tolerable`
    );
  }

  return Object.freeze({
    id,
    chamber,
    prompt,
    lore,
    options: Object.freeze(options),
  });
}

function theme(cardId, title, tagline, bossGimmick, questions) {
  if (!MAIN_CARDS[cardId]) {
    throw new RangeError(`imperium theme references unknown card: ${cardId}`);
  }
  for (const chamber of IMPERIUM_QUESTION_CHAMBERS) {
    const pool = questions.filter((q) => q.chamber === chamber);
    if (pool.length < IMPERIUM_QUESTIONS_PER_CHAMBER) {
      throw new RangeError(
        `imperium theme ${cardId} needs ${IMPERIUM_QUESTIONS_PER_CHAMBER} chamber ${chamber} questions`
      );
    }
  }
  return Object.freeze({
    cardId,
    title,
    tagline,
    bossGimmick: Object.freeze({ ...bossGimmick }),
    questions: Object.freeze(questions),
  });
}

function bossSkill(name, multiplier, cooldownSec) {
  return Object.freeze({
    active: Object.freeze({
      name,
      multiplier,
      flatBonus: 0,
      defIgnore: 0,
      cooldownSec,
      unlocked: true,
      upgraded: false,
    }),
    passives: Object.freeze([]),
  });
}

function boss(id, name, maxHp, atk, def, critRate, critDmg, behavior, skills) {
  return Object.freeze({
    id,
    name,
    behavior,
    skills,
    stats: Object.freeze({ maxHp, atk, def, critRate, critDmg }),
  });
}

export const IMPERIUM_THEMES = Object.freeze({
  girgas: theme(
    'girgas',
    'Girgas - Sugar Tyrant',
    'Raja permen yang membakar santai sambil menertawakan napasamu',
    { label: 'Sugar Rush', atkPct: 1.06, defPct: 1, maxHpPct: 1 },
    [
      question(
        'girgas_c1_q1',
        1,
        'Girgas menawarmu lelehan gula yang katanya mencairkan armor. Apa yang sebenarnya terjadi?',
        'Lelehan itu lengket dan menempel pada siapa pun yang menyentuhnya.',
        [
          option(
            'A',
            'Bekukan lelehannya sampai berubah kristal keras',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
          option(
            'B',
            'Biarkan lelehannya merembes ke armor-mu',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_cracked_ward']
          ),
          option(
            'C',
            'Celupkan seluruh lengan lalu biarkan mengering',
            IMPERIUM_OUTCOMES.critical,
            ['critical_shattered_ward']
          ),
        ]
      ),
      question(
        'girgas_c1_q2',
        1,
        'Lorong penuh permen lengket. Apa langkah yang menjaga lengan tetap bebas?',
        'Gula yang menempel hanya bisa dilepas oleh gerak yang stabil.',
        [
          option(
            'A',
            'Lompati sebagian besar lorong sambil bergegas',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
          option(
            'B',
            'Makan sebanyak mungkin lalu lanjutkan perjalanan',
            IMPERIUM_OUTCOMES.critical,
            ['critical_withered_core']
          ),
          option(
            'C',
            'Pakai sarung tangan batu lalu proceed pelan-pelan',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
        ]
      ),
      question(
        'girgas_c2_q1',
        2,
        'Girgas bersumpah bahwa dia baik-baik saja. Tanda mana yang paling jujur?',
        'Orang yang paling keras menyangkal biasanya yang paling perlu diperiksa.',
        [
          option(
            'A',
            'Dia tetap tersenyum sambil mengancammu',
            IMPERIUM_OUTCOMES.critical,
            ['critical_broken_edge']
          ),
          option(
            'B',
            'Dia menolak menjawab pertanyaan apa pun tentang lorong',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_deadly_tempo']
          ),
          option(
            'C',
            'Dia menjawab sedikit lebih lambat dari biasanya',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_dulled_edge']
          ),
        ]
      ),
      question(
        'girgas_c2_q2',
        2,
        'Jalan keluar tertutup permen yang bisa meledak. Apa prioritas yang benar?',
        'Girgas suka menunda letupan sampai korbannya terlalu dekat.',
        [
          option(
            'A',
            'Dekati letupan dan pakai lengan sebagai tameng',
            IMPERIUM_OUTCOMES.critical,
            ['critical_cursed_flux']
          ),
          option(
            'B',
            'Tabrak permen sebanyak mungkin supaya meledak lebih cepat',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
          option(
            'C',
            'Cari rongga di dinding lalu lewati saat ledakan mereda',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_keen_edge']
          ),
        ]
      ),
    ]
  ),

  lena: theme(
    'lena',
    'Lena - Starfall Arbiter',
    'Pemanah yang mengukur segalanya dari atas',
    { label: 'Starfall', atkPct: 1, defPct: 1.08, maxHpPct: 1 },
    [
      question(
        'lena_c1_q1',
        1,
        'Anak panah Lena memecah menjadi tiga. Susunan mana yang paling menambah damage?',
        'Tiga sudut: satu mengunci, dua menusuk.',
        [
          option(
            'A',
            'Satu panah mengunci lalu dua menusuk bersamaan',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_keen_edge']
          ),
          option(
            'B',
            'Lempar ketiganya ke langit lalu turunkan tanpa kendali',
            IMPERIUM_OUTCOMES.critical,
            ['critical_broken_edge']
          ),
          option(
            'C',
            'Ketiganya ditembakkan bersamaan ke satu titik yang sama',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_dulled_edge']
          ),
        ]
      ),
      question(
        'lena_c1_q2',
        1,
        'Angin di Menara Bintang berbalik arah tiap tiga puluh detik. Apa yang menjaga akurasi?',
        'Tembakan yang meleset menjadi pelajaran, bukan alasan untuk menyerah.',
        [
          option(
            'A',
            'Tembak seadanya sambil berharap hasilnya bagus',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_dulled_edge']
          ),
          option(
            'B',
            'Hitung sudut dan timbang kompensasinya',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_deadly_tempo']
          ),
          option(
            'C',
            'Tutup mata dan andalkan takdir sepenuhnya',
            IMPERIUM_OUTCOMES.critical,
            ['critical_dull_fortune']
          ),
        ]
      ),
      question(
        'lena_c2_q1',
        2,
        'Lena menawarkan jatuhan yang disebut aman. Kenapa itu jebakan?',
        'Dia mengukur jarak lorong, bukan niat baik.',
        [
          option(
            'A',
            'Karena yang dia hitung jarak lorong, bukan niat baik',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
          option(
            'B',
            'Karena insting selalu salah di lorong ini',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_cracked_ward']
          ),
          option(
            'C',
            'Karena dia memang berniat menjatuhkannya',
            IMPERIUM_OUTCOMES.critical,
            ['critical_shattered_ward']
          ),
        ]
      ),
      question(
        'lena_c2_q2',
        2,
        'Celah di dinding punya satu tombol pemicu. Tekanannya bagaimana?',
        'Alarm Lena berbunyi pada tegangan yang terlampau tinggi.',
        [
          option(
            'A',
            'Tekan ringan dua kali lalu lepaskan',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
          option(
            'B',
            'Tancapkan paling dalam demi keamanan',
            IMPERIUM_OUTCOMES.critical,
            ['critical_cursed_flux']
          ),
          option(
            'C',
            'Tancapkan secukupnya lalu tekan habis',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_titan_core']
          ),
        ]
      ),
    ]
  ),

  ameris: theme(
    'ameris',
    'Ameris - Cocoa Empath',
    'Yang membaca mood labirin lalu memakainya sebagai senjata',
    { label: 'Choco Barrage', atkPct: 1, defPct: 1, maxHpPct: 1.08 },
    [
      question(
        'ameris_c1_q1',
        1,
        'Ameris bilang kamu aman. Tanda mana yang benar-benar memastikan?',
        'Ameris selalu sopan. Tidak selalu jujur.',
        [
          option(
            'A',
            'Dia mengatakannya sambil tersenyum',
            IMPERIUM_OUTCOMES.critical,
            ['critical_shattered_ward']
          ),
          option(
            'B',
            'Lantai tempat ia berdiri memang tidak bisa dilewati',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_titan_core']
          ),
          option(
            'C',
            'Dia terlihat tenang saat mengatakannya',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_cracked_ward']
          ),
        ]
      ),
      question(
        'ameris_c1_q2',
        1,
        'Sekeping coklat jatuh jadi tiga bagian. Mana yang membuatmu idempoten?',
        'Idempoten berarti dua kali sama dengan sekali.',
        [
          option(
            'A',
            'Jatuhkan lalu ambil tepat satu bagian',
            IMPERIUM_OUTCOMES.critical,
            ['critical_broken_edge']
          ),
          option(
            'B',
            'Jatuhkan yang paling besar dan abaikan sisanya',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
          option(
            'C',
            'Jatuhkan, kumpulkan, lalu abaikan bagian kembar',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_keen_edge']
          ),
        ]
      ),
      question(
        'ameris_c2_q1',
        2,
        'Ameris menyodorkan coklat panas dan berkata coba dulu. Apa langkah benar?',
        'Coklat di labirin ini sudah beracun sejak lama.',
        [
          option(
            'A',
            'Simpan dulu dan periksa di luar labirin',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
          option(
            'B',
            'Minum sedikit untuk mengukur kadar racunnya',
            IMPERIUM_OUTCOMES.critical,
            ['critical_withered_core']
          ),
          option(
            'C',
            'Bilas dengan air biasa lalu minum sedikit',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_hollow_core']
          ),
        ]
      ),
      question(
        'ameris_c2_q2',
        2,
        'Lorong menyempit bertahap. Langkah mana yang menjaga headroom?',
        'Headroom adalah ruang tersisa sebelum lenganmu menabrak dinding.',
        [
          option(
            'A',
            'Jalan cepat tapi miring sedikit',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
          option(
            'B',
            'Jalan stabil dan sisakan ruang untuk mundur',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
          option(
            'C',
            'Jalan secepat mungkin sampai mentok',
            IMPERIUM_OUTCOMES.critical,
            ['critical_cursed_flux']
          ),
        ]
      ),
    ]
  ),

  daisy: theme(
    'daisy',
    'Daisy - Last Stand Warden',
    'Yang bertahan lebih lama dari yang mestinya',
    { label: 'Last Stand', atkPct: 0.97, defPct: 1.1, maxHpPct: 1 },
    [
      question(
        'daisy_c1_q1',
        1,
        'Daisy menahan gerbang selama enam jam. Apa yang sebenarnya dia andalkan?',
        'Gerbang itu hanya kebal sebagian besar waktu.',
        [
          option(
            'A',
            'Titik lemah mekanisme pintu yang dia kenal',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
          option('B', 'Semangat', IMPERIUM_OUTCOMES.tolerable, [
            'tolerable_cracked_ward',
          ]),
          option(
            'C',
            'Takut pada apa yang ada di balik pintu',
            IMPERIUM_OUTCOMES.critical,
            ['critical_withered_core']
          ),
        ]
      ),
      question(
        'daisy_c1_q2',
        1,
        'Pelat armor bisa retak. Retakan di bagian mana yang paling tahan?',
        'Retak di alat jauh lebih sulit diperbaiki daripada retak di flesh.',
        [
          option(
            'A',
            'Pelat kaki yang selalu dipakai bergerak',
            IMPERIUM_OUTCOMES.critical,
            ['critical_broken_edge']
          ),
          option(
            'B',
            'Pelat dada agar menahan semua serangan depan',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_cracked_ward']
          ),
          option(
            'C',
            'Pelat bahu sebagai penahan benturan pertama',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_titan_core']
          ),
        ]
      ),
      question(
        'daisy_c2_q1',
        2,
        'Daisy berkata: transfer waktumu keanku dan aku buka pintu boss. Apa yang hilang?',
        'Transfer waktu mengurangi sumber daya di tempat lain.',
        [
          option(
            'A',
            'Tidak ada yang hilang, tawarannya gratis',
            IMPERIUM_OUTCOMES.critical,
            ['critical_withered_core']
          ),
          option(
            'B',
            'Cooldown beberapa serangan ikut terpakai',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_deadly_tempo']
          ),
          option(
            'C',
            'Cadangan pemulihan ikut habis',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_hollow_core']
          ),
        ]
      ),
      question(
        'daisy_c2_q2',
        2,
        'Pilar runtuh berurutan. Pilar mana yang menahan guncangan paling lama?',
        'Urutan runtuh dimulai dari yang paling ringan.',
        [
          option(
            'A',
            'Semua pilar sekaligus tanpa urutan',
            IMPERIUM_OUTCOMES.critical,
            ['critical_cursed_flux']
          ),
          option(
            'B',
            'Pilar terakhir yang masih berdiri',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
          option(
            'C',
            'Pilar pertama sebagai penahan beban',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_keen_edge']
          ),
        ]
      ),
    ]
  ),

  luuk: theme(
    'luuk',
    'Luuk - Savage Instinct',
    'Yang membaca kelemahan lalu menerobos guard',
    { label: 'Predatory Instinct', atkPct: 1.1, defPct: 1, maxHpPct: 1 },
    [
      question(
        'luuk_c1_q1',
        1,
        'Luuk menyerang armor tebal. Serangan mana yang mengabaikan DEF paling besar?',
        'Mengabaikan DEF membuat damage benar-benar masuk, bukan sekadar dioleh sipit.',
        [
          option(
            'A',
            'Serang tepat bagian armor yang paling tipis',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_keen_edge']
          ),
          option(
            'B',
            'Serang bagian armor yang paling tebal',
            IMPERIUM_OUTCOMES.critical,
            ['critical_broken_edge']
          ),
          option(
            'C',
            'Serang berulang pada titik yang sama',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
        ]
      ),
      question(
        'luuk_c1_q2',
        1,
        'Target punya ATK lebih tinggi darimu. Apa yang benar secara konsep combat?',
        'ATK lawan lebih besar berarti hasil lebih besar, tapi risiko juga lebih besar.',
        [
          option(
            'A',
            'Mundur pelan sambil menjaga jarak',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_heavy_step']
          ),
          option(
            'B',
            'Kurangi risiko dengan menjaga jarak',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
          option(
            'C',
            'Maju terus tanpa menjaga jarak',
            IMPERIUM_OUTCOMES.critical,
            ['critical_cursed_flux']
          ),
        ]
      ),
      question(
        'luuk_c2_q1',
        2,
        'Luuk memperlambat napasnya sebelum menerjang. Apa gunanya?',
        'Napas yang tenang menjaga presisi di bawah tekanan.',
        [
          option(
            'A',
            'Menghimpun ketenangan agar serangannya pertama paling akurat',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_deadly_tempo']
          ),
          option(
            'B',
            'Memulihkan tenaga sebelum menerjang',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_hollow_core']
          ),
          option(
            'C',
            'Membakar seluruh tenaga seketika',
            IMPERIUM_OUTCOMES.critical,
            ['critical_withered_core']
          ),
        ]
      ),
      question(
        'luuk_c2_q2',
        2,
        'Serangan Luuk menembus bagian armor tertentu. Mana yang menutup celah itu?',
        'Celah armor paling berbahaya adalah yang paling cepat ditutup.',
        [
          option(
            'A',
            'Perkuat bagian yang paling jarang diserang',
            IMPERIUM_OUTCOMES.tolerable,
            ['tolerable_cracked_ward']
          ),
          option(
            'B',
            'Perkuat semuanya sekaligus sampai rapuh',
            IMPERIUM_OUTCOMES.critical,
            ['critical_cursed_flux']
          ),
          option(
            'C',
            'Perkuat bagian yang paling sering ditembus',
            IMPERIUM_OUTCOMES.correct,
            ['blessing_iron_ward']
          ),
        ]
      ),
    ]
  ),
});

export const IMPERIUM_FALLBACK_THEME = theme(
  'girgas',
  'Imperium Unnamed Warden',
  'Labirin memakai tema cadangan karena konten kartu mingguan belum tersedia',
  { label: 'Fallback Seal', atkPct: 1, defPct: 1, maxHpPct: 1 },
  [
    question(
      'fallback_c1_q1',
      1,
      'Pintu labirin mengunci di depanmu. Mana langkah yang benar?',
      'Labirin menguji pertanyaan, bukan kekuatan fisik.',
      [
        option(
          'A',
          'Paksa pintunya dengan tangan kosong',
          IMPERIUM_OUTCOMES.critical,
          ['critical_broken_edge']
        ),
        option(
          'B',
          'Baca panelnya dan jawab sesuai aturan',
          IMPERIUM_OUTCOMES.correct,
          ['blessing_keen_edge']
        ),
        option(
          'C',
          'Cari pintu lain dan berharap ada yang terbuka',
          IMPERIUM_OUTCOMES.tolerable,
          ['tolerable_heavy_step']
        ),
      ]
    ),
    question(
      'fallback_c1_q2',
      1,
      'Dua jalur tersedia: lebar tapi panas, sempit tapi tenang. Mana yang lebih aman?',
      'Keputusan ditentukan oleh durasi, bukan lebar.',
      [
        option(
          'A',
          'Jalur yang terlihat paling terang',
          IMPERIUM_OUTCOMES.critical,
          ['critical_shattered_ward']
        ),
        option(
          'B',
          'Jalur lebar karena lebih cepat selesai',
          IMPERIUM_OUTCOMES.tolerable,
          ['tolerable_heavy_step']
        ),
        option(
          'C',
          'Jalur sempit karena paparan panasnya lebih kecil',
          IMPERIUM_OUTCOMES.correct,
          ['blessing_iron_ward']
        ),
      ]
    ),
    question(
      'fallback_c2_q1',
      2,
      'Boss menanyakan alasanmu masuk. Jawaban mana yang paling tepat?',
      'Boss menghakimi alasan, bukan kebenaran.',
      [
        option('A', 'Jawab jujur dan ringkas', IMPERIUM_OUTCOMES.correct, [
          'blessing_deadly_tempo',
        ]),
        option('B', 'Diam saja sampai dia bosan', IMPERIUM_OUTCOMES.critical, [
          'critical_dull_fortune',
        ]),
        option('C', 'Berbohong sebagian', IMPERIUM_OUTCOMES.tolerable, [
          'tolerable_cracked_ward',
        ]),
      ]
    ),
    question(
      'fallback_c2_q2',
      2,
      'Ada trap yang aktif setiap tiga detik. Di mana window aman?',
      'Trap tidak bisa dihapus, hanya bisa dielewati.',
      [
        option(
          'A',
          'Berhenti di tengah-tengah dan diam saja',
          IMPERIUM_OUTCOMES.critical,
          ['critical_cursed_flux']
        ),
        option(
          'B',
          'Tepat sebelum trap reset terjadi',
          IMPERIUM_OUTCOMES.tolerable,
          ['tolerable_dulled_edge']
        ),
        option(
          'C',
          'Tepat setelah trap reset dan sebelum lengket lagi',
          IMPERIUM_OUTCOMES.correct,
          ['blessing_keen_edge']
        ),
      ]
    ),
  ]
);

function difficulty(
  diff,
  name,
  emoji,
  description,
  requires,
  bossDef,
  rewards
) {
  if (!IMPERIUM_DIFF_LIST.includes(diff)) {
    throw new RangeError(`imperium difficulty out of range: ${diff}`);
  }
  if (!requires.every((r) => IMPERIUM_DIFF_LIST.includes(r) && r < diff)) {
    throw new RangeError(
      `imperium difficulty ${diff} has invalid unlock requirements`
    );
  }
  for (const [key, range] of Object.entries(rewards)) {
    if (
      !Number.isInteger(range?.min) ||
      !Number.isInteger(range?.max) ||
      range.min < 0 ||
      range.max < range.min
    ) {
      throw new RangeError(`imperium difficulty ${diff} invalid ${key} range`);
    }
  }
  return Object.freeze({
    diff,
    name,
    emoji,
    description,
    requires: Object.freeze([...requires]),
    boss: bossDef,
    rewards: Object.freeze({
      exp: Object.freeze({ ...rewards.exp }),
      coin: Object.freeze({ ...rewards.coin }),
      cerelia: Object.freeze({ ...rewards.cerelia }),
    }),
  });
}

export const IMPERIUM_DIFFICULTIES = Object.freeze({
  1: difficulty(
    1,
    'Antechamber',
    '🟢',
    'Gerbang pertama. Ramah untuk pemain baru.',
    [],
    boss(
      'imperium_sentinel_1',
      'Sentinel of the First Seal',
      800,
      42,
      8,
      0.15,
      1.4,
      'basic',
      null
    ),
    {
      exp: { min: 150, max: 220 },
      coin: { min: 40_000, max: 60_000 },
      cerelia: { min: 2, max: 4 },
    }
  ),
  2: difficulty(
    2,
    'Gilded Gallery',
    '🟡',
    'Lorong berlapis emas dengan jebakan sosial.',
    [],
    boss(
      'imperium_warden_2',
      'Gilded Torturer',
      1_500,
      58,
      12,
      0.18,
      1.45,
      'basic',
      null
    ),
    {
      exp: { min: 280, max: 400 },
      coin: { min: 70_000, max: 100_000 },
      cerelia: { min: 4, max: 7 },
    }
  ),
  3: difficulty(
    3,
    'Hollow Court',
    '🟠',
    'Pilihan mulai diuji. Satu kesalahan berat sudah fatal.',
    [],
    boss(
      'imperium_monarch_3',
      'Hollow Monarch',
      2_600,
      78,
      18,
      0.2,
      1.5,
      'skill_based',
      bossSkill('Royal Verdict', 1.4, 8)
    ),
    {
      exp: { min: 520, max: 750 },
      coin: { min: 120_000, max: 170_000 },
      cerelia: { min: 7, max: 11 },
    }
  ),
  4: difficulty(
    4,
    'Thorned Archive',
    '🔴',
    'Terbuka setelah Diff 1, 2, dan 3 clear minggu ini.',
    [1, 2, 3],
    boss(
      'imperium_archivist_4',
      'Thorned Archivist',
      4_200,
      105,
      26,
      0.22,
      1.55,
      'skill_based',
      bossSkill('Shelf of Blades', 1.6, 7)
    ),
    {
      exp: { min: 900, max: 1_300 },
      coin: { min: 200_000, max: 280_000 },
      cerelia: { min: 11, max: 16 },
    }
  ),
  5: difficulty(
    5,
    'Sovereign Vault',
    '⚫',
    'Terbuka setelah Diff 4 clear minggu ini. Ujian terakhir.',
    [4],
    boss(
      'imperium_sovereign_5',
      'Imperium Sovereign',
      6_800,
      140,
      34,
      0.25,
      1.6,
      'skill_based',
      bossSkill('Sovereign Edict', 1.9, 6)
    ),
    {
      exp: { min: 1_500, max: 2_200 },
      coin: { min: 320_000, max: 450_000 },
      cerelia: { min: 16, max: 24 },
    }
  ),
});

export function getDifficulty(diff) {
  if (diff === null || diff === undefined || diff === '') return null;
  const key = Number(diff);
  if (!Number.isInteger(key)) return null;
  return IMPERIUM_DIFFICULTIES[key] ?? null;
}

export function getDifficulties() {
  return IMPERIUM_DIFF_LIST.map((d) => IMPERIUM_DIFFICULTIES[d]);
}

export function weekIndexFor(nowMs = Date.now()) {
  const { epochMs, weekMs } = IMPERIUM_WEEKLY;
  return Math.floor((nowMs - epochMs) / weekMs);
}

export function weekStartMsFor(nowMs = Date.now()) {
  return IMPERIUM_WEEKLY.epochMs + weekIndexFor(nowMs) * IMPERIUM_WEEKLY.weekMs;
}

export function rotationCards() {
  return [...IMPERIUM_WEEKLY.rotation];
}

export function weeklyCardIdFor(weekIndex) {
  const ids = rotationCards();
  if (!ids.length) return null;
  const base = Number.isInteger(weekIndex) ? weekIndex : 0;
  const idx = ((base % ids.length) + ids.length) % ids.length;
  return ids[idx];
}

export function themeForCard(cardId) {
  if (cardId && IMPERIUM_THEMES[cardId]) return IMPERIUM_THEMES[cardId];
  return IMPERIUM_FALLBACK_THEME;
}

export function weeklyThemeForNow(nowMs = Date.now()) {
  const weekIndex = weekIndexFor(nowMs);
  const cardId = weeklyCardIdFor(weekIndex);
  return {
    weekIndex,
    cardId,
    card: cardId ? (MAIN_CARDS[cardId] ?? null) : null,
    theme: themeForCard(cardId),
  };
}

export function getEffect(effectId) {
  return IMPERIUM_EFFECTS[effectId] ?? null;
}

export function rollReward(range, random = Math.random) {
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}
