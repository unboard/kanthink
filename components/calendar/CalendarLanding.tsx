'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { BUSINESSES } from '@/lib/calendar/types';

function useHideKanChrome() {
  useEffect(() => {
    document.body.setAttribute('data-mcs-page', 'true');
    document.documentElement.style.colorScheme = 'light';
    const style = document.createElement('style');
    style.id = 'cal-hide-chrome';
    style.textContent = `
      body[data-mcs-page] .relative.z-10.flex.h-screen > *:not(div:last-of-type) { display: none !important; }
      body[data-mcs-page] .relative.z-10.flex.h-screen { display: block !important; height: auto !important; }
      body[data-mcs-page] .relative.z-10.flex.h-screen > div { margin-left: 0 !important; display: block !important; }
      body[data-mcs-page], body[data-mcs-page] html { background: #f6f7f9 !important; color: #171717 !important; }
      body[data-mcs-page] canvas { display: none !important; }
    `;
    document.head.appendChild(style);
    return () => { document.body.removeAttribute('data-mcs-page'); document.documentElement.style.colorScheme = ''; style.remove(); };
  }, []);
}

export function CalendarLanding() {
  useHideKanChrome();
  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
        <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-blue-600">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
          Marketing Calendar
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">Plan the ideas that grow revenue.</h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-500">
          One calendar to see what to do this week, what&apos;s happening, and what already ran — across every business. Ideas come through a conversation with Kan, who knows your audiences, products, and tools.
        </p>

        <div className="mt-8 space-y-3">
          {BUSINESSES.map((b) => (
            <Link key={b.slug} href={`/calendar/${b.slug}`}
              className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: b.accent }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-neutral-900">{b.name}</div>
                <div className="truncate text-[13px] text-neutral-500">{b.tagline}</div>
              </div>
              <svg className="text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-500" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-[12.5px] text-neutral-400">More businesses can be added as you grow. Each gets its own calendar, knowledge base, and Kan.</p>
      </div>
    </div>
  );
}
