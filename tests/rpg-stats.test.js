import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RPG_STATS_CONFIG,
  expRequiredForLevel,
  defaultRpgStats,
} from '../src/features/rpg/config/stats-config.js';
import {
  createStatService,
  toBaseStats,
} from '../src/features/rpg/services/stat-service.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';

describe('rpg stats config defaults', () => {
  it('is frozen and exposes starting values', () => {
    assert.ok(Object.isFrozen(RPG_STATS_CONFIG));
    assert.equal(RPG_STATS_CONFIG.startingLevel, 1);
    assert.equal(RPG_STATS_CONFIG.startingExp, 0);
    assert.ok(RPG_STATS_CONFIG.startingMaxHp > 0);
    assert.ok(RPG_STATS_CONFIG.startingAtk >= 0);
    assert.ok(RPG_STATS_CONFIG.startingDef >= 0);
  });

  it('uses fraction crit rate and multiplier crit dmg', () => {
    const { startingCritRate, startingCritDmg } = RPG_STATS_CONFIG;
    assert.ok(startingCritRate >= 0 && startingCritRate <= 1);
    assert.ok(startingCritDmg >= 1);
  });

  it('defaultRpgStats matches the config', () => {
    assert.deepEqual(defaultRpgStats(), {
      level: RPG_STATS_CONFIG.startingLevel,
      exp: RPG_STATS_CONFIG.startingExp,
      max_hp: RPG_STATS_CONFIG.startingMaxHp,
      current_hp: RPG_STATS_CONFIG.startingCurrentHp,
      atk: RPG_STATS_CONFIG.startingAtk,
      def: RPG_STATS_CONFIG.startingDef,
      crit_rate: RPG_STATS_CONFIG.startingCritRate,
      crit_dmg: RPG_STATS_CONFIG.startingCritDmg,
    });
  });

  it('fresh players start at full HP', () => {
    const defaults = defaultRpgStats();
    assert.equal(defaults.current_hp, defaults.max_hp);
  });

  it('exp curve is deterministic and increasing', () => {
    const l1 = expRequiredForLevel(1);
    const l2 = expRequiredForLevel(2);
    const l3 = expRequiredForLevel(3);
    assert.equal(l1, expRequiredForLevel(1));
    assert.ok(l1 > 0 && l2 > l1 && l3 > l2);
  });

  it('rejects invalid levels', () => {
    assert.throws(() => expRequiredForLevel(0), RangeError);
    assert.throws(() => expRequiredForLevel(1.5), RangeError);
  });
});

describe('toBaseStats', () => {
  it('maps snake_case rows to camelCase base stats only', () => {
    const stats = toBaseStats({
      user_id: 'u1@s.whatsapp.net',
      level: 4,
      exp: 250,
      max_hp: 1200,
      current_hp: 743,
      atk: 30,
      def: 20,
      crit_rate: 0.05,
      crit_dmg: 2.0,
    });
    assert.deepEqual(stats, {
      userId: 'u1@s.whatsapp.net',
      level: 4,
      exp: 250,
      maxHp: 1200,
      currentHp: 743,
      atk: 30,
      def: 20,
      critRate: 0.05,
      critDmg: 2.0,
    });
  });

  it('exposes no card, final, or artifact fields', () => {
    const stats = toBaseStats({
      user_id: 'u',
      level: 1,
      exp: 0,
      max_hp: 100,
      current_hp: 100,
      atk: 10,
      def: 5,
      crit_rate: 0.05,
      crit_dmg: 2.0,
    });
    for (const key of Object.keys(stats)) {
      assert.match(
        key,
        /^(userId|level|exp|maxHp|currentHp|atk|def|critRate|critDmg)$/
      );
    }
  });

  it('returns null for missing rows', () => {
    assert.equal(toBaseStats(null), null);
  });
});

describe('statService.getBaseStats', () => {
  it('ensures the player and returns base stats', async () => {
    const row = {
      user_id: 'u2@s.whatsapp.net',
      level: 1,
      exp: 0,
      max_hp: 100,
      current_hp: 100,
      atk: 10,
      def: 5,
      crit_rate: 0.05,
      crit_dmg: 2.0,
    };
    let ensuredWith = null;
    const service = createStatService({
      playerModel: {
        ensure: async (userId) => {
          ensuredWith = userId;
          return row;
        },
      },
    });
    const stats = await service.getBaseStats('u2@s.whatsapp.net');
    assert.equal(ensuredWith, 'u2@s.whatsapp.net');
    assert.equal(stats.maxHp, 100);
    assert.equal(stats.currentHp, 100);
    assert.equal(stats.critDmg, 2.0);
  });
});

describe('rpgPlayerModel input validation (no DB)', () => {
  it('rejects invalid level/exp/hp without touching the database', async () => {
    const explodingClient = () => {
      throw new Error('must not reach the database');
    };
    await assert.rejects(
      rpgPlayerModel.setLevel('u', 0, explodingClient),
      RangeError
    );
    await assert.rejects(
      rpgPlayerModel.setLevel('u', 1.5, explodingClient),
      RangeError
    );
    await assert.rejects(
      rpgPlayerModel.setExp('u', -1, explodingClient),
      RangeError
    );
    await assert.rejects(
      rpgPlayerModel.setCurrentHp('u', 1.5, explodingClient),
      RangeError
    );
  });

  it('update only allows known RPG columns', async () => {
    let captured = null;
    const stubClient = {
      unsafe: async (query, params) => {
        captured = { query, params };
        return [{ user_id: 'u' }];
      },
    };
    await rpgPlayerModel.update(
      'u',
      { atk: 99, injected: 1, level: 5 },
      stubClient
    );
    assert.ok(captured.query.includes('atk = $1'));
    assert.ok(captured.query.includes('level = $2'));
    assert.ok(!captured.query.includes('injected'));
    assert.deepEqual(captured.params, [99, 5, 'u']);
  });
});
