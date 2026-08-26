import { db } from '#storage/connection.js';
import SETTINGS from '#environment/settings.js';
import {
  divergentRunModel,
  divergentUsageModel,
  statsModel,
  userModel,
  walletModel,
} from '#storage/models/index.js';

const PATHS = {
  destruction: {
    name: 'Destruction',
    description: 'Damage naik saat HP menipis dan pemulihan setelah battle.',
  },
  hunt: {
    name: 'Hunt',
    description: 'Serangan cepat dengan critical dan peluang dodge tinggi.',
  },
  erudition: {
    name: 'Erudition',
    description: 'Damage stabil yang menguat seiring banyaknya blessing.',
  },
  preservation: {
    name: 'Preservation',
    description: 'Mengurangi damage dan memberi shield setiap battle.',
  },
  abundance: {
    name: 'Abundance',
    description: 'Pemulihan HP tinggi dan batas HP lebih besar.',
  },
  nihility: {
    name: 'Nihility',
    description: 'Mengikis pertahanan musuh dan menghasilkan fragment ekstra.',
  },
};

const BLESSINGS = [
  { id: 'destruction_fighting_spirit', path: 'destruction', name: 'Fighting Spirit', text: '+16% damage saat HP di bawah 60%.', atk: 0.16 },
  { id: 'destruction_regression', path: 'destruction', name: 'Regression', text: 'Pulihkan 8 HP setelah menang.', heal: 8 },
  { id: 'destruction_cataclysm', path: 'destruction', name: 'Cataclysm', text: '+10% damage dan +5 max HP.', atk: 0.1, maxHp: 5 },
  { id: 'hunt_critical_boost', path: 'hunt', name: 'Critical Boost', text: '+15% peluang critical.', crit: 0.15 },
  { id: 'hunt_galaxy', path: 'hunt', name: 'Galaxy Hunter', text: '+14% damage terhadap elite dan boss.', bossAtk: 0.14 },
  { id: 'hunt_afterimage', path: 'hunt', name: 'Afterimage', text: '+10% peluang menghindari damage.', dodge: 0.1 },
  { id: 'erudition_brain', path: 'erudition', name: 'Brain in a Vat', text: '+5% damage untuk setiap 3 blessing.', perBlessing: 0.05 },
  { id: 'erudition_inspiration', path: 'erudition', name: 'Inspiration', text: '+12% damage.', atk: 0.12 },
  { id: 'erudition_compression', path: 'erudition', name: 'Energy Compression', text: '+25% critical damage.', critDamage: 0.25 },
  { id: 'preservation_construct', path: 'preservation', name: 'Firm Construct', text: '-12% damage yang diterima.', reduction: 0.12 },
  { id: 'preservation_shield', path: 'preservation', name: 'Amber Shield', text: 'Dapatkan shield 7 HP sebelum battle.', shield: 7 },
  { id: 'preservation_resonance', path: 'preservation', name: 'Resonant Guard', text: '+8 max HP dan -5% damage.', maxHp: 8, reduction: 0.05 },
  { id: 'abundance_dewdrop', path: 'abundance', name: 'Dewdrop', text: 'Pulihkan 12 HP setelah menang.', heal: 12 },
  { id: 'abundance_lotus', path: 'abundance', name: 'Lotus in Bloom', text: '+15 max HP.', maxHp: 15 },
  { id: 'abundance_mercy', path: 'abundance', name: 'Merciful Cycle', text: 'Event pemulihan memberi 50% lebih banyak HP.', eventHeal: 0.5 },
  { id: 'nihility_suspicion', path: 'nihility', name: 'Suspicion', text: 'Abaikan 14% kekuatan musuh.', weaken: 0.14 },
  { id: 'nihility_void', path: 'nihility', name: 'Void Current', text: '+18% damage setelah node event.', atk: 0.18 },
  { id: 'nihility_entropy', path: 'nihility', name: 'Entropy', text: '+25 fragment dari setiap kemenangan.', fragments: 25 },
];

