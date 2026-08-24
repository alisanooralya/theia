import { db } from '#storage/connection.js';
import {
  userModel,
  walletModel,
  statsModel,
  questModel,
} from '#storage/models/index.js';

const CRIT_CHANCE = 0.15;
const CRIT_MULT = 1.5;
const MAX_DODGE = 0.3;
const HEAL_AFTER_PCT = 0.2;
const REWARD_CASH = 2_000;
const REWARD_EXP_WIN = 80;
const REWARD_EXP_LOSS = 20;

class BattleService {
  fight(attackerJid, defenderJid) {
    userModel.ensure(attackerJid);
    userModel.ensure(defenderJid);
    const aStats = statsModel.ensure(attackerJid);
    const dStats = statsModel.ensure(defenderJid);

    if (aStats.hp <= 0) throw new Error('HP kamu 0! Heal dulu sebelum battle.');
    if (dStats.hp <= 0) throw new Error('HP lawan sedang 0, tunggu dia heal.');

    const now = Math.floor(Date.now() / 1000);
    const effAtk = (s) =>
      s.buff_expire > now ? s.atk + (s.buff_atk || 0) : s.atk;
    const effDef = (s) =>
      s.buff_expire > now ? s.def + (s.buff_def || 0) : s.def;

    const rounds = this._simulate(
      { jid: attackerJid, ...aStats, atk: effAtk(aStats), def: effDef(aStats) },
      { jid: defenderJid, ...dStats, atk: effAtk(dStats), def: effDef(dStats) }
    );

    const winner = rounds.at(-1).aHp > 0 ? attackerJid : defenderJid;
    const loser = winner === attackerJid ? defenderJid : attackerJid;

    const winnerStreakBefore = statsModel.find(winner)?.win_streak ?? 0;
    let rewardCash;
    if (winnerStreakBefore === 0) rewardCash = REWARD_CASH;
    else rewardCash = Math.floor(REWARD_CASH * (0.5 + Math.random() * 0.2));
    const loserLoss = Math.floor(rewardCash / 2);

    db.transaction(() => {
      statsModel.setHp(attackerJid, Math.max(0, rounds.at(-1).aHp));
      statsModel.setHp(defenderJid, Math.max(0, rounds.at(-1).dHp));
      statsModel.addHp(winner, Math.floor(aStats.max_hp * HEAL_AFTER_PCT));
      statsModel.recordWin(winner);
      statsModel.recordLoss(loser);
      walletModel.reward(winner, rewardCash, 'battle win');
      const lw = walletModel.find(loser);
      const deduct = Math.min(loserLoss, lw?.cash ?? 0);
      if (deduct > 0) walletModel.addCash(loser, -deduct);
      const winnerStats = winner === attackerJid ? aStats : dStats;
      const expMult =
        winnerStats.buff_expire > now ? winnerStats.buff_exp_mult || 1 : 1;
      userModel.addExp(winner, Math.floor(REWARD_EXP_WIN * expMult));
      userModel.addExp(loser, REWARD_EXP_LOSS);
      questModel.addProgress(winner, 'daily_win', 1);
      questModel.addProgress(winner, 'weekly_win', 1);
      questModel.addProgress(winner, 'total_battles', 1);
      questModel.addProgress(loser, 'total_battles', 1);
    })();

    return {
      winner,
      loser,
      rounds,
      reward: { cash: rewardCash, exp: REWARD_EXP_WIN, loserLoss },
      attackerFinalHp: Math.max(0, rounds.at(-1).aHp),
      defenderFinalHp: Math.max(0, rounds.at(-1).dHp),
    };
  }

  _simulate(a, d) {
    const rounds = [];
    let aHp = a.hp,
      dHp = d.hp;
    const [first, second] = a.spd >= d.spd ? [a, d] : [d, a];
    const isFirstA = first.jid === a.jid;

    for (let i = 0; i < 10 && aHp > 0 && dHp > 0; i++) {
      const r = { round: i + 1, aHp, dHp, events: [] };

      const dmg1 = this._calcDamage(first, second);
      if (dmg1.dodged) r.events.push({ type: 'dodge', by: second.jid });
      else {
        if (isFirstA) dHp = Math.max(0, dHp - dmg1.dmg);
        else aHp = Math.max(0, aHp - dmg1.dmg);
        r.events.push({
          type: dmg1.crit ? 'crit' : 'hit',
          by: first.jid,
          dmg: dmg1.dmg,
        });
      }

      if (aHp <= 0 || dHp <= 0) {
        r.aHp = aHp;
        r.dHp = dHp;
        rounds.push(r);
        break;
      }

      const dmg2 = this._calcDamage(second, first);
      if (dmg2.dodged) r.events.push({ type: 'dodge', by: first.jid });
      else {
        if (isFirstA) aHp = Math.max(0, aHp - dmg2.dmg);
        else dHp = Math.max(0, dHp - dmg2.dmg);
        r.events.push({
          type: dmg2.crit ? 'crit' : 'hit',
          by: second.jid,
          dmg: dmg2.dmg,
        });
      }

      r.aHp = aHp;
      r.dHp = dHp;
      rounds.push(r);
    }
    return rounds;
  }

  _calcDamage(attacker, defender) {
    const spdDiff = Math.max(0, defender.spd - attacker.spd);
    if (Math.random() < Math.min(MAX_DODGE, spdDiff / 100))
      return { dmg: 0, crit: false, dodged: true };

    const base = Math.max(1, attacker.atk - Math.floor(defender.def / 2));
    const vary = Math.floor(base * 0.2);
    let dmg = base + Math.floor(Math.random() * vary * 2) - vary;
    const crit = Math.random() < CRIT_CHANCE;
    if (crit) dmg = Math.floor(dmg * CRIT_MULT);
    return { dmg: Math.max(1, dmg), crit, dodged: false };
  }
}

export const battleService = new BattleService();
