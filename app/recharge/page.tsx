import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db, withTransaction } from '@/lib/db';
import { formatUsdt, verifyUsdtDeposit } from '@/lib/usdt';
import { DashboardShell } from '@/components/dashboard-shell';

async function submitDeposit(formData: FormData) {
  'use server';
  const session = await getSession();
  if (!session) redirect('/');

  const txHash = String(formData.get('txHash') ?? '').trim();
  if (!txHash) throw new Error('Transaction hash is required');
  if (process.env.PAYMENTS_ENABLED !== 'true') {
    throw new Error('Recharge is disabled until payment settings are enabled');
  }

  const verified = await verifyUsdtDeposit(txHash);

  await withTransaction(async client => {
    const existing = await client.query('SELECT id, status FROM usdt_deposits WHERE tx_hash=$1 FOR UPDATE', [verified.txHash]);
    if (existing.rowCount) {
      throw new Error(`This transaction has already been submitted (status: ${existing.rows[0].status})`);
    }

    await client.query(
      `INSERT INTO usdt_deposits
        (user_id, tx_hash, from_address, to_address, amount_base_units, block_number, confirmations, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [session.userId, verified.txHash, verified.fromAddress, verified.toAddress, verified.amountBaseUnits.toString(), verified.blockNumber.toString(), verified.confirmations.toString()]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload)
       VALUES ($1,'usdt.deposit.submitted','usdt_deposit',$2,$3::jsonb)`,
      [session.userId, verified.txHash, JSON.stringify({ amountBaseUnits: verified.amountBaseUnits.toString(), blockNumber: verified.blockNumber.toString() })]
    );
  });

  revalidatePath('/recharge');
  revalidatePath('/admin/deposits');
  redirect('/recharge?submitted=1');
}

export default async function RechargePage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { submitted } = await searchParams;
  const [user, deposits] = await Promise.all([
    db.query('SELECT full_name, referral_code FROM users WHERE id=$1', [session.userId]),
    db.query(
      `SELECT tx_hash, amount_base_units, status, review_note, created_at, approved_at
       FROM usdt_deposits WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [session.userId]
    ),
  ]);

  const depositWallet = process.env.USDT_DEPOSIT_WALLET_ADDRESS || '';
  const enabled = process.env.PAYMENTS_ENABLED === 'true' && Boolean(process.env.BSC_RPC_URL) && Boolean(process.env.USDT_BEP20_CONTRACT_ADDRESS) && Boolean(depositWallet);

  return <DashboardShell userName={user.rows[0].full_name} referralCode={user.rows[0].referral_code}>
    <div className="text-sm text-slate-400">Dashboard / Recharge</div>
    <h1 className="mt-2 text-2xl font-black">USDT BEP20 Recharge</h1>

    <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="gf-card p-6">
        <div className="text-sm font-semibold text-cyan-300">Deposit Wallet</div>
        <div className="mt-2 break-all rounded-xl border border-blue-900/50 bg-black/20 p-4 font-mono text-sm text-white">
          {depositWallet || 'Deposit wallet is not configured'}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Send only USDT on BNB Smart Chain (BEP20) to this address. Never send BNB or another token.</p>

        <form action={submitDeposit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">Transaction Hash</label>
          <input name="txHash" required placeholder="0x..." className="w-full rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-3 font-mono text-sm outline-none focus:border-blue-500" />
          <button disabled={!enabled} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
            {enabled ? 'Verify & Submit Deposit' : 'Recharge Not Configured'}
          </button>
        </form>
        {submitted === '1' && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">Deposit verified on BSC and submitted to Admin for approval.</div>}
      </section>

      <section className="gf-card p-6">
        <h2 className="font-bold">Deposit Status</h2>
        <div className="mt-4 space-y-3">
          {deposits.rows.map((d: any) => <div key={d.tx_hash} className="rounded-xl border border-blue-900/40 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{new Date(d.created_at).toLocaleString('en-IN')}</span><span className="rounded-full border border-blue-900/50 px-2 py-1 text-xs capitalize">{d.status}</span></div>
            <div className="mt-2 font-bold text-cyan-300">{formatUsdt(d.amount_base_units)} USDT</div>
            <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{d.tx_hash}</div>
            {d.review_note && <div className="mt-2 text-xs text-slate-400">{d.review_note}</div>}
          </div>)}
          {!deposits.rows.length && <div className="rounded-xl border border-dashed border-blue-900/40 p-6 text-center text-sm text-slate-500">No deposit requests yet.</div>}
        </div>
      </section>
    </div>
  </DashboardShell>;
}
