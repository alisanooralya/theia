import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIncomingCardDamage,
  applyOutgoingCardDamage,
  calculateCardStats,
  combatModifiersForCards,
  cardTurnStats,
  getCardUpgradeCost,
  RAID_SHOP,
} from '../src/features/rpg/card.js';

const MAIN_CARDS = [
  { type: 'main', max_hp: 910, max_atk: 164, max_def: 32 },
  { type: 'main', max_hp: 760, max_atk: 167, max_def: 38 },
  { type: 'main', max_hp: 920, max_atk: 216, max_def: 40 },
  { type: 'main', max_hp: 960, max_atk: 143, max_def: 22 },
];

test('Lv.5 stats are lower and Lv.100 reaches exact targets', () => {
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
});

test('Support Card remains statless at Lv.1 and has no upgrade cost', () => {
  const support = {
    type: 'support',
    level: 1,
    max_hp: 999,
    max_atk: 999,
    max_def: 999,
  };
  assert.deepEqual(calculateCardStats(support), { hp: 0, atk: 0, def: 0 });
  assert.equal(getCardUpgradeCost(100), null);
});

test('upgrade cost is deterministic and stops at Lv.100', () => {
  assert.deepEqual(getCardUpgradeCost(5), { coin: 750, material: 1 });
  assert.deepEqual(getCardUpgradeCost(50), { coin: 3000, material: 5 });
  assert.equal(getCardUpgradeCost(100), null);
});

test('Main Card passive is locked below Lv.50 and unlocks at Lv.50', () => {
  const locked = combatModifiersForCards(
    { card_id: 'girgas', level: 49 },
    null
  );
  const unlocked = combatModifiersForCards(
    { card_id: 'girgas', level: 50 },
    null
  );
  assert.equal(locked.damageMultiplier, 1);
  assert.equal(unlocked.damageMultiplier, 1.2);
});

test('Support Card passive works independently at Lv.1', () => {
  const modifiers = combatModifiersForCards(null, {
    card_id: 'raid_emblem',
    level: 1,
  });
  assert.equal(modifiers.damageMultiplier, 1.05);
});

test('stack and conditional combat modifiers preserve card identities', () => {
  const lena = {
    atk: 100,
    def: 50,
    cardHits: 3,
    cardModifiers: { stackPerHit: 0.1, maxStacks: 3 },
  };
  assert.deepEqual(cardTurnStats(lena), { atk: 130, def: 65 });

  const daisy = {
    hp: 30,
    max_hp: 100,
    cardModifiers: {
      damageMultiplier: 1.1,
      lowHpDamageMultiplier: 1.2,
      incomingDamageMultiplier: 0.9,
    },
  };
  assert.equal(applyOutgoingCardDamage(100, daisy), 132);
  assert.equal(applyIncomingCardDamage(100, daisy), 90);

  const ameris = {
    atk: 100,
    def: 50,
    cardHits: 2,
    cardModifiers: { thirdHitAtk: 1.3 },
  };
  assert.deepEqual(cardTurnStats(ameris), { atk: 130, def: 50 });
});

test('Raid Shop exposes the exclusive Card upgrade material', () => {
  assert.deepEqual(RAID_SHOP.card_core, {
    name: 'Card Core',
    price: 2,
    quantity: 1,
    type: 'material',
  });
});
