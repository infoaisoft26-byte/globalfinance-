'use client';

import Link from 'next/link';
import { useState } from 'react';

const groups = [
  ['Dashboard', '/dashboard'],
  ['Recharge', '/recharge'],
  ['Basic Package', '/packages/basic'],
  ['FD Package', '/packages/fd'],
  ['Direct Team', '/downline/direct'],
  ['Team List', '/downline/team'],
  ['Income', '/income'],
  ['P2P Transfer', '/transactional/p2p'],
  ['Transfer Income To Fund', '/transactional/income-to-fund'],
  ['Fund Withdrawal', '/transactional/withdrawal'],
  ['Reports', '/reports'],
  ['Support Ticket', '/support'],
  ['Logout', '/logout'],
];

export function DashboardShell({ children, userName, referralCode }: { children: React.ReactNode; userName: string; referralCode: string }) {
  const [open, setOpen] = useState(false);
  const referralUrl = typeof window === 'undefined' ? `/register?r=${referralCode}` : `${window.location.origin}/register?r=${referralCode}`;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-[280px] border-r border-blue-900/50 bg-[#071427] p-5 transition-transform lg:static lg:translate-x-0`}>
        <div className="mb-8">
          <div className="text-xl font-black tracking-[.08em]">GLOBAL FINANCE</div>
          <div className="mt-1 text-xs text-slate-400">Secure • Transparent • Digital Finance Platform</div>
        </div>
        <nav className="space-y-1">
          {groups.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-blue-500/10 hover:text-white">{label}</Link>)}
        </nav>
        <div className="mt-8 border-t border-blue-900/40 pt-5 text-xs text-slate-400">
          <div className="font-semibold text-white">{userName}</div>
          <div className="mt-1">Referral: {referralCode}</div>
        </div>
      </aside>
      {open && <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" />}
      <main className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-blue-900/40 bg-[#06101f]/90 px-4 backdrop-blur lg:px-7">
          <button onClick={() => setOpen(true)} className="rounded-lg border border-blue-800/50 px-3 py-2 lg:hidden">Menu</button>
          <div>
            <div className="text-xs text-slate-500">GLOBAL FINANCE</div>
            <div className="font-semibold">Financial Dashboard</div>
          </div>
          <button onClick={() => navigator.clipboard.writeText(referralUrl)} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500">Copy Referral</button>
        </header>
        <div className="p-4 lg:p-7">{children}</div>
        <footer className="px-6 py-8 text-center text-xs text-slate-500">© 2026 Global Finance. All Rights Reserved.</footer>
      </main>
    </div>
  );
}
