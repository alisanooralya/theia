import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DOMAINS,
  getDomain,
  getDomains,
  rollReward,
} from '../src/features/rpg/config/domain-config.js';
import {
  formatDomainList,
  formatDomainResult,
} from '../src/commands/modules/rpg/domain.js';

describe('domain config', () => {
  it('exposes exactly easy/medium/hard with bosses', () => {
    assert.deepEqual(getDomains().map((d) => d.id), ['easy', 'medium', 'hard']);
    for (const domain of getDomains()) {
      assert.ok(domain.name && domain.boss.id && domain.boss.name);
      assert.ok(domain.boss.stats.maxHp > 0);
      assert.ok(domain.boss.stats.atk >= 0 && domain.boss.stats.def >= 0);
    }
    assert.equal(getDomain('HARD').id, 'hard');
    assert.equal(getDomain('nope'), null);
    assert.equal(getDomain(''), null);
  });

  it('reward ranges match the specified brackets', () => {
    assert.deepEqual(DOMAINS.easy.rewards, {
      exp: { min: 100, max: 150 },
      coin: { min: 5000, max: 10000 },
      cerelia: { min: 2, max: 4 },
    });
    assert.deepEqual(DOMAINS.medium.rewards, {
      exp: { min: 250, max: 400 },
      coin: { min: 15000, max: 25000 },
      cerelia: { min: 5, max: 8 },
    });
    assert.deepEqual(DOMAINS.hard.rewards, {
      exp: { min: 600, max: 900 },
      coin: { min: 35000, max: 50000 },
      cerelia: { min: 10, max: 15 },
    });
  });

  it('rolls stay within range', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = rollReward(DOMAINS.hard.rewards.coin);
      assert.ok(value >= 35000 && value <= 50000);
    }
    assert.equal(rollReward({ min: 5, max: 5 }, () => 0.99), 5);
  });

  it('lists difficulties without hardcoded names', async () => {
    const text = formatDomainList();
    for (const domain of getDomains()) {
      assert.ok(text.includes(domain.name));
      assert.ok(text.includes(`.domain ${domain.id}`));
    }
    const { readFile } = await import('node:fs/promises');
    const svc = await readFile(new URL('../src/features/rpg/services/domain-service.js', import.meta.url), 'utf8');
    const cmd = await readFile(new URL('../src/commands/modules/rpg/domain.js', import.meta.url), 'utf8');
    for (const banned of ['Slime King', 'Stone Golem', 'Abyss Dragon']) {
      assert.ok(!svc.includes(banned), `hardcoded in service: ${banned}`);
      assert.ok(!cmd.includes(banned), `hardcoded in command: ${banned}`);
    }
  });
});

describe('domain result UI', () => {
  it('renders WIN/LOSE/DRAW outcomes', () => {
    const win = formatDomainResult({
      status: 'WIN',
      bossName: 'Slime King',
      rewards: { exp: 120, coin: 7000, cerelia: 3 },
      leveledUp: true,
      duplicate: false,
    });
    assert.ok(win.includes('DOMAIN CLEAR'));
    assert.ok(win.includes('EXP +120'));
    assert.ok(win.includes('Cerelia ×3'));
    assert.ok(win.includes('Level Up'));
    const lose = formatDomainResult({ status: 'LOSE', bossName: 'X' });
    assert.ok(lose.includes('DOMAIN FAILED'));
    assert.ok(lose.includes('No rewards'));
    const draw = formatDomainResult({ status: 'DRAW', bossName: 'X' });
    assert.ok(draw.includes('DRAW'));
  });
});
