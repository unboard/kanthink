'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Channel, ID, Card as CardType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { Drawer } from '@/components/ui';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { useKeyboardOffset } from './ChatInput';

interface ChannelActionsDrawerProps {
  channel: Channel;
  isOpen: boolean;
  onClose: () => void;
}

type ActionType = 'newsletter' | 'course' | 'blog' | null;
type GenerationState = 'idle' | 'generating' | 'preview' | 'sending' | 'sent' | 'error';

interface ChatMessage {
  role: 'user' | 'kan';
  content: string;
}

export function ChannelActionsDrawer({ channel, isOpen, onClose }: ChannelActionsDrawerProps) {
  const allCards = useStore((s) => s.cards);
  const allTasks = useStore((s) => s.tasks);
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [genState, setGenState] = useState<GenerationState>('idle');
  const [generatedContent, setGeneratedContent] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [error, setError] = useState('');
  const [selectedColumnIds, setSelectedColumnIds] = useState<Set<string>>(new Set());
  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeTasks, setIncludeTasks] = useState(false);
  // Generate with Kan chat mode
  const [kanMode, setKanMode] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const { keyboardOffset, onFocus: kbFocus, onBlur: kbBlur } = useKeyboardOffset();

  // Get all cards organized by column (including archived if enabled)
  const columnCards = useMemo(() => {
    return channel.columns.map((col) => {
      const activeIds = col.itemOrder || col.cardIds || [];
      const archivedIds = includeArchived ? (col.backsideCardIds || []) : [];
      const allIds = [...activeIds, ...archivedIds];
      const cards = allIds
        .map((id) => allCards[id])
        .filter(Boolean) as CardType[];
      return { column: col, cards, archivedCount: (col.backsideCardIds || []).length };
    });
  }, [channel, allCards, includeArchived]);

  const totalCards = useMemo(() =>
    columnCards.reduce((sum, { cards }) => sum + cards.length, 0),
    [columnCards]
  );

  // Get cards from selected columns (or all if none selected)
  const selectedCards = useMemo(() => {
    const cols = selectedColumnIds.size > 0
      ? columnCards.filter(({ column }) => selectedColumnIds.has(column.id))
      : columnCards;
    return cols.flatMap(({ cards }) => cards);
  }, [columnCards, selectedColumnIds]);

  const toggleColumn = useCallback((colId: string) => {
    setSelectedColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  }, []);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatMessages.length > 1) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading]);

  // Focus chat input when entering kan mode
  useEffect(() => {
    if (kanMode && !isChatLoading) {
      chatInputRef.current?.focus();
    }
  }, [kanMode, isChatLoading]);

  // Get tasks from selected cards
  const selectedTasksContext = useMemo(() => {
    if (!includeTasks) return '';
    const tasks: string[] = [];
    selectedCards.forEach((card) => {
      (card.taskIds || []).forEach((taskId) => {
        const task = allTasks[taskId];
        if (task) tasks.push(`- [${task.status === 'done' ? 'x' : ' '}] ${task.title}`);
      });
    });
    return tasks.length > 0 ? `\n\nTasks from these cards:\n${tasks.join('\n')}` : '';
  }, [selectedCards, allTasks, includeTasks]);

  const userMessageCount = chatMessages.filter((m) => m.role === 'user').length;
  const isReadyToGenerate = userMessageCount >= 1;

  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || !activeAction) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    const updatedMessages = [...chatMessages, { role: 'user' as const, content: userMsg }];
    setChatMessages(updatedMessages);
    setIsChatLoading(true);

    const msgCount = updatedMessages.filter((m) => m.role === 'user').length;
    const conversationHistory = updatedMessages.map((m) => `${m.role === 'user' ? 'User' : 'Kan'}: ${m.content}`).join('\n');

    try {
      const res = await fetch('/api/channels/actions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          channelName: channel.name,
          channelDescription: channel.description || '',
          prompt: `You are Kan, a creative collaborator helping a user create a ${activeAction} from their Kanthink channel "${channel.name}" (${selectedCards.length} cards).

Conversation so far:
${conversationHistory}

Guidelines for your response:
- Keep it to 2-3 sentences max
- Be warm and collaborative
- After the user gives you 1-2 preferences, confirm what you've understood and tell them they can hit "Generate" whenever they're ready, or keep adding preferences
- ${msgCount >= 2 ? 'The user has given enough input. Summarize what you\'ll create and encourage them to hit Generate.' : 'Ask ONE specific question about their preference (tone, format, length, style, or audience).'}
- Never generate the actual content — just have the conversation`,
          cards: selectedCards.slice(0, 3).map((c) => ({ title: c.title, summary: c.summary || '', content: '', tags: c.tags || [] })),
        }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: 'kan', content: data.content || 'I had trouble processing that. Could you try again?' }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: 'kan', content: 'Something went wrong. Try again?' }]);
    }
    setIsChatLoading(false);
  }, [chatInput, activeAction, selectedCards, channel]);

  const handleGenerateWithInstructions = useCallback(async (type: ActionType, additionalInstructions?: string) => {
    if (!type) return;
    setGenState('generating');
    setError('');

    const cardContext = selectedCards.map((card) => ({
      title: card.title,
      summary: card.summary || '',
      content: card.messages?.map((m) => m.content).join('\n').slice(0, 500) || '',
      tags: card.tags || [],
    }));

    const taskSuffix = selectedTasksContext;

    const typePrompts: Record<string, string> = {
      newsletter: `Create an engaging email newsletter based on the following channel content. The channel is called "${channel.name}"${channel.description ? ` and is about: ${channel.description}` : ''}. Write a compelling subject line, introduction paragraph, and then summarize the key cards as newsletter sections with headers. Keep it concise and scannable. Use a warm, professional tone. Output as HTML suitable for email.${additionalInstructions ? `\n\nAdditional user instructions: ${additionalInstructions}` : ''}${taskSuffix}`,
      course: `Create a course outline based on the following channel content. The channel is called "${channel.name}". Organize the cards into logical modules/lessons. For each lesson, include a title, learning objective, and key points. Output as clean HTML.${additionalInstructions ? `\n\nAdditional user instructions: ${additionalInstructions}` : ''}${taskSuffix}`,
      blog: `Create a blog post based on the following channel content. The channel is called "${channel.name}". Write a compelling title, introduction, and body that weaves the card content into a cohesive narrative. Output as clean HTML.${additionalInstructions ? `\n\nAdditional user instructions: ${additionalInstructions}` : ''}${taskSuffix}`,
    };

    try {
      const res = await fetch('/api/channels/actions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          channelName: channel.name,
          channelDescription: channel.description || '',
          prompt: typePrompts[type],
          cards: cardContext,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Generation failed');
      }

      const data = await res.json();
      setGeneratedContent(data.content);
      setGenState('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to generate content');
      setGenState('error');
    }
  }, [selectedCards, channel, selectedTasksContext]);

  const handleGenerate = useCallback(async (type: ActionType) => {
    await handleGenerateWithInstructions(type);
  }, [handleGenerateWithInstructions]);

  const handleGenerateFromChat = useCallback(async () => {
    const additionalInstructions = chatMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('. ');
    await handleGenerateWithInstructions(activeAction, additionalInstructions);
  }, [chatMessages, activeAction, handleGenerateWithInstructions]);

  const handleSendEmail = useCallback(async () => {
    if (!recipientEmail.trim()) {
      setError('Please enter a recipient email');
      return;
    }
    setGenState('sending');
    setError('');

    try {
      const res = await fetch('/api/channels/actions/send-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail.trim(),
          channelName: channel.name,
          html: generatedContent,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Send failed');
      }

      setGenState('sent');
    } catch (err: any) {
      setError(err.message || 'Failed to send email');
      setGenState('error');
    }
  }, [recipientEmail, generatedContent, channel]);

  const handleBack = useCallback(() => {
    if (kanMode && genState === 'idle') {
      // Exit kan mode back to column selection
      setKanMode(false);
      setChatMessages([]);
      setChatInput('');
      return;
    }
    setActiveAction(null);
    setGenState('idle');
    setGeneratedContent('');
    setError('');
    setRecipientEmail('');
    setKanMode(false);
    setChatMessages([]);
    setChatInput('');
  }, [kanMode, genState]);

  const handleClose = useCallback(() => {
    setActiveAction(null);
    setGenState('idle');
    setGeneratedContent('');
    setError('');
    setRecipientEmail('');
    setKanMode(false);
    setChatMessages([]);
    setChatInput('');
    onClose();
  }, [onClose]);

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  }, [handleChatSend]);

  const actions = [
    {
      type: 'newsletter' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Email Newsletter',
      description: 'Generate a newsletter from your cards and send it via email',
    },
    {
      type: 'course' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      title: 'Course Outline',
      description: 'Turn your cards into a structured course with modules and lessons',
    },
    {
      type: 'blog' as const,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
      title: 'Blog Post',
      description: 'Generate a blog post or article from your channel content',
    },
  ];

  const activeActionTitle = actions.find((a) => a.type === activeAction)?.title || '';

  // ── Full chat mode (Generate with Kan) ──
  if (kanMode && activeAction && (genState === 'idle' || genState === 'error')) {
    return (
      <Drawer isOpen={isOpen} onClose={handleClose} width="lg">
        <div
          className="flex flex-col sm:h-full sm:max-h-[calc(100vh-2rem)]"
          style={{ height: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset}px)` : '100dvh' }}
        >
          {/* Chat header */}
          <div className="flex-shrink-0 flex items-center gap-3 p-4 border-b border-neutral-100 dark:border-neutral-800">
            <img
              src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
              alt="Kan"
              className="w-8 h-8"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Generate {activeActionTitle}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {selectedCards.length} cards from {channel.name}
              </p>
            </div>
            <button
              onClick={handleBack}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chat messages area */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'kan' && (
                  <img
                    src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                    alt="Kan"
                    className="w-7 h-7 flex-shrink-0 mt-0.5"
                  />
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-md'
                      : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isChatLoading && (
              <div className="flex gap-2.5 justify-start">
                <img
                  src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-icon_pbne7q.svg"
                  alt="Kan"
                  className="w-7 h-7 flex-shrink-0 mt-0.5 animate-pulse"
                />
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg">
                  {error}
                </p>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 p-4 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex gap-2 mb-3">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                onFocus={kbFocus}
                onBlur={kbBlur}
                placeholder="Tell Kan what you want..."
                rows={1}
                disabled={isChatLoading}
                className="flex-1 resize-none rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3.5 py-2.5 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:border-violet-400 dark:focus:border-violet-500 disabled:opacity-50"
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || isChatLoading}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleGenerateFromChat}
              disabled={!isReadyToGenerate || isChatLoading}
              className={`w-full py-2.5 px-4 rounded-xl text-white font-medium text-sm transition-all disabled:cursor-not-allowed ${
                isReadyToGenerate
                  ? 'bg-violet-600 hover:bg-violet-700 shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                  : 'bg-neutral-600 dark:bg-neutral-700 opacity-50'
              }`}
            >
              {isReadyToGenerate ? `Generate ${activeActionTitle}` : 'Chat with Kan first, then generate'}
            </button>
          </div>
        </div>
      </Drawer>
    );
  }

  // ── Standard drawer (action selection, column selection, preview, etc.) ──
  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="lg" floating>
      <div className="p-6 pt-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <KanthinkIcon size={18} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {activeAction ? activeActionTitle : 'Channel Actions'}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {activeAction
                ? `Generate from ${selectedCards.length} card${selectedCards.length !== 1 ? 's' : ''} in ${channel.name}`
                : `Turn "${channel.name}" content into something shareable`}
            </p>
          </div>
          {activeAction && (
            <button
              onClick={handleBack}
              className="ml-auto text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Back
            </button>
          )}
        </div>

        {!activeAction ? (
          <>
            {/* Action cards */}
            <div className="space-y-3 mb-6">
              {actions.map((action) => (
                <button
                  key={action.type}
                  onClick={() => setActiveAction(action.type)}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-all text-left group"
                >
                  <div className="mt-0.5 text-neutral-400 group-hover:text-violet-500 transition-colors">
                    {action.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 dark:text-white text-sm">
                      {action.title}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {action.description}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-neutral-300 dark:text-neutral-600 mt-1 group-hover:text-violet-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Channel stats */}
            <div className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-3">
              <span>{totalCards} cards across {channel.columns.length} columns</span>
            </div>
          </>
        ) : genState === 'idle' || genState === 'error' ? (
          /* Column selection + generate */
          <div>
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
              Select columns to include
            </h3>
            <div className="space-y-2 mb-4">
              {columnCards.map(({ column, cards }) => (
                <label
                  key={column.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedColumnIds.size === 0 || selectedColumnIds.has(column.id)}
                    onChange={() => toggleColumn(column.id)}
                    className="rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300">
                    {column.name}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {cards.length} card{cards.length !== 1 ? 's' : ''}
                  </span>
                </label>
              ))}
            </div>

            {/* Advanced options */}
            <div className="mb-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Advanced options
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-2 pl-4">
                  <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeArchived}
                      onChange={(e) => setIncludeArchived(e.target.checked)}
                      className="rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                    />
                    Include archived cards
                    {columnCards.some(c => c.archivedCount > 0) && (
                      <span className="text-xs text-neutral-400">
                        ({columnCards.reduce((sum, c) => sum + c.archivedCount, 0)} archived)
                      </span>
                    )}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTasks}
                      onChange={(e) => setIncludeTasks(e.target.checked)}
                      className="rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                    />
                    Include card tasks/subtasks
                  </label>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => handleGenerate(activeAction)}
                disabled={selectedCards.length === 0}
                className="flex-1 py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-neutral-300 disabled:dark:bg-neutral-700 text-white font-medium text-sm transition-colors"
              >
                Generate
              </button>
              <button
                onClick={async () => {
                  setKanMode(true);
                  setIsChatLoading(true);
                  setChatMessages([]);
                  try {
                    // Build context from selected cards
                    const cardTitles = selectedCards.slice(0, 15).map(c => c.title).join(', ');
                    const columnNames = [...new Set(selectedCards.map(c => {
                      const col = channel.columns.find(col => col.cardIds?.includes(c.id) || col.itemOrder?.includes(c.id));
                      return col?.name || 'Unknown';
                    }))].join(', ');

                    const res = await fetch('/api/channels/actions/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'chat',
                        channelName: channel.name,
                        channelDescription: channel.description,
                        prompt: `You are Kan, the AI assistant in Kanthink. The user wants to generate a ${activeAction} from their channel "${channel.name}" (${channel.description || 'no description'}). They selected ${selectedCards.length} cards from columns: ${columnNames}. Card titles include: ${cardTitles}.

Write a short, friendly greeting (2-3 sentences max) that:
1. Shows you understand their content and what they're trying to create
2. Asks ONE specific, smart question to help shape the output (audience, format, tone, length, etc.)
3. Mentions that they can hit Generate at any time when ready

Keep it conversational and brief. No bullet lists or markdown.`,
                        cards: [],
                      }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setChatMessages([{ role: 'kan', content: data.content || `Let's create your ${activeAction}! What style or format are you going for?` }]);
                    } else {
                      setChatMessages([{ role: 'kan', content: `Let's create your ${activeAction} from these ${selectedCards.length} cards. Any specific style, tone, or format you'd like?` }]);
                    }
                  } catch {
                    setChatMessages([{ role: 'kan', content: `Let's create your ${activeAction} from these ${selectedCards.length} cards. Any specific style, tone, or format you'd like?` }]);
                  }
                  setIsChatLoading(false);
                }}
                disabled={selectedCards.length === 0}
                className="flex-1 py-2.5 px-4 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 font-medium text-sm transition-colors"
              >
                Generate with Kan
              </button>
            </div>
          </div>
        ) : genState === 'generating' ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full mb-4" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Kan is generating your {activeAction}...
            </p>
          </div>
        ) : genState === 'preview' ? (
          <div>
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden mb-4">
              <div className="max-h-[400px] overflow-y-auto p-4 bg-white dark:bg-neutral-800">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: generatedContent }}
                />
              </div>
            </div>

            {activeAction === 'newsletter' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Send to email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setGenState('idle');
                  setGeneratedContent('');
                }}
                className="flex-1 py-2.5 px-4 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Regenerate
              </button>
              {activeAction === 'newsletter' ? (
                <button
                  onClick={handleSendEmail}
                  disabled={!recipientEmail.trim()}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-neutral-300 disabled:dark:bg-neutral-700 text-white font-medium text-sm transition-colors"
                >
                  Send Newsletter
                </button>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/channels/actions/publish', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            channelId: channel.id,
                            channelName: channel.name,
                            title: `${channel.name} ${activeActionTitle}`,
                            type: activeAction,
                            html: generatedContent,
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          navigator.clipboard.writeText(data.url);
                          setError(`Published! Link copied: ${data.url}`);
                        }
                      } catch { setError('Publish failed'); }
                    }}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm transition-colors"
                  >
                    Publish as Page
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(generatedContent)}
                    className="py-2.5 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    title="Copy raw HTML"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : genState === 'sending' ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full mb-4" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Sending newsletter...</p>
          </div>
        ) : genState === 'sent' ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-900 dark:text-white mb-1">Newsletter sent!</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Delivered to {recipientEmail}</p>
            <button
              onClick={handleBack}
              className="mt-4 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400"
            >
              Back to actions
            </button>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