const CURIOS = [
  { id: 'dimension_dice', name: 'Dimension Dice', text: 'Reward fragment +25%.', fragmentMult: 0.25 },
  { id: 'healing_terminal', name: 'Healing Terminal', text: 'Pulihkan 15 HP saat didapat.', instantHeal: 15 },
  { id: 'shattered_crown', name: 'Shattered Crown', text: '+18% damage, tetapi max HP -8.', atk: 0.18, maxHp: -8 },
  { id: 'silver_coin', name: 'Silver Coin', text: 'Reward akhir cash +30%.', cashMult: 0.3 },
  { id: 'clockwork', name: 'Clockwork Apple', text: 'Damage yang diterima -8%.', reduction: 0.08 },
  { id: 'lucky_capsule', name: 'Lucky Capsule', text: 'Peluang critical +10%.', crit: 0.1 },
  { id: 'wax_seal', name: 'Path Wax Seal', text: 'Blessing dari Path pilihanmu lebih sering muncul.', pathBias: true },
  { id: 'cosmic_credit', name: 'Cosmic Credit', text: 'Langsung memperoleh 180 fragment.', instantFragments: 180 },
  { id: 'mechanical_cuckoo', name: 'Mechanical Cuckoo', text: '+12% damage terhadap boss.', bossAtk: 0.12 },
  { id: 'revival_chip', name: 'Revival Chip', text: 'Sekali per run, bangkit dengan 35 HP.', revive: true },
  { id: 'error_corrupted_code', name: 'Error Curio: Corrupted Code', text: 'Kekuatan semua musuh +18%.', error: true, enemyPower: 0.18 },
  { id: 'error_empty_pouch', name: 'Error Curio: Empty Pouch', text: 'Fragment yang diperoleh -20%.', error: true, fragmentMult: -0.2 },
  { id: 'error_broken_clock', name: 'Error Curio: Broken Clock', text: 'Damage yang diterima +15%.', error: true, incomingDamage: 0.15 },
];

const NAMES = {
  battle: ['Antimatter Patrol', 'Fragmentum Pack', 'Void Marauders', 'Automaton Squad', 'Dreamjolt Troupe', 'Swarm Remnants'],
  event: [
    'Ruan Mei Replica',
    'Unending Darkness',
    'Cosmic Merchant',
    'Lonely Trotter',
    'Mirror of Memories',
    'Society of Architects',
    'Glitched Arcade',
    'Nameless Signal',
  ],
  treasure: ['Abandoned Vault', 'Sealed Curio Room', 'Celestial Cache'],
  elite: ['Frigid Prowler', 'Aurumaton Gatekeeper'],
  boss: ['Doomsday Beast', 'Synthetic God'],
};

const BASE_REWARD = {
  battle: { fragments: 90, cash: 0 },
  elite: { fragments: 190, cash: 0 },
  boss: { fragments: 300, cash: 0 },
};

const FINAL_REWARD = {
  baseCash: 9_000,
  cashPerFragment: 9,
  baseExp: 550,
  expPerBlessing: 25,
};

const RUN_LIMIT = {
  daily: 2,
  weekly: 5,
};

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SETTINGS.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function periodKeys(date = new Date()) {
  const parts = Object.fromEntries(
    dateFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  const dailyKey = `${parts.year}-${parts.month}-${parts.day}`;
  const localDate = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  );
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  const weeklyKey = localDate.toISOString().slice(0, 10);
  return { dailyKey, weeklyKey };
}

function normalizedUsage(row, date = new Date()) {
  const { dailyKey, weeklyKey } = periodKeys(date);
  return {
    dailyKey,
    dailyCount: row?.daily_key === dailyKey ? row.daily_count : 0,
    weeklyKey,
    weeklyCount: row?.weekly_key === weeklyKey ? row.weekly_count : 0,
  };
}

