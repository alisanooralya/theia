import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIncomingCardDamage,
  applyOutgoingCardDamage,
  calculateCardStats,
  getCardCdm,
  getCardCritRate,
  getCardUpgradeCost,
  createCardBattleState,
  RAID_SHOP,
} from '../src/features/rpg/card.js';

const MAIN_CARDS = [
  { type: 'main', max_hp: 910, max_atk: 164, max_def: 32 },
  { type: 'main', max_hp: 760, max_atk: 167, max_def: 38 },
  { type: 'main', max_hp: 920, max_atk: 216, max_def: 40 },
  { type: 'main', max_hp: 960, max_atk: 143, max_def: 22 },
];

test('1. Main Card passive is inactive below Lv.50', () => {
  const card49 = { card_id: 'girgas', level: 49, type: 'main' };
  const battleState = createCardBattleState(card49);
  assert.equal(battleState.isActive, false);

  battleState.onHitDealt(1000);
  assert.equal(battleState.lollipopStacks, 0);

  const dmgMods = battleState.getDamageModifiers(100, 100, 1000);
  assert.equal(dmgMods.damageMultiplier, 1.0);
  assert.equal(dmgMods.incomingDamageMultiplier, 1.0);
});

test('2. Main Card passive activates at Lv.50', () => {
  const card50 = { card_id: 'girgas', level: 50, type: 'main' };
  const battleState = createCardBattleState(card50);
  assert.equal(battleState.isActive, true);

  battleState.onHitDealt(1000);
  assert.equal(battleState.lollipopStacks, 1);
  const dmgMods = battleState.getDamageModifiers(100, 100, 1000);
  assert.equal(dmgMods.damageMultiplier, 1.1);
});

test('3. Girgas: hit triggers stack, 2s cooldown, max 2 stacks (+20%), 8s expiration, refresh duration', () => {
  const state = createCardBattleState({
    card_id: 'girgas',
    level: 50,
    type: 'main',
  });

  // Hit 1 at t=1000 -> gain 1 stack (+10%)
  state.onHitDealt(1000);
  assert.equal(state.lollipopStacks, 1);
  assert.equal(state.getDamageModifiers(100, 100, 1000).damageMultiplier, 1.1);

  // Hit 2 at t=2500 (1.5s later, < 2s CD) -> cooldown active, still 1 stack
  state.onHitDealt(2500);
  assert.equal(state.lollipopStacks, 1);
  assert.equal(state.getDamageModifiers(100, 100, 2500).damageMultiplier, 1.1);

  // Hit 3 at t=3000 (2.0s later, CD ready) -> gain 2nd stack (max 2, +20%)
  state.onHitDealt(3000);
  assert.equal(state.lollipopStacks, 2);
  assert.equal(state.getDamageModifiers(100, 100, 3000).damageMultiplier, 1.2);

  // Hit 4 at t=5000 (2.0s later) -> capped at 2 stacks, duration refreshes to 5000 + 8000 = 13000
  state.onHitDealt(5000);
  assert.equal(state.lollipopStacks, 2);
  assert.equal(state.lollipopExpiresAt, 13000);
  assert.equal(state.getDamageModifiers(100, 100, 5000).damageMultiplier, 1.2);

  // At t=12999 (within 8s duration) -> still 2 stacks
  assert.equal(state.getDamageModifiers(100, 100, 12999).damageMultiplier, 1.2);

  // At t=13000 (8s after last trigger at 5000) -> expired! Stacks reset to 0
  assert.equal(state.getDamageModifiers(100, 100, 13000).damageMultiplier, 1.0);
});

test('4. Lena: enemy hit triggers stack, 4s cooldown, max 3 stacks (+30% ATK/DEF), 5s expiration', () => {
  const state = createCardBattleState({
    card_id: 'lena',
    level: 50,
    type: 'main',
  });

  // Hit received 1 at t=1000 -> 1 stack (+10% ATK/DEF)
  state.onHitReceived(1000);
  assert.equal(state.starFragmentStacks, 1);
  assert.deepEqual(state.getStatModifiers(100, 50, 1000), { atk: 110, def: 55 });

  // Hit received 2 at t=3000 (< 4s CD) -> CD active, still 1 stack
  state.onHitReceived(3000);
  assert.equal(state.starFragmentStacks, 1);

  // Hit received 3 at t=5000 (4s after t=1000) -> 2 stacks (+20% ATK/DEF)
  state.onHitReceived(5000);
  assert.equal(state.starFragmentStacks, 2);
  assert.deepEqual(state.getStatModifiers(100, 50, 5000), { atk: 120, def: 60 });

  // Hit received 4 at t=9000 (4s after t=5000) -> 3 stacks (max 3, +30% ATK/DEF)
  state.onHitReceived(9000);
  assert.equal(state.starFragmentStacks, 3);
  assert.deepEqual(state.getStatModifiers(100, 50, 9000), { atk: 130, def: 65 });

  // Hit received 5 at t=13000 -> capped at 3 stacks, duration refreshes to 13000 + 5000 = 18000
  state.onHitReceived(13000);
  assert.equal(state.starFragmentStacks, 3);
  assert.equal(state.starFragmentExpiresAt, 18000);

  // At t=17999 -> active
  assert.deepEqual(state.getStatModifiers(100, 50, 17999), { atk: 130, def: 65 });

  // At t=18000 (5s after last refresh) -> expired
  assert.deepEqual(state.getStatModifiers(100, 50, 18000), { atk: 100, def: 50 });
});

