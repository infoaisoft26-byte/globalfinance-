import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { firestore } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export default async function BrochurePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const snap = await firestore.collection('globalSettings').doc('brochure').get();
  const data = snap.data();
  const available = snap.exists && Boolean(data?.storagePath);
  return <main className="min-h-screen bg-white px-4 py-10 text-slate-900 sm:px-8">
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="text-sm font-bold text-blue-700">← Back to Dashboard</Link>
      <section className="mt-6 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-xl shadow-blue-950/10">
        <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 p-7 text-white sm:p-10">
          <div className="text-sm font-bold uppercase tracking-[.2em] text-blue-100">Global Finance</div>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Brochure & Plan Details</h1>
          <p className="mt-3 max-w-xl text-blue-50">Download the latest official brochure shared by the platform.</p>
        </div>
        <div className="p-6 sm:p-8">
          {available ? <><div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-3xl">📄</div><div className="min-w-0"><div className="font-extrabold text-slate-900">Official Brochure PDF</div><div className="mt-1 break-all text-sm text-slate-600">{data?.fileName || 'Global Finance Brochure.pdf'}</div></div></div><a href="/api/brochure" className="mt-5 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 px-5 py-4 text-center font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5">↓ Download Brochure PDF</a></> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><div className="font-bold">Brochure abhi available nahi hai</div><p className="mt-1 text-sm">Admin ke upload karte hi PDF yahan dikhne lagegi.</p></div>}
        </div>
      </section>
    </div>
  </main>;
}
