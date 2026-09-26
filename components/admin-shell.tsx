import Link from 'next/link';

const links = [
  ['Overview', '/admin'],
  ['Users', '/admin/users'],
  ['KYC Review', '/admin/kyc'],
  ['Reports', '/admin/reports'],
  ['Support Tickets', '/admin/tickets'],
  ['Audit Log', '/admin/audit'],
];

export function AdminShell({ children, adminName }: { children: React.ReactNode; adminName: string }) {
  return (
    <div className="min-h-screen bg-[#050c18] text-slate-100 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-r border-blue-900/40 bg-[#071427] p-5">
        <Link href="/admin" className="block text-lg font-black tracking-[.08em]">GLOBAL FINANCE</Link>
        <div className="mt-1 text-xs text-slate-400">Administration Console</div>
        <nav className="mt-8 space-y-1">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-blue-500/10 hover:text-white">{label}</Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-blue-900/40 pt-5 text-xs text-slate-400">
          Signed in as <span className="font-semibold text-white">{adminName}</span>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="border-b border-blue-900/40 bg-[#06101f] px-5 py-4 lg:px-8">
          <div className="text-xs uppercase tracking-[.22em] text-blue-300">GLOBAL FINANCE</div>
          <h1 className="mt-1 text-xl font-bold">Admin Panel</h1>
        </header>
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