test('5. Ameris: every 3 valid user hits triggers passive, 6s cooldown, CR +10%, CDM 2.0x -> 2.5x, 4s duration', () => {
  const state = createCardBattleState({
    card_id: 'ameris',
    level: 50,
    type: 'main',
  });

  // Hits 1 and 2 at t=1000 -> not triggered
  state.onHitDealt(1000);
  state.onHitDealt(1000);
  assert.deepEqual(state.getCritModifiers(1000), { critRateBonus: 0, cdm: 2.0 });

  // Hit 3 at t=1000 -> 3rd hit! Triggers passive for 4s (expires at 5000)
  state.onHitDealt(1000);
  assert.deepEqual(state.getCritModifiers(1000), { critRateBonus: 10, cdm: 2.5 });

  // Hits 4, 5, 6 at t=3000 -> 6th hit is multiple of 3, but 6s cooldown is not ready (3000 - 1000 = 2000 < 6000)
  state.onHitDealt(3000);
  state.onHitDealt(3000);
  state.onHitDealt(3000);
  // Still active from the first trigger (now 3000 < 5000)
  assert.deepEqual(state.getCritModifiers(3000), { critRateBonus: 10, cdm: 2.5 });

  // At t=5000 -> duration of 4s has elapsed, passive expires
  assert.deepEqual(state.getCritModifiers(5000), { critRateBonus: 0, cdm: 2.0 });

  // Hits 7 and 8 at t=6000
  state.onHitDealt(6000);
  state.onHitDealt(6000);

  // Hit 9 at t=7000 -> 9th hit! 6s cooldown is ready (7000 - 1000 = 6000 >= 6000) -> reactivates!
  state.onHitDealt(7000);
  assert.deepEqual(state.getCritModifiers(7000), { critRateBonus: 10, cdm: 2.5 });
});

test('6. Daisy: correct effect at each HP threshold, dynamic evaluation, no duplicate application', () => {
  const state = createCardBattleState({
    card_id: 'daisy',
    level: 50,
    type: 'main',
  });

  // HP > 75% (80/100 = 0.80): Damage dealt +10%, Damage taken -20% (0.80)
  const hp80 = state.getDamageModifiers(80, 100);
  assert.equal(Math.round(hp80.damageMultiplier * 100), 110);
  assert.equal(Math.round(hp80.incomingDamageMultiplier * 100), 80);

  // HP > 50% and <= 75% (60/100 = 0.60): Damage dealt +20%, Damage taken -10% (0.90)
  const hp60 = state.getDamageModifiers(60, 100);
  assert.equal(Math.round(hp60.damageMultiplier * 100), 120);
  assert.equal(Math.round(hp60.incomingDamageMultiplier * 100), 90);

  // HP > 25% and <= 50% (40/100 = 0.40): Damage dealt +30%, Damage taken -10% (0.90)
  const hp40 = state.getDamageModifiers(40, 100);
  assert.equal(Math.round(hp40.damageMultiplier * 100), 130);
  assert.equal(Math.round(hp40.incomingDamageMultiplier * 100), 90);

  // HP <= 25% (20/100 = 0.20): Damage dealt +40%, Damage taken -10% (0.90)
  const hp20 = state.getDamageModifiers(20, 100);
  assert.equal(Math.round(hp20.damageMultiplier * 100), 140);
  assert.equal(Math.round(hp20.incomingDamageMultiplier * 100), 90);

  // Test dynamic change on a fighter object
  const fighter = { hp: 80, max_hp: 100, cardBattleState: state };
  assert.equal(applyOutgoingCardDamage(100, fighter), 110);
  assert.equal(applyIncomingCardDamage(100, fighter), 80);

  fighter.hp = 20;
  assert.equal(applyOutgoingCardDamage(100, fighter), 140);
  assert.equal(applyIncomingCardDamage(100, fighter), 90);
});

