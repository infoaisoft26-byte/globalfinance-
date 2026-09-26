import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { getPrivateStorage } from '@/lib/storage';

export async function GET(req: Request) {
  const admin = await requireAdmin();
  const key = new URL(req.url).searchParams.get('key') ?? '';
  if (!key.startsWith('kyc/')) return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  const exists = await db.query('SELECT id FROM kyc_submissions WHERE document_storage_key=$1 OR address_storage_key=$1 LIMIT 1', [key]);
  if (!exists.rowCount) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const { client, bucket } = getPrivateStorage();
  const signed = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 120 });
  await db.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,payload) VALUES ($1,$2,$3,$4,$5::jsonb)', [admin.id,'kyc.document.viewed','kyc_document',exists.rows[0].id,JSON.stringify({key})]);
  return NextResponse.redirect(signed);
}
