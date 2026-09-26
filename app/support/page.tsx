import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { getSession } from '@/lib/auth';
import { db, withTransaction } from '@/lib/db';

async function createTicket(formData: FormData) {
  'use server';
  const session = await getSession();
  if (!session) redirect('/');
  const subject = String(formData.get('subject') ?? '').trim().slice(0, 160);
  const message = String(formData.get('message') ?? '').trim().slice(0, 5000);
  const priority = String(formData.get('priority') ?? 'normal');
  if (!subject || !message) throw new Error('Subject and message are required');
  if (!['low','normal','high'].includes(priority)) throw new Error('Invalid priority');
  await withTransaction(async client => {
    const { rows } = await client.query('INSERT INTO support_tickets (user_id,subject,message,priority) VALUES ($1,$2,$3,$4) RETURNING id', [session.userId, subject, message, priority]);
    await client.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [session.userId,'support.ticket.created','support_ticket',rows[0].id,JSON.stringify({priority})]);
  });
  revalidatePath('/support');
}

export default async function SupportPage() {
  const session = await getSession(); if (!session) redirect('/');
  const userResult = await db.query('SELECT full_name,referral_code FROM users WHERE id=$1 AND account_status=$2',[session.userId,'active']);
  if (!userResult.rowCount) redirect('/logout');
  const user=userResult.rows[0];
  const tickets=await db.query('SELECT id,subject,status,priority,created_at,updated_at FROM support_tickets WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50',[session.userId]);
  return <DashboardShell userName={user.full_name} referralCode={user.referral_code}>
    <div className="mb-6"><div className="text-sm text-slate-500">Dashboard / Support</div><h1 className="mt-1 text-2xl font-black">Support Ticket</h1></div>
    <form action={createTicket} className="gf-card p-5"><div className="grid gap-3 md:grid-cols-[1fr_180px]"><input name="subject" required maxLength={160} placeholder="Subject" className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"/><select name="priority" defaultValue="normal" className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></div><textarea name="message" required maxLength={5000} placeholder="Describe your issue" className="mt-3 min-h-32 w-full rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"/><button className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">Create Ticket</button></form>
    <div className="mt-6"><h2 className="mb-3 text-lg font-bold">My Tickets</h2><div className="overflow-x-auto rounded-2xl border border-blue-900/50"><table className="min-w-full text-sm"><thead className="bg-blue-950/40 text-left text-slate-400"><tr><th className="p-3">Subject</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Updated</th></tr></thead><tbody>{tickets.rows.map((t:any)=><tr key={t.id} className="border-t border-blue-950/70"><td className="p-3 font-medium">{t.subject}</td><td className="p-3 capitalize">{t.priority}</td><td className="p-3 capitalize">{t.status.replace('_',' ')}</td><td className="p-3 text-slate-400">{new Date(t.updated_at).toLocaleString('en-IN')}</td></tr>)}</tbody></table>{!tickets.rows.length&&<div className="p-8 text-center text-sm text-slate-500">No tickets yet.</div>}</div></div>
  </DashboardShell>;
}