test('7. Unequipping Main Card removes its passive', () => {
  const unequippedState = createCardBattleState(null);
  assert.equal(unequippedState.isActive, false);

  unequippedState.onHitDealt(1000);
  assert.equal(unequippedState.lollipopStacks, 0);

  const mods = unequippedState.getDamageModifiers(20, 100);
  assert.equal(mods.damageMultiplier, 1.0);
  assert.equal(mods.incomingDamageMultiplier, 1.0);
});

test('8. Different Main Cards do not have their passives active simultaneously', () => {
  const girgasState = createCardBattleState({
    card_id: 'girgas',
    level: 50,
    type: 'main',
  });
  girgasState.onHitDealt(1000);
  assert.equal(girgasState.lollipopStacks, 1);
  assert.equal(girgasState.starFragmentStacks, 0);
  assert.equal(girgasState.userHits, 0);

  const amerisState = createCardBattleState({
    card_id: 'ameris',
    level: 50,
    type: 'main',
  });
  amerisState.onHitDealt(1000);
  amerisState.onHitDealt(1000);
  amerisState.onHitDealt(1000);
  assert.equal(amerisState.lollipopStacks, 0);
  assert.equal(amerisState.getCritModifiers(1000).critRateBonus, 10);
  assert.equal(girgasState.getCritModifiers(1000).critRateBonus, 0);
});

test('9. Temporary passive state is reset when battle ends', () => {
  const state = createCardBattleState({
    card_id: 'girgas',
    level: 50,
    type: 'main',
  });
  state.onHitDealt(1000);
  assert.equal(state.lollipopStacks, 1);

  state.reset();
  assert.equal(state.lollipopStacks, 0);
  assert.equal(state.lollipopExpiresAt, 0);
  assert.equal(state.getDamageModifiers(100, 100, 1000).damageMultiplier, 1.0);
});

test('10. Existing Artifact stats and other profile stats remain unchanged', () => {
  const stats = calculateCardStats({
    type: 'main',
    max_hp: 910,
    max_atk: 164,
    max_def: 32,
    level: 100,
  });
  assert.deepEqual(stats, { hp: 910, atk: 164, def: 32 });
});

test('11. Existing Battle, Domain, Bounty, and Raid damage helpers work seamlessly', () => {
  const fighter = {
    atk: 100,
    def: 50,
    hp: 100,
    max_hp: 100,
    critRate: 0.1,
    cardBattleState: createCardBattleState({
      card_id: 'ameris',
      level: 50,
      type: 'main',
    }),
  };

  fighter.cardBattleState.onHitDealt(1000);
  fighter.cardBattleState.onHitDealt(1000);
  fighter.cardBattleState.onHitDealt(1000); // 3rd hit activates Ameris

  assert.equal(getCardCritRate(fighter, 1000), 0.2); // 0.10 + 0.10 = 0.20
  assert.equal(getCardCdm(fighter, 1000), 2.5);
});

test('12. Existing Support Card behavior remains unchanged', () => {
  const supportOnly = createCardBattleState(null, { card_id: 'raid_emblem' });
  const mods = supportOnly.getDamageModifiers(100, 100);
  assert.equal(mods.damageMultiplier, 1.05);

  const girgasWithSupport = createCardBattleState(
    { card_id: 'girgas', level: 50, type: 'main' },
    { card_id: 'raid_emblem' }
  );
  girgasWithSupport.onHitDealt(1000); // +10% Girgas, +5% Support
  const combined = girgasWithSupport.getDamageModifiers(100, 100, 1000);
  assert.equal(Math.round(combined.damageMultiplier * 1000), 1155); // 1.05 * 1.10 = 1.155
});

test('13. Existing Gacha and Card leveling remain unchanged', () => {
  for (const card of MAIN_CARDS) {
    const level5 = calculateCardStats(card, 5);
    const level100 = calculateCardStats(card, 100);
    assert.ok(level5.hp < level100.hp);
    assert.ok(level5.atk < level100.atk);
    assert.ok(level5.def < level100.def);
    assert.deepEqual(level100, {
      hp: card.max_hp,
      atk: card.max_atk,
      def: card.max_def,
    });
  }
  assert.deepEqual(getCardUpgradeCost(5), { coin: 750, material: 1 });
  assert.deepEqual(getCardUpgradeCost(50), { coin: 3000, material: 5 });
  assert.equal(getCardUpgradeCost(100), null);
  assert.deepEqual(RAID_SHOP.card_core, {
    name: 'Card Core',
    price: 2,
    quantity: 1,
    type: 'material',
  });
});
