import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPPORT_EFFECTS,
  PASSIVE_DESCRIPTIONS,
  RAID_SHOP,
  supportEffects,
  supportCoinMultiplier,
  passiveDescription,
  calculateCardStats,
  combatModifiersForCards,
  CardBattleState,
  applyOutgoingCardDamage,
  applyIncomingCardDamage,
  getCardCritRate,
} from '../src/features/rpg/card.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const main = (cardId, level = 100) => ({ card_id: cardId, type: 'main', level });
const support = (cardId) => ({ card_id: cardId, type: 'support', level: 1 });

describe('support card registry', () => {
  it('tepat 4 support card terdaftar', () => {
    assert.deepEqual(Object.keys(SUPPORT_EFFECTS).sort(), [
      'critical_eye',
      'iron_will',
      'raid_emblem',
      'treasure_hunter',
    ]);
  });

  it('angka efek sesuai spec', () => {
    assert.equal(SUPPORT_EFFECTS.raid_emblem.damageDealt, 0.05);
    assert.equal(SUPPORT_EFFECTS.treasure_hunter.coinBonus, 0.08);
    assert.equal(SUPPORT_EFFECTS.iron_will.damageTaken, -0.05);
    assert.equal(SUPPORT_EFFECTS.critical_eye.critRate, 5);
  });

  it('raid shop menjual tepat 4 support + card core', () => {
    const supports = Object.entries(RAID_SHOP).filter(
      ([, p]) => p.type === 'support'
    );
    assert.equal(supports.length, 4);
    for (const [, p] of supports) {
      assert.equal(p.quantity, 1);
    }
    assert.equal(RAID_SHOP.card_core.type, 'material');
  });

  it('passive description tersedia untuk semua support', () => {
    for (const id of Object.keys(SUPPORT_EFFECTS)) {
      assert.match(PASSIVE_DESCRIPTIONS[id], /.{10,}/);
    }
    assert.match(passiveDescription(support('critical_eye')), /Crit Rate/);
  });

  it('seed database memuat 3 support baru', () => {
    const ddl = readFileSync(join(root, 'src/storage/definitions.js'), 'utf8');
    for (const [id, name] of [
      ['treasure_hunter', 'Treasure Hunter'],
      ['iron_will', 'Iron Will'],
      ['critical_eye', 'Critical Eye'],
    ]) {
      assert.ok(
        ddl.includes(`('${id}', '${name}', 'support', 'Utility', 1, 0, 0, 0`),
        `seed ${id} hilang`
      );
    }
  });

  it('unique ownership ditegakkan di level DB', () => {
    const ddl = readFileSync(join(root, 'src/storage/definitions.js'), 'utf8');
    assert.ok(ddl.includes('UNIQUE(owner_jid, card_id)'));
    const model = readFileSync(
      join(root, 'src/storage/models/card.js'),
      'utf8'
    );
    assert.ok(model.includes('ON CONFLICT (owner_jid, card_id) DO NOTHING'));
  });
});

describe('supportEffects / coin multiplier', () => {
  it('tanpa support = netral', () => {
    assert.deepEqual(supportEffects(null), {});
    assert.deepEqual(supportEffects(undefined), {});
    assert.deepEqual(supportEffects({ card_id: 'unknown' }), {});
    assert.equal(supportCoinMultiplier(null), 1);
  });

  it('treasure hunter = pengali coin 1.08', () => {
    assert.equal(supportCoinMultiplier(support('treasure_hunter')), 1.08);
  });

  it('support lain tidak mengubah coin', () => {
    assert.equal(supportCoinMultiplier(support('raid_emblem')), 1);
    assert.equal(supportCoinMultiplier(support('iron_will')), 1);
    assert.equal(supportCoinMultiplier(support('critical_eye')), 1);
  });
});

