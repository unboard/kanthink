'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { processCard } from '@/lib/ai/processCard';
import type { ID } from '@/lib/types';
import { Button } from '@/components/ui';

interface CardCreateFormProps {
  channelId: ID;
  columnId: ID;
  onClose: () => void;
}

export function CardCreateForm({ channelId, columnId, onClose }: CardCreateFormProps) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const createCard = useStore((s) => s.createCard);
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const setCardProcessing = useStore((s) => s.setCardProcessing);
  const setCardProperties = useStore((s) => s.setCardProperties);
  const addQuestion = useStore((s) => s.addQuestion);

  const channel = channels[channelId];
  const column = channel?.columns.find((c) => c.id === columnId);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !column) return;
    const newCard = createCard(channelId, columnId, { title: title.trim() });
    setTitle('');
    onClose();

    // Auto-process if column has autoProcess enabled
    if (column.autoProcess && column.processingPrompt && channel) {
      setCardProcessing(newCard.id, true);

      try {
        const result = await processCard(newCard, column, channel);

        if (result.success) {
          // Get fresh card data
          const currentCard = cards[newCard.id] ?? newCard;
          const existingProps = currentCard.properties ?? [];
          const newPropsMap = new Map(result.properties.map((p) => [p.key, p]));

          for (const prop of existingProps) {
            if (!newPropsMap.has(prop.key)) {
              newPropsMap.set(prop.key, prop);
            }
          }

          setCardProperties(newCard.id, Array.from(newPropsMap.values()));

          for (const suggestion of result.suggestedProperties) {
            addQuestion(channelId, {
              question: `Add "${suggestion.label}" property to this channel?`,
              context: suggestion.reason,
              status: 'pending',
              suggestedAnswers: ['Yes, add it', 'No, skip'],
            });
          }
        }
      } finally {
        setCardProcessing(newCard.id, false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
      setTitle('');
    }
  };

  return (
    <div className="rounded-md bg-white p-2 shadow-sm dark:bg-neutral-900">
      <input
        ref={inputRef}
        type="text"
        placeholder="Card title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-neutral-200 bg-transparent px-2 py-1.5 text-sm focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onClose();
            setTitle('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
