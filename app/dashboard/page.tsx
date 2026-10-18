import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { DashboardShell } from '@/components/dashboard-shell';

const money = (paise: number | string | bigint) => `₹ ${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usdtMoney = (minor: number | string | bigint | null | undefined) => `${(Number(minor || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
type BreakdownRow = [string, number | string | bigint | null | undefined];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/');

  const userResult = await db.query('SELECT full_name, referral_code FROM users WHERE id=$1', [session.userId]);
  if (userResult.rowCount !== 1) redirect('/');
  const user = userResult.rows[0];

  const [wallets, packages, teams, investmentCycles, investmentState, income] = await Promise.all([
    db.query(`
      SELECT w.wallet_type, w.currency,
        COALESCE(SUM(CASE WHEN e.direction='credit' THEN e.amount_paise ELSE -e.amount_paise END),0)::bigint AS balance
      FROM wallets w LEFT JOIN ledger_entries e ON e.wallet_id=w.id
      WHERE w.user_id=$1 GROUP BY w.wallet_type, w.currency`, [session.userId]),
    db.query(`SELECT p.package_type, COALESCE(SUM(a.amount_paise),0)::bigint total
      FROM packages p LEFT JOIN package_activations a ON a.package_id=p.id AND a.user_id=$1 AND a.status='active'
      GROUP BY p.package_type`, [session.userId]),
    db.query(`WITH RECURSIVE team AS (
      SELECT id, 1 depth FROM users WHERE referred_by=$1
      UNION ALL SELECT u.id, t.depth+1 FROM users u JOIN team t ON u.referred_by=t.id
    ) SELECT COUNT(*) FILTER (WHERE depth=1)::int direct_team, COUNT(*)::int total_team FROM team`, [session.userId]),
    db.query(`SELECT
      id, package_id, amount_paise, cap_amount_paise, credited_total_paise, verified_deposit_id,
      cap_multiple, cap_reconciled, status, activated_at, completed_at, completion_reason
      FROM package_activations
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 20`, [session.userId]),
    db.query(`SELECT
      COUNT(*) FILTER (WHERE status='active' AND cap_reconciled=TRUE)::int AS active_cycles,
      COUNT(*) FILTER (WHERE status='active' AND cap_reconciled=FALSE)::int AS review_cycles,
      COUNT(*) FILTER (WHERE status IN ('completed','matured'))::int AS completed_cycles
      FROM package_activations WHERE user_id=$1`, [session.userId]),
    db.query(`SELECT
      COALESCE(SUM(CASE WHEN lt.transaction_type='joining_bonus' THEN le.amount_paise ELSE 0 END),0)::bigint joining_bonus,
      COALESCE(SUM(CASE WHEN lt.transaction_type='basic_referral' THEN le.amount_paise ELSE 0 END),0)::bigint basic_referral,
      COALESCE(SUM(CASE WHEN lt.transaction_type='basic_roi' AND lt.created_at::date=CURRENT_DATE THEN le.amount_paise ELSE 0 END),0)::bigint today_basic_roi,
      COALESCE(SUM(CASE WHEN lt.transaction_type='basic_level' AND lt.created_at::date=CURRENT_DATE THEN le.amount_paise ELSE 0 END),0)::bigint today_basic_level,
      COALESCE(SUM(CASE WHEN lt.transaction_type='basic_roi' THEN le.amount_paise ELSE 0 END),0)::bigint total_basic_roi,
      COALESCE(SUM(CASE WHEN lt.transaction_type='basic_level' THEN le.amount_paise ELSE 0 END),0)::bigint total_basic_level,
      COALESCE(SUM(CASE WHEN lt.transaction_type='fd_roi' AND lt.created_at::date=CURRENT_DATE THEN le.amount_paise ELSE 0 END),0)::bigint today_fd_roi,
      COALESCE(SUM(CASE WHEN lt.transaction_type='fd_level' AND lt.created_at::date=CURRENT_DATE THEN le.amount_paise ELSE 0 END),0)::bigint today_fd_level,
      COALESCE(SUM(CASE WHEN lt.transaction_type='fd_roi' THEN le.amount_paise ELSE 0 END),0)::bigint total_fd_roi,
      COALESCE(SUM(CASE WHEN lt.transaction_type='fd_level' THEN le.amount_paise ELSE 0 END),0)::bigint total_fd_level,
      COALESCE(SUM(CASE WHEN lt.transaction_type='fd_referral' THEN le.amount_paise ELSE 0 END),0)::bigint fd_referral,
      COALESCE(SUM(CASE WHEN lt.transaction_type='fd_released' THEN le.amount_paise ELSE 0 END),0)::bigint fd_released,
      COALESCE(SUM(CASE WHEN lt.transaction_type='salary_income' THEN le.amount_paise ELSE 0 END),0)::bigint total_salary,
      COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount_paise ELSE 0 END),0)::bigint total_income,
      COALESCE(SUM(CASE WHEN lt.transaction_type='withdrawal' AND le.direction='debit' THEN le.amount_paise ELSE 0 END),0)::bigint total_withdrawal
      FROM ledger_entries le JOIN wallets w ON w.id=le.wallet_id JOIN ledger_transactions lt ON lt.id=le.transaction_id
      WHERE w.user_id=$1 AND w.wallet_type='income' AND lt.status='posted'`, [session.userId]),
  ]);

  const walletMap = Object.fromEntries(wallets.rows.map((r) => [`${r.wallet_type}:${r.currency}`, r.balance]));
  const packageMap = Object.fromEntries(packages.rows.map((r) => [r.package_type, r.total]));
  const team = teams.rows[0] ?? { direct_team: 0, total_team: 0 };
  const i = income.rows[0] ?? {};
  const inv = investmentState.rows[0] ?? { active_cycles: 0, review_cycles: 0, completed_cycles: 0 };
  const cycles = investmentCycles.rows;
  const investmentStatus = Number(inv.active_cycles) > 0
    ? 'Active'
    : Number(inv.review_cycles) > 0
      ? 'Admin Review'
      : 'Inactive';

  const cards = [
    ['Investment Status', investmentStatus, Number(inv.active_cycles) > 0 ? 'gf-green' : 'gf-red'],

    ['Basic Package', money(packageMap.basic ?? 0), 'gf-blue'], ['FD Package', money(packageMap.fd ?? 0), 'gf-cyan'],
    ['Available Fund', money(walletMap['fund:USDT'] ?? 0), 'gf-blue'], ['Available Balance', money(walletMap['income:INR'] ?? 0), 'gf-green'],
    ['Total Income', money(i.total_income ?? 0), 'gf-green'], ['Total Withdrawal', money(i.total_withdrawal ?? 0), 'gf-red'],
  ];
  const basic: BreakdownRow[] = [
    ['Joining Bonus', i.joining_bonus], ['Referral Income', i.basic_referral], ['Today ROI Income', i.today_basic_roi],
    ['Today Level Income', i.today_basic_level], ['Total ROI Income', i.total_basic_roi], ['Total Level Income', i.total_basic_level],
  ];
  const fd: BreakdownRow[] = [
    ['Today ROI Income', i.today_fd_roi], ['Today Level Income', i.today_fd_level], ['Total ROI Income', i.total_fd_roi],
    ['Total Level Income', i.total_fd_level], ['Referral Income', i.fd_referral], ['FD Released', i.fd_released], ['Total Salary', i.total_salary],
  ];

  return <DashboardShell userName={user.full_name} referralCode={user.referral_code}>
    <div className="mb-6"><div className="text-sm text-slate-500">Dashboard / Overview</div><h1 className="mt-1 text-2xl font-black">Welcome, {user.full_name}</h1></div>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, cls]) => <div key={label} className="gf-card p-5"><div className="gf-label">{label}</div><div className={`gf-value ${cls}`}>{value}</div></div>)}</section>
    <section className="mt-6 gf-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-lg font-bold">5X Investment Cap</h2><p className="mt-1 text-sm text-slate-500">ROI, referral, level, bonuses and principal return count toward the same cap.</p></div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">5X limit</span>
      </div>
      {cycles.length === 0 ? <p className="mt-4 text-sm text-slate-500">No investment cycles found yet. Your cap progress will appear here after an investment is verified and activated.</p> : <div className="mt-4 space-y-4">
        {cycles.map((cycle: { id: string; amount_paise: number | string; cap_amount_paise: number | string | null; credited_total_paise: number | string; verified_deposit_id: string | null; cap_multiple: number; cap_reconciled: boolean; status: string; activated_at: string | Date | null; completed_at: string | Date | null; completion_reason: string | null }) => {
          const cap = Number(cycle.cap_amount_paise ?? 0);
          const counted = Number(cycle.credited_total_paise ?? 0);
          const progress = cap > 0 ? Math.min(100, Math.max(0, counted / cap * 100)) : 0;
          const remaining = Math.max(0, cap - counted);
          const cycleMoney = cycle.verified_deposit_id ? usdtMoney : money;
          const label = cycle.status === 'completed' || cycle.status === 'matured' ? 'Completed' : cycle.status === 'active' && !cycle.cap_reconciled ? 'Admin Review' : cycle.status === 'active' ? 'Active' : cycle.status;
          const badgeClass = label === 'Active' ? 'bg-emerald-50 text-emerald-700' : label === 'Completed' ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-700';
          return <div key={cycle.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="font-semibold">Investment cycle</div><div className="mt-1 text-xs text-slate-500">Invested: {cycleMoney(cycle.amount_paise)} · Maximum cap: {cycleMoney(cycle.cap_amount_paise)}</div></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}>{label}</span>
            </div>
            {cycle.cap_reconciled ? <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div><div className="gf-label">Counted toward cap</div><div className="mt-1 font-bold">{cycleMoney(counted)}</div></div>
                <div><div className="gf-label">Cap remaining</div><div className="mt-1 font-bold">{cycleMoney(remaining)}</div></div>
                <div><div className="gf-label">Progress</div><div className="mt-1 font-bold">{progress.toFixed(1)}%</div></div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
              {label === 'Completed' && <p className="mt-3 text-sm font-medium text-emerald-700">This investment cycle is complete. A new cycle requires a verified new investment.</p>}
            </> : <p className="mt-3 text-sm text-amber-700">Your historical income is awaiting admin reconciliation. Further capped credits remain blocked until verified.</p>}
          </div>;
        })}
      </div>}
    </section>
    <section className="mt-6 grid gap-4 md:grid-cols-2"><div className="gf-card p-5"><div className="gf-label">Direct Team</div><div className="gf-value gf-cyan">{team.direct_team}</div></div><div className="gf-card p-5"><div className="gf-label">Total Team</div><div className="gf-value gf-blue">{team.total_team}</div></div></section>
    <Breakdown title="Basic Income Breakdown" rows={basic}/><Breakdown title="FD Income Breakdown" rows={fd}/>
  </DashboardShell>;
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return <section className="mt-6"><h2 className="mb-3 text-lg font-bold">{title}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="gf-card p-4"><div className="gf-label">{label}</div><div className="gf-value">{money(value ?? 0)}</div></div>)}</div></section>;
}
