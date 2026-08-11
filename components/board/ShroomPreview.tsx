'use client';

import { useState } from 'react';
import type { InstructionAction, ShroomEmailConfig } from '@/lib/types';
import { ShroomStepList, SHROOM_ACTION_INFO as actionInfo } from './ShroomStepList';

interface ShroomConfigStep {
  action: InstructionAction;
  targetColumnName: string;
  description: string;
  cardCount?: number;
}

interface ShroomConfig {
  title: string;
  instructions: string;
  action: InstructionAction;
  targetColumnName: string;
  cardCount?: number;
  steps?: ShroomConfigStep[];
  email?: ShroomEmailConfig;
}

interface ShroomPreviewProps {
  config: ShroomConfig;
  columnNames: string[];
  onApprove: (config: ShroomConfig) => void;
  onKeepChatting: () => void;
  approveLabel?: string;
}


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
        {localConfig.steps && localConfig.steps.length > 0 ? (
          /* Multi-step flow — same list the detail drawer shows afterwards */
          <div className="px-4 pb-3">
            <ShroomStepList
              steps={localConfig.steps.map((s) => ({
                action: s.action,
                columnName: s.targetColumnName,
                description: s.description,
              }))}
            />
          </div>
        ) : (
          /* Single action */
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
        )}

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

        {/* Email brief — only when the conversation actually set one up */}
        {localConfig.email?.enabled && localConfig.email.brief && (
          <div className="px-4 pb-4">
            <div className="rounded-lg border border-teal-200 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/20 p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
                  Emails you after each run
                </span>
              </div>
              {editingField === 'emailBrief' ? (
                <textarea
                  autoFocus
                  value={localConfig.email.brief}
                  onChange={(e) =>
                    setLocalConfig({
                      ...localConfig,
                      email: { ...localConfig.email!, brief: e.target.value },
                    })
                  }
                  onBlur={() => setEditingField(null)}
                  rows={3}
                  className="w-full text-xs bg-white dark:bg-neutral-800 rounded-md border border-teal-300 dark:border-teal-700 p-2 outline-none text-neutral-700 dark:text-neutral-300 resize-none"
                />
              ) : (
                <p
                  onClick={() => setEditingField('emailBrief')}
                  className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                >
                  {localConfig.email.brief}
                </p>
              )}
              {localConfig.email.skipWhenNothingHappened !== false && (
                <p className="mt-1.5 text-[11px] text-teal-700/70 dark:text-teal-400/60">
                  Skipped when a run changes nothing
                </p>
              )}
            </div>
          </div>
        )}
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
