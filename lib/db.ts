import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured');

export const db = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function assertMoneyMovementEnabled(kind: 'payment' | 'payout') {
  const enabled = kind === 'payment' ? process.env.PAYMENTS_ENABLED === 'true' : process.env.PAYOUTS_ENABLED === 'true';
  if (!enabled) throw new Error(`${kind} operations are disabled until an authorized provider and compliance controls are configured`);
}
