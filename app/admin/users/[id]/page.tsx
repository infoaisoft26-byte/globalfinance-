import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db, withTransaction } from '@/lib/db';

async function updateAccountStatus(formData: FormData) {
  'use server';
  const admin = await requireAdmin();
  const userId = String(formData.get('userId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!['active','suspended','closed'].includes(status)) throw new Error('Invalid account status');
  await withTransaction(async client => {
    const result = await client.query("UPDATE users SET account_status=$1, updated_at=now() WHERE id=$2 AND role='user' RETURNING id", [status, userId]);
    if (!result.rowCount) throw new Error('User not found');
    await client.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [admin.id, 'user.account_status.changed', 'user', userId, JSON.stringify({ status })]);
  });
  revalidatePath(`/admin/users/${userId}`); revalidatePath('/admin/users'); revalidatePath('/admin');
}

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(`SELECT id, full_name, email, referral_code, account_status, kyc_status, created_at FROM users WHERE id=$1 AND role='user' LIMIT 1`, [id]);
  const user = rows[0]; if (!user) notFound();
  const [wallets, packages, tickets] = await Promise.all([
    db.query(`SELECT w.wallet_type, COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount_paise ELSE -e.amount_paise END),0)::bigint AS balance_paise FROM wallets w LEFT JOIN ledger_entries e ON e.wallet_id=w.id WHERE w.user_id=$1 GROUP BY w.id,w.wallet_type ORDER BY w.wallet_type`, [id]),
    db.query(`SELECT p.name, p.package_type, pa.amount_paise, pa.status, pa.created_at FROM package_activations pa JOIN packages p ON p.id=pa.package_id WHERE pa.user_id=$1 ORDER BY pa.created_at DESC LIMIT 25`, [id]),
    db.query(`SELECT id, subject, status, priority, updated_at FROM support_tickets WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 25`, [id])
  ]);
  const money=(v:any)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(v||0)/100);
  return <div>
    <a href="/admin/users" className="text-sm text-blue-300">← Users</a>
    <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-2xl font-bold">{user.full_name}</h2><div className="mt-1 text-sm text-slate-400">{user.email} • {user.referral_code}</div></div>
    <form action={updateAccountStatus} className="flex gap-2"><input type="hidden" name="userId" value={user.id}/><select name="status" defaultValue={user.account_status} className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">Update Status</button></form></div>
    <div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-blue-900/50 bg-white/[0.03] p-5"><div className="text-xs text-slate-500">KYC</div><div className="mt-2 font-semibold capitalize">{user.kyc_status.replace('_',' ')}</div></div>{wallets.rows.map((w:any)=><div key={w.wallet_type} className="rounded-2xl border border-blue-900/50 bg-white/[0.03] p-5"><div className="text-xs text-slate-500 capitalize">{w.wallet_type} Wallet</div><div className="mt-2 text-xl font-bold">{money(w.balance_paise)}</div><div className="mt-1 text-xs text-slate-500">Computed from immutable ledger</div></div>)}</div>
    <section className="mt-8"><h3 className="font-bold">Package Activations</h3><div className="mt-3 overflow-x-auto rounded-2xl border border-blue-900/50"><table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th className="p-3">Package</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Created</th></tr></thead><tbody>{packages.rows.map((p:any)=><tr className="border-t border-blue-950/70" key={`${p.name}-${p.created_at}`}><td className="p-3">{p.name}</td><td className="p-3">{money(p.amount_paise)}</td><td className="p-3 capitalize">{p.status}</td><td className="p-3">{new Date(p.created_at).toLocaleString('en-IN')}</td></tr>)}</tbody></table>{!packages.rows.length&&<div className="p-5 text-sm text-slate-500">No package activations.</div>}</div></section>
    <section className="mt-8"><h3 className="font-bold">Support Tickets</h3><div className="mt-3 space-y-2">{tickets.rows.map((t:any)=><a key={t.id} href={`/admin/tickets/${t.id}`} className="block rounded-xl border border-blue-900/40 bg-white/[0.02] p-3"><span className="font-medium">{t.subject}</span><span className="ml-3 text-xs text-slate-500">{t.status} • {t.priority}</span></a>)}{!tickets.rows.length&&<div className="text-sm text-slate-500">No tickets.</div>}</div></section>
  </div>;
}
