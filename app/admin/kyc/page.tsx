import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { db, withTransaction } from '@/lib/db';

async function reviewKyc(formData: FormData) {
  'use server';
  const admin = await requireAdmin();
  const submissionId = String(formData.get('submissionId') ?? '');
  const status = String(formData.get('status') ?? '');
  const note = String(formData.get('note') ?? '').slice(0, 1000);
  if (!['in_review','verified','rejected'].includes(status)) throw new Error('Invalid KYC status');
  await withTransaction(async client => {
    const { rows } = await client.query('SELECT user_id FROM kyc_submissions WHERE id=$1 FOR UPDATE', [submissionId]);
    const submission = rows[0]; if (!submission) throw new Error('KYC submission not found');
    await client.query('UPDATE kyc_submissions SET status=$1, reviewed_by=$2, reviewed_at=now(), review_note=$3 WHERE id=$4', [status, admin.id, note || null, submissionId]);
    await client.query('UPDATE users SET kyc_status=$1, kyc_reviewed_by=$2, kyc_reviewed_at=now(), updated_at=now() WHERE id=$3', [status, admin.id, submission.user_id]);
    await client.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [admin.id, 'kyc.reviewed', 'kyc_submission', submissionId, JSON.stringify({ status, note: note || null, userId: submission.user_id })]);
  });
  revalidatePath('/admin/kyc'); revalidatePath('/admin');
}

export default async function AdminKycPage() {
  const { rows } = await db.query(`SELECT k.id, k.user_id, k.legal_name, k.document_type, k.document_last4, k.document_storage_key, k.address_storage_key, k.status, k.submitted_at, k.review_note, u.email, u.referral_code FROM kyc_submissions k JOIN users u ON u.id=k.user_id ORDER BY CASE k.status WHEN 'pending' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END, k.submitted_at ASC LIMIT 100`);
  return <div><div><h2 className="text-2xl font-bold">KYC Review</h2><p className="mt-1 text-sm text-slate-400">Manual review queue. No automated financial eligibility decision is made here.</p></div>
    <div className="mt-6 space-y-4">{rows.map((k:any)=><div key={k.id} className="rounded-2xl border border-blue-900/50 bg-white/[0.03] p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="font-bold">{k.legal_name}</div><div className="mt-1 text-sm text-slate-400">{k.email} • {k.referral_code}</div><div className="mt-2 text-xs text-slate-500">Document: {k.document_type}{k.document_last4 ? ` •••• ${k.document_last4}` : ''} • Submitted {new Date(k.submitted_at).toLocaleString('en-IN')}</div><div className="mt-3 flex gap-3 text-sm"><a className="text-blue-300 hover:text-blue-200" href={`/api/admin/kyc/document?key=${encodeURIComponent(k.document_storage_key)}`}>View identity document</a>{k.address_storage_key&&<a className="text-blue-300 hover:text-blue-200" href={`/api/admin/kyc/document?key=${encodeURIComponent(k.address_storage_key)}`}>View address proof</a>}</div></div><span className="rounded-full border border-blue-800/50 px-3 py-1 text-xs capitalize">{k.status.replace('_',' ')}</span></div>
      <form action={reviewKyc} className="mt-4 grid gap-2 lg:grid-cols-[180px_1fr_auto]"><input type="hidden" name="submissionId" value={k.id}/><select name="status" defaultValue={k.status==='pending'?'in_review':k.status} className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"><option value="in_review">In Review</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select><input name="note" defaultValue={k.review_note??''} placeholder="Internal review note" className="rounded-xl border border-blue-900/60 bg-[#09172a] px-3 py-2 text-sm"/><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">Save Review</button></form>
    </div>)}{!rows.length&&<div className="rounded-2xl border border-blue-900/50 p-8 text-center text-sm text-slate-500">No KYC submissions yet.</div>}</div>
  </div>;
}