const EVENT_SCENARIOS = {
  'Ruan Mei Replica': [
    { id: 'research', name: 'Bantu Penelitian', text: 'Dapatkan Blessing acak dan 60 fragment.' },
    { id: 'ruan_rest', name: 'Minta Pemulihan', text: 'Pulihkan 40 HP.' },
    { id: 'ruan_leave', name: 'Pergi Diam-diam', text: 'Ambil 120 fragment.' },
  ],
  'Unending Darkness': [
    { id: 'light', name: 'Nyalakan Cahaya', text: 'Bayar 80 fragment untuk memulihkan seluruh HP.' },
    { id: 'darkness', name: 'Masuki Kegelapan', text: 'Kehilangan 22 HP dan memperoleh 260 fragment.' },
    { id: 'wait', name: 'Menunggu', text: 'Pulihkan 20 HP.' },
  ],
  'Cosmic Merchant': [
    { id: 'trade', name: 'Pertukaran Aneh', text: 'Bayar 100 fragment untuk Blessing acak.' },
    { id: 'buy_curio', name: 'Beli Kotak Curio', text: 'Bayar 160 fragment untuk Curio acak.' },
    { id: 'merchant_gift', name: 'Minta Sampel Gratis', text: 'Dapatkan 90 fragment.' },
  ],
  'Lonely Trotter': [
    { id: 'chase', name: 'Kejar Trotter', text: '50% mendapat 320 fragment, jika gagal kehilangan 20 HP.' },
    { id: 'feed', name: 'Beri Makan', text: 'Bayar 60 fragment untuk mendapat 10 max HP.' },
    { id: 'trotter_leave', name: 'Biarkan Pergi', text: 'Pulihkan 25 HP.' },
  ],
  'Mirror of Memories': [
    { id: 'mirror_blessing', name: 'Tatap Pantulan', text: 'Kehilangan 15 HP untuk Blessing acak.' },
    { id: 'mirror_shatter', name: 'Pecahkan Cermin', text: 'Dapatkan 180 fragment.' },
    { id: 'mirror_restore', name: 'Pulihkan Ingatan', text: 'Pulihkan 35 HP.' },
  ],
  'Society of Architects': [
    { id: 'donate', name: 'Donasi Material', text: 'Bayar 120 fragment untuk mendapat 15 max HP.' },
    { id: 'work', name: 'Bantu Pembangunan', text: 'Kehilangan 10 HP dan mendapat 170 fragment.' },
    { id: 'shelter', name: 'Gunakan Shelter', text: 'Pulihkan 30 HP.' },
  ],
  'Glitched Arcade': [
    { id: 'jackpot', name: 'Tarik Tuas', text: '50% mendapat 280 fragment, jika gagal kehilangan 120 fragment.' },
    { id: 'repair', name: 'Perbaiki Mesin', text: 'Kehilangan 12 HP untuk mendapat Blessing acak.' },
    { id: 'arcade_leave', name: 'Cabut Kabel', text: 'Dapatkan 70 fragment.' },
  ],
  'Nameless Signal': [
    { id: 'answer_signal', name: 'Jawab Sinyal', text: 'Dapatkan Curio acak, mungkin termasuk Error Curio.' },
    { id: 'decode_signal', name: 'Dekode Sinyal', text: 'Dapatkan Blessing acak.' },
    { id: 'sell_signal', name: 'Jual Koordinat', text: 'Dapatkan 150 fragment.' },
  ],
};

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sample(values, count) {
  return shuffle(values).slice(0, count);
}

function buildNodes() {
  const regular = shuffle([
    ...Array(6).fill('battle'),
    ...Array(3).fill('event'),
    ...Array(3).fill('treasure'),
  ]);
  let regularIndex = 0;
  const counters = { battle: 0, event: 0, treasure: 0, elite: 0, boss: 0 };
  const namePools = Object.fromEntries(
    Object.entries(NAMES).map(([type, names]) => [type, shuffle(names)])
  );
  return Array.from({ length: 16 }, (_, index) => {
    const position = index + 1;
    const type = position === 5 || position === 12
      ? 'elite'
      : position === 8 || position === 16
        ? 'boss'
        : regular[regularIndex++];
    const names = namePools[type];
    const name = names[counters[type]++ % names.length];
    return { position, type, name, cleared: false };
  });
}

