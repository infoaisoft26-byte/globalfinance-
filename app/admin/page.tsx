import { db } from '@/lib/db';

function Card({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-blue-900/50 bg-white/[0.035] p-5 shadow-2xl shadow-black/10"><div className="text-sm text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold text-white">{value}</div></div>;
}

export default async function AdminOverview() {
  const [users, kyc, tickets, ledger] = await Promise.all([
    db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE account_status='active')::int AS active FROM users WHERE role='user'"),
    db.query("SELECT count(*) FILTER (WHERE status IN ('pending','in_review'))::int AS pending FROM kyc_submissions"),
    db.query("SELECT count(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open FROM support_tickets"),
    db.query("SELECT count(*)::int AS txns FROM ledger_transactions"),
  ]);
  const u = users.rows[0], k = kyc.rows[0], t = tickets.rows[0], l = ledger.rows[0];
  return <div>
    <div className="mb-6"><h2 className="text-2xl font-bold">Operations Overview</h2><p className="mt-1 text-sm text-slate-400">Live counts from PostgreSQL. No demo financial data.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card label="Registered Users" value={u.total} /><Card label="Active Users" value={u.active} /><Card label="KYC Awaiting Review" value={k.pending} /><Card label="Open Tickets" value={t.open} />
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><Card label="Immutable Ledger Transactions" value={l.txns} /><Card label="Money Movement" value="Provider-gated" /></div>
  </div>;
}
