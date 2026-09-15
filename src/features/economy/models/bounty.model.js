import { sql } from '#storage/connection.js';

function parseRow(row) {
  if (!row) return null;
  let snapshot = row.snapshot;
  if (typeof snapshot === 'string') {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      snapshot = null;
    }
  }
  return { ...row, snapshot };
}

class BountyModel {
  async findActiveByOwner(ownerId, client = sql, forUpdate = false) {
    const rows = await client.unsafe(
      `SELECT * FROM crime_bounties WHERE owner_id = $1 AND status = 'active' LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [ownerId]
    );
    return parseRow(rows[0] ?? null);
  }

  async findById(id, client = sql) {
    const rows = await client`SELECT * FROM crime_bounties WHERE id = ${id}`;
    return parseRow(rows[0] ?? null);
  }

  async listActive(limit = 20, client = sql) {
    const rows = await client`
      SELECT b.*, u.push_name AS owner_name
      FROM crime_bounties b
      LEFT JOIN users u ON u.jid = b.owner_id
      WHERE b.status = 'active'
      ORDER BY b.bounty_coin DESC, b.created_at ASC
      LIMIT ${limit}
    `;
    return rows.map(parseRow);
  }

  async create(
    {
      ownerId,
      crimeId = '',
      crimeName = '',
      coinReward,
      bountyPercent,
      bountyCoin,
      snapshot,
      createdAt,
      expiresAt,
    },
    client = sql
  ) {
    const rows = await client`
      INSERT INTO crime_bounties
        (owner_id, crime_id, crime_name, coin_reward, bounty_percent, bounty_coin, snapshot, status, created_at, expires_at)
      VALUES
        (${ownerId}, ${crimeId}, ${crimeName}, ${coinReward}, ${bountyPercent}, ${bountyCoin}, ${JSON.stringify(snapshot ?? {})}, 'active', ${createdAt}, ${expiresAt})
      RETURNING *
    `;
    return parseRow(rows[0] ?? null);
  }

  /**
   * Atomic single-winner claim. Only the first caller whose UPDATE matches
   * an active, unexpired row gets it back; concurrent/retry hunters get null.
   */
  async claim(id, hunterId, nowMs, client = sql) {
    const rows = await client`
      UPDATE crime_bounties
      SET status = 'claimed', claimed_by = ${hunterId}, claimed_at = ${nowMs},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${id} AND status = 'active' AND expires_at > ${nowMs}
      RETURNING *
    `;
    return parseRow(rows[0] ?? null);
  }

  /**
   * Atomic expiry of one active row. Returns the expired row, or null when
   * another worker (hunt claim / concurrent expiry) won the race.
   */
  async expire(id, nowMs, client = sql) {
    const rows = await client`
      UPDATE crime_bounties
      SET status = 'expired',
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${id} AND status = 'active' AND expires_at <= ${nowMs}
      RETURNING *
    `;
    return parseRow(rows[0] ?? null);
  }

  async expireDue(nowMs, client = sql) {
    const rows = await client`
      UPDATE crime_bounties
      SET status = 'expired',
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE status = 'active' AND expires_at <= ${nowMs}
      RETURNING *
    `;
    return rows.map(parseRow);
  }
}

export const bountyModel = new BountyModel();
