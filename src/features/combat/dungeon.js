import { db } from '#storage/connection.js';
import {
  userModel,
  walletModel,
  statsModel,
  inventoryModel,
  questModel,
  dungeonRunModel,
} from '#storage/models/index.js';

// ── Sistem Dungeon Run (mini roguelike, terinspirasi Divergent Universe) ──

const BLESSINGS = {
  amukan: { name: 'Amukan', emoji: '⚔️', desc: '+15% ATK', atkMult: 0.15 },
  baja: { name: 'Baja', emoji: '🛡️', desc: '+15% DEF', defMult: 0.15 },
  vitalitas: { name: 'Vitalitas', emoji: '❤️', desc: '+20% Max HP (langsung heal)', maxHpMult: 0.2 },
  vampir: { name: 'Vampir', emoji: '🩸', desc: 'Lifesteal 10% dari damage', lifesteal: 0.1 },
  presisi: { name: 'Presisi', emoji: '🎯', desc: '+15% peluang crit (1.5x dmg)', critChance: 0.15 },
  bertahan: { name: 'Bertahan', emoji: '🌀', desc: '-10% damage yang diterima', incomingReduction: 0.1 },
  regenerasi: { name: 'Regenerasi', emoji: '♻️', desc: 'Heal 5% Max HP tiap node clear', regenPct: 0.05 },
};

const CURIOS = {
  kompas_rezeki: { name: 'Kompas Rezeki', emoji: '🧭', desc: '+20% semua cash reward', cashMult: 0.2 },
  batu_pengalaman: { name: 'Batu Pengalaman', emoji: '📖', desc: '+25% semua exp reward', expMult: 0.25 },
  lonceng_bertahan: { name: 'Lonceng Bertahan', emoji: '🔔', desc: 'Sekali pakai: selamat dari kematian di 30% HP' },
};

const REST_OPTIONS = [
  { type: 'heal', healPct: 0.4, label: '💤 Istirahat — pulihkan 40% Max HP' },
  { type: 'blessing', label: '✨ Meditasi — dapat 1 blessing acak (tanpa heal)' },
];

const EVENTS = {
  altar_misterius: {
    text: '🗿 *Altar Misterius* — kamu menemukan altar tua yang berdenyut aneh...',
    options: [
      {
        label: 'Sentuh altar (60% dapat curio acak, 40% HP -15%)',
        resolve: () => (Math.random() < 0.6
          ? { curioRandom: true, text: 'Altar bercahaya, sebuah curio melayang ke tanganmu!' }
          : { hpDeltaPct: -0.15, text: 'Altar menyentakmu dengan energi gelap!' }),
      },
      { label: 'Lewati dengan aman', resolve: () => ({ text: 'Kamu memilih aman dan melanjutkan perjalanan.' }) },
    ],
  },
  pedagang_gelap: {
    text: '🧙 *Pedagang Misterius* — sosok berjubah menawarkan transaksi aneh...',
    options: [
      {
        label: 'Tukar 15% HP saat ini dengan cash instan',
        resolve: () => ({ hpDeltaPct: -0.15, cashDelta: Math.floor(400 + Math.random() * 500), text: 'Transaksi selesai, sekantung koin berpindah tangan.' }),
      },
      { label: 'Tolak tawaran', resolve: () => ({ text: 'Kamu menolak dan pedagang itu menghilang.' }) },
    ],
  },
  reruntuhan_kuno: {
    text: '🏛️ *Reruntuhan Kuno* — sebuah peti tua tertimbun debu ditemukan...',
    options: [
      {
        label: 'Buka peti (50% blessing gratis, 50% elite dadakan menyerang)',
        resolve: () => (Math.random() < 0.5
          ? { blessingRandom: true, text: 'Peti terbuka, kekuatan baru mengalir ke dalam dirimu!' }
          : { forcedElite: true, text: 'Peti itu jebakan! Penjaga elite muncul!' }),
      },
      { label: 'Abaikan dan lanjut', resolve: () => ({ text: 'Kamu memilih tidak mengambil risiko.' }) },
    ],
  },
};
const EVENT_IDS = Object.keys(EVENTS);

