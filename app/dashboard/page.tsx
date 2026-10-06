import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { DashboardShell } from '@/components/dashboard-shell';

const money = (paise: number | string | bigint) => `₹ ${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type BreakdownRow = [string, number | string | bigint | null | undefined];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/');

  const userResult = await db.query('SELECT full_name, referral_code FROM users WHERE id=$1', [session.userId]);
  if (userResult.rowCount !== 1) redirect('/');
  const user = userResult.rows[0];

  const [wallets, packages, teams, income] = await Promise.all([
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

  const cards = [
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
    <section className="mt-6 grid gap-4 md:grid-cols-2"><div className="gf-card p-5"><div className="gf-label">Direct Team</div><div className="gf-value gf-cyan">{team.direct_team}</div></div><div className="gf-card p-5"><div className="gf-label">Total Team</div><div className="gf-value gf-blue">{team.total_team}</div></div></section>
    <Breakdown title="Basic Income Breakdown" rows={basic}/><Breakdown title="FD Income Breakdown" rows={fd}/>
  </DashboardShell>;
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return <section className="mt-6"><h2 className="mb-3 text-lg font-bold">{title}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="gf-card p-4"><div className="gf-label">{label}</div><div className="gf-value">{money(value ?? 0)}</div></div>)}</div></section>;
}
