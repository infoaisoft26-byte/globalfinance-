import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { KycForm } from '@/components/kyc-form';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function KycPage(){
  const session=await getSession(); if(!session) redirect('/');
  const userResult=await db.query('SELECT full_name,referral_code,kyc_status FROM users WHERE id=$1 AND account_status=$2',[session.userId,'active']);
  if(!userResult.rowCount) redirect('/logout'); const user=userResult.rows[0];
  const latest=await db.query('SELECT status,document_type,submitted_at,reviewed_at,review_note FROM kyc_submissions WHERE user_id=$1 ORDER BY submitted_at DESC LIMIT 1',[session.userId]);
  const row=latest.rows[0];
  return <DashboardShell userName={user.full_name} referralCode={user.referral_code}><div className="mb-6"><div className="text-sm text-slate-500">Dashboard / KYC</div><h1 className="mt-1 text-2xl font-black">KYC Verification</h1><p className="mt-2 text-sm text-slate-400">Current status: <span className="capitalize text-white">{user.kyc_status.replace('_',' ')}</span></p></div>{row&&<div className="gf-card mb-5 p-4 text-sm"><div className="font-semibold">Latest submission</div><div className="mt-2 text-slate-400">{row.document_type} • {row.status.replace('_',' ')} • {new Date(row.submitted_at).toLocaleString('en-IN')}</div>{row.review_note&&<div className="mt-2 text-slate-400">Review note: {row.review_note}</div>}</div>}<KycForm/></DashboardShell>;
}