const MONSTERS = [
  {
    id: 'slime',
    name: 'Slime',
    emoji: '🟢',
    atk: 5,
    def: 2,
    hp: 30,
    reward: [200, 500],
    exp: 15,
    rarity: 'common',
  },
  {
    id: 'goblin',
    name: 'Goblin',
    emoji: '👺',
    atk: 10,
    def: 5,
    hp: 60,
    reward: [400, 900],
    exp: 25,
    rarity: 'common',
  },
  {
    id: 'wolf',
    name: 'Dire Wolf',
    emoji: '🐺',
    atk: 18,
    def: 8,
    hp: 100,
    reward: [700, 1500],
    exp: 40,
    rarity: 'uncommon',
  },
  {
    id: 'orc',
    name: 'Orc Warrior',
    emoji: '👹',
    atk: 25,
    def: 15,
    hp: 150,
    reward: [1200, 2500],
    exp: 60,
    rarity: 'uncommon',
  },
  {
    id: 'troll',
    name: 'Cave Troll',
    emoji: '🪨',
    atk: 35,
    def: 20,
    hp: 250,
    reward: [2000, 4000],
    exp: 90,
    rarity: 'rare',
  },
  {
    id: 'dragon',
    name: 'Drake',
    emoji: '🐉',
    atk: 55,
    def: 30,
    hp: 400,
    reward: [4000, 8000],
    exp: 150,
    rarity: 'epic',
  },
];

class DungeonService {
  explore(playerJid) {
    userModel.ensure(playerJid);
    const pStats = statsModel.ensure(playerJid);
    const pUser = userModel.findById(playerJid);

    if (pStats.hp <= 0)
      throw new Error('HP kamu 0! Pakai `!heal` dulu sebelum masuk dungeon.');

    const pool = this._monsterPool(pUser.level);
    const monster = pool[Math.floor(Math.random() * pool.length)];
    const rounds = this._simulate(pStats, monster);
    const won = rounds.at(-1).pHp > 0;

    const rewardCash = won
      ? Math.floor(
          monster.reward[0] +
            Math.random() * (monster.reward[1] - monster.reward[0])
        )
      : 0;
    const rewardExp = won ? monster.exp : Math.floor(monster.exp * 0.2);
    const drop = won ? this._rollDrop(monster) : null;

    db.transaction(() => {
      statsModel.setHp(playerJid, Math.max(0, rounds.at(-1).pHp));
      if (won) {
        statsModel.addHp(playerJid, Math.floor(pStats.max_hp * 0.1));
        if (rewardCash > 0)
          walletModel.reward(playerJid, rewardCash, `dungeon: ${monster.id}`);
        if (drop) inventoryModel.add(playerJid, drop, 1);
        statsModel.recordWin(playerJid);
        questModel.addProgress(playerJid, 'total_battles', 1);
      } else {
        statsModel.recordLoss(playerJid);
        questModel.addProgress(playerJid, 'total_battles', 1);
      }
      userModel.addExp(playerJid, rewardExp);
    })();

    return {
      monster,
      rounds,
      won,
      rewardCash,
      rewardExp,
      drop,
      finalHp: Math.max(0, rounds.at(-1).pHp),
    };
  }

  _monsterPool(level) {
    if (level >= 20) return MONSTERS;
    if (level >= 12) return MONSTERS.slice(0, 5);
    if (level >= 6) return MONSTERS.slice(0, 4);
    if (level >= 3) return MONSTERS.slice(0, 3);
    return MONSTERS.slice(0, 2);
  }

