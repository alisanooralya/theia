import { sql } from '#storage/connection.js';

const PERIOD_NUMERIC_COLUMNS = [
  'start_at',
  'end_at',
  'boss_count',
  'current_boss',
  'completed_at',
  'created_at',
  'updated_at',
];

const BOSS_NUMERIC_COLUMNS = [
  'boss_index',
  'max_hp',
  'remaining_hp',
  'defeated_at',
];

const CONTRIBUTION_NUMERIC_COLUMNS = [
  'boss_index',
  'damage',
  'hits',
  'reward_claimed',
];

function mapPeriod(row) {
  if (!row) return null;
  const period = { ...row };
  for (const column of PERIOD_NUMERIC_COLUMNS) {
    if (period[column] !== null && period[column] !== undefined) {
      period[column] = Number(period[column]);
    }
  }
  return period;
}

function mapBoss(row) {
  if (!row) return null;
  const boss = { ...row };
  for (const column of BOSS_NUMERIC_COLUMNS) {
    if (boss[column] !== null && boss[column] !== undefined) {
      boss[column] = Number(boss[column]);
    }
  }
  return boss;
}

function mapContribution(row) {
  if (!row) return null;
  const contribution = { ...row };
  for (const column of CONTRIBUTION_NUMERIC_COLUMNS) {
    if (contribution[column] !== null && contribution[column] !== undefined) {
      contribution[column] = Number(contribution[column]);
    }
  }
  return contribution;
}

