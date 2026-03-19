'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { ChatMessage, DebugInfo } from '@/lib/mcs/types';

/**
 * Hide the Kan app chrome (nav, panels, etc.) when this page is mounted.
 * This page is temporary and will be removed.
 */
function useHideKanChrome() {
  useEffect(() => {
    // Mark body so we can hide Kan chrome
    document.body.setAttribute('data-mcs-page', 'true');
    // Override the dark theme
    document.documentElement.style.colorScheme = 'light';

    const style = document.createElement('style');
    style.id = 'mcs-hide-chrome';
    style.textContent = `
      /* Hide ALL Kan chrome — nav rail, panels, status bar, overlays */
      body[data-mcs-page] .relative.z-10.flex.h-screen > *:not(div:last-of-type) {
        display: none !important;
      }
      /* Remove flex/overflow from the chrome wrapper so the page flows naturally */
      body[data-mcs-page] .relative.z-10.flex.h-screen {
        display: block !important;
        height: auto !important;
      }
      /* Make the main content wrapper fill and reset margin */
      body[data-mcs-page] .relative.z-10.flex.h-screen > div {
        margin-left: 0 !important;
        display: block !important;
      }
      /* Override dark backgrounds */
      body[data-mcs-page], body[data-mcs-page] html {
        background: #fafafa !important;
        color: #171717 !important;
      }
      /* Hide ambient background effects */
      body[data-mcs-page] canvas {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.body.removeAttribute('data-mcs-page');
      document.documentElement.style.colorScheme = '';
      style.remove();
    };
  }, []);
}

const STARTER_PROMPTS = [
  'Do you offer yard signs?',
  'What banner is best for a trade show booth?',
  'How much are 500 door hangers?',
  'Do you have magnets for cars?',
  'What print products do you have for Kpop events?',
  'What\'s the difference between foam boards and yard signs?',
];

export default function MCSChatPage() {
  useHideKanChrome();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [selectedDebug, setSelectedDebug] = useState<DebugInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-select latest debug info
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.debug);
    if (lastAssistant?.debug) {
      setSelectedDebug(lastAssistant.debug);
    }
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const conversationMessages = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/mcs-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      const assistantMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: data.message || 'I couldn\'t generate a response.',
        timestamp: Date.now(),
        debug: data.debug ? {
          ...data.debug,
          tokenUsage: data.tokenUsage,
        } : undefined,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: `Sorry, something went wrong. ${err instanceof Error ? err.message : 'Please try again.'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Chat Panel */}
      <div className={`flex flex-col ${showDebug ? 'w-1/2 lg:w-3/5' : 'w-full'} border-r border-neutral-200`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">MCS Print Chat</h1>
              <p className="text-xs text-neutral-500">MyCreativeShop Product Assistant</p>
            </div>
          </div>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              showDebug
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
            }`}
          >
            {showDebug ? 'Hide' : 'Show'} Debug
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-neutral-800 mb-2">MCS Print Assistant</h2>
              <p className="text-neutral-500 text-sm mb-8 max-w-md">
                Ask me about MyCreativeShop print products — signs, banners, business cards, stickers, and more.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="text-left px-4 py-3 text-sm text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-neutral-200 text-neutral-800'
                } ${msg.debug ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                onClick={() => msg.debug && setSelectedDebug(msg.debug)}
              >
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  <MessageContent content={msg.content} />
                </div>
                {msg.role === 'assistant' && msg.debug && (
                  <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center gap-1.5 text-[10px] text-neutral-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {msg.debug.intent} · {msg.debug.answerSource}
                    {msg.debug.tokenUsage && (
                      <span className="ml-auto">{msg.debug.tokenUsage.input + msg.debug.tokenUsage.output} tok</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-neutral-200 rounded-2xl px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-neutral-200 bg-white">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about MCS print products..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-neutral-300 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-neutral-50"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="w-1/2 lg:w-2/5 flex flex-col bg-neutral-900 text-neutral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-700 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
            </svg>
            <h2 className="text-sm font-semibold text-neutral-300">Debug Inspector</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {selectedDebug ? (
              <DebugPanel debug={selectedDebug} />
            ) : (
              <div className="text-neutral-500 text-sm text-center mt-20">
                Send a message to see debug output.
                <br />
                <span className="text-neutral-600 text-xs">Click any assistant message to inspect it.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  // Simple markdown-ish rendering
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('- ')) {
          return <p key={i} className="ml-3">• {renderInlineFormatting(line.slice(2))}</p>;
        }
        if (line.startsWith('### ')) {
          return <p key={i} className="font-semibold text-sm mt-2">{line.slice(4)}</p>;
        }
        if (line.startsWith('## ')) {
          return <p key={i} className="font-semibold mt-2">{line.slice(3)}</p>;
        }
        if (line.trim() === '') {
          return <br key={i} />;
        }
        return <p key={i}>{renderInlineFormatting(line)}</p>;
      })}
    </>
  );
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Handle **bold**, [links](url), and `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    // Code
    const codeMatch = remaining.match(/`([^`]+)`/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: 'bold', match: boldMatch, index: boldMatch.index! } : null,
      linkMatch ? { type: 'link', match: linkMatch, index: linkMatch.index! } : null,
      codeMatch ? { type: 'code', match: codeMatch, index: codeMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const earliest = matches[0]!;
    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    if (earliest.type === 'bold') {
      parts.push(<strong key={key++}>{earliest.match[1]}</strong>);
    } else if (earliest.type === 'link') {
      parts.push(
        <a key={key++} href={earliest.match[2]} target="_blank" rel="noopener noreferrer" className="underline text-blue-400 hover:text-blue-300">
          {earliest.match[1]}
        </a>
      );
    } else if (earliest.type === 'code') {
      parts.push(<code key={key++} className="bg-neutral-100 px-1 rounded text-xs">{earliest.match[1]}</code>);
    }

    remaining = remaining.slice(earliest.index + earliest.match[0].length);
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

function DebugPanel({ debug }: { debug: DebugInfo }) {
  return (
    <div className="space-y-5 text-xs font-mono">
      {/* Intent */}
      <DebugSection title="Intent">
        <span className="inline-block px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded font-semibold">
          {debug.intent}
        </span>
      </DebugSection>

      {/* Entities */}
      <DebugSection title="Extracted Entities">
        <div className="space-y-1">
          {Object.entries(debug.entities || {}).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-neutral-500">{key}</span>
              <span className={value ? 'text-emerald-400' : 'text-neutral-600'}>
                {value !== null && value !== undefined ? String(value) : '—'}
              </span>
            </div>
          ))}
        </div>
      </DebugSection>

      {/* Matched Products */}
      <DebugSection title="Matched Products">
        {debug.matchedProducts && debug.matchedProducts.length > 0 ? (
          <div className="space-y-2">
            {debug.matchedProducts.map((p, i) => (
              <div key={i} className="bg-neutral-800 rounded-lg p-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-neutral-200 font-semibold">{p.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    p.confidence >= 0.8 ? 'bg-emerald-900/50 text-emerald-300' :
                    p.confidence >= 0.5 ? 'bg-amber-900/50 text-amber-300' :
                    'bg-neutral-700 text-neutral-400'
                  }`}>
                    {Math.round(p.confidence * 100)}%
                  </span>
                </div>
                <div className="text-neutral-500 text-[10px]">{p.reason}</div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-neutral-600">No products matched</span>
        )}
      </DebugSection>

      {/* Missing Fields */}
      {debug.missingFields && debug.missingFields.length > 0 && (
        <DebugSection title="Missing Fields">
          <div className="flex flex-wrap gap-1">
            {debug.missingFields.map((field, i) => (
              <span key={i} className="px-2 py-0.5 bg-amber-900/30 text-amber-300 rounded">
                {field}
              </span>
            ))}
          </div>
        </DebugSection>
      )}

      {/* Response Strategy */}
      <DebugSection title="Response Strategy">
        <p className="text-neutral-400 leading-relaxed">{debug.responseStrategy}</p>
      </DebugSection>

      {/* Answer Source */}
      <DebugSection title="Answer Source">
        <span className={`inline-block px-2 py-0.5 rounded font-semibold ${
          debug.answerSource === 'structured_knowledge' ? 'bg-emerald-900/50 text-emerald-300' :
          debug.answerSource === 'retrieved_content' ? 'bg-blue-900/50 text-blue-300' :
          debug.answerSource === 'pricing_tool' ? 'bg-violet-900/50 text-violet-300' :
          'bg-neutral-700 text-neutral-400'
        }`}>
          {debug.answerSource}
        </span>
      </DebugSection>

      {/* Token Usage */}
      {debug.tokenUsage && (
        <DebugSection title="Token Usage">
          <div className="flex gap-4">
            <div>
              <span className="text-neutral-500">In: </span>
              <span className="text-neutral-300">{debug.tokenUsage.input.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-neutral-500">Out: </span>
              <span className="text-neutral-300">{debug.tokenUsage.output.toLocaleString()}</span>
            </div>
          </div>
        </DebugSection>
      )}
    </div>
  );
}

function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2 font-semibold">{title}</h3>
      {children}
    </div>
  );
}
