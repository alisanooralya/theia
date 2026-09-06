import { sql } from '#storage/connection.js';

function mapCard(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    level: Number(row.level),
    max_level: Number(row.max_level),
    max_hp: Number(row.max_hp),
    max_atk: Number(row.max_atk),
    max_def: Number(row.max_def),
  };
}

class CardModel {
  async definitions(type = null, client = sql) {
    const rows = type
      ? await client`SELECT * FROM cards WHERE type = ${type} ORDER BY name`
      : await client`SELECT * FROM cards ORDER BY type, name`;
    return rows;
  }

  async findOwned(jid, id, client = sql, forUpdate = false) {
    const rows = forUpdate
      ? await client`
          SELECT uc.*, c.name, c.role, c.max_level, c.max_hp, c.max_atk, c.max_def, c.passive
          FROM user_cards uc JOIN cards c ON c.id = uc.card_id
          WHERE uc.owner_jid = ${jid} AND uc.id = ${id} FOR UPDATE
        `
      : await client`
          SELECT uc.*, c.name, c.role, c.max_level, c.max_hp, c.max_atk, c.max_def, c.passive
          FROM user_cards uc JOIN cards c ON c.id = uc.card_id
          WHERE uc.owner_jid = ${jid} AND uc.id = ${id}
        `;
    return mapCard(rows[0]);
  }

  async owned(jid, type = null, client = sql) {
    const rows = type
      ? await client`
          SELECT uc.*, c.name, c.role, c.max_level, c.max_hp, c.max_atk, c.max_def, c.passive,
                 (ec.user_card_id IS NOT NULL) AS equipped
          FROM user_cards uc JOIN cards c ON c.id = uc.card_id
          LEFT JOIN equipped_cards ec ON ec.jid = uc.owner_jid AND ec.user_card_id = uc.id
          WHERE uc.owner_jid = ${jid} AND uc.type = ${type} ORDER BY uc.id
        `
      : await client`
          SELECT uc.*, c.name, c.role, c.max_level, c.max_hp, c.max_atk, c.max_def, c.passive,
                 (ec.user_card_id IS NOT NULL) AS equipped
          FROM user_cards uc JOIN cards c ON c.id = uc.card_id
          LEFT JOIN equipped_cards ec ON ec.jid = uc.owner_jid AND ec.user_card_id = uc.id
          WHERE uc.owner_jid = ${jid} ORDER BY uc.type, uc.id
        `;
    return rows.map(mapCard);
  }

  async grant(jid, cardId, rewardKey = null, client = sql) {
    const rows = await client`
      INSERT INTO user_cards (owner_jid, card_id, type, level, reward_key)
      SELECT ${jid}, id, type, CASE WHEN type = 'main' THEN 5 ELSE 1 END, ${rewardKey}
      FROM cards WHERE id = ${cardId}
      ON CONFLICT (owner_jid, reward_key) DO NOTHING
      RETURNING id
    `;
    if (!rows[0] && rewardKey) {
      const existing = await client`
        SELECT id FROM user_cards WHERE owner_jid = ${jid} AND reward_key = ${rewardKey}
      `;
      return existing[0]
        ? this.findOwned(jid, Number(existing[0].id), client)
        : null;
    }
    return rows[0] ? this.findOwned(jid, Number(rows[0].id), client) : null;
  }

  async updateLevel(jid, id, level, client = sql) {
    const rows = await client`
      UPDATE user_cards SET level = ${level}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE owner_jid = ${jid} AND id = ${id} AND type = 'main' AND level < 100
      RETURNING id
    `;
    return rows[0] ? this.findOwned(jid, Number(rows[0].id), client) : null;
  }

  async equipped(jid, slot = null, client = sql) {
    const rows = slot
      ? await client`
          SELECT uc.*, c.name, c.role, c.max_level, c.max_hp, c.max_atk, c.max_def, c.passive
          FROM equipped_cards ec JOIN user_cards uc ON uc.id = ec.user_card_id AND uc.owner_jid = ec.jid
          JOIN cards c ON c.id = uc.card_id WHERE ec.jid = ${jid} AND ec.slot = ${slot}
        `
      : await client`
          SELECT uc.*, c.name, c.role, c.max_level, c.max_hp, c.max_atk, c.max_def, c.passive
          FROM equipped_cards ec JOIN user_cards uc ON uc.id = ec.user_card_id AND uc.owner_jid = ec.jid
          JOIN cards c ON c.id = uc.card_id WHERE ec.jid = ${jid} ORDER BY ec.slot
        `;
    return slot ? mapCard(rows[0]) : rows.map(mapCard);
  }

  async equip(jid, slot, cardId, client = sql) {
    await client`
      INSERT INTO equipped_cards (jid, slot, user_card_id) VALUES (${jid}, ${slot}, ${cardId})
      ON CONFLICT (jid, slot) DO UPDATE SET user_card_id = EXCLUDED.user_card_id,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
    return this.equipped(jid, slot, client);
  }

  async unequip(jid, slot, client = sql) {
    const rows = await client`
      DELETE FROM equipped_cards WHERE jid = ${jid} AND slot = ${slot} RETURNING user_card_id
    `;
    return rows[0]?.user_card_id ? Number(rows[0].user_card_id) : null;
  }
}

export const cardModel = new CardModel();
