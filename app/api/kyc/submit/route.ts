import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { withTransaction } from '@/lib/db';

const schema = z.object({
  legalName: z.string().trim().min(2).max(160),
  documentType: z.enum(['pan','aadhaar','passport','driving_license','other']),
  documentLast4: z.string().trim().regex(/^[A-Za-z0-9]{0,4}$/).optional().default(''),
  documentStorageKey: z.string().regex(/^kyc\/[0-9a-f-]+\/[A-Za-z0-9-]+-identity$/),
  addressStorageKey: z.string().regex(/^kyc\/[0-9a-f-]+\/[A-Za-z0-9-]+-address$/).optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid KYC submission' }, { status: 400 });
  const data = parsed.data;
  if (!data.documentStorageKey.startsWith(`kyc/${session.userId}/`) || (data.addressStorageKey && !data.addressStorageKey.startsWith(`kyc/${session.userId}/`))) {
    return NextResponse.json({ error: 'Invalid storage ownership' }, { status: 403 });
  }
  const id = await withTransaction(async client => {
    const { rows } = await client.query(`INSERT INTO kyc_submissions (user_id,legal_name,document_type,document_last4,document_storage_key,address_storage_key,status) VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`, [session.userId,data.legalName,data.documentType,data.documentLast4||null,data.documentStorageKey,data.addressStorageKey||null]);
    await client.query(`UPDATE users SET kyc_status='pending',updated_at=now() WHERE id=$1`, [session.userId]);
    await client.query(`INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,payload) VALUES ($1,$2,$3,$4,$5::jsonb)`, [session.userId,'kyc.submitted','kyc_submission',rows[0].id,JSON.stringify({documentType:data.documentType})]);
    return rows[0].id;
  });
  return NextResponse.json({ ok: true, id });
}
