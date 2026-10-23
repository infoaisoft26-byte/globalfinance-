import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { firestore } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Please sign in to download the brochure.' }, { status: 401 });
  try {
    const snap = await firestore.collection('globalSettings').doc('brochure').get();
    const settings = snap.data();
    if (!snap.exists || !settings?.storagePath) return NextResponse.json({ error: 'The brochure has not been uploaded yet.' }, { status: 404 });
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) return NextResponse.json({ error: 'Brochure storage is not configured.' }, { status: 503 });
    const [url] = await getStorage().bucket(bucketName).file(String(settings.storagePath)).getSignedUrl({
      action: 'read',
      expires: Date.now() + 5 * 60 * 1000,
      responseDisposition: 'attachment; filename="Global-Finance-Brochure.pdf"',
      responseType: 'application/pdf',
    });
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    console.error('[BROCHURE_DOWNLOAD]', error);
    return NextResponse.json({ error: 'Could not prepare the brochure download.' }, { status: 500 });
  }
}
