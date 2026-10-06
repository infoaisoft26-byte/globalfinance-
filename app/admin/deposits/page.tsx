import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { db, withTransaction } from '@/lib/db';
import { formatUsdt } from '@/lib/usdt';

async function reviewDeposit(formData: FormData) {
  'use server';
  const admin = await requireAdmin();
  const depositId = String(formData.get('depositId') ?? '');
  const action = String(formData.get('action') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  if (!['approve','reject'].includes(action)) throw new Error('Invalid deposit action');

  await withTransaction(async client => {
    const depositResult = await client.query('SELECT * FROM usdt_deposits WHERE id=$1 FOR UPDATE', [depositId]);
    const deposit = depositResult.rows[0];
    if (!deposit) throw new Error('Deposit not found');
    if (deposit.status !== 'pending') throw new Error('Deposit has already been reviewed');

    if (action === 'reject') {
      await client.query(
        `UPDATE usdt_deposits SET status='rejected', review_note=$1, reviewed_by=$2, reviewed_at=now()
         WHERE id=$3`,
        [note || 'Deposit rejected by admin', admin.id, depositId]
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload)
         VALUES ($1,'usdt.deposit.rejected','usdt_deposit',$2,$3::jsonb)`,
        [admin.id, depositId, JSON.stringify({ txHash: deposit.tx_hash, note: note || 'Deposit rejected by admin' })]
      );
      return;
    }

    const walletResult = await client.query(
      `INSERT INTO wallets (user_id, wallet_type, currency) VALUES ($1,'fund','USDT')
       ON CONFLICT (user_id, wallet_type, currency) DO UPDATE SET user_id=EXCLUDED.user_id
       RETURNING id`,
      [deposit.user_id]
    );
    const walletId = walletResult.rows[0].id;
    const reference = `usdt-deposit:${depositId}`;

    await client.query(
      `INSERT INTO ledger_transactions (reference, transaction_type, status, metadata, created_by)
       VALUES ($1,'usdt_deposit','posted',$2::jsonb,$3)`,
      [reference, JSON.stringify({ depositId, txHash: deposit.tx_hash, token: 'USDT', network: 'BSC', amountBaseUnits: deposit.amount_base_units.toString() }), admin.id]
    );
    const txResult = await client.query('SELECT id FROM ledger_transactions WHERE reference=$1', [reference]);
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, wallet_id, direction, amount_paise)
       VALUES ($1,$2,'credit',$3)`,
      [txResult.rows[0].id, walletId, deposit.amount_base_units.toString()]
    );
    await client.query(
      `UPDATE usdt_deposits SET status='approved', review_note=$1, reviewed_by=$2, reviewed_at=now(), approved_at=now()
       WHERE id=$3`,
      [note || 'Deposit approved', admin.id, depositId]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload)
       VALUES ($1,'usdt.deposit.approved','usdt_deposit',$2,$3::jsonb)`,
      [admin.id, depositId, JSON.stringify({ txHash: deposit.tx_hash, walletId, amountBaseUnits: deposit.amount_base_units.toString() })]
    );
  });

  revalidatePath('/admin/deposits');
  revalidatePath('/dashboard');
}

export default async function AdminDepositsPage() {
  await requireAdmin();
  const { rows } = await db.query(
    `SELECT d.id, d.tx_hash, d.from_address, d.to_address, d.amount_base_units, d.status, d.review_note, d.created_at,
            u.full_name, u.email
     FROM usdt_deposits d JOIN users u ON u.id=d.user_id
     ORDER BY d.created_at DESC LIMIT 200`
  );

  return <div>
    <div className="mb-6"><h2 className="text-2xl font-bold">USDT Deposits</h2><p className="mt-1 text-sm text-slate-400">Only blockchain-verified BSC USDT transfers are listed. Approval credits the user's immutable Fund Wallet ledger.</p></div>
    <div className="space-y-4">
      {rows.map((d: any) => <div key={d.id} className="rounded-2xl border border-blue-900/50 bg-white/[0.025] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-bold text-white">{d.full_name} <span className="font-normal text-slate-500">({d.email})</span></div>
            <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{d.status}</div>
          </div>
          <div className="text-xl font-black text-cyan-300">{formatUsdt(d.amount_base_units)} USDT</div>
        </div>
        <div className="mt-4 grid gap-2 text-xs text-slate-400">
          <div><span className="text-slate-600">Tx:</span> <span className="break-all font-mono">{d.tx_hash}</span></div>
          <div><span className="text-slate-600">From:</span> <span className="break-all font-mono">{d.from_address}</span></div>
          <div><span className="text-slate-600">To:</span> <span className="break-all font-mono">{d.to_address}</span></div>
          <div>Submitted: {new Date(d.created_at).toLocaleString('en-IN')}</div>
        </div>
        {d.status === 'pending' && <form action={reviewDeposit} className="mt-4 flex flex-col gap-2 lg:flex-row">
          <input type="hidden" name="depositId" value={d.id}/>
          <input name="note" placeholder="Review note (optional)" className="min-w-0 flex-1 rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm outline-none"/>
          <button name="action" value="approve" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold">Approve & Credit</button>
          <button name="action" value="reject" className="rounded-xl bg-red-600/80 px-4 py-2 text-sm font-bold">Reject</button>
        </form>}
        {d.review_note && <div className="mt-3 text-xs text-slate-500">Note: {d.review_note}</div>}
      </div>)}
      {!rows.length && <div className="rounded-2xl border border-dashed border-blue-900/40 p-10 text-center text-sm text-slate-500">No deposit requests yet.</div>}
    </div>
  </div>;
}
