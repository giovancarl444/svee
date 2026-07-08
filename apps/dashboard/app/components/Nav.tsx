'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', n: '01', label: 'Today' },
  { href: '/tomorrow', n: '02', label: 'Tomorrow' },
  { href: '/inbox', n: '03', label: 'Inbox' },
  { href: '/loops', n: '04', label: 'Loops' },
  { href: '/connectors', n: '05', label: 'Signals' },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-ink/12 bg-bone/95 backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {TABS.map((t) => {
          const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                  active ? 'text-ink' : 'text-steel hover:text-ink'
                }`}
              >
                <span
                  className={`h-px w-5 ${active ? 'bg-ink' : 'bg-transparent'}`}
                  aria-hidden
                />
                <span className="font-mono text-[10px] tracking-wider">{t.n}</span>
                <span className="text-[11px] font-medium">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
