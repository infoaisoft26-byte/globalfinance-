import { db } from '@/lib/db';

const money = (paise: unknown) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(paise||0)/100);

export default async function AdminReportsPage() {
  const [users, kyc, tickets, txTypes, walletTotals] = await Promise.all([
    db.query(`SELECT date_trunc('day',created_at)::date AS day,count(*)::int AS users FROM users WHERE role='user' AND created_at >= now()-interval '30 days' GROUP BY 1 ORDER BY 1 DESC`),
    db.query(`SELECT status,count(*)::int AS count FROM kyc_submissions GROUP BY status ORDER BY status`),
    db.query(`SELECT status,count(*)::int AS count FROM support_tickets GROUP BY status ORDER BY status`),
    db.query(`SELECT transaction_type,count(*)::int AS count FROM ledger_transactions GROUP BY transaction_type ORDER BY count DESC`),
    db.query(`SELECT w.wallet_type, COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount_paise ELSE -e.amount_paise END),0)::bigint AS balance_paise FROM wallets w LEFT JOIN ledger_entries e ON e.wallet_id=w.id GROUP BY w.wallet_type ORDER BY w.wallet_type`)
  ]);
  return <div><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 className="text-2xl font-bold">Reports</h2><p className="mt-1 text-sm text-slate-400">Operational reporting from live PostgreSQL tables.</p></div><a href="/api/admin/reports/export" className="rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-semibold hover:bg-blue-500">Export Users CSV</a></div>
    <div className="mt-6 grid gap-4 md:grid-cols-2">{walletTotals.rows.map((w:any)=><div key={w.wallet_type} className="rounded-2xl border border-blue-900/50 bg-white/[0.03] p-5"><div className="text-sm capitalize text-slate-400">Total {w.wallet_type} wallet balance</div><div className="mt-2 text-2xl font-bold">{money(w.balance_paise)}</div><div className="mt-1 text-xs text-slate-500">Derived from immutable ledger entries</div></div>)}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-2"><ReportTable title="KYC Status" headers={['Status','Count']} rows={kyc.rows.map((r:any)=>[r.status,r.count])}/><ReportTable title="Ticket Status" headers={['Status','Count']} rows={tickets.rows.map((r:any)=>[r.status,r.count])}/><ReportTable title="Ledger Transaction Types" headers={['Type','Count']} rows={txTypes.rows.map((r:any)=>[r.transaction_type,r.count])}/><ReportTable title="New Users – Last 30 Days" headers={['Date','Users']} rows={users.rows.map((r:any)=>[new Date(r.day).toLocaleDateString('en-IN'),r.users])}/></div>
  </div>;
}

function ReportTable({title,headers,rows}:{title:string;headers:string[];rows:(string|number)[][]}) { return <div className="rounded-2xl border border-blue-900/50 bg-white/[0.025] p-4"><h3 className="font-bold">{title}</h3><div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500">{headers.map(h=><th key={h} className="py-2 pr-4">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className="border-t border-blue-950/70">{row.map((c,j)=><td key={j} className="py-2 pr-4 capitalize">{c}</td>)}</tr>)}</tbody></table>{!rows.length&&<div className="py-5 text-sm text-slate-500">No data yet.</div>}</div></div> }
