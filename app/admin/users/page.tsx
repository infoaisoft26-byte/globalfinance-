import { db } from '@/lib/db';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const term = q.trim();
  const { rows } = await db.query(
    `SELECT id, full_name, email, referral_code, role, account_status, kyc_status, created_at
     FROM users
     WHERE role='user' AND ($1='' OR full_name ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%' OR referral_code ILIKE '%'||$1||'%')
     ORDER BY created_at DESC LIMIT 100`, [term]
  );
  return <div>
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div><h2 className="text-2xl font-bold">User Management</h2><p className="mt-1 text-sm text-slate-400">Real registered users only.</p></div>
      <form className="flex gap-2"><input name="q" defaultValue={term} placeholder="Name, email, GF ID" className="w-72 rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm outline-none"/><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">Search</button></form>
    </div>
    <div className="mt-6 overflow-x-auto rounded-2xl border border-blue-900/50 bg-white/[0.025]">
      <table className="min-w-full text-sm"><thead className="bg-blue-950/40 text-left text-slate-400"><tr><th className="p-3">User</th><th className="p-3">Referral</th><th className="p-3">KYC</th><th className="p-3">Status</th><th className="p-3">Joined</th><th className="p-3">Action</th></tr></thead>
      <tbody>{rows.map((u:any)=><tr key={u.id} className="border-t border-blue-950/70"><td className="p-3"><div className="font-semibold text-white">{u.full_name}</div><div className="text-xs text-slate-500">{u.email}</div></td><td className="p-3">{u.referral_code}</td><td className="p-3 capitalize">{u.kyc_status.replace('_',' ')}</td><td className="p-3 capitalize">{u.account_status}</td><td className="p-3 text-slate-400">{new Date(u.created_at).toLocaleDateString('en-IN')}</td><td className="p-3"><a href={`/admin/users/${u.id}`} className="text-blue-300 hover:text-blue-200">View / Manage</a></td></tr>)}</tbody></table>
      {rows.length===0 && <div className="p-8 text-center text-sm text-slate-500">No matching users found.</div>}
    </div>
  </div>;
}
