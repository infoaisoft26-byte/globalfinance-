import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { DashboardShell } from '@/components/dashboard-shell';

const titles: Record<string,string> = {
  'recharge': 'Recharge',
  'packages/basic': 'Basic Package',
  'packages/fd': 'FD Package',
  'downline/direct': 'Direct Team',
  'downline/team': 'Team List',
  'income': 'Income',
  'transactional/p2p': 'P2P Transfer',
  'transactional/income-to-fund': 'Transfer Income To Fund',
  'transactional/withdrawal': 'Fund Withdrawal',
  'reports': 'Reports',
  'support': 'Support Ticket',
};

export default async function ModulePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const session = await getSession();
  if (!session) redirect('/');
  const { slug } = await params;
  const key = slug.join('/');
  const title = titles[key] ?? 'GLOBAL FINANCE';
  const result = await db.query('SELECT full_name, referral_code FROM users WHERE id=$1', [session.userId]);
  if (result.rowCount !== 1) redirect('/');
  const user = result.rows[0];

  const transactional = key.startsWith('transactional/') || key === 'recharge' || key.startsWith('packages/');
  return <DashboardShell userName={user.full_name} referralCode={user.referral_code}>
    <div className="text-sm text-slate-500">Dashboard / {title}</div>
    <h1 className="mt-2 text-2xl font-black">{title}</h1>
    <div className="gf-card mt-6 p-6">
      {transactional ? <>
        <div className="text-base font-bold">Controlled financial operation</div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">This operation is disabled by default. It must only be activated after an authorized payment or payout provider, KYC/AML controls, applicable tax handling and regulatory requirements are configured. The application will not simulate successful money movement.</p>
        <button disabled className="mt-5 rounded-xl bg-blue-600/40 px-4 py-2.5 text-sm font-semibold text-blue-200 opacity-60">Provider integration required</button>
      </> : <>
        <div className="text-base font-bold">Real backend module</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">This route is authenticated and ready for backend-driven records. No demo rows or fake totals are rendered.</p>
      </>}
    </div>
  </DashboardShell>;
}