  _simulate(pStats, monster) {
    const rounds = [];
    let pHp = pStats.hp,
      mHp = monster.hp;

    for (let i = 0; i < 15 && pHp > 0 && mHp > 0; i++) {
      const r = { round: i + 1, pHp, mHp, events: [] };

      const pDmg = Math.max(1, pStats.atk - Math.floor(monster.def / 2));
      const pVar = Math.floor(pDmg * 0.2);
      mHp = Math.max(
        0,
        mHp - Math.max(1, pDmg + Math.floor(Math.random() * pVar * 2) - pVar)
      );
      r.events.push({
        by: 'player',
        dmg: Math.max(1, pDmg + Math.floor(Math.random() * pVar * 2) - pVar),
      });

      if (mHp <= 0) {
        r.pHp = pHp;
        r.mHp = 0;
        rounds.push(r);
        break;
      }

      const mDmg = Math.max(1, monster.atk - Math.floor(pStats.def / 2));
      const mVar = Math.floor(mDmg * 0.2);
      pHp = Math.max(
        0,
        pHp - Math.max(1, mDmg + Math.floor(Math.random() * mVar * 2) - mVar)
      );
      r.events.push({
        by: 'monster',
        dmg: Math.max(1, mDmg + Math.floor(Math.random() * mVar * 2) - mVar),
      });

      r.pHp = pHp;
      r.mHp = mHp;
      rounds.push(r);
    }
    return rounds;
  }

