'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import type { Channel, InstructionCard, InstructionAction, InstructionTarget, ContextColumnSelection, ID, AutomaticTrigger, AutomaticSafeguards, InstructionScope, ScheduleInterval, EventTrigger, ScheduledTrigger } from '@/lib/types';
import { useStore } from '@/lib/store';
import { calculateNextScheduledRun } from '@/lib/automationSafeguards';
import { REJECTION_REASONS } from '@/lib/constants';
import { Drawer } from '@/components/ui/Drawer';
import { Button, Textarea } from '@/components/ui';

const SKIP_LABELS: Record<string, string> = {
  daily_cap_reached: 'Skipped — daily limit reached',
  loop_prevention: 'Skipped — card was made by this shroom',
  cooldown_active: 'Skipped — ran too recently',
  not_enabled: 'Skipped — not set to run automatically',
};

interface ShroomLearnings {
  total: number;
  byReason: Record<string, number>;
  rejections: { id: string; cardTitle: string; reason?: string | null; feedback?: string | null; createdAt?: string }[];
}

interface InstructionDetailDrawerV2Props {
  instructionCard: InstructionCard | null;
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
  onRun: (card: InstructionCard) => Promise<void>;
  onPreview?: (card: InstructionCard) => Promise<void>;
  onChatWithKan?: (card: InstructionCard) => void;
}

/**
 * V2 Prototype: A more visual, less settings-heavy instruction editor.
 *
 * Key differences:
 * - Visual column selection using clickable chips
 * - Inline action selection as buttons, not radio buttons
 * - Instructions as the hero element
 * - Destination/context as a visual flow diagram
 * - Collapsible advanced settings
 */
