import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db, withTransaction } from '@/lib/db';

async function updateTicket(formData: FormData) {
  'use server';
  const admin = await requireAdmin();
  const ticketId = String(formData.get('ticketId') ?? '');
  const status = String(formData.get('status') ?? '');
  const priority = String(formData.get('priority') ?? '');
  const reply = String(formData.get('reply') ?? '').trim().slice(0, 5000);
  if (!['open','in_progress','resolved','closed'].includes(status)) throw new Error('Invalid ticket status');
  if (!['low','normal','high','urgent'].includes(priority)) throw new Error('Invalid ticket priority');
  await withTransaction(async client => {
    const result = await client.query('UPDATE support_tickets SET status=$1, priority=$2, assigned_admin_id=$3, updated_at=now() WHERE id=$4 RETURNING id', [status, priority, admin.id, ticketId]);
    if (!result.rowCount) throw new Error('Ticket not found');
    if (reply) await client.query('INSERT INTO support_ticket_messages (ticket_id, author_user_id, body) VALUES ($1,$2,$3)', [ticketId, admin.id, reply]);
    await client.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [admin.id, 'support.ticket.updated', 'support_ticket', ticketId, JSON.stringify({ status, priority, replied: Boolean(reply) })]);
  });
  revalidatePath(`/admin/tickets/${ticketId}`); revalidatePath('/admin/tickets'); revalidatePath('/admin');
}

export default async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rows } = await db.query(`SELECT t.*,u.full_name,u.email,u.referral_code FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=$1 LIMIT 1`, [id]);
  const ticket = rows[0]; if (!ticket) notFound();
  const messages = await db.query(`SELECT m.id,m.body,m.created_at,u.full_name,u.role FROM support_ticket_messages m JOIN users u ON u.id=m.author_user_id WHERE m.ticket_id=$1 ORDER BY m.created_at ASC`, [id]);
  return <div><a href="/admin/tickets" className="text-sm text-blue-300">← Tickets</a><div className="mt-3"><h2 className="text-2xl font-bold">{ticket.subject}</h2><p className="mt-1 text-sm text-slate-400">{ticket.full_name} • {ticket.email} • {ticket.referral_code}</p></div>
    <div className="mt-6 rounded-2xl border border-blue-900/50 bg-white/[0.03] p-5"><div className="text-sm whitespace-pre-wrap">{ticket.message}</div><div className="mt-3 text-xs text-slate-500">Created {new Date(ticket.created_at).toLocaleString('en-IN')}</div></div>
    <div className="mt-4 space-y-3">{messages.rows.map((m:any)=><div key={m.id} className={`rounded-2xl border p-4 ${m.role==='admin'?'border-blue-700/50 bg-blue-500/5':'border-blue-900/40 bg-white/[0.02]'}`}><div className="text-xs text-slate-500">{m.full_name} • {m.role}</div><div className="mt-2 whitespace-pre-wrap text-sm">{m.body}</div><div className="mt-2 text-xs text-slate-600">{new Date(m.created_at).toLocaleString('en-IN')}</div></div>)}</div>
    <form action={updateTicket} className="mt-6 rounded-2xl border border-blue-900/50 bg-white/[0.03] p-5"><input type="hidden" name="ticketId" value={ticket.id}/><div className="grid gap-3 md:grid-cols-2"><select name="status" defaultValue={ticket.status} className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><select name="priority" defaultValue={ticket.priority} className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><textarea name="reply" placeholder="Reply to user (optional)" className="mt-3 min-h-28 w-full rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"/><button className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">Save & Reply</button></form>
  </div>;
}