function totalEffects(state) {
  const effects = {};
  const owned = [
    ...state.blessings.map((id) => BLESSINGS.find((item) => item.id === id)),
    ...state.curios.map((id) => CURIOS.find((item) => item.id === id)),
  ].filter(Boolean);
  for (const item of owned) {
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'number') effects[key] = (effects[key] || 0) + value;
      if (value === true) effects[key] = true;
    }
  }
  return effects;
}

function maxHp(state) {
  return Math.max(50, state.baseMaxHp + (totalEffects(state).maxHp || 0));
}

function addFragments(state, amount) {
  const mult = 1 + (totalEffects(state).fragmentMult || 0);
  const gained = Math.floor(amount * mult);
  state.fragments += gained;
  return gained;
}

function heal(state, amount) {
  const before = state.hp;
  state.hp = Math.min(maxHp(state), state.hp + Math.floor(amount));
  return state.hp - before;
}

function availableBlessings(state, count = 3) {
  const remaining = BLESSINGS.filter((item) => !state.blessings.includes(item.id));
  const effects = totalEffects(state);
  if (!effects.pathBias) return sample(remaining, count);
  const matching = shuffle(remaining.filter((item) => item.path === state.path));
  const others = shuffle(remaining.filter((item) => item.path !== state.path));
  return [...matching, ...others].slice(0, count);
}

function availableCurios(state, count = 3) {
  return sample(CURIOS.filter((item) => !state.curios.includes(item.id)), count);
}

function grantBlessing(state) {
  const [blessing] = availableBlessings(state, 1);
  if (!blessing) return null;
  state.blessings.push(blessing.id);
  return blessing;
}

function grantCurio(state) {
  const [curio] = availableCurios(state, 1);
  if (!curio) return null;
  state.curios.push(curio.id);
  if (curio.instantHeal) heal(state, curio.instantHeal);
  if (curio.instantFragments) state.fragments += curio.instantFragments;
  state.hp = Math.min(state.hp, maxHp(state));
  return curio;
}

class DivergentUniverseService {
  get paths() {
    return PATHS;
  }

  get blessings() {
    return BLESSINGS;
  }

  get curios() {
    return CURIOS;
  }

  get finalReward() {
    return FINAL_REWARD;
  }

  get runLimit() {
    return RUN_LIMIT;
  }

  getRun(jid) {
    return divergentRunModel.find(jid);
  }

  getUsage(jid) {
    const usage = normalizedUsage(divergentUsageModel.find(jid));
    return {
      ...usage,
      dailyRemaining: Math.max(0, RUN_LIMIT.daily - usage.dailyCount),
      weeklyRemaining: Math.max(0, RUN_LIMIT.weekly - usage.weeklyCount),
    };
  }

  start(jid, metadata = {}) {
    return db.transaction(() => this._start(jid, metadata))();
  }

  _start(jid, metadata = {}) {
    userModel.ensure(jid, metadata);
    statsModel.ensure(jid);
    const current = divergentRunModel.find(jid);
    if (current?.status === 'active') {
      throw new Error('Masih ada run aktif. Gunakan `.du status` atau `.du abandon`.');
    }
    const usage = normalizedUsage(divergentUsageModel.ensure(jid));
    if (usage.dailyCount >= RUN_LIMIT.daily) {
      throw new Error(
        `Batas harian DU tercapai (${usage.dailyCount}/${RUN_LIMIT.daily}). Coba lagi setelah reset pukul 00.00 ${SETTINGS.timezone}.`
      );
    }
    if (usage.weeklyCount >= RUN_LIMIT.weekly) {
      throw new Error(
        `Batas mingguan DU tercapai (${usage.weeklyCount}/${RUN_LIMIT.weekly}). Coba lagi setelah reset Senin pukul 00.00 ${SETTINGS.timezone}.`
      );
    }
    const state = {
      path: null,
      nodeIndex: 0,
      nodes: buildNodes(),
      baseMaxHp: 100,
      hp: 100,
      fragments: 0,
      blessings: [],
      curios: [],
      pending: { type: 'path', options: Object.keys(PATHS) },
      revived: false,
      lastResult: 'Pilih Path untuk memulai sinkronisasi.',
    };
    const run = divergentRunModel.create(jid, state);
    divergentUsageModel.save(jid, {
      ...usage,
      dailyCount: usage.dailyCount + 1,
      weeklyCount: usage.weeklyCount + 1,
    });
    return run;
  }

