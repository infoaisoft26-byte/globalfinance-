import fs from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = await fs.readFile(new URL('../db/migrations/20261018_usdt_accounting.sql', import.meta.url), 'utf8');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: process.env.PGSSL === 'disable' ? false : undefined });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('USDT ledger schema installed. No balances converted and payouts remain disabled.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
