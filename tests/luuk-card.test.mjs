import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_CARDS,
  SIGN_CARDS,
  cardKind,
  cardArtFile,
  cardArtPath,
  cardStatsAtLevel,
  getCardDefinition,
  getMainCard,
  getSignCard,
} from '../src/features/rpg/config/card-config.js';
import {
  mainSkillState,
  signPassiveState,
  isSignCompatible,
} from '../src/features/rpg/services/skill-engine.js';
import {
  battleSkillsFromEffects,
  createBattle,
  enemyTurn,
  playerTurn,
  runRound,
} from '../src/features/rpg/services/battle-engine.js';
import { rollMainCard } from '../src/features/rpg/config/gacha-config.js';

const NO_CRIT = 0.99;

function lastPlayerDamage(state) {
  const entries = state.log.filter((e) => e.actor === 'player');
  return entries[entries.length - 1].damage;
}

function luukPassiveSkills(level) {
  const def = MAIN_CARDS.luuk;
  const st = mainSkillState(def, level);
  const entries = [];
  if (st.passive.unlocked) {
    entries.push({
      source: 'main-passive',
      cardId: 'luuk',
      name: def.passive.name,
      upgraded: st.passive.upgraded,
      cooldownMs: null,
      effects: st.passive.effects,
    });
  }
  return { active: null, passives: battleSkillsFromEffects(entries).passives };
}

function luukActiveSkills(level) {
  const def = MAIN_CARDS.luuk;
  const st = mainSkillState(def, level);
  const entries = [];
  if (st.active.unlocked) {
    entries.push({
      source: 'main-active',
      cardId: 'luuk',
      name: def.active.name,
      upgraded: st.active.upgraded,
      cooldownMs: st.active.cooldownMs,
      effects: st.active.effects,
    });
  }
  return battleSkillsFromEffects(entries);
}

function luukSignSkills() {
  const def = SIGN_CARDS.luuk_sign;
  const entries = [
    {
      source: 'sign-passive',
      cardId: 'luuk_sign',
      name: def.passive.name,
      upgraded: false,
      cooldownMs: null,
      effects: signPassiveState(def, 'luuk').effects,
    },
  ];
  return { active: null, passives: battleSkillsFromEffects(entries).passives };
}

function arena({ userAtk = 100, userDef = 10, userHp = 5000, enemyAtk = 10, enemyDef = 0, enemyMaxHp = 5000, playerSkills = null }) {
  return createBattle({
    playerStats: {
      maxHp: 5000,
      currentHp: userHp,
      atk: userAtk,
      def: userDef,
      critRate: 0,
      critDmg: 1.5,
    },
    enemy: {
      id: 'dummy',
      name: 'Dummy',
      stats: {
        maxHp: enemyMaxHp,
        atk: enemyAtk,
        def: enemyDef,
        critRate: 0,
        critDmg: 1.5,
      },
    },
    playerSkills,
  });
}

describe('luuk main card config', () => {
  it('1. luuk dapat dipilih via getter/kind/definition', () => {
    assert.equal(getMainCard('luuk')?.name, 'Luuk');
    assert.equal(cardKind('luuk'), 'main');
    assert.equal(getCardDefinition('luuk')?.id, 'luuk');
    assert.ok(MAIN_CARDS.luuk);
  });

  it('2. lv1 stat benar', () => {
    assert.deepEqual(cardStatsAtLevel(MAIN_CARDS.luuk, 1), {
      hp: 233,
      atk: 110,
      def: 9,
    });
  });

  it('3. lv100 stat sesuai target', () => {
    assert.deepEqual(cardStatsAtLevel(MAIN_CARDS.luuk, 100), {
      hp: 2450,
      atk: 1100,
      def: 68,
    });
  });

  it('lifecycle mengikuti milestones (25/50/75/100)', () => {
    const def = MAIN_CARDS.luuk;
    assert.equal(def.active.unlockLevel, 25);
    assert.equal(def.active.upgradeLevel, 75);
    assert.equal(def.passive.unlockLevel, 50);
    assert.equal(def.passive.upgradeLevel, 100);
    assert.equal(def.passive.name, 'Predatory Instinct');
    assert.equal(mainSkillState(def, 24).active.unlocked, false);
    assert.equal(mainSkillState(def, 25).active.unlocked, true);
    assert.equal(mainSkillState(def, 49).passive.unlocked, false);
    assert.equal(mainSkillState(def, 50).passive.unlocked, true);
    assert.equal(mainSkillState(def, 100).passive.upgraded, true);
  });
});

