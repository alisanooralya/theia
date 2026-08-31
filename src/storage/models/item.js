import { sql } from '#storage/connection.js';

class ItemModel {
  async findById(id, client = sql) {
    const rows = await client`SELECT * FROM items WHERE id = ${id}`;
    return rows[0] ?? null;
  }

  async findAll(client = sql) {
    return client`SELECT * FROM items ORDER BY category, name`;
  }

  async findByCategory(cat, client = sql) {
    return client`SELECT * FROM items WHERE category = ${cat} ORDER BY price`;
  }

  async shopItems(client = sql) {
    return client`SELECT * FROM items WHERE price > 0 ORDER BY category, price`;
  }

  async upsert(item, client = sql) {
    await client`
      INSERT INTO items (id, name, description, category, price, sellable, stackable, rarity, data)
      VALUES (${item.id}, ${item.name}, ${item.description ?? ''}, ${item.category ?? 'misc'}, ${item.price ?? 0}, ${item.sellable ? 1 : 0}, ${item.stackable ? 1 : 0}, ${item.rarity ?? 'common'}, ${JSON.stringify(item.data ?? {})})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
        price = EXCLUDED.price, sellable = EXCLUDED.sellable, stackable = EXCLUDED.stackable,
        rarity = EXCLUDED.rarity, data = EXCLUDED.data
    `;
  }

  async bulkUpsert(items) {
    await sql.begin(async (t) => {
      for (const item of items) await this.upsert(item, t);
    });
  }
}

export const itemModel = new ItemModel();