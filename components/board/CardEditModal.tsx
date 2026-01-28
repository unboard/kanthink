'use client';

import { useState, useEffect } from 'react';
import type { Card } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Button, Input, Modal } from '@/components/ui';

interface CardEditModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CardEditModal({ card, isOpen, onClose }: CardEditModalProps) {
  const [title, setTitle] = useState('');
  const updateCard = useStore((s) => s.updateCard);
  const deleteCard = useStore((s) => s.deleteCard);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
    }
  }, [card]);

  const handleSave = () => {
    if (!card || !title.trim()) return;
    updateCard(card.id, { title: title.trim() });
    onClose();
  };

  const handleDelete = () => {
    if (!card) return;
    deleteCard(card.id);
    onClose();
  };

  if (!card) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit card">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <p className="text-xs text-neutral-500">
          Open the card detail view to add notes or chat with AI.
        </p>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950">
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!title.trim()}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
