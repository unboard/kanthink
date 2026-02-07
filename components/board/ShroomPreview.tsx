'use client';

import { useState } from 'react';
import type { InstructionAction } from '@/lib/types';

interface ShroomConfig {
  title: string;
  instructions: string;
  action: InstructionAction;
  targetColumnName: string;
  cardCount?: number;
}

interface ShroomPreviewProps {
  config: ShroomConfig;
  columnNames: string[];
  onApprove: (config: ShroomConfig) => void;
  onKeepChatting: () => void;
  approveLabel?: string;
}

const actionInfo: Record<InstructionAction, { label: string; icon: React.ReactNode; color: string }> = {
  generate: {
    label: 'Generate',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  },
  modify: {
    label: 'Modify',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  move: {
    label: 'Move',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
};

export function ShroomPreview({
  config,
  columnNames,
  onApprove,
  onKeepChatting,
  approveLabel = 'Create shroom',
}: ShroomPreviewProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [localConfig, setLocalConfig] = useState<ShroomConfig>(config);

  const info = actionInfo[localConfig.action];

  const handleFieldChange = (field: keyof ShroomConfig, value: string | number) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleApprove = () => {
    onApprove(localConfig);
  };

  return (
    <div className="space-y-3">
      {/* Config card */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 overflow-hidden">
        {/* Title */}
        <div className="px-4 pt-4 pb-2">
          {editingField === 'title' ? (
            <input
              autoFocus
              value={localConfig.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              onBlur={() => setEditingField(null)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
              className="text-base font-semibold bg-transparent border-b border-violet-400 outline-none text-neutral-900 dark:text-white w-full"
            />
          ) : (
            <h3
              onClick={() => setEditingField('title')}
              className="text-base font-semibold text-neutral-900 dark:text-white cursor-pointer hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              {localConfig.title}
            </h3>
          )}
        </div>

        {/* Action type + target */}
        <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
          {/* Action badge */}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${info.color}`}>
            {info.icon}
            {info.label}
          </span>

          {/* Arrow */}
          <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {/* Target column chip */}
          {editingField === 'targetColumnName' ? (
            <div className="flex flex-wrap gap-1">
              {columnNames.map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    handleFieldChange('targetColumnName', name);
                    setEditingField(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    localConfig.targetColumnName === name
                      ? 'bg-violet-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setEditingField('targetColumnName')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors"
            >
              {localConfig.targetColumnName}
            </button>
          )}

          {/* Card count (generate only) */}
          {localConfig.action === 'generate' && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => handleFieldChange('cardCount', Math.max(1, (localConfig.cardCount ?? 5) - 1))}
                className="w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-neutral-600 flex items-center justify-center"
              >
                -
              </button>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 w-14 text-center">
                {localConfig.cardCount ?? 5} cards
              </span>
              <button
                onClick={() => handleFieldChange('cardCount', Math.min(20, (localConfig.cardCount ?? 5) + 1))}
                className="w-5 h-5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-neutral-600 flex items-center justify-center"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="px-4 pb-4">
          {editingField === 'instructions' ? (
            <textarea
              autoFocus
              value={localConfig.instructions}
              onChange={(e) => handleFieldChange('instructions', e.target.value)}
              onBlur={() => setEditingField(null)}
              rows={4}
              className="w-full text-sm bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-violet-300 dark:border-violet-600 p-2.5 outline-none text-neutral-700 dark:text-neutral-300 resize-none"
            />
          ) : (
            <p
              onClick={() => setEditingField('instructions')}
              className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-2.5"
            >
              {localConfig.instructions}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          className="flex-1 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          {approveLabel}
        </button>
        <button
          onClick={onKeepChatting}
          className="px-4 py-2.5 rounded-lg bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          Keep chatting
        </button>
      </div>
    </div>
  );
}
