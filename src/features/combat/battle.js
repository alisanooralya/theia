import { db } from '#storage/connection.js';
import {
  userModel,
  walletModel,
  statsModel,
  questModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';

const CRIT_MULT = 1.5;
const HEAL_AFTER_PCT = 0.2;
const REWARD_CASH = 2_000;
const REWARD_EXP_WIN = 80;
const REWARD_EXP_LOSS = 20;

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
      critRate: aStats.critRate / 100,
    };
    const defender = {
      jid: defenderJid,
      hp: dBase.hp,
      max_hp: dBase.max_hp,
      atk: effAtk(dBase, dStats),
      def: effDef(dBase, dStats),
      critRate: dStats.critRate / 100,
    };

    const rounds = this._simulate(attacker, defender);

    const winner = rounds.at(-1).aHp > 0 ? attackerJid : defenderJid;
    const loser = winner === attackerJid ? defenderJid : attackerJid;

    const winnerStreakBefore = statsModel.find(winner)?.win_streak ?? 0;
    let rewardCash;
    if (winnerStreakBefore === 0) rewardCash = REWARD_CASH;
    else rewardCash = Math.floor(REWARD_CASH * (1.5 + Math.random() * 0.2));
    const loserLoss = Math.floor(rewardCash / 2);

    db.transaction(() => {
      statsModel.setHp(attackerJid, Math.max(0, rounds.at(-1).aHp));
      statsModel.setHp(defenderJid, Math.max(0, rounds.at(-1).dHp));
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

    for (let i = 0; i < 10 && aHp > 0 && dHp > 0; i++) {
      const r = { round: i + 1, aHp, dHp, events: [] };

      const dmg1 = this._calcDamage(a, d);
      aHp = Math.max(0, aHp - dmg1.dmg);
      r.events.push({
        type: dmg1.crit ? 'crit' : 'hit',
        by: a.jid,
        dmg: dmg1.dmg,
      });

      if (aHp <= 0) {
        r.aHp = aHp;
        r.dHp = dHp;
        rounds.push(r);
        break;
      }

      const dmg2 = this._calcDamage(d, a);
      dHp = Math.max(0, dHp - dmg2.dmg);
      r.events.push({
        type: dmg2.crit ? 'crit' : 'hit',
        by: d.jid,
        dmg: dmg2.dmg,
      });

      r.aHp = aHp;
      r.dHp = dHp;
      rounds.push(r);
    }
    return rounds;
  }

  _calcDamage(attacker, defender) {
    const base = Math.max(1, attacker.atk - Math.floor(defender.def / 2));
    const vary = Math.floor(base * 0.2);
    let dmg = base + Math.floor(Math.random() * vary * 2) - vary;
    const crit = Math.random() < attacker.critRate;
    if (crit) dmg = Math.floor(dmg * CRIT_MULT);
    return { dmg: Math.max(1, dmg), crit };
  }
}

export const battleService = new BattleService();