describe('luuk passive: predatory instinct', () => {
  it('4. tidak aktif jika enemy atk <= luuk atk', () => {
    const skills = luukPassiveSkills(50);
    assert.equal(skills.passives.length, 1);
    const base = enemyTurn(
      arena({ enemyAtk: 100, playerSkills: luukPassiveSkills(50) }),
      NO_CRIT
    );
    // 100 * 100/110 = 90.9 -> 91 tanpa reduksi
    assert.equal(5000 - base.player.hp, 91);
    const lower = enemyTurn(
      arena({ enemyAtk: 50, playerSkills: luukPassiveSkills(50) }),
      NO_CRIT
    );
    // 50 * 100/110 = 45.45 -> 45 tanpa reduksi
    assert.equal(5000 - lower.player.hp, 45);
  });

  it('5. aktif jika enemy atk > luuk atk', () => {
    const after = enemyTurn(
      arena({ enemyAtk: 101, playerSkills: luukPassiveSkills(50) }),
      NO_CRIT
    );
    // 101 * 100/110 = 91.8 -> 92, reduksi 10% -> 82.8 -> 83
    assert.equal(5000 - after.player.hp, 83);
  });

  it('6. incoming damage berkurang 10% (lv50) dan 20% saat upgrade (lv100)', () => {
    const lv50 = enemyTurn(
      arena({ enemyAtk: 200, playerSkills: luukPassiveSkills(50) }),
      NO_CRIT
    );
    // 200 * 100/110 = 181.8 -> 182 * 0.9 = 163.8 -> 164
    assert.equal(5000 - lv50.player.hp, 164);
    const lv100 = enemyTurn(
      arena({ enemyAtk: 200, playerSkills: luukPassiveSkills(100) }),
      NO_CRIT
    );
    // 182 * 0.8 = 145.6 -> 146
    assert.equal(5000 - lv100.player.hp, 146);
  });
});

describe('luuk active: savage rend (def ignore)', () => {
  it('7. def ignore 20% bekerja pada basic attack setelah skill', () => {
    const skills = luukActiveSkills(25);
    assert.equal(skills.active.buffs.length, 1);
    assert.equal(skills.active.buffs[0].modifiers.defIgnore, 0.2);
    let state = arena({
      enemyDef: 100,
      playerSkills: skills,
    });
    const plain = playerTurn(state, 'basic_attack', NO_CRIT);
    // 100 * 100/200 = 50
    assert.equal(plain.log[0].damage, 50);
    // skill hit normal + buff ditempel
    state = runRound(state, 'skill', NO_CRIT);
    assert.equal(lastPlayerDamage(state), 50);
    // basic berikutnya ignore 20%: def efektif 80 -> 100*100/180 = 55.6 -> 56
    state = runRound(state, 'basic_attack', NO_CRIT);
    assert.equal(lastPlayerDamage(state), 56);
    // buff kedaluwarsa setelah 1 round: kembali 50
    state = runRound(state, 'basic_attack', NO_CRIT);
    assert.equal(lastPlayerDamage(state), 50);
  });

  it('upgrade lv75 menaikkan def ignore (0.35)', () => {
    const skills = luukActiveSkills(75);
    assert.equal(skills.active.buffs[0].modifiers.defIgnore, 0.35);
    let state = arena({ enemyDef: 100, playerSkills: skills });
    state = runRound(state, 'skill', NO_CRIT);
    state = runRound(state, 'basic_attack', NO_CRIT);
    // def efektif 65 -> 100*100/165 = 60.6 -> 61
    assert.equal(lastPlayerDamage(state), 61);
  });

  it('8. def target tidak berubah', () => {
    const skills = luukActiveSkills(25);
    let state = arena({ enemyDef: 100, playerSkills: skills });
    state = runRound(state, 'skill', NO_CRIT);
    state = runRound(state, 'basic_attack', NO_CRIT);
    assert.equal(state.enemy.stats.def, 100);
  });
});

