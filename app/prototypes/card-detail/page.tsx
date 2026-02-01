'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { CardDetailDrawer } from '@/components/board/CardDetailDrawer';

export default function CardDetailPrototypePage() {
  const [isOpen, setIsOpen] = useState(true);
  const cards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);

  // Find the first available card to display
  const firstChannel = Object.values(channels)[0];
  const firstCard = Object.values(cards).find((c) => c.channelId === firstChannel?.id) ?? Object.values(cards)[0];

  // Keep drawer open
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => setIsOpen(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!firstCard) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-400">No cards found. Create a card in a channel first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <CardDetailDrawer
        card={firstCard}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