  _rollDrop(monster) {
    const rates = { common: 0.4, uncommon: 0.25, rare: 0.12, epic: 0.05 };
    if (Math.random() > (rates[monster.rarity] ?? 0.2)) return null;
    const drops = {
      common: ['potion_hp_sm'],
      uncommon: ['potion_hp_sm', 'potion_hp_md'],
      rare: ['potion_hp_md', 'potion_hp_lg'],
      epic: ['potion_hp_lg', 'lootbox_std'],
    };
    const pool = drops[monster.rarity] ?? drops.common;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getMonsters() {
    return MONSTERS;
  }

  // ── Dungeon Run (mini roguelike) ──────────────────────────────────────

  getRun(jid) {
    return dungeonRunModel.find(jid);
  }

  startRun(jid) {
    userModel.ensure(jid);
    const stats = statsModel.ensure(jid);
    if (stats.hp <= 0) throw new Error('HP kamu 0! Pakai `!heal` dulu sebelum masuk dungeon.');

    const existing = dungeonRunModel.findActive(jid);
    if (existing) {
      throw new Error('Kamu masih punya dungeon run aktif! Ketik `!dungeon` untuk lanjut, atau `!dungeon abandon` untuk membatalkan.');
    }

    const nodeTypes = this._generateNodeTypes();
    dungeonRunModel.create(jid, { nodeTypes });
    return this.advance(jid);
  }

  // Entry point utama untuk `!dungeon` tanpa argumen — resolve node sekarang,
  // atau kasih tau kalau ada pilihan yang masih menunggu untuk di-`choose`.
  advance(jid) {
    userModel.ensure(jid);
    const stats = statsModel.ensure(jid);
    const run = dungeonRunModel.findActive(jid);
    if (!run) throw new Error('Belum ada dungeon run aktif. Mulai dengan `!dungeon start`.');
    if (stats.hp <= 0) throw new Error('HP kamu 0! Pakai `!heal` dulu sebelum lanjut dungeon.');

    if (run.pending_choice) {
      return { awaitingChoice: true, pendingChoice: run.pending_choice, run };
    }

    const nodeType = run.node_types[run.current_node - 1];

    switch (nodeType) {
      case 'combat':
        return this._resolveCombatNode(jid, {});
      case 'elite':
        return this._resolveCombatNode(jid, { mult: 1.6, tag: 'Elite' });
      case 'boss':
        return this._resolveCombatNode(jid, { mult: 2.2, tag: 'BOSS', isBoss: true });
      case 'treasure':
        return this._resolveTreasureNode(jid, run);
      case 'rest': {
        const pending = { kind: 'rest', text: '💤 *Tempat Istirahat* — kamu menemukan tempat aman untuk berhenti sejenak.', options: REST_OPTIONS.map((o) => o.label) };
        dungeonRunModel.setPendingChoice(jid, pending);
        return { nodeType: 'rest', awaitingChoice: true, pendingChoice: pending, run: dungeonRunModel.find(jid) };
      }
      case 'event': {
        const eventId = EVENT_IDS[Math.floor(Math.random() * EVENT_IDS.length)];
        const def = EVENTS[eventId];
        const pending = { kind: 'event', eventId, text: def.text, options: def.options.map((o) => o.label) };
        dungeonRunModel.setPendingChoice(jid, pending);
        return { nodeType: 'event', text: def.text, awaitingChoice: true, pendingChoice: pending, run: dungeonRunModel.find(jid) };
      }
      default:
        throw new Error(`Tipe node tidak dikenal: ${nodeType}`);
    }
  }

  // Resolve pilihan yang sedang pending (blessing / rest / event). index = 0-based.
  chooseOption(jid, index) {
    const run = dungeonRunModel.findActive(jid);
    if (!run) throw new Error('Tidak ada dungeon run aktif.');
    if (!run.pending_choice) throw new Error('Tidak ada pilihan yang sedang menunggu. Ketik `!dungeon` untuk lanjut.');

    const { kind } = run.pending_choice;

    if (kind === 'blessing') {
      const { optionIds } = run.pending_choice;
      const id = optionIds[index];
      if (!id) throw new Error(`Pilihan tidak valid. Pilih angka 1-${optionIds.length}.`);
      this._grantBlessing(jid, id);
      const updatedRun = dungeonRunModel.advanceNode(jid);
      return { kind: 'blessing', picked: { id, ...BLESSINGS[id] }, run: updatedRun, runEnded: false };
    }

    if (kind === 'rest') {
      const opt = REST_OPTIONS[index];
      if (!opt) throw new Error(`Pilihan tidak valid. Pilih angka 1-${REST_OPTIONS.length}.`);
      let grantedBlessingId = null;
      if (opt.type === 'heal') {
        const stats = statsModel.find(jid);
        statsModel.addHp(jid, Math.floor(stats.max_hp * opt.healPct));
      } else if (opt.type === 'blessing') {
        const [id] = this._pickBlessingOptions(1);
        this._grantBlessing(jid, id);
        grantedBlessingId = id;
      }
      const updatedRun = dungeonRunModel.advanceNode(jid);
      return { kind: 'rest', picked: opt, grantedBlessingId, run: updatedRun, runEnded: false };
    }

    if (kind === 'event') {
      const def = EVENTS[run.pending_choice.eventId];
      const opt = def.options[index];
      if (!opt) throw new Error(`Pilihan tidak valid. Pilih angka 1-${def.options.length}.`);
      const outcome = opt.resolve();

      // Peti jebakan -> langsung fight elite. pending_choice akan diganti oleh
      // _resolveCombatNode (jadi 'blessing' kalau menang, atau run berakhir kalau kalah).
      if (outcome.forcedElite) {
        const fightResult = this._resolveCombatNode(jid, { mult: 1.6, tag: 'Elite' });
        return { kind: 'event', outcome, fightResult, runEnded: fightResult.runEnded };
      }

      let defeated = false;
      if (outcome.hpDeltaPct) {
        const stats = statsModel.find(jid);
        const delta = Math.round(stats.hp * outcome.hpDeltaPct);
        const newHp = Math.max(0, stats.hp + delta);
        statsModel.setHp(jid, newHp);

        if (newHp <= 0) {
          if (run.curios.includes('lonceng_bertahan')) {
            const stats2 = statsModel.find(jid);
            statsModel.setHp(jid, Math.max(1, Math.floor(stats2.max_hp * 0.3)));
            dungeonRunModel.removeCurio(jid, 'lonceng_bertahan');
          } else {
            dungeonRunModel.finish(jid, 'defeated');
            defeated = true;
          }
        }
      }

      if (defeated) {
        return { kind: 'event', outcome, defeated: true, runEnded: true };
      }

      if (outcome.cashDelta) {
        walletModel.reward(jid, outcome.cashDelta, 'dungeon-run: event');
        dungeonRunModel.addRewards(jid, outcome.cashDelta, 0);
      }
      if (outcome.expDelta) {
        userModel.addExp(jid, outcome.expDelta);
        dungeonRunModel.addRewards(jid, 0, outcome.expDelta);
      }
      if (outcome.blessingId) this._grantBlessing(jid, outcome.blessingId);
      if (outcome.blessingRandom) {
        const [id] = this._pickBlessingOptions(1);
        this._grantBlessing(jid, id);
      }
      if (outcome.curioId) dungeonRunModel.addCurio(jid, outcome.curioId);
      if (outcome.curioRandom) {
        const owned = new Set(run.curios);
        const available = Object.keys(CURIOS).filter((id) => !owned.has(id));
        if (available.length) dungeonRunModel.addCurio(jid, available[Math.floor(Math.random() * available.length)]);
      }

      const updatedRun = dungeonRunModel.advanceNode(jid);
      return { kind: 'event', outcome, run: updatedRun, runEnded: false };
    }

    throw new Error(`Tipe pilihan tidak dikenal: ${kind}`);
  }

  abandonRun(jid) {
    const run = dungeonRunModel.findActive(jid);
    if (!run) throw new Error('Tidak ada dungeon run aktif untuk dibatalkan.');
    return dungeonRunModel.finish(jid, 'abandoned');
  }

  getBlessingInfo(id) {
    return BLESSINGS[id] ? { id, ...BLESSINGS[id] } : null;
  }

  getCurioInfo(id) {
    return CURIOS[id] ? { id, ...CURIOS[id] } : null;
  }

  // ── Internal: resolve node combat/elite/boss ────────────────────────

  _resolveCombatNode(jid, { mult = 1, tag = null, isBoss = false }) {
    const run = dungeonRunModel.findActive(jid);
    const pStats = statsModel.find(jid);
    const pUser = userModel.findById(jid);
    const pool = this._monsterPool(pUser.level);

    let monster = isBoss ? pool[pool.length - 1] : pool[Math.floor(Math.random() * pool.length)];
    if (mult !== 1 || tag) monster = this._scaleMonster(monster, mult, tag);

    const mods = this._computeModifiers(run.blessings);
    const rounds = this._simulateNode(pStats, monster, mods);
    let finalHp = Math.max(0, rounds.at(-1).pHp);
    const won = finalHp > 0 && rounds.at(-1).mHp <= 0;

    statsModel.setHp(jid, finalHp);

    const nodeType = isBoss ? 'boss' : tag === 'Elite' ? 'elite' : 'combat';

    // Kalah tapi punya curio revive
    let revived = false;
    if (!won && run.curios.includes('lonceng_bertahan')) {
      revived = true;
      const effMaxHp = Math.round(pStats.max_hp * mods.maxHpMult);
      finalHp = Math.max(1, Math.floor(effMaxHp * 0.3));
      statsModel.setHp(jid, finalHp);
      dungeonRunModel.removeCurio(jid, 'lonceng_bertahan');
    }

    if (!won) statsModel.recordLoss(jid);
    questModel.addProgress(jid, 'total_battles', 1);

    if (!won && !revived) {
      const consolationExp = Math.floor(monster.exp * 0.2);
      userModel.addExp(jid, consolationExp);
      dungeonRunModel.addRewards(jid, 0, consolationExp);
      const finishedRun = dungeonRunModel.finish(jid, 'defeated');
      return { nodeType, monster, rounds, won: false, defeated: true, finalHp, runEnded: true, run: finishedRun };
    }

    if (!won && revived) {
      const updatedRun = dungeonRunModel.advanceNode(jid);
      return { nodeType, monster, rounds, won: false, revived: true, finalHp, runEnded: false, run: updatedRun };
    }

    // Menang
    statsModel.recordWin(jid);
    const curioMult = this._computeCurioMult(run.curios);
    let rewardCash = Math.floor(monster.reward[0] + Math.random() * (monster.reward[1] - monster.reward[0]));
    rewardCash = Math.round(rewardCash * curioMult.cashMult);
    const rewardExp = Math.round(monster.exp * curioMult.expMult);
    const drop = this._rollDrop(monster);

    db.transaction(() => {
      if (mods.regenPct > 0) {
        statsModel.addHp(jid, Math.floor(pStats.max_hp * mods.regenPct));
      }
      if (rewardCash > 0) walletModel.reward(jid, rewardCash, `dungeon-run: ${monster.id}`);
      if (drop) inventoryModel.add(jid, drop, 1);
      userModel.addExp(jid, rewardExp);
      dungeonRunModel.addRewards(jid, rewardCash, rewardExp);
    })();

    if (isBoss) {
      const bonusCash = Math.floor(rewardCash * 1.5);
      walletModel.reward(jid, bonusCash, 'dungeon-run: boss clear bonus');
      dungeonRunModel.addRewards(jid, bonusCash, 0);
      const finishedRun = dungeonRunModel.finish(jid, 'cleared');
      return {
        nodeType: 'boss', monster, rounds, won: true, cleared: true, finalHp,
        rewardCash: rewardCash + bonusCash, rewardExp, drop, runEnded: true, run: finishedRun,
      };
    }

    const optionIds = this._pickBlessingOptions(3);
    const pending = { kind: 'blessing', optionIds };
    dungeonRunModel.setPendingChoice(jid, pending);
    const updatedRun = dungeonRunModel.find(jid);
    return {
      nodeType, monster, rounds, won: true, finalHp, rewardCash, rewardExp, drop,
      pendingChoice: pending, runEnded: false, run: updatedRun,
    };
  }

  _resolveTreasureNode(jid, run) {
    const curioMult = this._computeCurioMult(run.curios);
    const cash = Math.round((300 + Math.random() * 700) * curioMult.cashMult);

    let curioId = null;
    if (Math.random() < 0.5) {
      const owned = new Set(run.curios);
      const available = Object.keys(CURIOS).filter((id) => !owned.has(id));
      if (available.length) curioId = available[Math.floor(Math.random() * available.length)];
    }

    db.transaction(() => {
      walletModel.reward(jid, cash, 'dungeon-run: treasure');
      dungeonRunModel.addRewards(jid, cash, 0);
      if (curioId) dungeonRunModel.addCurio(jid, curioId);
    })();

    const updatedRun = dungeonRunModel.advanceNode(jid);
    return { nodeType: 'treasure', cash, curioId, runEnded: false, run: updatedRun };
  }

  _grantBlessing(jid, id) {
    dungeonRunModel.addBlessing(jid, id);
    const b = BLESSINGS[id];
    if (b?.maxHpMult) {
      const stats = statsModel.find(jid);
      statsModel.addHp(jid, Math.floor(stats.max_hp * b.maxHpMult));
    }
  }

  _pickBlessingOptions(count) {
    const pool = Object.keys(BLESSINGS);
    const picked = [];
    while (picked.length < count && pool.length) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return picked;
  }

  _computeModifiers(blessingIds) {
    const mods = {
      atkMult: 1, defMult: 1, maxHpMult: 1, lifesteal: 0,
      critChance: 0, critMult: 1.5, incomingReduction: 0, regenPct: 0,
    };
    for (const id of blessingIds) {
      const b = BLESSINGS[id];
      if (!b) continue;
      if (b.atkMult) mods.atkMult += b.atkMult;
      if (b.defMult) mods.defMult += b.defMult;
      if (b.maxHpMult) mods.maxHpMult += b.maxHpMult;
      if (b.lifesteal) mods.lifesteal += b.lifesteal;
      if (b.critChance) mods.critChance += b.critChance;
      if (b.incomingReduction) mods.incomingReduction += b.incomingReduction;
      if (b.regenPct) mods.regenPct += b.regenPct;
    }
    mods.critChance = Math.min(mods.critChance, 0.75);
    mods.incomingReduction = Math.min(mods.incomingReduction, 0.6);
    return mods;
  }

  _computeCurioMult(curioIds) {
    let cashMult = 1;
    let expMult = 1;
    for (const id of curioIds) {
      const c = CURIOS[id];
      if (!c) continue;
      if (c.cashMult) cashMult += c.cashMult;
      if (c.expMult) expMult += c.expMult;
    }
    return { cashMult, expMult };
  }

  _generateNodeTypes() {
    const mid = [];
    for (let i = 0; i < 10; i++) mid.push(this._weightedNodeType());
    return ['combat', ...mid, 'boss'];
  }

  _weightedNodeType() {
    const weights = [['combat', 30], ['event', 25], ['treasure', 20], ['rest', 15], ['elite', 10]];
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * total;
    for (const [val, w] of weights) {
      if (r < w) return val;
      r -= w;
    }
    return weights[0][0];
  }

  _scaleMonster(monster, mult, tag) {
    return {
      ...monster,
      name: tag ? `${tag} ${monster.name}` : monster.name,
      hp: Math.round(monster.hp * mult),
      atk: Math.round(monster.atk * mult),
      def: Math.round(monster.def * mult),
      reward: [Math.round(monster.reward[0] * mult), Math.round(monster.reward[1] * mult)],
      exp: Math.round(monster.exp * mult),
    };
  }

  _simulateNode(pStats, monster, mods) {
    const rounds = [];
    let pHp = pStats.hp;
    let mHp = monster.hp;
    const effMaxHp = Math.round(pStats.max_hp * mods.maxHpMult);
    const effAtk = pStats.atk * mods.atkMult;
    const effDef = pStats.def * mods.defMult;

    for (let i = 0; i < 15 && pHp > 0 && mHp > 0; i++) {
      const r = { round: i + 1, pHp, mHp, events: [] };

      const pDmgBase = Math.max(1, effAtk - Math.floor(monster.def / 2));
      const pVar = Math.floor(pDmgBase * 0.2);
      let dmgDealt = Math.max(1, Math.round(pDmgBase + Math.random() * pVar * 2 - pVar));
      const isCrit = Math.random() < mods.critChance;
      if (isCrit) dmgDealt = Math.round(dmgDealt * mods.critMult);
      mHp = Math.max(0, mHp - dmgDealt);
      if (mods.lifesteal > 0) pHp = Math.min(effMaxHp, pHp + Math.floor(dmgDealt * mods.lifesteal));
      r.events.push({ by: 'player', dmg: dmgDealt, crit: isCrit });

      if (mHp <= 0) {
        r.pHp = pHp;
        r.mHp = 0;
        rounds.push(r);
        break;
      }

      const mDmgBase = Math.max(1, monster.atk - Math.floor(effDef / 2));
      const mVar = Math.floor(mDmgBase * 0.2);
      let dmgTaken = Math.max(1, Math.round(mDmgBase + Math.random() * mVar * 2 - mVar));
      dmgTaken = Math.max(1, Math.round(dmgTaken * (1 - mods.incomingReduction)));
      pHp = Math.max(0, pHp - dmgTaken);
      r.events.push({ by: 'monster', dmg: dmgTaken });

      r.pHp = pHp;
      r.mHp = mHp;
      rounds.push(r);
    }
    return rounds;
  }
}

export const dungeonService = new DungeonService();