export function InstructionDetailDrawerV2({
  instructionCard,
  channel,
  isOpen,
  onClose,
  onRun,
  onPreview,
  onChatWithKan,
}: InstructionDetailDrawerV2Props) {
  const { data: session } = useSession();
  const updateInstructionCard = useStore((s) => s.updateInstructionCard);
  const deleteInstructionCard = useStore((s) => s.deleteInstructionCard);
  const cards = useStore((s) => s.cards);
  const isAdminUser = session?.user?.isAdmin ?? false;

  // Local form state
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [summary, setSummary] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [action, setAction] = useState<InstructionAction>('generate');
  const [selectedColumnIds, setSelectedColumnIds] = useState<ID[]>([]);
  const [cardCount, setCardCount] = useState(5);
  const [contextAllColumns, setContextAllColumns] = useState(true);
  const [contextColumnIds, setContextColumnIds] = useState<ID[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  const [showLearnings, setShowLearnings] = useState(false);
  const [learnings, setLearnings] = useState<ShroomLearnings | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | undefined>();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePromptText, setImagePromptText] = useState('');

  // Cooldown / daily cap / loop prevention. Not surfaced in the UI — the defaults are
  // the guard rails, and the same values apply whether a run comes from cron, a card
  // landing, or the Run button.
  const [safeguards, setSafeguards] = useState<AutomaticSafeguards>({
    cooldownMinutes: 5,
    dailyCap: 50,
    preventLoops: true,
  });
  // Scope state
  const [scope, setScope] = useState<InstructionScope>('channel');

  // Global resource state (admin only)
  const [isGlobalResource, setIsGlobalResource] = useState(false);

  // Chain state
  const [nextInstructionId, setNextInstructionId] = useState<string | undefined>();
  const [autoApprove, setAutoApprove] = useState(false);
  const allInstructionCards = useStore((s) => s.instructionCards);

  // When this runs — the three modes cover everything the engine can actually do
  // unattended. Threshold and reaction triggers exist in the type but have no
  // server-side runner, so they'd be a promise the app can't keep.
  const [runWhen, setRunWhen] = useState<'manual' | 'card' | 'schedule'>('manual');
  const [watchColumnId, setWatchColumnId] = useState<ID>('');
  const [scheduleInterval, setScheduleInterval] = useState<ScheduleInterval>('daily');
  const [scheduleTime, setScheduleTime] = useState('09:00');

  // Email-after-run state
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailBrief, setEmailBrief] = useState('');
  const [emailSkipWhenEmpty, setEmailSkipWhenEmpty] = useState(true);
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testEmailError, setTestEmailError] = useState<string | null>(null);

  const isSyncingRef = useRef(false);
  const instructionCardId = instructionCard?.id;

  // Sync form state from props
  // Load what this shroom has learned from rejections
  useEffect(() => {
    if (!isOpen || !instructionCard) {
      setLearnings(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/channels/${channel.id}/instructions/${instructionCard.id}/learnings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setLearnings(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, instructionCard, channel.id]);

  useEffect(() => {
    if (instructionCard) {
      isSyncingRef.current = true;
      setTitle(instructionCard.title);
      setInstructions(instructionCard.instructions);
      setSummary(instructionCard.summary ?? '');
      setAction(instructionCard.action);
      setCardCount(instructionCard.cardCount ?? 5);

      const target = instructionCard.target;
      if (target.type === 'column') {
        setSelectedColumnIds([target.columnId]);
      } else if (target.type === 'columns') {
        setSelectedColumnIds(target.columnIds);
      } else {
        setSelectedColumnIds(channel.columns.map(c => c.id));
      }

      const ctx = instructionCard.contextColumns;
      if (!ctx || ctx.type === 'all') {
        setContextAllColumns(true);
        setContextColumnIds([]);
      } else {
        setContextAllColumns(false);
        setContextColumnIds(ctx.columnIds);
      }

      setSafeguards(instructionCard.safeguards || { cooldownMinutes: 5, dailyCap: 50, preventLoops: true });
      setScope(instructionCard.scope || 'channel');
      setIsGlobalResource(instructionCard.isGlobalResource || false);
      setCoverImageUrl(instructionCard.coverImageUrl);
      setNextInstructionId(instructionCard.nextInstructionId ?? undefined);
      setAutoApprove(instructionCard.autoApprove || false);

      const saved = instructionCard.triggers ?? [];
      const event = saved.find((t) => t.type === 'event') as EventTrigger | undefined;
      const scheduled = saved.find((t) => t.type === 'scheduled') as ScheduledTrigger | undefined;
      if (instructionCard.isEnabled && event) {
        setRunWhen('card');
        setWatchColumnId(event.columnId);
      } else if (instructionCard.isEnabled && scheduled) {
        setRunWhen('schedule');
        setScheduleInterval(scheduled.interval);
        setScheduleTime(scheduled.specificTime || '09:00');
      } else {
        setRunWhen('manual');
      }
      if (!event) {
        // Default the watched column to whatever the shroom already acts on
        const t = instructionCard.target;
        setWatchColumnId(
          t.type === 'column' ? t.columnId
            : t.type === 'columns' ? (t.columnIds[0] ?? channel.columns[0]?.id ?? '')
            : channel.columns[0]?.id ?? ''
        );
      }

      setEmailEnabled(instructionCard.emailConfig?.enabled ?? false);
      setEmailBrief(instructionCard.emailConfig?.brief ?? '');
      setEmailSkipWhenEmpty(instructionCard.emailConfig?.skipWhenNothingHappened !== false);
      setTestEmailState('idle');
      setTestEmailError(null);

      setTimeout(() => { isSyncingRef.current = false; }, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructionCardId]);

  // Auto-save on changes
  useEffect(() => {
    if (!isSyncingRef.current && instructionCard) {
      handleSave();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextAllColumns, contextColumnIds, selectedColumnIds, action]);

  const handleSave = () => {
    if (!instructionCard) return;

    let target: InstructionTarget;
    if (selectedColumnIds.length === 0) {
      target = { type: 'column', columnId: channel.columns[0]?.id || '' };
    } else if (selectedColumnIds.length === 1) {
      target = { type: 'column', columnId: selectedColumnIds[0] };
    } else if (selectedColumnIds.length === channel.columns.length) {
      target = { type: 'board' };
    } else {
      target = { type: 'columns', columnIds: selectedColumnIds };
    }

    const contextColumns: ContextColumnSelection | null = contextAllColumns
      ? null
      : { type: 'columns', columnIds: contextColumnIds };

    // "When a card lands in X" means both ways a card can arrive — typed in, or dragged
    // over from another column. Two triggers, one idea, so the user never has to know
    // the difference.
    const nextTriggers: AutomaticTrigger[] =
      runWhen === 'card' && watchColumnId
        ? [
            { type: 'event', eventType: 'card_created_in', columnId: watchColumnId },
            { type: 'event', eventType: 'card_moved_to', columnId: watchColumnId },
          ]
        : runWhen === 'schedule'
          ? [{ type: 'scheduled', interval: scheduleInterval, specificTime: scheduleTime }]
          : [];

    const nextEnabled = nextTriggers.length > 0;

    updateInstructionCard(instructionCard.id, {
      title,
      instructions,
      summary: summary.trim() || undefined,
      action,
      target,
      contextColumns,
      runMode: nextEnabled ? 'automatic' : 'manual',
      cardCount: action === 'generate' ? cardCount : undefined,
      triggers: nextTriggers,
      safeguards,
      isEnabled: nextEnabled,
      // Cron only picks up a shroom whose next run is due, so a schedule that never gets
      // a first due-date would sit there looking enabled and never fire.
      nextScheduledRun:
        runWhen === 'schedule'
          ? calculateNextScheduledRun(scheduleInterval, scheduleTime).toISOString()
          : undefined,
      scope,
      isGlobalResource,
      coverImageUrl,
      nextInstructionId: nextInstructionId || undefined,
      autoApprove,
      // Untouched shrooms shouldn't carry an empty email object around
      emailConfig: emailEnabled || emailBrief.trim()
        ? { enabled: emailEnabled, brief: emailBrief, skipWhenNothingHappened: emailSkipWhenEmpty }
        : undefined,
    });
  };

  const handleGenerateSummary = async () => {
    if (!instructionCard || isSummaryLoading) return;
    if (!instructions.trim()) {
      setSummaryError('Write the instructions first — there is nothing to summarise yet.');
      return;
    }
    setIsSummaryLoading(true);
    setSummaryError(null);
    try {
      // Save first: the generator reads the instructions from the database, so an
      // unsaved edit in the textarea would otherwise be summarised from the old text.
      handleSave();
      const res = await fetch('/api/shroom-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructionId: instructionCard.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.summary) {
        setSummaryError(data.error || 'Could not generate a summary.');
        return;
      }
      setSummary(data.summary);
      // Persist immediately. The textarea saves on blur, and a button press that
      // visibly changes the field but only saves if you click elsewhere afterwards
      // is the kind of thing that quietly loses work.
      updateInstructionCard(instructionCard.id, { summary: data.summary });
    } catch {
      setSummaryError('Could not reach the server.');
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!instructionCard || testEmailState === 'sending') return;
    handleSave();
    setTestEmailState('sending');
    setTestEmailError(null);
    try {
      const res = await fetch(
        `/api/channels/${channel.id}/instructions/${instructionCard.id}/test-email`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestEmailError(data.error || 'Could not send the test email.');
        setTestEmailState('error');
        return;
      }
      setTestEmailState('sent');
    } catch {
      setTestEmailError('Could not reach the server.');
      setTestEmailState('error');
    }
  };

  const [isPreviewing, setIsPreviewing] = useState(false);

  const handleRun = async () => {
    if (!instructionCard || isRunning) return;
    handleSave();
    setIsRunning(true);
    try {
      await onRun(instructionCard);
    } finally {
      setIsRunning(false);
    }
  };

  const handlePreview = async () => {
    if (!instructionCard || isRunning || isPreviewing || !onPreview) return;
    handleSave();
    setIsPreviewing(true);
    try {
      await onPreview(instructionCard);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDelete = () => {
    if (!instructionCard) return;
    if (confirm('Delete this action?')) {
      deleteInstructionCard(instructionCard.id);
      onClose();
    }
  };

  const toggleColumn = (columnId: ID) => {
    setSelectedColumnIds(prev =>
      prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]
    );
  };

  const toggleContextColumn = (columnId: ID) => {
    setContextColumnIds(prev =>
      prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]
    );
  };

  if (!instructionCard) return null;

  const actionLabels: Record<InstructionAction, { label: string; icon: React.ReactNode; description: string }> = {
    generate: {
      label: 'Generate',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
      description: 'Create new cards',
    },
    modify: {
      label: 'Modify',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      description: 'Update existing cards',
    },
    move: {
      label: 'Move',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      description: 'Move cards between columns',
    },
    report: {
      label: 'Report',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      description: 'Summarize what is happening, without changing cards',
    },
  };

  // Count cards in selected columns for preview
  const cardsInSelectedColumns = channel.columns
    .filter(c => selectedColumnIds.includes(c.id))
    .reduce((sum, c) => sum + c.cardIds.length, 0);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} width="md" floating>
      <div className="flex flex-col h-full">
        {/* Header with Shrooms branding */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-white dark:bg-neutral-900 flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <img
            src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
            alt=""
            className="w-8 h-8 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-neutral-900 dark:text-white">
              Shrooms
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              AI-powered actions for your board
            </p>
          </div>
          {onChatWithKan && instructionCard && (
            <button
              onClick={() => onChatWithKan(instructionCard)}
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
              title="Chat with Kan"
            >
              <img
                src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                alt=""
                className="w-4 h-4"
              />
              Chat
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Cover image */}
          <div className="relative group">
            {coverImageUrl ? (
              <div className="relative rounded-xl overflow-hidden aspect-[2/1] bg-neutral-800">
                <img src={coverImageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={async () => {
                      setIsGeneratingImage(true);
                      try {
                        const res = await fetch('/api/generate-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ context: title || 'shroom', type: 'shroom' }),
                        });
                        const data = await res.json();
                        if (data.url) { setCoverImageUrl(data.url); setTimeout(handleSave, 0); }
                      } finally { setIsGeneratingImage(false); }
                    }}
                    disabled={isGeneratingImage}
                    className="px-3 py-1.5 rounded-lg bg-white/90 text-neutral-900 text-xs font-medium hover:bg-white transition-colors"
                  >
                    {isGeneratingImage ? 'Generating...' : 'Regenerate'}
                  </button>
                  <button
                    onClick={() => { setCoverImageUrl(undefined); setTimeout(handleSave, 0); }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium hover:bg-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                {isGeneratingImage && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setIsGeneratingImage(true);
                      try {
                        const res = await fetch('/api/generate-image', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ context: title || 'shroom', type: 'shroom' }),
                        });
                        const data = await res.json();
                        if (data.url) { setCoverImageUrl(data.url); setTimeout(handleSave, 0); }
                      } finally { setIsGeneratingImage(false); }
                    }}
                    disabled={isGeneratingImage}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-400 transition-colors"
                  >
                    {isGeneratingImage ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Generating...
                      </span>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Generate cover
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowImagePrompt(!showImagePrompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Custom prompt
                  </button>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-400 transition-colors cursor-pointer">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const form = new FormData();
                        form.append('file', file);
                        const res = await fetch('/api/upload-image', { method: 'POST', body: form });
                        const data = await res.json();
                        if (data.url) { setCoverImageUrl(data.url); setTimeout(handleSave, 0); }
                      }}
                    />
                  </label>
                </div>
                {showImagePrompt && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={imagePromptText}
                      onChange={(e) => setImagePromptText(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && imagePromptText.trim()) {
                          setIsGeneratingImage(true);
                          try {
                            const res = await fetch('/api/generate-image', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ prompt: imagePromptText.trim() }),
                            });
                            const data = await res.json();
                            if (data.url) { setCoverImageUrl(data.url); setTimeout(handleSave, 0); }
                          } finally {
                            setIsGeneratingImage(false);
                            setShowImagePrompt(false);
                            setImagePromptText('');
                          }
                        }
                      }}
                      placeholder="Describe the image you want..."
                      className="flex-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:border-violet-500/40"
                    />
                    <button
                      onClick={async () => {
                        if (!imagePromptText.trim()) return;
                        setIsGeneratingImage(true);
                        try {
                          const res = await fetch('/api/generate-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt: imagePromptText.trim() }),
                          });
                          const data = await res.json();
                          if (data.url) { setCoverImageUrl(data.url); setTimeout(handleSave, 0); }
                        } finally {
                          setIsGeneratingImage(false);
                          setShowImagePrompt(false);
                          setImagePromptText('');
                        }
                      }}
                      disabled={!imagePromptText.trim() || isGeneratingImage}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Generate
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shroom name input */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleSave}
            placeholder="Action name..."
            className="text-lg font-semibold bg-transparent border-none outline-none text-neutral-900 dark:text-white placeholder:text-neutral-400 w-full"
          />
          {/* Action Type - Button Group. Four actions don't fit a phone width, so the row
              scrolls sideways; the negative margin lets it bleed to the drawer edges so it
              reads as scrollable rather than clipped. */}
          <div className="flex gap-2 overflow-x-auto -mx-6 px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(Object.entries(actionLabels) as [InstructionAction, typeof actionLabels['generate']][]).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => setAction(key)}
                className={`flex flex-shrink-0 items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  action === key
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Instructions - The Hero */}
          <div>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              onBlur={handleSave}
              placeholder={
                action === 'generate'
                  ? 'Describe what cards to create...'
                  : action === 'modify'
                    ? 'Describe how to modify the cards...'
                    : 'Describe when cards should be moved...'
              }
              rows={5}
              className="text-base"
            />
          </div>

          {/* Board summary. Without one the card falls back to `instructions`, which is
              written to the model rather than to a person and reads as a clipped fragment. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                Card summary
              </span>
              <button
                onClick={handleGenerateSummary}
                disabled={isSummaryLoading}
                className="text-xs font-medium px-2.5 py-1 rounded-lg text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 disabled:opacity-50 transition-colors"
              >
                {isSummaryLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>
            <Textarea
              value={summary}
              onChange={(e) => { setSummary(e.target.value); setSummaryError(null); }}
              onBlur={handleSave}
              placeholder="One line describing what this does, shown on the board card."
              rows={2}
              className="text-sm"
            />
            {summaryError ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{summaryError}</p>
            ) : (
              !summary.trim() && (
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  Empty, so the board shows the instructions instead.
                </p>
              )
            )}
          </div>

          {/* Visual Flow: Context → Action → Destination */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 space-y-4">
            {/* Destination Columns */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  {action === 'generate' ? 'Add to' : action === 'modify' ? 'Modify in' : 'Move from'}
                </span>
                {action === 'generate' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCardCount(Math.max(1, cardCount - 1))}
                      className="w-6 h-6 rounded bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-600"
                    >
                      -
                    </button>
                    <span className="text-sm text-neutral-600 dark:text-neutral-400 w-12 text-center">
                      {cardCount} cards
                    </span>
                    <button
                      onClick={() => setCardCount(Math.min(20, cardCount + 1))}
                      className="w-6 h-6 rounded bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-600"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {channel.columns.map((col) => {
                  const isSelected = selectedColumnIds.includes(col.id);
                  const cardCount = col.cardIds.length;
                  return (
                    <button
                      key={col.id}
                      onClick={() => toggleColumn(col.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-white dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600 border border-neutral-200 dark:border-neutral-600'
                      }`}
                    >
                      {col.name}
                      {(action === 'modify' || action === 'move') && isSelected && cardCount > 0 && (
                        <span className="ml-1.5 text-xs opacity-70">({cardCount})</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {(action === 'modify' || action === 'move') && cardsInSelectedColumns > 0 && (
                <p className="text-xs text-neutral-500 mt-2">
                  {cardsInSelectedColumns} card{cardsInSelectedColumns !== 1 ? 's' : ''} will be affected
                </p>
              )}
            </div>

            {/* Divider with arrow */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
              <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <div className="flex-1 border-t border-neutral-200 dark:border-neutral-700" />
            </div>

            {/* Context Columns (what AI sees) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  AI Reads From
                </span>
                <button
                  onClick={() => {
                    setContextAllColumns(!contextAllColumns);
                    if (!contextAllColumns) setContextColumnIds([]);
                  }}
                  className={`text-xs px-2 py-0.5 rounded ${
                    contextAllColumns
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                      : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
                  }`}
                >
                  {contextAllColumns ? 'All' : 'Custom'}
                </button>
              </div>
              {contextAllColumns ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  AI can see all {channel.columns.length} columns for context
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {channel.columns.map((col) => {
                    const isSelected = contextColumnIds.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        onClick={() => toggleContextColumn(col.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          isSelected
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-white dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-600 border border-dashed border-neutral-300 dark:border-neutral-600'
                        }`}
                      >
                        {col.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* When this runs. Three options, phrased as sentences, because "does this
              happen on its own?" is the first thing anyone wants to know about an
              automation — and it used to be a checkbox that did nothing. */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-3">
              When this runs
            </h3>
            <div className="space-y-2">
              {([
                { key: 'manual', label: 'Only when I run it' },
                { key: 'card', label: 'When a card lands in' },
                { key: 'schedule', label: 'On a schedule' },
              ] as const).map(({ key, label }) => {
                const selected = runWhen === key;
                return (
                  <div
                    key={key}
                    className={`rounded-xl border transition-colors ${
                      selected
                        ? 'border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-950/20'
                        : 'border-neutral-200 dark:border-neutral-800'
                    }`}
                  >
                    <button
                      onClick={() => { setRunWhen(key); setTimeout(() => handleSave(), 0); }}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
                    >
                      <span
                        className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selected
                            ? 'border-violet-500'
                            : 'border-neutral-300 dark:border-neutral-600'
                        }`}
                      >
                        {selected && <span className="w-2 h-2 rounded-full bg-violet-500" />}
                      </span>
                      <span className={`text-sm ${selected ? 'font-medium text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>
                        {label}
                      </span>
                    </button>

                    {selected && key === 'card' && (
                      <div className="px-3.5 pb-3 pl-10">
                        <select
                          value={watchColumnId}
                          onChange={(e) => { setWatchColumnId(e.target.value); setTimeout(() => handleSave(), 0); }}
                          className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-violet-500"
                        >
                          {channel.columns.map((col) => (
                            <option key={col.id} value={col.id}>{col.name}</option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                          Runs whether or not you have Kanthink open. Cards this shroom
                          created itself won&apos;t set it off again.
                        </p>
                      </div>
                    )}

                    {selected && key === 'schedule' && (
                      <div className="px-3.5 pb-3 pl-10 flex flex-wrap items-center gap-2">
                        <select
                          value={scheduleInterval}
                          onChange={(e) => { setScheduleInterval(e.target.value as ScheduleInterval); setTimeout(() => handleSave(), 0); }}
                          className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-violet-500"
                        >
                          <option value="hourly">Every hour</option>
                          <option value="every4hours">Every 4 hours</option>
                          <option value="daily">Every day</option>
                          <option value="weekly">Every week</option>
                        </select>
                        {(scheduleInterval === 'daily' || scheduleInterval === 'weekly') && (
                          <>
                            <span className="text-sm text-neutral-500">at</span>
                            <input
                              type="time"
                              value={scheduleTime}
                              onChange={(e) => { setScheduleTime(e.target.value); setTimeout(() => handleSave(), 0); }}
                              className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-violet-500"
                            />
                          </>
                        )}
                        <p className="w-full mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                          Runs on the server, so it happens even with every tab closed.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversation History - Collapsible */}
          {instructionCard.conversationHistory && instructionCard.conversationHistory.length > 0 && (
            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
              <button
                onClick={() => setShowConversationHistory(!showConversationHistory)}
                className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showConversationHistory ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <img
                  src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                  alt=""
                  className="w-4 h-4"
                />
                Conversation history ({instructionCard.conversationHistory.length} messages)
              </button>
              {showConversationHistory && (
                <div className="mt-3 space-y-2 pl-6">
                  {instructionCard.conversationHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <img
                          src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                          alt="Kan"
                          className="w-5 h-5 flex-shrink-0 mt-0.5"
                        />
                      )}
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Advanced Settings - Collapsible */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced settings
            </button>
            {showAdvanced && (
              <div className="mt-4 space-y-4 pl-6">
                {/* Scope selection */}
                <div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">
                    Visibility
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setScope('channel');
                        setTimeout(() => handleSave(), 0);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        scope === 'channel'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                      This Channel
                    </button>
                    <button
                      onClick={() => {
                        setScope('global');
                        setTimeout(() => handleSave(), 0);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        scope === 'global'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                      </svg>
                      Global
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">
                    {scope === 'channel'
                      ? 'Only visible and runnable in this channel'
                      : 'Visible in Shrooms panel and runnable on any channel'}
                  </p>
                </div>

                {/* Automatic execution toggle */}
                {/* "Run automatically" used to live here as a checkbox with no trigger
                    editor behind it, so ticking it did nothing. Scheduling and card
                    triggers are now the "When this runs" control above. */}

                {/* Auto-approve: skip review queue for generate shrooms */}
                {action === 'generate' && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoApprove}
                      onChange={(e) => {
                        setAutoApprove(e.target.checked);
                        setTimeout(() => handleSave(), 0);
                      }}
                      className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Auto-approve cards
                      </span>
                      <p className="text-xs text-neutral-500">
                        Skip the review queue and create cards directly
                      </p>
                    </div>
                  </label>
                )}

                {/* Chain: Then run another shroom */}
                <div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">
                    Then run
                  </span>
                  <select
                    value={nextInstructionId || ''}
                    onChange={(e) => {
                      setNextInstructionId(e.target.value || undefined);
                      setTimeout(() => handleSave(), 0);
                    }}
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="">None (no chain)</option>
                    {Object.values(allInstructionCards)
                      .filter(ic => ic.channelId === channel.id && ic.id !== instructionCard?.id)
                      .map(ic => (
                        <option key={ic.id} value={ic.id}>{ic.title}</option>
                      ))
                    }
                  </select>
                  <p className="text-xs text-neutral-500 mt-1">
                    Automatically run another shroom after this one completes (max chain depth: 5)
                  </p>
                </div>

                {/* Admin-only: Share as Kanthink Resource */}
                {isAdminUser && (
                  <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4 mt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isGlobalResource}
                        onChange={(e) => {
                          setIsGlobalResource(e.target.checked);
                          setTimeout(() => handleSave(), 0);
                        }}
                        className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Share as Kanthink Resource
                        </span>
                        <p className="text-xs text-neutral-500">
                          This shroom will be available to all users and marked as &quot;by Kanthink&quot;
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Email after run. The brief is prose, not a template — Kan writes the actual
              email per run from this plus what the run found. */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 px-6 py-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => { setEmailEnabled(e.target.checked); }}
                onBlur={handleSave}
                className="mt-0.5 w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-violet-600 focus:ring-violet-500"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Email me after this runs
                </span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Goes to the board owner&apos;s account email.
                </span>
              </span>
            </label>

            {emailEnabled && (
              <div className="pl-7 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                    What should the email say?
                  </label>
                  <Textarea
                    value={emailBrief}
                    onChange={(e) => setEmailBrief(e.target.value)}
                    onBlur={handleSave}
                    placeholder="e.g. Short summary of what came in. Lead with anything urgent, then up to five bullets. Casual tone, under 150 words."
                    rows={3}
                    className="text-sm"
                  />
                  <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Describe the email, don&apos;t write it — Kan composes each one from this
                    plus what the run actually found.
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailSkipWhenEmpty}
                    onChange={(e) => { setEmailSkipWhenEmpty(e.target.checked); }}
                    onBlur={handleSave}
                    className="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">
                    Skip the email when a run changes nothing
                  </span>
                </label>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSendTestEmail}
                    disabled={testEmailState === 'sending' || !emailBrief.trim()}
                    className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testEmailState === 'sending' ? 'Sending…' : 'Send me a test'}
                  </button>
                  {testEmailState === 'sent' && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Sent — check your inbox
                    </span>
                  )}
                  {testEmailState === 'error' && testEmailError && (
                    <span className="text-xs text-red-500 dark:text-red-400">{testEmailError}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Recent activity. An automatic shroom is invisible by nature — if it declines
              to run (daily cap, loop prevention) the only other evidence is a server log,
              which makes "not running" and "broken" look identical from here. */}
          {(instructionCard.executionHistory?.length ?? 0) > 0 && (
            <div className="border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-3">
                Recent activity
              </h3>
              <ul className="space-y-1.5">
                {instructionCard.executionHistory!.slice(0, 6).map((run, i) => (
                  <li key={`${run.timestamp}-${i}`} className="flex items-baseline gap-2 text-xs">
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        run.skippedReason
                          ? 'bg-amber-400'
                          : run.success
                            ? 'bg-green-500'
                            : 'bg-red-400'
                      }`}
                    />
                    <span className="text-neutral-600 dark:text-neutral-400 flex-1">
                      {run.skippedReason
                        ? SKIP_LABELS[run.skippedReason] ?? 'Skipped'
                        : run.success
                          ? `Ran on ${run.cardsAffected} card${run.cardsAffected === 1 ? '' : 's'}`
                          : 'Failed'}
                      <span className="text-neutral-400 dark:text-neutral-500"> · {run.triggeredBy}</span>
                    </span>
                    <span className="text-neutral-400 dark:text-neutral-500 flex-shrink-0">
                      {new Date(run.timestamp).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What this shroom has learned from rejections — the same rows that get
              injected into its prompts, so the feedback loop is visible. */}
          {learnings && learnings.total > 0 && (
            <div className="border-t border-neutral-100 dark:border-neutral-800">
              <button
                onClick={() => setShowLearnings(!showLearnings)}
                className="w-full flex items-center gap-2 px-6 py-4 text-left"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showLearnings ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex-1">
                  What this shroom has learned
                </span>
                <span className="text-xs text-neutral-400">{learnings.total}</span>
              </button>

              {showLearnings && (
                <div className="px-6 pb-5 space-y-3">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Cards you rejected. This history goes into the shroom&apos;s prompt so it
                    stops producing more like them.
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(learnings.byReason).map(([reason, count]) => (
                      <span
                        key={reason}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                      >
                        {REJECTION_REASONS.find((r) => r.key === reason)?.label ?? 'No reason given'} · {count}
                      </span>
                    ))}
                  </div>

                  <ul className="space-y-2">
                    {learnings.rejections.slice(0, 10).map((r) => (
                      <li key={r.id} className="text-xs">
                        <span className="text-neutral-700 dark:text-neutral-300 line-through">{r.cardTitle}</span>
                        {r.feedback && (
                          <span className="block text-neutral-500 dark:text-neutral-400 mt-0.5">
                            &ldquo;{r.feedback}&rdquo;
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-neutral-100 dark:border-neutral-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete
          </Button>
          <div className="flex items-center gap-2">
            {onPreview && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreview}
                disabled={isPreviewing || isRunning}
                className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20"
              >
                {isPreviewing ? 'Previewing...' : 'Preview'}
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleRun}
              disabled={isRunning || isPreviewing}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isRunning ? 'Running...' : 'Run'}
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
