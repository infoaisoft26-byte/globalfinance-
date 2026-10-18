'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [referral, setReferral] = useState(params.get('r') ?? '');
  const [sponsor, setSponsor] = useState<{ referralCode: string; fullName: string } | null>(null);
  const [sponsorLoading, setSponsorLoading] = useState(false);

  useEffect(() => {
    if (mode !== 'register') return;
    const code = referral.trim().toUpperCase();
    if (!code || !/^GF[0-9]{6}$/.test(code)) { setSponsor(null); setSponsorLoading(false); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSponsorLoading(true);
      try {
        const res = await fetch('/api/referral/lookup?code=' + encodeURIComponent(code), { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setSponsor(res.ok ? { referralCode: body.referralCode, fullName: body.fullName } : null);
      } catch {
        if (!cancelled) setSponsor(null);
      } finally {
        if (!cancelled) setSponsorLoading(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [mode, referral]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = mode === 'login'
      ? { email: data.email, password: data.password }
      : { fullName: data.fullName, mobileNumber: data.mobileNumber, email: data.email, password: data.password, referral: String(data.referral || '').trim().toUpperCase() || undefined };
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? 'Request failed'); setBusy(false); return; }
      router.push(mode === 'login' && body.role === 'admin' ? '/admin' : '/dashboard'); router.refresh();
    } catch {
      setError('Unable to connect. Please try again.');
      setBusy(false);
    }
  }

  return <div className="gf-card w-full max-w-md p-7">
    <div className="mb-6"><div className="text-xs font-bold tracking-[.18em] text-blue-400">GLOBAL FINANCE</div><h1 className="mt-2 text-2xl font-black">{mode === 'login' ? 'Secure Login' : 'Create Account'}</h1><p className="mt-2 text-sm text-slate-400">Secure • Transparent • Digital Finance Platform</p></div>
    <form onSubmit={submit} className="space-y-4">
      {mode === 'register' && <input name="fullName" required minLength={2} maxLength={120} placeholder="Full name" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />}
      {mode === 'register' && <input name="mobileNumber" type="tel" inputMode="numeric" autoComplete="tel" required pattern="^\\+91[6-9][0-9]{9}$" placeholder="Mobile number (+91XXXXXXXXXX)" title="Enter a valid Indian mobile number with +91 and 10 digits" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />}
      <input name="email" type="email" required placeholder="Email address" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />
      <input name="password" type="password" required minLength={mode === 'register' ? 10 : 1} placeholder="Password" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />
      {mode === 'register' && <>
        <input name="referral" value={referral} onChange={(event) => setReferral(event.target.value.toUpperCase())} placeholder="Sponsor referral ID (optional)" autoComplete="off" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />
        {sponsorLoading && <p className="text-xs text-slate-400">Checking sponsor…</p>}
        {sponsor && <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 px-3 py-2 text-sm"><div className="font-semibold text-emerald-300">Sponsor: {sponsor.fullName}</div><div className="text-xs text-slate-400">Referral ID: {sponsor.referralCode}</div></div>}
        {!!referral.trim() && !sponsorLoading && !sponsor && /^GF[0-9]{6}$/.test(referral.trim()) && <p className="text-xs text-amber-300">Sponsor ID not found. Please check the ID.</p>}
      </>}
      {error && <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>}
      <button disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold hover:bg-blue-500 disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}</button>
    </form>
    <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="mt-5 w-full text-sm text-blue-300">{mode === 'login' ? 'Create a new account' : 'Already registered? Login'}</button>
  </div>;
}
