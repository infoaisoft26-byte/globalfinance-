'use client';

import Link from 'next/link';
import { useState } from 'react';

const groups = [
  ['Dashboard', '/dashboard'],
  ['Download Brochure', '/brochure'],
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
    <div className="min-h-screen bg-white text-[#102447] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 w-[280px] border-r border-blue-900/50 bg-white p-5 text-slate-900 transition-transform lg:static lg:translate-x-0`}>
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/30 bg-gradient-to-br from-blue-500/25 to-cyan-400/10 text-cyan-300 shadow-lg shadow-blue-950/30" aria-label="Global Finance logo">
              <svg viewBox="0 0 48 48" className="h-7 w-7" aria-hidden="true">
                <path d="M24 4 39 10v11c0 10-6.3 18.5-15 23-8.7-4.5-15-13-15-23V10L24 4Z" fill="none" stroke="currentColor" strokeWidth="3"/>
                <path d="m16 25 5 5 11-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black tracking-[.06em] text-[#102447]">GLOBAL FINANCE</div>
              <div className="mt-1 text-xs font-medium text-slate-700">Secure • Transparent • Digital Finance Platform</div>
            </div>
          </div>
        </div>
        <nav className="space-y-1">
          {groups.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-base font-semibold text-slate-800 transition-colors hover:bg-blue-50 hover:text-blue-800">{label}</Link>)}
        </nav>
        <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-700">
          <div className="font-bold text-[#102447]">{userName}</div>
          <div className="mt-1">Referral: {referralCode}</div>
        </div>
      </aside>
      {open && <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" />}
      <main className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur lg:px-7">
          <button onClick={() => setOpen(true)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-[#102447] lg:hidden">Menu</button>
          <div>
            <div className="text-xs font-bold tracking-wide text-blue-800">GLOBAL FINANCE</div>
            <div className="truncate text-base font-extrabold text-[#102447]">Welcome, {userName}</div>
          </div>
          <button onClick={() => navigator.clipboard.writeText(referralUrl)} className="rounded-xl bg-[#1746A2] px-3 py-2 text-sm font-bold text-white hover:bg-blue-800">Copy Referral</button>
        </header>
        <div className="gf-quick-actions grid grid-cols-2 gap-2 px-3 pt-4 sm:grid-cols-4 sm:gap-3 sm:px-5 lg:px-7">
          {[
            ['Deposit / Recharge', '/recharge'],
            ['Withdraw', '/transactional/withdrawal'],
            ['Packages', '/packages/basic'],
            ['P2P Transfer', '/transactional/p2p'],
          ].map(([label, href]) => <Link key={href} href={href} className="flex min-h-12 items-center rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-bold text-[#102447] shadow-sm transition hover:border-blue-400 hover:bg-blue-50">{label}</Link>)}
        </div>
        <div className="px-3 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-7">{children}</div>
        <footer className="px-6 py-8 text-center text-xs font-medium text-slate-600">© 2026 Global Finance. All Rights Reserved.</footer>
      </main>
    </div>
  );
}
