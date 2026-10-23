import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { firestore } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 8 * 1024 * 1024;

async function authorizedAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return false;
  const snap = await firestore.collection('users').doc(session.userId).get();
  const user = snap.data();
  return snap.exists && user?.role === 'admin' && (user.accountStatus ?? user.account_status) === 'active';
}

export async function POST(request: NextRequest) {
  if (!(await authorizedAdmin())) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Please choose a PDF file.' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'PDF must be smaller than 8 MB.' }, { status: 400 });
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
    const signature = Buffer.from(await file.slice(0, 5).arrayBuffer()).toString('ascii');
    if (signature !== '%PDF-') return NextResponse.json({ error: 'The selected file is not a valid PDF.' }, { status: 400 });

    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: 'FIREBASE_STORAGE_BUCKET is not configured in deployment settings.' }, { status: 503 });
    const bucket = getStorage().bucket(bucketName);
    const path = 'public-documents/global-finance-brochure.pdf';
    const target = bucket.file(path);
    await target.save(Buffer.from(await file.arrayBuffer()), {
      resumable: false,
      metadata: { contentType: 'application/pdf', cacheControl: 'private, max-age=0, no-transform', metadata: { originalName: file.name.slice(0, 160), uploadedAt: new Date().toISOString() } },
    });
    await firestore.collection('globalSettings').doc('brochure').set({
      storagePath: path,
      fileName: file.name.slice(0, 160),
      sizeBytes: file.size,
      updatedAt: new Date(),
      updatedBy: (await getSession())?.userId ?? null,
    });
    return NextResponse.json({ success: true, fileName: file.name, sizeBytes: file.size });
  } catch (error) {
    console.error('[ADMIN_BROCHURE_UPLOAD]', error);
    return NextResponse.json({ error: 'Upload failed. Check Firebase Storage configuration and permissions.' }, { status: 500 });
  }
}
