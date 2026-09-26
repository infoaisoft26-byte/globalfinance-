import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPrivateStorage } from '@/lib/storage';

const allowedTypes = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as null | { contentType?: string; kind?: 'identity'|'address'; size?: number };
  if (!body?.contentType || !allowedTypes.has(body.contentType) || !['identity','address'].includes(body.kind ?? '') || !Number.isInteger(body.size) || (body.size ?? 0) <= 0 || (body.size ?? 0) > MAX_BYTES) {
    return NextResponse.json({ error: 'Unsupported file type, document kind, or file size' }, { status: 400 });
  }
  const { client, bucket } = getPrivateStorage();
  const key = `kyc/${session.userId}/${crypto.randomUUID()}-${body.kind}`;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: body.contentType, ContentLength: body.size, ServerSideEncryption: 'AES256' });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return NextResponse.json({ key, uploadUrl, expiresIn: 300, maxBytes: MAX_BYTES });
}