class RaidModel {
  async addRaidCoin(jid, amount, client = sql) {
    await client`
      UPDATE users SET raid_coin = raid_coin + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async getRaidCoin(jid, client = sql) {
    const rows = await client`SELECT raid_coin FROM users WHERE jid = ${jid}`;
    return rows[0]?.raid_coin ?? 0;
  }

  async spendRaidCoin(jid, amount, client = sql) {
    if (!Number.isInteger(amount) || amount < 1)
      throw new Error('Jumlah Raid Coin tidak valid');
    const rows = await client`
      UPDATE users SET raid_coin = raid_coin - ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE jid = ${jid} AND raid_coin >= ${amount}
      RETURNING raid_coin
    `;
    if (!rows[0]) throw new Error('Raid Coin tidak cukup');
    return rows[0].raid_coin;
  }

  async ensurePeriod(periodConfig, client = sql) {
    const { id, name, startAt, endAt, bosses } = periodConfig;
    await client`
      INSERT INTO raid_periods (period_id, name, start_at, end_at, boss_count, current_boss, status)
      VALUES (${id}, ${name}, ${startAt}, ${endAt}, ${bosses.length}, 0, 'active')
      ON CONFLICT (period_id) DO NOTHING
    `;
    for (const [index, boss] of bosses.entries()) {
      await client`
        INSERT INTO raid_bosses (period_id, boss_index, boss_id, max_hp, remaining_hp)
        VALUES (${id}, ${index}, ${boss.id}, ${boss.maxHp}, ${boss.maxHp})
        ON CONFLICT (period_id, boss_index) DO NOTHING
      `;
    }
  }

  async lockPeriod(periodId, client = sql) {
    const rows =
      await client`SELECT * FROM raid_periods WHERE period_id = ${periodId} FOR UPDATE`;
    return mapPeriod(rows[0] ?? null);
  }

  async getPeriod(periodId, client = sql) {
    const rows =
      await client`SELECT * FROM raid_periods WHERE period_id = ${periodId}`;
    return mapPeriod(rows[0] ?? null);
  }

  async finalizePeriod(periodId, client = sql) {
    const now = Math.floor(Date.now() / 1000);
    const rows = await client`
      UPDATE raid_periods
      SET status = 'completed', completed_at = ${now},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE period_id = ${periodId} AND status = 'active'
      RETURNING *
    `;
    return mapPeriod(rows[0] ?? null);
  }

  async getBossState(periodId, bossIndex, client = sql) {
    const rows = await client`
      SELECT * FROM raid_bosses WHERE period_id = ${periodId} AND boss_index = ${bossIndex}
    `;
    return mapBoss(rows[0] ?? null);
  }

  async getBossStates(periodId, client = sql) {
    const rows = await client`
      SELECT * FROM raid_bosses WHERE period_id = ${periodId} ORDER BY boss_index ASC
    `;
    return rows.map(mapBoss);
  }

  async setBossHp(periodId, bossIndex, remainingHp, client = sql) {
    await client`
      UPDATE raid_bosses
      SET remaining_hp = ${remainingHp}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE period_id = ${periodId} AND boss_index = ${bossIndex}
    `;
  }

  async markBossDefeated(periodId, bossIndex, client = sql) {
    const now = Math.floor(Date.now() / 1000);
    const rows = await client`
      UPDATE raid_bosses
      SET defeated_at = ${now}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE period_id = ${periodId} AND boss_index = ${bossIndex}
        AND defeated_at = 0 AND remaining_hp <= 0
      RETURNING *
    `;
    return mapBoss(rows[0] ?? null);
  }

  async advanceProgression(periodId, fromBossIndex, client = sql) {
    const now = Math.floor(Date.now() / 1000);
    const rows = await client`
      UPDATE raid_periods
      SET current_boss = current_boss + 1,
          status = CASE WHEN current_boss + 1 >= boss_count THEN 'completed' ELSE status END,
          completed_at = CASE WHEN current_boss + 1 >= boss_count THEN ${now} ELSE completed_at END,
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE period_id = ${periodId} AND current_boss = ${fromBossIndex} AND status = 'active'
      RETURNING *
    `;
    return mapPeriod(rows[0] ?? null);
  }

  async getRaidEntries(jid, dayKey, client = sql) {
    const rows = await client`
      SELECT day_key, used FROM raid_entries WHERE jid = ${jid}
    `;
    const row = rows[0];
    if (!row || row.day_key !== dayKey) return 0;
    return Number(row.used);
  }

  async consumeRaidEntry(jid, dayKey, maxEntries, client = sql) {
    const rows = await client`
      INSERT INTO raid_entries (jid, day_key, used)
      VALUES (${jid}, ${dayKey}, 1)
      ON CONFLICT (jid) DO UPDATE SET
        day_key = ${dayKey},
        used = CASE
          WHEN raid_entries.day_key <> ${dayKey} THEN 1
          ELSE raid_entries.used + 1
        END,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE raid_entries.day_key <> ${dayKey}
         OR raid_entries.used < ${maxEntries}
      RETURNING used
    `;
    if (!rows[0]) return null;
    return Number(rows[0].used);
  }

  async addContribution(periodId, bossIndex, jid, damage, client = sql) {
    if (!(damage > 0)) return null;
    const rows = await client`
      INSERT INTO raid_contributions (period_id, boss_index, jid, damage, hits)
      VALUES (${periodId}, ${bossIndex}, ${jid}, ${damage}, 1)
      ON CONFLICT (period_id, boss_index, jid) DO UPDATE SET
        damage = raid_contributions.damage + EXCLUDED.damage,
        hits = raid_contributions.hits + 1,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      RETURNING *
    `;
    return mapContribution(rows[0] ?? null);
  }

  async getContributionsByJid(periodId, jid, client = sql) {
    const rows = await client`
      SELECT * FROM raid_contributions
      WHERE period_id = ${periodId} AND jid = ${jid} AND damage > 0
      ORDER BY boss_index ASC
    `;
    return rows.map(mapContribution);
  }

  async getTotalContribution(periodId, jid, client = sql) {
    const rows = await client`
      SELECT COALESCE(SUM(damage), 0)::BIGINT AS total FROM raid_contributions
      WHERE period_id = ${periodId} AND jid = ${jid}
    `;
    return Number(rows[0]?.total ?? 0);
  }

  async getLeaderboard(periodId, limit = 10, client = sql) {
    const rows = await client`
      SELECT jid, SUM(damage)::BIGINT AS total_damage, SUM(hits)::BIGINT AS total_hits
      FROM raid_contributions
      WHERE period_id = ${periodId}
      GROUP BY jid
      HAVING SUM(damage) > 0
      ORDER BY total_damage DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      jid: row.jid,
      totalDamage: Number(row.total_damage),
      totalHits: Number(row.total_hits),
    }));
  }

  async getBossContributions(periodId, bossIndex, limit = 10, client = sql) {
    const rows = await client`
      SELECT jid, damage, hits FROM raid_contributions
      WHERE period_id = ${periodId} AND boss_index = ${bossIndex} AND damage > 0
      ORDER BY damage DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      jid: row.jid,
      damage: Number(row.damage),
      hits: Number(row.hits),
    }));
  }

  async claimBossReward(periodId, bossIndex, jid, client = sql) {
    const rows = await client`
      UPDATE raid_contributions
      SET reward_claimed = 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE period_id = ${periodId} AND boss_index = ${bossIndex} AND jid = ${jid}
        AND damage > 0 AND reward_claimed = 0
      RETURNING *
    `;
    return mapContribution(rows[0] ?? null);
  }
}

export const raidModel = new RaidModel();
