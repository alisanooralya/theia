import { sql } from '#storage/connection.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function withRetry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw last;
}

const rows = await withRetry(() => sql`
  SELECT item_id, COUNT(*)::int AS owners, SUM(quantity)::int AS total
  FROM rpg_inventory
  WHERE item_id LIKE 'orbital_record_%'
  GROUP BY item_id
  ORDER BY item_id
`);

const owners = rows.reduce((n, r) => n + r.owners, 0);
const total = rows.reduce((n, r) => n + r.total, 0);
for (const r of rows) {
  console.log(`${r.item_id}: ${r.owners} user, ${r.total} item`);
}
console.log(`total: ${owners} row (${total} item) pada ${rows.length} jenis record`);

if (DRY_RUN) {
  console.log('dry-run: tidak ada data yang dihapus');
} else {
  const deleted = await withRetry(() => sql`
    DELETE FROM rpg_inventory
    WHERE item_id LIKE 'orbital_record_%'
  `);
  console.log(`dihapus: ${deleted.count} row`);
  const rest = await withRetry(() => sql`
    SELECT COUNT(*)::int AS n FROM rpg_inventory
    WHERE item_id LIKE 'orbital_record_%'
  `);
  console.log(`sisa: ${rest[0].n} row`);
}

await sql.end();
