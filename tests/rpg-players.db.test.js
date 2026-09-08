import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import {
  RPG_STATS_CONFIG,
  defaultRpgStats,
} from '../src/features/rpg/config/stats-config.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpg2test-${process.pid}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n) {
  const userId = uid(n);
  await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
  createdUsers.push(userId);
  return userId;
}

describe('rpg_players table (database)', { skip: !dbAvailable }, () => {
  before(async () => {
    // Idempotent migration must succeed even when run repeatedly.
    await createSchema();
    await createSchema();
  });

  after(async () => {
    if (createdUsers.length) {
      await sql`DELETE FROM users WHERE jid = ANY(${createdUsers})`;
    }
    await closeDatabase();
  });

  it('migration creates the rpg_players table', async () => {
    const rows = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'rpg_players'
    `;
    const columns = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    for (const name of [
      'user_id',
      'level',
      'exp',
      'max_hp',
      'current_hp',
      'atk',
      'def',
      'crit_rate',
      'crit_dmg',
      'created_at',
      'updated_at',
    ]) {
      assert.ok(columns[name], `missing column ${name}`);
      assert.equal(columns[name].is_nullable, 'NO');
    }
    // One RPG player per user.
    const pk = await sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'rpg_players' AND tc.constraint_type = 'PRIMARY KEY'
    `;
    assert.deepEqual(
      pk.map((r) => r.column_name),
      ['user_id']
    );
  });

  it('ensure creates the parent users row for fresh senders', async () => {
    // The message pipeline does not create users rows for every sender.
    // Without this, the rpg_players FK rejects the insert and NO rpg
    // table ever updates.
    const userId = uid('fresh');
    createdUsers.push(userId);
    const player = await rpgPlayerModel.ensure(userId);
    assert.ok(player);
    const parent = await sql`SELECT jid FROM users WHERE jid = ${userId}`;
    assert.equal(parent.length, 1);
  });

  it('creates a player with config defaults', async () => {
    const userId = await makeUser('a');
    const player = await rpgPlayerModel.ensure(userId);
    assert.deepEqual(
      {
        level: player.level,
        exp: player.exp,
        max_hp: player.max_hp,
        current_hp: player.current_hp,
        atk: player.atk,
        def: player.def,
        crit_rate: player.crit_rate,
        crit_dmg: player.crit_dmg,
      },
      defaultRpgStats()
    );
  });

  it('DDL column defaults mirror the stats config', async () => {
    const userId = await makeUser('defaults');
    const rows =
      await sql`INSERT INTO rpg_players (user_id) VALUES (${userId}) RETURNING *`;
    assert.deepEqual(
      {
        level: rows[0].level,
        exp: rows[0].exp,
        max_hp: rows[0].max_hp,
        current_hp: rows[0].current_hp,
        atk: rows[0].atk,
        def: rows[0].def,
      },
      {
        level: RPG_STATS_CONFIG.startingLevel,
        exp: RPG_STATS_CONFIG.startingExp,
        max_hp: RPG_STATS_CONFIG.startingMaxHp,
        current_hp: RPG_STATS_CONFIG.startingCurrentHp,
        atk: RPG_STATS_CONFIG.startingAtk,
        def: RPG_STATS_CONFIG.startingDef,
      }
    );
    assert.ok(
      Math.abs(rows[0].crit_rate - RPG_STATS_CONFIG.startingCritRate) < 1e-9
    );
    assert.ok(
      Math.abs(rows[0].crit_dmg - RPG_STATS_CONFIG.startingCritDmg) < 1e-9
    );
  });

  it('ensure does not duplicate players', async () => {
    const userId = await makeUser('b');
    const first = await rpgPlayerModel.ensure(userId);
    await rpgPlayerModel.update(userId, { atk: 42 });
    const second = await rpgPlayerModel.ensure(userId);
    assert.equal(second.atk, 42);
    assert.equal(second.user_id, first.user_id);
    const count =
      await sql`SELECT COUNT(*)::int AS n FROM rpg_players WHERE user_id = ${userId}`;
    assert.equal(count[0].n, 1);
  });

  it('keeps current HP independent from max HP', async () => {
    const userId = await makeUser('c');
    await rpgPlayerModel.ensure(userId);
    await rpgPlayerModel.update(userId, { max_hp: 1200 });
    await rpgPlayerModel.setCurrentHp(userId, 743);
    // Raising and lowering Max HP must not touch Current HP.
    await rpgPlayerModel.update(userId, { max_hp: 2000 });
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 743);
    await rpgPlayerModel.update(userId, { max_hp: 50 });
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 743);
  });

  it('persists level and EXP', async () => {
    const userId = await makeUser('d');
    await rpgPlayerModel.ensure(userId);
    await rpgPlayerModel.setLevel(userId, 7);
    await rpgPlayerModel.setExp(userId, 1234);
    const player = await rpgPlayerModel.get(userId);
    assert.equal(player.level, 7);
    assert.equal(player.exp, 1234);
  });

  it('enforces one player per user (PK)', async () => {
    const userId = await makeUser('e');
    await rpgPlayerModel.ensure(userId);
    await assert.rejects(
      sql`INSERT INTO rpg_players (user_id) VALUES (${userId})`
    );
  });

  it('enforces FK to users and NOT NULL / CHECK constraints', async () => {
    const userId = await makeUser('f');
    await rpgPlayerModel.ensure(userId);
    // FK: unknown user rejected.
    await assert.rejects(
      sql`INSERT INTO rpg_players (user_id) VALUES ('rpg2test-ghost-${process.pid}@test.local')`
    );
    // NOT NULL: null user rejected.
    await assert.rejects(sql`INSERT INTO rpg_players (user_id) VALUES (NULL)`);
    // CHECK: negative exp rejected.
    await assert.rejects(
      sql`UPDATE rpg_players SET exp = -1 WHERE user_id = ${userId}`
    );
    // CHECK: zero max_hp rejected.
    await assert.rejects(
      sql`UPDATE rpg_players SET max_hp = 0 WHERE user_id = ${userId}`
    );
  });
});