describe('combatModifiersForCards (legacy path)', () => {
  it('tanpa card = netral', () => {
    assert.deepEqual(combatModifiersForCards(null, null), {
      damageMultiplier: 1,
      incomingDamageMultiplier: 1,
      critRateBonus: 0,
    });
  });

  it('raid focus tetap damage +5%', () => {
    const m = combatModifiersForCards(null, support('raid_emblem'));
    assert.equal(m.damageMultiplier, 1.05);
    assert.equal(m.incomingDamageMultiplier, 1);
    assert.equal(m.critRateBonus, 0);
  });

  it('iron will = incoming 0.95', () => {
    const m = combatModifiersForCards(null, support('iron_will'));
    assert.equal(m.incomingDamageMultiplier, 0.95);
    assert.equal(m.damageMultiplier, 1);
  });

  it('critical eye = crit +5', () => {
    const m = combatModifiersForCards(null, support('critical_eye'));
    assert.equal(m.critRateBonus, 5);
  });

  it('treasure hunter tidak mengubah combat', () => {
    assert.deepEqual(combatModifiersForCards(null, support('treasure_hunter')), {
      damageMultiplier: 1,
      incomingDamageMultiplier: 1,
      critRateBonus: 0,
    });
  });

  it('ameris + critical eye = 10 + 5 (tidak saling menimpa)', () => {
    const m = combatModifiersForCards(
      main('ameris', 50),
      support('critical_eye')
    );
    assert.equal(m.critRateBonus, 15);
  });

  it('daisy + iron will = 0.8 * 0.95', () => {
    const m = combatModifiersForCards(main('daisy', 50), support('iron_will'));
    assert.ok(Math.abs(m.incomingDamageMultiplier - 0.76) < 1e-9);
  });

  it('main di bawah Lv.50: passive main mati, passive support tetap jalan', () => {
    const m = combatModifiersForCards(main('ameris', 5), support('raid_emblem'));
    assert.equal(m.damageMultiplier, 1.05);
    assert.equal(m.critRateBonus, 0);
  });
});

describe('CardBattleState (jalur combat aktif)', () => {
  it('tanpa card = netral', () => {
    const s = new CardBattleState(null, null);
    assert.equal(s.supportDamageMultiplier, 1);
    assert.equal(s.supportIncomingMultiplier, 1);
    assert.equal(s.supportCritRateBonus, 0);
  });

  it('iron will aktif tanpa main card', () => {
    const s = new CardBattleState(null, support('iron_will'));
    assert.equal(s.isActive, false);
    const mods = s.getDamageModifiers(100, 100);
    assert.equal(mods.incomingDamageMultiplier, 0.95);
    assert.equal(mods.damageMultiplier, 1);
  });

  it('critical eye aktif tanpa main card', () => {
    const s = new CardBattleState(null, support('critical_eye'));
    assert.deepEqual(s.getCritModifiers(), { critRateBonus: 5, cdm: 2.0 });
  });

  it('raid focus tetap damage 1.05', () => {
    const s = new CardBattleState(null, support('raid_emblem'));
    assert.equal(s.getDamageModifiers(100, 100).damageMultiplier, 1.05);
  });

  it('ameris Lv.50 + critical eye = 10 + 5 saat window aktif', () => {
    const s = new CardBattleState(main('ameris', 50), support('critical_eye'));
    const now = Date.now();
    s.userHits = 2;
    s.lastAmerisActivation = now - 7000;
    s.onHitDealt(now);
    assert.equal(s.getCritModifiers(now).critRateBonus, 15);
  });

  it('daisy + iron will menumpuk sekali (0.8 * 0.95)', () => {
    const s = new CardBattleState(main('daisy', 60), support('iron_will'));
    const mods = s.getDamageModifiers(900, 1000);
    assert.ok(Math.abs(mods.incomingDamageMultiplier - 0.76) < 1e-9);
  });
});

describe('apply damage + crit rate', () => {
  it('applyIncomingCardDamage memakai battle state (iron will)', () => {
    const fighter = {
      hp: 100,
      max_hp: 100,
      cardBattleState: new CardBattleState(null, support('iron_will')),
    };
    assert.equal(applyIncomingCardDamage(100, fighter), 95);
  });

  it('applyIncomingCardDamage legacy path tidak berubah', () => {
    assert.equal(applyIncomingCardDamage(100, null), 100);
    assert.equal(
      applyIncomingCardDamage(100, { cardModifiers: {} }),
      100
    );
  });

  it('applyOutgoingCardDamage raid focus tidak berubah', () => {
    const fighter = {
      hp: 100,
      max_hp: 100,
      cardBattleState: new CardBattleState(null, support('raid_emblem')),
    };
    assert.equal(applyOutgoingCardDamage(100, fighter), 105);
  });

  it('getCardCritRate +5% dari critical eye', () => {
    const fighter = {
      critRate: 0.1,
      cardBattleState: new CardBattleState(null, support('critical_eye')),
    };
    assert.ok(Math.abs(getCardCritRate(fighter) - 0.15) < 1e-9);
  });
});

describe('aturan support card', () => {
  it('support selalu stat bonus nol', () => {
    assert.deepEqual(calculateCardStats(support('iron_will')), {
      hp: 0,
      atk: 0,
      def: 0,
    });
  });
});
