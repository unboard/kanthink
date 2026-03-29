'use client';

import { useState } from 'react';
import { ConversationalSurface } from '@/components/reimagine/ConversationalSurface';
import { FocusLens } from '@/components/reimagine/FocusLens';

type Concept = 'talk' | 'focus';

export default function ReimaginePage() {
  const [concept, setConcept] = useState<Concept>('talk');

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col overflow-hidden">
      {/* Concept switcher */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-white/5 border border-white/8 rounded-full p-1">
        <button
          onClick={() => setConcept('talk')}
          className={`px-4 py-1.5 text-xs rounded-full transition-all ${
            concept === 'talk'
              ? 'bg-white/10 text-white/80'
              : 'text-white/30 hover:text-white/50'
          }`}
        >
          talk to your work
        </button>
        <button
          onClick={() => setConcept('focus')}
          className={`px-4 py-1.5 text-xs rounded-full transition-all ${
            concept === 'focus'
              ? 'bg-white/10 text-white/80'
              : 'text-white/30 hover:text-white/50'
          }`}
        >
          focus lens
        </button>
      </div>

      {concept === 'talk' ? <ConversationalSurface /> : <FocusLens />}
    </div>
  );
}
