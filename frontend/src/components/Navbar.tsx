'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

const LINKS = [
  { href: '/dashboard/today', label: 'Today' },
  { href: '/dashboard', label: 'Pipeline' },
  { href: '/dashboard/finder', label: 'Finder' },
  { href: '/dashboard/inbox', label: 'Inbox' },
  { href: '/dashboard/content', label: 'Content' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Unread inbox badge - refreshed on navigation and every 30s
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get('/inbox/unread-count')
        .then((res) => !cancelled && setUnread(res.data.data.unread))
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname]);

  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard' || pathname.startsWith('/dashboard/leads')
      : pathname.startsWith(href);

  return (
    <header className="border-b border-slate-200 bg-white">
      {/* Mobile: logo + logout on row 1, links full-width on row 2. Desktop: one row. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-2 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-4 sm:px-6">
        <div className="contents sm:flex sm:min-w-0 sm:items-center sm:gap-6">
          <Link href="/dashboard" className="whitespace-nowrap text-lg font-semibold text-slate-900">
            AI CRM
          </Link>
          <nav className="order-last flex w-full justify-between gap-1 overflow-x-auto sm:order-none sm:w-auto sm:justify-start">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition sm:px-3 ${
                  isActive(link.href)
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {link.label}
                {link.href === '/dashboard/inbox' && unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-shrink-0 items-center gap-4">
          <span className="hidden text-sm text-slate-500 sm:inline">
            {user?.businessName || user?.name}
          </span>
          <button
            onClick={logout}
            className="whitespace-nowrap rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:px-3"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
