'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = mode === 'login'
      ? { email: data.email, password: data.password }
      : { fullName: data.fullName, email: data.email, password: data.password, referral: data.referral || undefined };
    const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? 'Request failed'); setBusy(false); return; }
    router.push(mode === 'login' && body.role === 'admin' ? '/admin' : '/dashboard'); router.refresh();
  }

  return <div className="gf-card w-full max-w-md p-7">
    <div className="mb-6"><div className="text-xs font-bold tracking-[.18em] text-blue-400">GLOBAL FINANCE</div><h1 className="mt-2 text-2xl font-black">{mode === 'login' ? 'Secure Login' : 'Create Account'}</h1><p className="mt-2 text-sm text-slate-400">Secure • Transparent • Digital Finance Platform</p></div>
    <form onSubmit={submit} className="space-y-4">
      {mode === 'register' && <input name="fullName" required placeholder="Full name" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />}
      <input name="email" type="email" required placeholder="Email address" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />
      <input name="password" type="password" required minLength={mode === 'register' ? 10 : 1} placeholder="Password" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />
      {mode === 'register' && <input name="referral" defaultValue={params.get('r') ?? ''} placeholder="Referral code (optional)" className="w-full rounded-xl border border-blue-900/60 bg-[#071427] px-4 py-3 outline-none focus:border-blue-500" />}
      {error && <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>}
      <button disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold hover:bg-blue-500 disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Register'}</button>
    </form>
    <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="mt-5 w-full text-sm text-blue-300">{mode === 'login' ? 'Create a new account' : 'Already registered? Login'}</button>
  </div>;
}
