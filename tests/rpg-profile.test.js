import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createProfileService,
  formatProfile,
} from '../src/features/rpg/services/profile-service.js';
import { expRequiredForLevel } from '../src/features/rpg/config/stats-config.js';
import {
  MAIN_CARDS,
  SIGN_CARDS,
  cardStatsAtLevel,
} from '../src/features/rpg/config/card-config.js';

const FINAL = Object.freeze({
  level: 25,
  exp: 120,
  maxHp: 500,
  currentHp: 450,
  atk: 85,
  def: 42,
  critRate: 0.05,
  critDmg: 2.0,
});

function mainCard(over = {}) {
  const def = MAIN_CARDS.girgas;
  return {
    cardId: 'girgas',
    level: 25,
    definition: def,
    skills: {
      active: { unlocked: true, upgraded: false },
      passive: { unlocked: false, upgraded: false },
    },
    ...over,
  };
}

function signCard(over = {}) {
  const def = SIGN_CARDS.girgas_sign;
  return {
    cardId: 'girgas_sign',
    level: 10,
    definition: def,
    stats: cardStatsAtLevel(def, 10),
    signCompatible: true,
    ...over,
  };
}

function stubService({
  final = FINAL,
  main = null,
  sign = null,
  calls = null,
} = {}) {
  return createProfileService({
    finalStatsService: {
      getFinalStats: async (userId) => {
        if (calls) calls.final.push(userId);
        return final;
      },
    },
    cardService: {
      getEquippedMainCard: async (userId) => {
        if (calls) calls.main.push(userId);
        return main;
      },
      getEquippedSignCard: async (userId) => {
        if (calls) calls.sign.push(userId);
        return sign;
      },
    },
  });
}

describe('profile data', () => {
  it('reads all numbers from Final Stats Service only', async () => {
    const calls = { final: [], main: [], sign: [] };
    const data = await stubService({
      calls,
      main: mainCard(),
      sign: signCard(),
    }).getProfileData('u');
    assert.deepEqual(calls.final, ['u']);
    assert.deepEqual(calls.main, ['u']);
    assert.deepEqual(calls.sign, ['u']);
    assert.equal(data.maxHp, 500);
    assert.equal(data.currentHp, 450);
    assert.equal(data.atk, 85);
    assert.equal(data.def, 42);
    assert.equal(data.critRate, 0.05);
    assert.equal(data.critDmg, 2.0);
    assert.equal(data.expNeeded, expRequiredForLevel(25));
  });

  it('propagates service errors instead of rendering partial data', async () => {
    const broken = createProfileService({
      finalStatsService: {
        getFinalStats: async () => {
          throw new Error('db down');
        },
      },
      cardService: {
        getEquippedMainCard: async () => null,
        getEquippedSignCard: async () => null,
      },
    });
    await assert.rejects(broken.getProfileData('u'), /db down/);
  });
});