  choosePath(jid, pathId) {
    const run = this._activeRun(jid);
    if (run.state.path) throw new Error('Path run ini sudah dipilih.');
    const path = String(pathId || '').toLowerCase();
    if (!PATHS[path]) throw new Error('Path tidak tersedia. Lihat daftar dengan `.du paths`.');
    run.state.path = path;
    run.state.pending = null;
    if (path === 'abundance') {
      run.state.baseMaxHp += 10;
      run.state.hp += 10;
    }
    run.state.lastResult = `Sinkronisasi Path ${PATHS[path].name} berhasil.`;
    return divergentRunModel.save(run);
  }

  explore(jid) {
    const run = this._activeRun(jid);
    const state = run.state;
    if (!state.path) throw new Error('Pilih Path dahulu dengan `.du path <nama>`.');
    if (state.pending) throw new Error('Selesaikan pilihan yang tertunda dengan `.du choose <nomor>`.');
    const node = state.nodes[state.nodeIndex];
    if (!node) throw new Error('Semua node pada run ini sudah selesai.');

    if (node.type === 'event') this._openEvent(state, node);
    else if (node.type === 'treasure') this._openTreasure(state, node);
    else this._battle(state, node);

    if (state.hp <= 0) run.status = 'failed';

    return divergentRunModel.save(run);
  }

  choose(jid, rawChoice) {
    return db.transaction(() => this._choose(jid, rawChoice))();
  }

  _choose(jid, rawChoice) {
    const run = this._activeRun(jid);
    const state = run.state;
    const pending = state.pending;
    if (!pending || pending.type === 'path') {
      throw new Error('Tidak ada pilihan aktif. Gunakan `.du explore`.');
    }
    const choice = Number.parseInt(rawChoice, 10) - 1;
    if (!Number.isInteger(choice) || !pending.options[choice]) {
      throw new Error(`Pilihan harus antara 1-${pending.options.length}.`);
    }

    if (pending.type === 'blessing') {
      const blessing = BLESSINGS.find((item) => item.id === pending.options[choice]);
      state.blessings.push(blessing.id);
      state.lastResult = `Blessing diperoleh: ${blessing.name}. ${blessing.text}`;
      this._advance(state);
    } else if (pending.type === 'curio') {
      const curio = CURIOS.find((item) => item.id === pending.options[choice]);
      state.curios.push(curio.id);
      if (curio.instantHeal) heal(state, curio.instantHeal);
      if (curio.instantFragments) state.fragments += curio.instantFragments;
      state.hp = Math.min(state.hp, maxHp(state));
      state.lastResult = `Curio diperoleh: ${curio.name}. ${curio.text}`;
      this._advance(state);
    } else if (pending.type === 'event') {
      this._resolveEvent(state, pending.options[choice]);
      this._advance(state);
    }

    if (state.nodeIndex >= state.nodes.length) {
      this._finish(run);
    }
    return divergentRunModel.save(run);
  }

  abandon(jid) {
    const run = divergentRunModel.find(jid);
    if (!run || run.status !== 'active') return false;
    run.status = 'abandoned';
    run.state.pending = null;
    run.state.lastResult = 'Run dihentikan tanpa reward akhir.';
    divergentRunModel.save(run);
    return true;
  }

