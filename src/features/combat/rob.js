import { sql } from '#storage/connection.js';
import { userModel, walletModel, statsModel } from '#storage/models/index.js';

const MIN_CHANCE = 0.3;
const MAX_CHANCE = 0.7;
const ROB_MIN_PCT = 0.1;
const ROB_MAX_PCT = 0.3;
const PENALTY_PCT = 0.2;
const MIN_CASH = 500;

class RobService {
  async attempt(robberJid, targetJid) {
    await userModel.ensure(robberJid);
    await userModel.ensure(targetJid);
    const robberStats = await statsModel.ensure(robberJid);
    const targetStats = await statsModel.ensure(targetJid);
    const targetWallet = await walletModel.find(targetJid);

    if (!targetWallet || targetWallet.cash < MIN_CASH)
      throw new Error(
        `Target tidak punya cukup coin untuk dirampok (min: 🪙${MIN_CASH}).`
      );

    const atkAdv = robberStats.atk - targetStats.def;
    const chance = Math.min(
      MAX_CHANCE,
      Math.max(MIN_CHANCE, 0.5 + atkAdv / 100)
    );
    const success = Math.random() < chance;
    let stolen = 0,
      penalty = 0;

    await sql.begin(async (t) => {
      if (success) {
        const pct = ROB_MIN_PCT + Math.random() * (ROB_MAX_PCT - ROB_MIN_PCT);
        stolen = Math.max(1, Math.floor(targetWallet.cash * pct));
        await walletModel.addCash(targetJid, -stolen, t);
        await walletModel.addCash(robberJid, stolen, t);
      } else {
        const robberWallet = await walletModel.find(robberJid, t);
        penalty = Math.floor((robberWallet?.cash ?? 0) * PENALTY_PCT);
        if (penalty > 0) await walletModel.addCash(robberJid, -penalty, t);
      }
    });

    return { success, stolen, penalty, chance: Math.round(chance * 100) };
  }
}

export const robService = new RobService();