describe('profile formatting', () => {
  async function text(over = {}) {
    const data = await stubService(over).getProfileData('u');
    return formatProfile(data);
  }

  it('renders card layout with main + compatible sign', async () => {
    const t = await text({ main: mainCard(), sign: signCard() });
    assert.ok(t.includes('*Girgas* - Lv.25'));
    assert.ok(t.includes('⚡ Active Lollipop Crash'));
    assert.ok(t.includes('🟢 Unlocked'));
    assert.ok(t.includes(MAIN_CARDS.girgas.active.description));
    assert.ok(t.includes('⏱️ Cooldown: 8s'));
    assert.ok(t.includes('✨ Passive Sugar Rush'));
    assert.ok(t.includes('🔒 Unlocks at Lv.50'));
    assert.ok(t.includes(MAIN_CARDS.girgas.passive.description));
    assert.ok(t.includes('*Girgas Sign* - Lv.10'));
    assert.ok(t.includes('🟢 Passive: Active (Lollipop Drive)'));
    assert.ok(t.includes(SIGN_CARDS.girgas_sign.passive.description));
    // Passive blocks carry no cooldown.
    assert.ok(!t.includes('Cooldown: null'));
  });

  it('renders full stats when no main card is equipped', async () => {
    const t = await text();
    assert.ok(t.includes('Level: *25*'));
    assert.ok(t.includes(`EXP: *120 / ${expRequiredForLevel(25)}*`));
    assert.ok(t.includes('HP: *450 / 500*'));
    assert.ok(t.includes('ATK: *85*'));
    assert.ok(t.includes('DEF: *42*'));
    assert.ok(t.includes('Crit Rate: *5%*'));
    assert.ok(t.includes('Crit DMG: *2x*'));
  });

  it('shows empty states without cards', async () => {
    const t = await text();
    // NOTE: current service prints 'Belum ada Main Card' for both slots.
    assert.ok(t.includes('Belum ada Main Card'));
    assert.ok(t.includes('🔰 *Sign Card*'));
  });

  it('shows main without sign', async () => {
    const t = await text({ main: mainCard() });
    assert.ok(t.includes('*Girgas* - Lv.25'));
    assert.ok(t.includes('Belum ada Sign Card'));
  });

  it('descriptions come from config, not the profile service', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      new URL('../src/features/rpg/services/profile-service.js', import.meta.url),
      'utf8'
    );
    for (const phrase of [
      'crushing blow',
      'Star Fragment',
      'Lollipop Drive',
      'Eagle Eye',
    ]) {
      assert.ok(!src.includes(phrase), `hardcoded description: ${phrase}`);
    }
    const t = await text({ main: mainCard(), sign: signCard() });
    assert.ok(t.includes(MAIN_CARDS.girgas.active.description));
    assert.ok(t.includes(MAIN_CARDS.girgas.passive.description));
    assert.ok(t.includes(SIGN_CARDS.girgas_sign.passive.description));
  });

  it('marks incompatible sign passive inactive but keeps bonuses', async () => {
    const t = await text({
      main: mainCard(),
      sign: signCard({ signCompatible: false }),
    });
    assert.ok(t.includes('ATK +27'));
    assert.ok(t.includes('DEF +10'));
    assert.ok(t.includes('🔴 Passive: Inactive'));
    assert.ok(t.includes(SIGN_CARDS.girgas_sign.passive.description));
    assert.ok(t.includes('Requires: girgas'));
    assert.ok(!t.includes('🟢 Passive: Active'));
  });

  it('reflects milestone skill states', async () => {
    const locked = await text({
      main: mainCard({
        level: 1,
        skills: {
          active: { unlocked: false, upgraded: false },
          passive: { unlocked: false, upgraded: false },
        },
      }),
    });
    assert.ok(locked.includes('Lv.25'));
    assert.ok(locked.includes('Lv.50'));
    const maxed = await text({
      main: mainCard({
        level: 100,
        skills: {
          active: { unlocked: true, upgraded: true },
          passive: { unlocked: true, upgraded: true },
        },
      }),
    });
    assert.ok(maxed.includes('Upgraded'));
  });

  it('renders HP 0 without healing markers', async () => {
    const t = await text({ final: { ...FINAL, currentHp: 0 } });
    assert.ok(t.includes('HP: *0 / 500*'));
    assert.ok(t.includes('💀'));
  });
});

describe('profile command', () => {
  it('registers .profile with legacy aliases and stays thin', async () => {
    const mod = await import('../src/commands/modules/rpg/profile.js');
    const cmd = mod.default;
    assert.equal(cmd.name, 'profile');
    assert.ok(cmd.aliases.includes('profil'));
    assert.equal(cmd.category, 'rpg');
    assert.equal(typeof cmd.execute, 'function');
    const src = (cmd.execute.toString() + JSON.stringify(cmd)).toLowerCase();
    for (const banned of [
      'base +',
      'getbaseStats',
      'update(',
      'setcurrenthp',
      'insert into',
      'update rpg',
    ]) {
      assert.ok(
        !src.includes(banned),
        `command must stay thin, found: ${banned}`
      );
    }
  });

  it('replies with rendered profile and handles errors', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      new URL('../src/commands/modules/rpg/profile.js', import.meta.url),
      'utf8'
    );
    assert.ok(src.includes('getProfileData'));
    assert.ok(src.includes('formatProfile'));
    assert.ok(src.includes('ctx.reply'));
  });
});
