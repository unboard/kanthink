'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { X } from 'lucide-react';

interface Props {
  srcDoc: string;
  title: string;
}

/**
 * Full-viewport public playground render. The iframe gets the whole screen;
 * a tiny "Made with Kanthink" footer sits above it and can be dismissed
 * (per-visit) via localStorage.
 */
export function PublicPlaygroundFrame({ srcDoc, title }: Props) {
  const [hideFooter, setHideFooter] = useState(false);

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-modals allow-popups allow-forms"
        allow="autoplay; clipboard-write"
        className="flex-1 w-full border-0"
        title={title}
      />
      {!hideFooter && (
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-t border-neutral-200 bg-white text-xs">
          <Link href="/" className="flex items-center gap-1.5 text-neutral-600 hover:text-violet-600 transition-colors">
            <KanthinkIcon size={14} className="text-violet-500" />
            <span className="font-medium">Made with Kanthink</span>
          </Link>
          <button
            onClick={() => setHideFooter(true)}
            aria-label="Hide footer"
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