describe('luuk sign card', () => {
  it('9. lv1 = 40 atk / 15 def, kompatibel hanya dengan luuk', () => {
    assert.deepEqual(cardStatsAtLevel(SIGN_CARDS.luuk_sign, 1), {
      atk: 40,
      def: 15,
    });
    assert.equal(getSignCard('luuk_sign')?.name, 'Luuk Sign');
    assert.equal(cardKind('luuk_sign'), 'sign');
    assert.equal(isSignCompatible(SIGN_CARDS.luuk_sign, 'luuk'), true);
    assert.equal(isSignCompatible(SIGN_CARDS.luuk_sign, 'girgas'), false);
    assert.equal(signPassiveState(SIGN_CARDS.luuk_sign, 'girgas').active, false);
  });

  it('10. lv50 sesuai target sekitar 172 atk / 64 def', () => {
    assert.deepEqual(cardStatsAtLevel(SIGN_CARDS.luuk_sign, 50), {
      atk: 172,
      def: 64,
    });
  });

  it('11-13. sign passive +10% hanya saat enemy hp > user hp', () => {
    const skills = luukSignSkills();
    const active = playerTurn(
      arena({ userHp: 500, enemyMaxHp: 1000, playerSkills: skills }),
      'basic_attack',
      NO_CRIT
    );
    assert.equal(active.log[0].damage, 110);
    const inactiveLow = playerTurn(
      arena({ userHp: 1000, enemyMaxHp: 500, playerSkills: skills }),
      'basic_attack',
      NO_CRIT
    );
    assert.equal(inactiveLow.log[0].damage, 100);
    const inactiveEqual = playerTurn(
      arena({ userHp: 1000, enemyMaxHp: 1000, playerSkills: skills }),
      'basic_attack',
      NO_CRIT
    );
    assert.equal(inactiveEqual.log[0].damage, 100);
  });

  it('14. condition memakai current hp dan dievaluasi ulang tiap damage', () => {
    const skills = luukSignSkills();
    // maxHp sama (1000), tapi user current 400 < enemy 500 -> aktif.
    // bila memakai maxHp, 500 > 1000 false -> tidak aktif.
    const currentBased = playerTurn(
      arena({ userHp: 400, enemyMaxHp: 500, playerSkills: skills }),
      'basic_attack',
      NO_CRIT
    );
    assert.equal(currentBased.log[0].damage, 110);
    // re-evaluasi: user 950 vs enemy 1000 -> hit pertama 110 (enemy 890),
    // hit kedua enemy 890 < 950 -> kembali 100.
    let state = arena({ userHp: 950, enemyMaxHp: 1000, playerSkills: skills });
    state = playerTurn(state, 'basic_attack', NO_CRIT);
    assert.equal(state.log[0].damage, 110);
    state = playerTurn(state, 'basic_attack', NO_CRIT);
    assert.equal(state.log[1].damage, 100);
  });
});

describe('luuk integration', () => {
  it('15. luuk terdaftar di card config', () => {
    assert.ok(Object.keys(MAIN_CARDS).includes('luuk'));
    assert.ok(Object.keys(SIGN_CARDS).includes('luuk_sign'));
    assert.equal(SIGN_CARDS.luuk_sign.compatibleCard, 'luuk');
  });

  it('16. image card existing dipakai via mekanisme existing', () => {
    assert.equal(cardArtFile('luuk'), 'luuk.webp');
    assert.ok(cardArtPath('luuk')?.endsWith('luuk.webp'));
    // profile/card/gacha membaca dari MAIN_CARDS/SIGN_CARDS secara dynamic,
    // jadi tidak ada registrasi tambahan (dicakup test 15/17/18 + db test).
  });

  it('17. luuk sign lewat sistem sign existing', () => {
    const passive = signPassiveState(SIGN_CARDS.luuk_sign, 'luuk');
    assert.equal(passive.active, true);
    assert.equal(passive.effects.length, 1);
  });

  it('18. gacha mengenali luuk secara dynamic', () => {
    assert.ok(Object.keys(MAIN_CARDS).includes('luuk'));
    assert.equal(rollMainCard(() => 0.9999), 'luuk');
    assert.equal(MAIN_CARDS[rollMainCard(() => 0.9999)].name, 'Luuk');
  });

  it('19. tidak ada regression pada card existing', () => {
    assert.deepEqual(cardStatsAtLevel(MAIN_CARDS.girgas, 1), {
      hp: 213,
      atk: 118,
      def: 10,
    });
    assert.deepEqual(cardStatsAtLevel(MAIN_CARDS.girgas, 100), {
      hp: 2589,
      atk: 1286,
      def: 49,
    });
    assert.deepEqual(cardStatsAtLevel(MAIN_CARDS.lena, 100), {
      hp: 2065,
      atk: 1257,
      def: 39,
    });
    assert.deepEqual(cardStatsAtLevel(MAIN_CARDS.ameris, 100), {
      hp: 2399,
      atk: 1307,
      def: 54,
    });
    assert.deepEqual(cardStatsAtLevel(MAIN_CARDS.daisy, 100), {
      hp: 2829,
      atk: 985,
      def: 78,
    });
    for (const [id, def] of Object.entries(MAIN_CARDS)) {
      if (id === 'luuk') continue;
      const skills = battleSkillsFromEffects([
        {
          source: 'main-active',
          cardId: id,
          name: def.active.name,
          upgraded: false,
          cooldownMs: def.active.cooldownMs,
          effects: def.active.effects,
        },
      ]);
      assert.equal(skills.active.defIgnore, 0);
      assert.deepEqual(skills.active.buffs, []);
    }
  });

  it('20. config invalid tetap fail-fast', () => {
    assert.throws(
      () =>
        createBattle({
          playerStats: {
            maxHp: 100,
            currentHp: 100,
            atk: 10,
            def: 5,
            critRate: 0,
            critDmg: 1.5,
          },
          enemy: {
            id: 'x',
            name: 'X',
            stats: { maxHp: 100, atk: 10, def: 5, critRate: 0, critDmg: 1.5 },
          },
          playerSkills: {
            active: null,
            passives: [
              {
                name: 'bad',
                trigger: 'nope',
                modifiers: {},
                effects: [],
              },
            ],
          },
        }),
      /unsupported passive trigger/
    );
  });
});
