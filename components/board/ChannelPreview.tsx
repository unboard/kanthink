'use client';

import { useState } from 'react';
import type { ChannelConfig, ChannelConfigColumn, ChannelConfigShroom } from '@/lib/channelCreation/extractChannelConfig';

interface ChannelPreviewProps {
  config: ChannelConfig;
  onApprove: (config: ChannelConfig) => void;
  onKeepChatting: () => void;
  /** Dark theme for overlay context (ConversationalWelcome) */
  dark?: boolean;
}

const actionLabels: Record<string, { label: string; color: string }> = {
  generate: { label: 'Generate', color: 'bg-violet-500/20 text-violet-300' },
  modify: { label: 'Modify', color: 'bg-amber-500/20 text-amber-300' },
  move: { label: 'Move', color: 'bg-blue-500/20 text-blue-300' },
};

export function ChannelPreview({
  config,
  onApprove,
  onKeepChatting,
  dark = false,
}: ChannelPreviewProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [localConfig, setLocalConfig] = useState<ChannelConfig>(config);

  const updateField = <K extends keyof ChannelConfig>(field: K, value: ChannelConfig[K]) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
  };

  const updateColumn = (index: number, updates: Partial<ChannelConfigColumn>) => {
    setLocalConfig(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) => i === index ? { ...col, ...updates } : col),
    }));
  };

  const updateShroom = (index: number, updates: Partial<ChannelConfigShroom>) => {
    setLocalConfig(prev => ({
      ...prev,
      shrooms: prev.shrooms.map((s, i) => i === index ? { ...s, ...updates } : s),
    }));
  };

  // Style classes for dark overlay context
  const cardBg = dark
    ? 'bg-neutral-900/80 border-neutral-700'
    : 'bg-white dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700';
  const textPrimary = dark ? 'text-white' : 'text-neutral-900 dark:text-white';
  const textSecondary = dark ? 'text-neutral-400' : 'text-neutral-600 dark:text-neutral-400';
  const textMuted = dark ? 'text-neutral-500' : 'text-neutral-500 dark:text-neutral-500';
  const inputBorder = dark ? 'border-violet-500' : 'border-violet-400';
  const inputBg = dark ? 'bg-neutral-800' : 'bg-neutral-50 dark:bg-neutral-800';
  const sectionBg = dark ? 'bg-neutral-800/50' : 'bg-neutral-50 dark:bg-neutral-800/50';

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border ${cardBg} overflow-hidden`}>
        {/* Channel name */}
        <div className="px-4 pt-4 pb-1">
          {editingField === 'name' ? (
            <input
              autoFocus
              value={localConfig.name}
              onChange={(e) => updateField('name', e.target.value)}
              onBlur={() => setEditingField(null)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
              className={`text-base font-semibold bg-transparent border-b ${inputBorder} outline-none ${textPrimary} w-full`}
            />
          ) : (
            <h3
              onClick={() => setEditingField('name')}
              className={`text-base font-semibold ${textPrimary} cursor-pointer hover:text-violet-400 transition-colors`}
            >
              {localConfig.name}
            </h3>
          )}
        </div>

        {/* Description */}
        <div className="px-4 pb-3">
          {editingField === 'description' ? (
            <input
              autoFocus
              value={localConfig.description}
              onChange={(e) => updateField('description', e.target.value)}
              onBlur={() => setEditingField(null)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
              className={`text-sm bg-transparent border-b ${inputBorder} outline-none ${textSecondary} w-full`}
            />
          ) : (
            <p
              onClick={() => setEditingField('description')}
              className={`text-sm ${textSecondary} cursor-pointer hover:text-violet-400 transition-colors`}
            >
              {localConfig.description || 'Add a description...'}
            </p>
          )}
        </div>

        {/* Columns */}
        <div className="px-4 pb-3">
          <p className={`text-[11px] font-medium uppercase tracking-wider ${textMuted} mb-2`}>Columns</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {localConfig.columns.map((col, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && (
                  <svg className={`w-3 h-3 ${textMuted} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
                {editingField === `column-${i}` ? (
                  <input
                    autoFocus
                    value={col.name}
                    onChange={(e) => updateColumn(i, { name: e.target.value })}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                    className={`text-xs bg-transparent border-b ${inputBorder} outline-none ${textPrimary} w-20`}
                  />
                ) : (
                  <button
                    onClick={() => setEditingField(`column-${i}`)}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                      col.isAiTarget
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        : dark
                          ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                          : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
                    }`}
                  >
                    {col.name}
                    {col.isAiTarget && (
                      <span className="ml-1 text-[9px] opacity-70">AI</span>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Shrooms */}
        {localConfig.shrooms.length > 0 && (
          <div className="px-4 pb-3">
            <p className={`text-[11px] font-medium uppercase tracking-wider ${textMuted} mb-2`}>Shrooms</p>
            <div className="space-y-1.5">
              {localConfig.shrooms.map((shroom, i) => {
                const info = actionLabels[shroom.action] || actionLabels.generate;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${info.color}`}>
                      {info.label}
                    </span>
                    {editingField === `shroom-${i}` ? (
                      <input
                        autoFocus
                        value={shroom.title}
                        onChange={(e) => updateShroom(i, { title: e.target.value })}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                        className={`text-xs bg-transparent border-b ${inputBorder} outline-none ${textPrimary} flex-1`}
                      />
                    ) : (
                      <span
                        onClick={() => setEditingField(`shroom-${i}`)}
                        className={`text-xs ${textSecondary} cursor-pointer hover:text-violet-400 transition-colors`}
                      >
                        {shroom.title}
                      </span>
                    )}
                    <span className={`text-[10px] ${textMuted} ml-auto flex-shrink-0`}>
                      → {shroom.targetColumnName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Instructions (collapsible) */}
        <div className="px-4 pb-4">
          <details>
            <summary className={`text-[11px] font-medium uppercase tracking-wider ${textMuted} mb-2 cursor-pointer hover:text-violet-400 transition-colors`}>
              Instructions
            </summary>
            {editingField === 'instructions' ? (
              <textarea
                autoFocus
                value={localConfig.instructions}
                onChange={(e) => updateField('instructions', e.target.value)}
                onBlur={() => setEditingField(null)}
                rows={4}
                className={`w-full text-sm ${inputBg} rounded-lg border ${inputBorder} p-2.5 outline-none ${textSecondary} resize-none`}
              />
            ) : (
              <p
                onClick={() => setEditingField('instructions')}
                className={`text-sm ${textSecondary} leading-relaxed cursor-pointer hover:text-violet-400 transition-colors ${sectionBg} rounded-lg p-2.5`}
              >
                {localConfig.instructions || 'No instructions set'}
              </p>
            )}
          </details>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(localConfig)}
          className="flex-1 px-4 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          Create Channel
        </button>
        <button
          onClick={onKeepChatting}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            dark
              ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
          }`}
        >
          Keep chatting
        </button>
      </div>
    </div>
  );
}
