import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPrivateStorage } from '@/lib/storage';

const allowedTypes = new Set(['application/pdf','image/jpeg','image/png','image/webp']);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as null | { contentType?: string; kind?: 'identity'|'address' };
  if (!body?.contentType || !allowedTypes.has(body.contentType) || !['identity','address'].includes(body.kind ?? '')) {
    return NextResponse.json({ error: 'Unsupported file type or document kind' }, { status: 400 });
  }
  const { client, bucket } = getPrivateStorage();
  const key = `kyc/${session.userId}/${crypto.randomUUID()}-${body.kind}`;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: body.contentType, ServerSideEncryption: 'AES256' });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return NextResponse.json({ key, uploadUrl, expiresIn: 300 });
}
