import { firestore } from '@/lib/firebase-admin';
import { AdminBrochureUploader } from '@/components/admin-brochure-uploader';

export const dynamic = 'force-dynamic';

export default async function AdminBrochurePage() {
  const snap = await firestore.collection('globalSettings').doc('brochure').get();
  const data = snap.data();
  const date = data?.updatedAt?.toDate ? data.updatedAt.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : undefined;
  return <div className="mx-auto max-w-3xl space-y-6">
    <div><div className="text-sm font-bold uppercase tracking-widest text-blue-600">User resources</div><h2 className="mt-2 text-3xl font-black text-white">Brochure Management</h2><p className="mt-2 text-sm text-slate-400">Manage the PDF that users can download from their dashboard.</p></div>
    <AdminBrochureUploader currentName={data?.fileName} updatedAt={date} />
  </div>;
}
