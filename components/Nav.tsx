'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Today', icon: '⚡' },
  { href: '/food', label: 'Food', icon: '🍳' },
  { href: '/train', label: 'Train', icon: '🏋️' },
  { href: '/week', label: 'Week', icon: '📈' },
  { href: '/photos', label: 'Photos', icon: '📷' },
  { href: '/program', label: 'Plan', icon: '🗓️' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-card/95 backdrop-blur border-t border-edge">
      <div className="mx-auto max-w-lg grid grid-cols-6">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? 'text-accent' : 'text-slate-400'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
