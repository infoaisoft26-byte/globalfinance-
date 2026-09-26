import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AuthForm } from '@/components/auth-form';

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <section>
          <div className="inline-flex rounded-full border border-blue-700/40 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-300">GLOBAL FINANCE</div>
          <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Secure digital finance infrastructure with transparent records.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">A compliance-first platform foundation with secure authentication, PostgreSQL persistence, immutable ledger records and role-based administration.</p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {['Server-side auth','Immutable ledger','Real database data'].map((item) => <div key={item} className="gf-card p-4 text-sm font-semibold">{item}</div>)}
          </div>
        </section>
        <AuthForm />
      </div>
    </main>
  );
}
