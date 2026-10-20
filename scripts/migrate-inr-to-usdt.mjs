/**
 * INR -> USDT opening-balance conversion. Default is read-only dry run.
 * Requires an explicitly verified rate. --apply requires independent operator approval.
 * Historical INR ledger rows are never changed or deleted.
 */
import pg from 'pg';
const { Pool } = pg;
const apply = process.argv.includes('--apply');
const rate = process.env.INR_PER_USDT;
const rateSource = process.env.INR_USDT_RATE_SOURCE;
const rateAsOf = process.env.INR_USDT_RATE_AS_OF;
const approvedBy = process.env.USDT_MIGRATION_APPROVED_BY;
const notes = process.env.USDT_MIGRATION_NOTES;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!rate || !/^\d+(?:\.\d{1,8})?$/.test(rate) || /^0+(?:\.0+)?$/.test(rate)) throw new Error('INR_PER_USDT must be explicitly set to a verified positive rate');
if (apply && process.env.USDT_MIGRATION_APPROVED !== 'true') throw new Error('Set USDT_MIGRATION_APPROVED=true only after independent review');
if (apply && (!rateSource || !rateAsOf || !approvedBy || !notes)) throw new Error('Apply requires INR_USDT_RATE_SOURCE, INR_USDT_RATE_AS_OF, USDT_MIGRATION_APPROVED_BY and USDT_MIGRATION_NOTES');
if (rateAsOf && Number.isNaN(Date.parse(rateAsOf))) throw new Error('INR_USDT_RATE_AS_OF must be a valid timestamp');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, ssl: process.env.PGSSL === 'disable' ? false : undefined });
const client = await pool.connect();
const fixed = (value, scale) => {
  const s = String(value), neg = s.startsWith('-'), raw = neg ? s.slice(1) : s;
  const [whole, frac = ''] = raw.split('.');
  const n = BigInt(whole || '0') * (10n ** BigInt(scale)) + BigInt((frac + '0'.repeat(scale)).slice(0, scale) || '0');
  return neg ? -n : n;
};
const show = (n, scale) => {
  const neg = n < 0n, a = neg ? -n : n, base = 10n ** BigInt(scale);
  return `${neg ? '-' : ''}${a / base}.${String(a % base).padStart(scale, '0')}`;
};
try {
  await client.query('BEGIN');
  const { rows } = await client.query(`
    SELECT w.user_id,w.wallet_type,w.currency,
      COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount_paise ELSE -e.amount_paise END),0)::numeric/100 AS net_inr,
      ROUND((COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount_paise ELSE -e.amount_paise END),0)::numeric/100)/$1::numeric,6) AS net_usdt
    FROM wallets w
    LEFT JOIN ledger_entries e ON e.wallet_id=w.id
    LEFT JOIN ledger_transactions t ON t.id=e.transaction_id AND t.status='posted'
    WHERE w.currency='INR' AND (e.id IS NULL OR t.id IS NOT NULL)
    GROUP BY w.user_id,w.wallet_type,w.currency ORDER BY w.user_id,w.wallet_type
  `, [rate]);
  const balances = rows.map(r => ({user_id:r.user_id,wallet_type:r.wallet_type,net_inr:String(r.net_inr),net_usdt:String(r.net_usdt),currency:r.currency}));
  const negative = balances.filter(b => fixed(b.net_inr,2) < 0n);
  if (negative.length) throw new Error('Migration stopped: negative INR wallet balances need manual reconciliation: '+JSON.stringify(negative.slice(0,10)));
  const nonZero = balances.filter(b => fixed(b.net_inr,2) > 0n);
  const inrCents = rows.reduce((s,r) => s+fixed(r.net_inr,2),0n);
  const usdtMicros = rows.reduce((s,r) => s+fixed(r.net_usdt,6),0n);
  const sourceINR = show(inrCents,2), convertedUSDT = show(usdtMicros,6);
  console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',rate,rateSource:rateSource??null,rateAsOf:rateAsOf??null,wallets:balances.length,nonZeroWallets:nonZero.length,sourceINR,convertedUSDT,negativeWallets:negative.length,payoutsEnabled:false,preview:balances.slice(0,20)},null,2));
  if (!apply) { await client.query('ROLLBACK'); console.log('Dry run only; no records changed.'); }
  else {
    const key = 'INR-TO-USDT-OPENING-'+rate.replace('.','_')+'-'+new Date(rateAsOf).toISOString().slice(0,10);
    const exists = await client.query('SELECT id FROM currency_migration_reconciliations WHERE migration_key=$1',[key]);
    if (exists.rowCount) throw new Error('Migration key already exists; refusing duplicate conversion');
    for (const b of nonZero) {
      const ref = `CONVERT:${key}:${b.user_id}:${b.wallet_type}`;
      const tx = await client.query(`INSERT INTO usdt_ledger_transactions(reference,transaction_type,status,metadata,created_by)
        VALUES($1,'opening_conversion','posted',$2::jsonb,$3) RETURNING id`,[ref,JSON.stringify({source_currency:'INR',source_amount_inr:b.net_inr,inr_per_usdt:rate,converted_amount_usdt:b.net_usdt,rate_source:rateSource,rate_as_of:rateAsOf,notes}),approvedBy]);
      await client.query(`INSERT INTO usdt_ledger_entries(transaction_id,user_id,wallet_type,entry_type,direction,amount_usdt,source_transaction_ref,metadata)
        VALUES($1,$2,$3,'opening_conversion','credit',$4,$5,$6::jsonb)`,[tx.rows[0].id,b.user_id,b.wallet_type,b.net_usdt,ref,JSON.stringify({source_currency:'INR',source_amount_inr:b.net_inr,inr_per_usdt:rate,rate_source:rateSource,rate_as_of:rateAsOf})]);
    }
    await client.query(`INSERT INTO currency_migration_reconciliations(migration_key,inr_per_usdt,rate_source,rate_as_of,approved_by,source_inr_total,converted_usdt_total,wallet_count,status,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)`,[key,rate,rateSource,rateAsOf,approvedBy,sourceINR,convertedUSDT,nonZero.length,notes]);
    await client.query('COMMIT');
    console.log('Opening balances posted to separate USDT ledger; reconciliation status remains pending. Historical INR ledger unchanged. Payouts remain disabled.');
  }
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
