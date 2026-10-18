import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for the PostgreSQL data layer');
}

const globalForPool = globalThis as typeof globalThis & { __globalFinancePool?: Pool };
export const db = globalForPool.__globalFinancePool ?? new Pool({
  connectionString,
  max: 10,
  ssl: process.env.PGSSL === 'disable' ? false : undefined,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

if (process.env.NODE_ENV !== 'production') globalForPool.__globalFinancePool = db;

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
  const enabled = kind === 'payment'
    ? process.env.PAYMENTS_ENABLED === 'true'
    : process.env.PAYOUTS_ENABLED === 'true';
  if (!enabled) {
    throw new Error(kind + ' operations are disabled until an authorized provider and compliance controls are configured');
  }
}

export type DbQueryResult<Row extends QueryResultRow = QueryResultRow> = QueryResult<Row>;
