import fs from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const sql = await fs.readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const pool = new Pool({ connectionString, max: 1, ssl: process.env.PGSSL === 'disable' ? false : undefined });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('GLOBAL FINANCE database migration completed.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
