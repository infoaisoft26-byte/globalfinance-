'use client';

import { useState } from 'react';

export function AdminBrochureUploader({ currentName, updatedAt }: { currentName?: string; updatedAt?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  async function upload() {
    if (!file) { setMessage('Pehle PDF file select karein.'); setError(true); return; }
    setBusy(true); setMessage(''); setError(false);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/admin/brochure', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload nahi ho paya.');
      setMessage('✓ Brochure successfully upload ho gaya. Users ab dashboard se download kar sakte hain.');
      setFile(null);
      window.location.reload();
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'Upload failed.');
    } finally { setBusy(false); }
  }

  return <section className="rounded-3xl border border-blue-100 bg-white p-5 text-slate-900 shadow-xl shadow-blue-950/5 sm:p-8">
    <div className="flex items-start gap-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-3xl">📄</div>
      <div><h3 className="text-xl font-extrabold">Brochure PDF</h3><p className="mt-1 text-sm text-slate-600">Upload ya existing brochure ko replace karein. Maximum file size 8 MB.</p></div>
    </div>
    {currentName && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="text-sm font-bold text-emerald-800">Current brochure available</div>
      <div className="mt-1 break-all text-sm text-slate-700">{currentName}</div>
      {updatedAt && <div className="mt-1 text-xs text-slate-500">Last updated: {updatedAt}</div>}
      <a className="mt-3 inline-flex font-bold text-blue-700 underline" href="/api/brochure">Test download</a>
    </div>}
    <div className="mt-6 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-5">
      <label htmlFor="brochure-pdf" className="block text-sm font-bold text-slate-800">Choose PDF from your computer</label>
      <input id="brochure-pdf" type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:font-bold file:text-white" />
      {file && <p className="mt-2 break-all text-sm text-slate-600">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
      <button type="button" onClick={upload} disabled={busy || !file} className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 px-6 py-3 font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Uploading PDF…' : currentName ? 'Upload / Replace Brochure' : 'Upload Brochure PDF'}</button>
    </div>
    {message && <div role="status" className={`mt-4 rounded-xl p-4 text-sm font-semibold ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>{message}</div>}
  </section>;
}
