import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { DashboardShell } from '@/components/dashboard-shell';

const money = (paise: number | string | bigint) => `₹ ${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type BreakdownRow = [string, number | string | bigint | null | undefined];
type TeamMember = {
  id: string;
  full_name: string;
  referral_code: string;
  referred_by: string | null;
  sponsor_name: string | null;
  sponsor_referral_code: string | null;
  created_at: string;
  account_status: string;
  depth: number;
};

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
    db.query(`
      WITH RECURSIVE team AS (
        SELECT u.id, u.full_name, u.referral_code, u.referred_by, u.created_at, u.account_status, 1 AS depth
        FROM users u WHERE u.referred_by=$1
        UNION ALL
        SELECT u.id, u.full_name, u.referral_code, u.referred_by, u.created_at, u.account_status, t.depth+1
        FROM users u JOIN team t ON u.referred_by=t.id
        WHERE t.depth < 100
      )
      SELECT
        COUNT(*) FILTER (WHERE depth=1)::int AS direct_team,
        COUNT(*)::int AS total_team,
        COALESCE(json_agg(json_build_object(
          'id', team.id,
          'full_name', team.full_name,
          'referral_code', team.referral_code,
          'referred_by', team.referred_by,
          'sponsor_name', sponsor.full_name,
          'sponsor_referral_code', sponsor.referral_code,
          'created_at', team.created_at,
          'account_status', team.account_status,
          'depth', team.depth
        ) ORDER BY team.depth, team.created_at DESC), '[]'::json) AS members
      FROM team
      LEFT JOIN users sponsor ON sponsor.id=team.referred_by`, [session.userId]),
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
  const team = teams.rows[0] ?? { direct_team: 0, total_team: 0, members: [] };
  const members = (team.members ?? []) as TeamMember[];
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

    <section className="mt-6">
      <div className="mb-3"><h2 className="text-xl font-black">Team Summary</h2><p className="mt-1 text-sm text-slate-500">Your referral ID and all members who joined through your referral network.</p></div>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="gf-card p-5"><div className="gf-label">My Referral ID</div><div className="gf-value gf-cyan">{user.referral_code}</div></div>
        <div className="gf-card p-5"><div className="gf-label">Direct Referrals</div><div className="gf-value gf-cyan">{team.direct_team}</div></div>
        <div className="gf-card p-5"><div className="gf-label">Total Team Members</div><div className="gf-value gf-blue">{team.total_team}</div></div>
      </div>
      <div className="gf-card overflow-x-auto p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-bold">Team Member Details ({members.length})</h3>
        {members.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No members have joined through your referral network yet.</p> : <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Member</th><th className="px-3 py-3">Referral ID</th><th className="px-3 py-3">Joined Through</th><th className="px-3 py-3">Level</th><th className="px-3 py-3">Joining Date</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody>{members.map((member) => <tr key={member.id} className="border-b border-slate-100 last:border-0">
            <td className="px-3 py-3 font-semibold">{member.full_name}</td>
            <td className="px-3 py-3 font-mono">{member.referral_code}</td>
            <td className="px-3 py-3">{member.sponsor_name ?? '—'}<div className="text-xs text-slate-500">{member.sponsor_referral_code ?? '—'}</div></td>
            <td className="px-3 py-3">{member.depth === 1 ? 'Direct' : `Level ${member.depth}`}</td>
            <td className="px-3 py-3">{new Date(member.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</td>
            <td className="px-3 py-3"><span className={member.account_status === 'active' ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>{member.account_status}</span></td>
          </tr>)}</tbody>
        </table>}
      </div>
    </section>

    <Breakdown title="Basic Income Breakdown" rows={basic}/><Breakdown title="FD Income Breakdown" rows={fd}/>
  </DashboardShell>;
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return <section className="mt-6"><h2 className="mb-3 text-lg font-bold">{title}</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{rows.map(([label, value]) => <div key={label} className="gf-card p-4"><div className="gf-label">{label}</div><div className="gf-value">{money(value ?? 0)}</div></div>)}</div></section>;
}
