import { db } from '#storage/connection.js';
import {
  userModel,
  walletModel,
  statsModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';

const CRIT_MULT = 1.5;
const HEAL_AFTER_PCT = 0.2;
const REWARD_CASH = 2_000;
const LOSER_LOSS = 1_500;
const STREAK_MULT_STEP = 0.5;
const STREAK_MULT_MAX = 3;
const REWARD_EXP_WIN = 80;
const REWARD_EXP_LOSS = 20;

const MAX_ROUNDS = 10;
const POWERFUL_MULT = 1.35;
const BLOCK_REDUCTION = 0.45;
const COUNTER_MULT = 0.7;
const MOMENTUM_THRESHOLD = 3;
const OVERDRIVE_MULT = 1.25;
const MOMENTUM_DMG_BONUS = 0.04;

const BLOCK_CHANCE_MAX = 0.18;
const COUNTER_CHANCE_MAX = 0.12;
const POWERFUL_CHANCE = 0.12;

function rng() {
  return Math.random();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

class BattleService {
  fight(attackerJid, defenderJid) {
    userModel.ensure(attackerJid);
    userModel.ensure(defenderJid);
    const aBase = statsModel.ensure(attackerJid);
    const dBase = statsModel.ensure(defenderJid);

    if (aBase.hp <= 0) throw new Error('HP kamu 0! Heal dulu sebelum battle.');
    if (dBase.hp <= 0) throw new Error('HP lawan sedang 0, tunggu dia heal.');

    const now = Math.floor(Date.now() / 1000);
    const aStats = artifactService.getPlayerStats(attackerJid);
    const dStats = artifactService.getPlayerStats(defenderJid);

    const effAtk = (base, s) =>
      base.buff_expire > now ? s.atk + (base.buff_atk || 0) : s.atk;
    const effDef = (base, s) =>
      base.buff_expire > now ? s.def + (base.buff_def || 0) : s.def;

    const attacker = {
      jid: attackerJid,
      hp: aBase.hp,
      max_hp: aBase.max_hp,
      atk: effAtk(aBase, aStats),
      def: effDef(aBase, aStats),
      critRate: clamp(aStats.critRate / 100, 0, 0.95),
    };
    const defender = {
      jid: defenderJid,
      hp: dBase.hp,
      max_hp: dBase.max_hp,
      atk: effAtk(dBase, dStats),
      def: effDef(dBase, dStats),
      critRate: clamp(dStats.critRate / 100, 0, 0.95),
    };

    const sim = this._simulate(attacker, defender);

    const draw = sim.draw;
    const winner = draw ? null : sim.winner;
    const loser = draw ? null : sim.loser;

    let rewardCash = REWARD_CASH;
    let loserLoss = LOSER_LOSS;
    let rewarded = false;

    if (!draw) {
      const winnerStreakBefore = statsModel.find(winner)?.win_streak ?? 0;
      const streakMult = Math.min(
        1 + winnerStreakBefore * STREAK_MULT_STEP,
        STREAK_MULT_MAX
      );
      rewardCash = Math.floor(REWARD_CASH * streakMult);
    }

    db.transaction(() => {
      statsModel.setHp(attackerJid, Math.max(0, sim.aFinalHp));
      statsModel.setHp(defenderJid, Math.max(0, sim.dFinalHp));
      if (!draw) {
        statsModel.addHp(winner, Math.floor(aBase.max_hp * HEAL_AFTER_PCT));
        statsModel.recordWin(winner);
        statsModel.recordLoss(loser);
        walletModel.reward(winner, rewardCash, 'battle win');
        const lw = walletModel.find(loser);
        const deduct = Math.min(loserLoss, lw?.cash ?? 0);
        if (deduct > 0) walletModel.addCash(loser, -deduct);
        const winnerBase = winner === attackerJid ? aBase : dBase;
        const expMult =
          winnerBase.buff_expire > now ? winnerBase.buff_exp_mult || 1 : 1;
        userModel.addExp(winner, Math.floor(REWARD_EXP_WIN * expMult));
        userModel.addExp(loser, REWARD_EXP_LOSS);
        rewarded = true;
      }
    })();

    return {
      draw,
      winner,
      loser,
      rounds: sim.rounds,
      snapshots: sim.snapshots,
      highlights: sim.highlights,
      counts: sim.counts,
      reward: { cash: rewardCash, exp: REWARD_EXP_WIN, loserLoss },
      attackerFinalHp: Math.max(0, sim.aFinalHp),
      defenderFinalHp: Math.max(0, sim.dFinalHp),
      rewarded,
    };
  }

  _simulate(a, d) {
    const rounds = [];
    const snapshots = [];
    const highlights = [];
    const counts = { crit: 0, block: 0, counter: 0, powerful: 0, finishing: 0 };
    const byJid = {
      [a.jid]: { crit: 0, block: 0, counter: 0, powerful: 0 },
      [d.jid]: { crit: 0, block: 0, counter: 0, powerful: 0 },
    };

    const state = {
      a: { ...a, momentum: 0 },
      d: { ...d, momentum: 0 },
    };

    let aHp = a.hp;
    let dHp = d.hp;
    let winner = null;
    let loser = null;
    let draw = false;
    let finishingBy = null;

    const pushSnapshot = (round, label, eventLine, momentumLine) => {
      snapshots.push({
        round,
        aHp: Math.max(0, aHp),
        dHp: Math.max(0, dHp),
        label,
        eventLine,
        momentumLine,
      });
    };

    const applyCounts = (c, attackerJid, defenderJid) => {
      counts.crit += c.crit;
      counts.block += c.block;
      counts.counter += c.counter;
      counts.powerful += c.powerful;
      counts.finishing += c.finishing;
      byJid[attackerJid].crit += c.crit;
      byJid[attackerJid].counter += c.counter;
      byJid[attackerJid].powerful += c.powerful;
      byJid[defenderJid].block += c.block;
    };

    for (let i = 0; i < MAX_ROUNDS && aHp > 0 && dHp > 0; i++) {
      const round = i + 1;
      const r = { round, aHp, dHp, events: [] };

      const aOut = this._attack(state.a, state.d, dHp);
      dHp = aOut.newDefenderHp;
      r.events.push(...aOut.events);
      applyCounts(aOut.counts, a.jid, d.jid);

      if (dHp <= 0) {
        winner = a.jid;
        loser = d.jid;
        finishingBy = a.jid;
        r.aHp = aHp;
        r.dHp = 0;
        rounds.push(r);
        break;
      }

      if (aOut.countered) {
        const cOut = this._counter(state.d, state.a, aHp);
        aHp = cOut.newDefenderHp;
        r.events.push(...cOut.events);
        applyCounts(cOut.counts, d.jid, a.jid);
        if (aHp <= 0) {
          winner = d.jid;
          loser = a.jid;
          finishingBy = d.jid;
          r.aHp = 0;
          r.dHp = dHp;
          rounds.push(r);
          break;
        }
      }

      const dOut = this._attack(state.d, state.a, aHp);
      aHp = dOut.newDefenderHp;
      r.events.push(...dOut.events);
      applyCounts(dOut.counts, d.jid, a.jid);

      if (aHp <= 0) {
        winner = d.jid;
        loser = a.jid;
        finishingBy = d.jid;
        r.aHp = 0;
        r.dHp = dHp;
        rounds.push(r);
        break;
      }

      if (dOut.countered) {
        const cOut = this._counter(state.a, state.d, dHp);
        dHp = cOut.newDefenderHp;
        r.events.push(...cOut.events);
        applyCounts(cOut.counts, a.jid, d.jid);
        if (dHp <= 0) {
          winner = a.jid;
          loser = d.jid;
          finishingBy = a.jid;
          r.aHp = aHp;
          r.dHp = 0;
          rounds.push(r);
          break;
        }
      }

      r.aHp = aHp;
      r.dHp = dHp;
      rounds.push(r);

      if (round === 3 || round === 6) {
        const notable = this._pickNotable(r.events);
        pushSnapshot(
          round,
          `Ronde ${round}`,
          notable,
          this._momentumLine(state.a, state.d)
        );
      }
    }

    const realFinish = !!finishingBy;

    if (!winner) {
      if (aHp === dHp) draw = true;
      else if (aHp > dHp) {
        winner = a.jid;
        loser = d.jid;
      } else {
        winner = d.jid;
        loser = a.jid;
      }
    }

    if (draw) {
      pushSnapshot(MAX_ROUNDS, 'Final', '⚖️ Battle berakhir seri!', null);
    } else if (realFinish) {
      pushSnapshot(
        MAX_ROUNDS,
        'Final',
        `☠️ ${this._name(finishingBy)} delivered the finishing blow!`,
        null
      );
    } else {
      pushSnapshot(
        MAX_ROUNDS,
        'Final',
        `⏳ Waktu habis! ${this._name(winner)} unggul dari sisa HP.`,
        null
      );
    }

    if (!draw) {
      const winStats = byJid[winner];
      const loseStats = byJid[loser];
      if (winStats.crit > 0)
        highlights.push(`💥 ${this._name(winner)} landed ${winStats.crit} Critical Hit${winStats.crit > 1 ? 's' : ''}`);
      if (loseStats.block > 0)
        highlights.push(`🛡️ ${this._name(loser)} blocked ${loseStats.block} attack${loseStats.block > 1 ? 's' : ''}`);
      const counterJid = winStats.counter > 0 ? winner : loser;
      if (counts.counter > 0)
        highlights.push(`⚡ ${this._name(counterJid)} performed ${byJid[counterJid].counter} Counter${byJid[counterJid].counter > 1 ? 's' : ''}`);
      if (realFinish)
        highlights.push(`☠️ ${this._name(finishingBy)} delivered the finishing blow`);
      else
        highlights.push(`⏳ ${this._name(winner)} won by remaining HP`);
    }

    return {
      rounds,
      snapshots,
      highlights,
      counts,
      winner,
      loser,
      draw,
      aFinalHp: aHp,
      dFinalHp: dHp,
    };
  }

  _attack(attacker, defender, defenderHp) {
    const events = [];
    const counts = { crit: 0, block: 0, counter: 0, powerful: 0, finishing: 0 };

    let base = Math.max(1, attacker.atk - Math.floor(defender.def / 2));
    const vary = Math.floor(base * 0.2);
    let dmg = base + Math.floor(rng() * vary * 2) - vary;

    let momentumBonus = 1 + attacker.momentum * MOMENTUM_DMG_BONUS;
    let overdrive = false;
    if (attacker.momentum >= MOMENTUM_THRESHOLD) {
      momentumBonus *= OVERDRIVE_MULT;
      overdrive = true;
      attacker.momentum = 0;
    }
    dmg = Math.floor(dmg * momentumBonus);

    const crit = rng() < attacker.critRate;
    let powerful = false;
    if (crit) {
      dmg = Math.floor(dmg * CRIT_MULT);
      counts.crit++;
      attacker.momentum++;
    } else if (rng() < POWERFUL_CHANCE) {
      dmg = Math.floor(dmg * POWERFUL_MULT);
      powerful = true;
      counts.powerful++;
      attacker.momentum++;
    }

    if (overdrive) events.push({ type: 'overdrive', by: attacker.jid });

    const blockChance = clamp(defender.def / (defender.def + 200), 0, BLOCK_CHANCE_MAX);
    const blocked = !crit && rng() < blockChance;
    if (blocked) {
      dmg = Math.floor(dmg * BLOCK_REDUCTION);
      counts.block++;
    }

    dmg = Math.max(1, dmg);

    if (crit) events.push({ type: 'crit', by: attacker.jid, dmg });
    else if (powerful) events.push({ type: 'powerful', by: attacker.jid, dmg });
    if (blocked) events.push({ type: 'block', by: defender.jid, dmg });

    const newDefenderHp = Math.max(0, defenderHp - dmg);

    if (newDefenderHp <= 0) {
      counts.finishing++;
      events.push({ type: 'finishing', by: attacker.jid, dmg });
    }

    const countered =
      newDefenderHp > 0 && !blocked && rng() < COUNTER_CHANCE_MAX;

    return { newDefenderHp, events, counts, countered };
  }

  _counter(attacker, defender, defenderHp) {
    const events = [];
    const counts = { crit: 0, block: 0, counter: 1, powerful: 0, finishing: 0 };

    let base = Math.max(1, attacker.atk - Math.floor(defender.def / 2));
    let dmg = Math.floor(base * COUNTER_MULT);
    const crit = rng() < attacker.critRate;
    if (crit) {
      dmg = Math.floor(dmg * CRIT_MULT);
      counts.crit++;
      attacker.momentum++;
    }
    dmg = Math.max(1, dmg);
    const newDefenderHp = Math.max(0, defenderHp - dmg);

    events.push({ type: 'counter', by: attacker.jid, dmg, crit });
    if (newDefenderHp <= 0) {
      counts.finishing++;
      events.push({ type: 'finishing', by: attacker.jid, dmg });
    }

    return { newDefenderHp, events, counts, countered: false };
  }

  _pickNotable(events) {
    const priority = ['finishing', 'crit', 'counter', 'powerful', 'block'];
    for (const t of priority) {
      const e = events.find((ev) => ev.type === t);
      if (e) return this._eventLine(e);
    }
    return null;
  }

  _eventLine(e) {
    const who = this._name(e.by);
    switch (e.type) {
      case 'crit':
        return `💥 ${who} landed a CRIT! (-${e.dmg})`;
      case 'powerful':
        return `🎯 ${who} landed a Powerful Hit! (-${e.dmg})`;
      case 'block':
        return `🛡️ ${who} blocked an attack! (-${e.dmg})`;
      case 'counter':
        return `⚡ ${who} countered! (-${e.dmg})${e.crit ? ' CRIT!' : ''}`;
      case 'finishing':
        return `☠️ ${who} delivered the finishing blow!`;
      case 'overdrive':
        return `🔥 ${who} OVERDRIVE!`;
      default:
        return null;
    }
  }

  _momentumLine(a, d) {
    const parts = [];
    if (a.momentum > 0) parts.push(`🔥 ${this._name(a.jid)} Momentum: ${a.momentum}`);
    if (d.momentum > 0) parts.push(`🔥 ${this._name(d.jid)} Momentum: ${d.momentum}`);
    return parts.join('  ') || null;
  }

  _name(jid) {
    return `@${jid.split('@')[0]}`;
  }
}

export const battleService = new BattleService();