  _activeRun(jid) {
    const run = divergentRunModel.find(jid);
    if (!run || run.status !== 'active') {
      throw new Error('Tidak ada run aktif. Mulai dengan `.du start`.');
    }
    return run;
  }

  _battle(state, node) {
    const effects = totalEffects(state);
    const tier = node.type === 'boss' ? 1.6 : node.type === 'elite' ? 1.3 : 1;
    const progress = 1 + node.position * 0.045;
    let playerPower = 1 + (effects.atk || 0);
    if (state.hp / maxHp(state) < 0.6 && state.path === 'destruction') playerPower += 0.18;
    if (node.type !== 'battle') playerPower += effects.bossAtk || 0;
    playerPower += Math.floor(state.blessings.length / 3) * (effects.perBlessing || 0);
    const critChance = Math.min(0.55, 0.12 + (effects.crit || 0));
    const crit = Math.random() < critChance;
    if (crit) playerPower *= 1.5 + (effects.critDamage || 0);
    const enemyPower = tier * progress * (1 - (effects.weaken || 0)) * (1 + (effects.enemyPower || 0));
    const winChance = Math.max(0.48, Math.min(0.94, 0.7 + (playerPower - enemyPower) * 0.18));
    const won = Math.random() < winChance;
    const shield = (effects.shield || 0) + (state.path === 'preservation' ? 5 : 0);
    const reduction = Math.min(0.6, (effects.reduction || 0) + (state.path === 'preservation' ? 0.08 : 0));
    let damage = Math.floor(
      (won ? 13 : 27) *
      tier *
      progress *
      (1 - reduction) *
      (1 + (effects.incomingDamage || 0))
    );
    if (Math.random() < Math.min(0.4, effects.dodge || 0)) damage = 0;
    damage = Math.max(0, damage - shield);
    state.hp = Math.max(0, state.hp - damage);

    if (!won) {
      if (state.hp <= 0 && effects.revive && !state.revived) {
        state.revived = true;
        state.hp = 35;
        state.lastResult = `Revival Chip aktif. Kamu kalah dari ${node.name}, tetapi bangkit dengan 35 HP. Coba lagi.`;
        return;
      }
      if (state.hp <= 0) {
        const cleared = state.nodes.filter((item) => item.cleared).length;
        state.lastResult = [
          `RUN GAGAL: Kamu dikalahkan ${node.name} (${node.type}) di node ${node.position}/16.`,
          `Damage diterima: ${damage} | HP: 0/${maxHp(state)} | Node clear: ${cleared}/16.`,
          `${state.fragments} Fragment yang terkumpul hangus bersama run ini.`,
          'Tidak ada cash/koin atau EXP yang diberikan karena node 16 belum diselesaikan.',
          'Hadiah hanya diberikan jika seluruh Divergent Universe berhasil dimenangkan.',
        ].join('\n');
        state.pending = null;
        return;
      }
      state.lastResult = [
        `PERTARUNGAN KALAH: ${node.name} belum dikalahkan di node ${node.position}/16.`,
        `Damage diterima: ${damage} | HP tersisa: ${state.hp}/${maxHp(state)} | Peluang menang: ${Math.round(winChance * 100)}%.`,
        'Node belum clear dan progres tidak maju. Fragment, Blessing, serta Curio tetap tersimpan.',
        'Kamu belum mendapat cash/koin atau EXP. Reward hanya dibayar setelah semua 16 node clear.',
        'Pulihkan HP melalui event jika tersedia, atau ketik `.du explore` untuk mencoba lagi.',
      ].join('\n');
      return;
    }

    const reward = BASE_REWARD[node.type];
    const gained = addFragments(state, reward.fragments + (effects.fragments || 0));
    const restored = heal(state, (effects.heal || 0) + (state.path === 'abundance' ? 5 : 0));
    const options = availableBlessings(state);
    state.pending = { type: 'blessing', options: options.map((item) => item.id) };
    state.lastResult = `${crit ? 'Critical! ' : ''}${node.name} dikalahkan. HP -${damage}${restored ? `, pulih ${restored}` : ''}, fragment +${gained}. Pilih satu Blessing.`;
  }

