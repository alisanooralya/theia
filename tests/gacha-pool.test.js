import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { singlePull, unownedCardPool } from '../src/features/rpg/gacha.js';
import { cardModel } from '../src/storage/models/card.js';

const defs = (ids) => ids.map((id) => ({ id }));

describe('unownedCardPool', () => {
  it('hanya berisi card yang belum dimiliki', () => {
    const pool = unownedCardPool(defs(['girgas', 'lena', 'treasure_hunter']), [
      'lena',
    ]);
    assert.deepEqual(
      pool.map((d) => d.id),
      ['girgas', 'treasure_hunter']
    );
  });

  it('pool kosong jika semua sudah dimiliki', () => {
    assert.deepEqual(
      unownedCardPool(defs(['girgas', 'lena']), ['girgas', 'lena']),
      []
    );
  });

  it('pool kosong jika definisi kosong (aman, tanpa throw)', () => {
    assert.deepEqual(unownedCardPool([], []), []);
  });

  it('user baru mendapat semua kandidat', () => {
    const all = ['girgas', 'lena', 'raid_emblem', 'iron_will'];
    assert.deepEqual(
      unownedCardPool(defs(all), []).map((d) => d.id),
      all
    );
  });
});

describe('singlePull (rate tidak berubah)', () => {
  const pool = [{ item: { id: 'x' }, weight: 1 }];

  it('roll < 0.08 = artifact', () => {
    assert.equal(singlePull(pool, () => 0.079).type, 'artifact');
  });

  it('0.08 <= roll < 0.09 = card (rate 1% tetap)', () => {
    assert.equal(singlePull(pool, () => 0.08).type, 'card');
    assert.equal(singlePull(pool, () => 0.089).type, 'card');
  });

  it('0.09 <= roll < 0.66 = zonk', () => {
    assert.equal(singlePull(pool, () => 0.09).type, 'zonk');
    assert.equal(singlePull(pool, () => 0.659).type, 'zonk');
  });

  it('roll >= 0.66 = item', () => {
    assert.equal(singlePull(pool, () => 0.99).type, 'item');
  });
});

describe('cardModel.grant tanpa DB (mock client)', () => {
  // Emulasi minimal server: INSERT sukses, konflik, dan SELECT balikan.
  const findRow = {
    id: 7,
    owner_jid: 'u1',
    card_id: 'lena',
    type: 'main',
    level: 5,
    max_level: 100,
    max_hp: 1,
    max_atk: 1,
    max_def: 1,
  };
  const mockClient =
    (mode) =>
    async (strings, ..._values) => {
      const text = strings.join(' ');
      if (text.includes('INSERT INTO user_cards')) {
        return mode === 'inserted' ? [{ id: 7 }] : [];
      }
      if (text.includes('SELECT id FROM user_cards')) {
        return mode === 'inserted' ? [] : [{ id: 7 }];
      }
      if (text.includes('FROM user_cards')) {
        return [{ ...findRow }];
      }
      return [];
    };

  it('insert baru mengembalikan card hasil insert', async () => {
    const card = await cardModel.grant(
      'u1',
      'lena',
      'req:0',
      mockClient('inserted')
    );
    assert.equal(card.id, 7);
    assert.equal(card.level, 5);
  });

  it('konflik (retry/concurrent) mengembalikan card existing, bukan throw', async () => {
    const card = await cardModel.grant(
      'u1',
      'lena',
      'req:0',
      mockClient('conflict')
    );
    assert.equal(card.id, 7);
    assert.equal(card.card_id, 'lena');
  });

  it('card_id tidak dikenal mengembalikan null', async () => {
    const empty = async () => [];
    assert.equal(await cardModel.grant('u1', 'nope', 'req:0', empty), null);
  });
});