  _openTreasure(state, node) {
    const gained = addFragments(state, 120);
    const options = availableCurios(state);
    if (!options.length) {
      state.lastResult = `${node.name} berisi ${gained} fragment. Semua Curio sudah dimiliki.`;
      this._advance(state);
      return;
    }
    state.pending = { type: 'curio', options: options.map((item) => item.id) };
    state.lastResult = `${node.name} dibuka. Fragment +${gained}. Pilih satu Curio.`;
  }

  _openEvent(state, node) {
    const options = EVENT_SCENARIOS[node.name] || EVENT_SCENARIOS['Ruan Mei Replica'];
    state.pending = { type: 'event', eventName: node.name, options };
    state.lastResult = `${node.name} menawarkan tiga kemungkinan.`;
  }

  _resolveEvent(state, option) {
    const eventHeal = (amount) => heal(
      state,
      amount * (1 + (totalEffects(state).eventHeal || 0))
    );
    const spend = (amount) => {
      if (state.fragments < amount) {
        throw new Error(`Butuh ${amount} fragment untuk pilihan ini.`);
      }
      state.fragments -= amount;
    };
    const addMaxHp = (amount) => {
      state.baseMaxHp += amount;
      state.hp += amount;
    };
    const randomBlessing = () => grantBlessing(state);
    const randomCurio = () => grantCurio(state);

    switch (option.id) {
      case 'research': {
        const blessing = randomBlessing();
        const gained = addFragments(state, 60);
        state.lastResult = blessing
          ? `Penelitian berhasil: ${blessing.name} dan ${gained} fragment diperoleh.`
          : `Penelitian menghasilkan ${gained} fragment.`;
        break;
      }
      case 'ruan_rest':
        state.lastResult = `Replika memulihkan ${eventHeal(40)} HP.`;
        break;
      case 'ruan_leave':
        state.lastResult = `Kamu pergi membawa ${addFragments(state, 120)} fragment.`;
        break;
      case 'light':
        spend(80);
        state.lastResult = `Cahaya kembali. ${eventHeal(maxHp(state))} HP dipulihkan.`;
        break;
      case 'darkness':
        state.hp = Math.max(1, state.hp - 22);
        state.lastResult = `Kegelapan mengambil 22 HP. Kamu memperoleh ${addFragments(state, 260)} fragment.`;
        break;
      case 'wait':
        state.lastResult = `Kamu menunggu dan memulihkan ${eventHeal(20)} HP.`;
        break;
      case 'trade': {
        spend(100);
        const blessing = randomBlessing();
        if (!blessing) state.fragments += 100;
        state.lastResult = blessing
          ? `100 fragment ditukar dengan Blessing ${blessing.name}.`
          : 'Semua Blessing sudah dimiliki. Fragment dikembalikan.';
        break;
      }
      case 'buy_curio': {
        spend(160);
        const curio = randomCurio();
        if (!curio) state.fragments += 160;
        state.lastResult = curio
          ? `Kotak dibuka dan berisi ${curio.name}. ${curio.text}`
          : 'Semua Curio sudah dimiliki. Fragment dikembalikan.';
        break;
      }
      case 'merchant_gift':
        state.lastResult = `Sampel gratis bernilai ${addFragments(state, 90)} fragment.`;
        break;
      case 'chase':
        if (Math.random() < 0.5) {
          state.lastResult = `Trotter tertangkap. Kamu memperoleh ${addFragments(state, 320)} fragment.`;
        } else {
          state.hp = Math.max(1, state.hp - 20);
          state.lastResult = 'Trotter lolos dan kamu kehilangan 20 HP.';
        }
        break;
      case 'feed':
        spend(60);
        addMaxHp(10);
        state.lastResult = 'Trotter memberimu berkah: max HP +10.';
        break;
      case 'trotter_leave':
        state.lastResult = `Trotter meninggalkan energi yang memulihkan ${eventHeal(25)} HP.`;
        break;
      case 'mirror_blessing': {
        state.hp = Math.max(1, state.hp - 15);
        const blessing = randomBlessing();
        state.lastResult = blessing
          ? `Pantulan mengambil 15 HP dan memberikan ${blessing.name}.`
          : 'Pantulan mengambil 15 HP, tetapi tidak ada Blessing tersisa.';
        break;
      }
      case 'mirror_shatter':
        state.lastResult = `Pecahan cermin berubah menjadi ${addFragments(state, 180)} fragment.`;
        break;
      case 'mirror_restore':
        state.lastResult = `Ingatan pulih bersama ${eventHeal(35)} HP.`;
        break;
      case 'donate':
        spend(120);
        addMaxHp(15);
        state.lastResult = 'Para arsitek memperkuat tubuhmu: max HP +15.';
        break;
      case 'work':
        state.hp = Math.max(1, state.hp - 10);
        state.lastResult = `Pekerjaan menghabiskan 10 HP dan menghasilkan ${addFragments(state, 170)} fragment.`;
        break;
      case 'shelter':
        state.lastResult = `Shelter memulihkan ${eventHeal(30)} HP.`;
        break;
      case 'jackpot':
        if (Math.random() < 0.5) {
          state.lastResult = `Jackpot! Kamu memperoleh ${addFragments(state, 280)} fragment.`;
        } else {
          const lost = Math.min(120, state.fragments);
          state.fragments -= lost;
          state.lastResult = `Mesin rusak. Kamu kehilangan ${lost} fragment.`;
        }
        break;
      case 'repair': {
        state.hp = Math.max(1, state.hp - 12);
        const blessing = randomBlessing();
        state.lastResult = blessing
          ? `Mesin aktif setelah mengambil 12 HP dan memberikan ${blessing.name}.`
          : 'Mesin mengambil 12 HP, tetapi tidak ada Blessing tersisa.';
        break;
      }
      case 'arcade_leave':
        state.lastResult = `Kabel berisi ${addFragments(state, 70)} fragment.`;
        break;
      case 'answer_signal': {
        const curio = randomCurio();
        state.lastResult = curio
          ? `Sinyal mengirim ${curio.name}. ${curio.text}`
          : 'Sinyal kosong karena semua Curio sudah dimiliki.';
        break;
      }
      case 'decode_signal': {
        const blessing = randomBlessing();
        state.lastResult = blessing
          ? `Sinyal terdekode menjadi Blessing ${blessing.name}.`
          : 'Sinyal tidak menghasilkan Blessing baru.';
        break;
      }
      case 'sell_signal':
        state.lastResult = `Koordinat terjual seharga ${addFragments(state, 150)} fragment.`;
        break;
      default:
        throw new Error('Pilihan event tidak dikenali.');
    }
  }

  _advance(state) {
    const node = state.nodes[state.nodeIndex];
    if (node) node.cleared = true;
    state.pending = null;
    state.nodeIndex += 1;
  }

  _finish(run) {
    const state = run.state;
    const effects = totalEffects(state);
    const rewardCash = Math.floor(
      (FINAL_REWARD.baseCash + state.fragments * FINAL_REWARD.cashPerFragment) *
      (1 + (effects.cashMult || 0))
    );
    const rewardExp =
      FINAL_REWARD.baseExp +
      state.blessings.length * FINAL_REWARD.expPerBlessing;
    db.transaction(() => {
      walletModel.reward(run.jid, rewardCash, 'divergent universe clear');
      userModel.addExp(run.jid, rewardExp);
    })();
    run.status = 'completed';
    state.finalReward = { cash: rewardCash, exp: rewardExp };
    state.lastResult = `Divergent Universe ditaklukkan. Reward akhir: ${rewardCash} cash dan ${rewardExp} EXP.`;
  }
}

export const divergentUniverseService = new DivergentUniverseService();
