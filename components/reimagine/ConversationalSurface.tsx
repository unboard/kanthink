'use client';

/**
 * Concept 1: Conversational Surface
 *
 * You talk to Kan about your work. Responses are Pretext shrinkwrap bubbles —
 * binary-searched to the tightest possible width that preserves line count.
 * Card data is pulled from the store and rendered as inline references
 * within the conversation flow.
 *
 * Pretext APIs used:
 *   - prepareWithSegments() for text preparation
 *   - layout() for height/lineCount measurement
 *   - walkLineRanges() to find max line width
 *   - Binary search over layout() to find tightest shrinkwrap width
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  prepareWithSegments,
  layout,
  walkLineRanges,
  layoutWithLines,
  type PreparedTextWithSegments,
} from '@chenglou/pretext';

// ─── Typography ───────────────────────────────────────────────────────────────
const BUBBLE_FONT = '15px Inter, system-ui, sans-serif';
const BUBBLE_LINE_HEIGHT = 22;
const BUBBLE_FONT_BOLD = '600 15px Inter, system-ui, sans-serif';
const CARD_TITLE_FONT = '600 13px Inter, system-ui, sans-serif';
const CARD_TITLE_LINE_HEIGHT = 18;
const CARD_BODY_FONT = '400 12px Inter, system-ui, sans-serif';
const CARD_BODY_LINE_HEIGHT = 17;

// ─── Shrinkwrap: find tightest width preserving line count ────────────────────
function shrinkwrap(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number,
): { width: number; height: number; lineCount: number } {
  const initial = layout(prepared, maxWidth, lineHeight);
  if (initial.lineCount <= 1) {
    // Single line: find exact width
    let w = 0;
    walkLineRanges(prepared, maxWidth, (line) => { w = line.width; });
    return { width: Math.ceil(w), height: initial.height, lineCount: 1 };
  }

  // Binary search for narrowest width that keeps the same line count
  let lo = 1;
  let hi = Math.ceil(maxWidth);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (layout(prepared, mid, lineHeight).lineCount <= initial.lineCount) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }

  const result = layout(prepared, lo, lineHeight);
  return { width: lo, height: result.height, lineCount: result.lineCount };
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CardRef {
  id: string;
  title: string;
  body: string;
  channel: string;
  column: string;
}

interface Message {
  id: string;
  role: 'user' | 'kan';
  text: string;
  cards?: CardRef[]; // Card references embedded in response
  timestamp: number;
}

// ─── Shrinkwrapped bubble component ──────────────────────────────────────────
function ShrinkBubble({
  message,
  maxWidth,
}: {
  message: Message;
  maxWidth: number;
}) {
  const [measured, setMeasured] = useState<{
    width: number; height: number;
    cardMeasurements: { titleW: number; titleH: number; bodyW: number; bodyH: number }[];
  } | null>(null);

  useEffect(() => {
    const prepared = prepareWithSegments(message.text, BUBBLE_FONT);
    const bubbleMaxW = Math.min(maxWidth, 480);
    const result = shrinkwrap(prepared, bubbleMaxW, BUBBLE_LINE_HEIGHT);

    // Measure embedded cards too
    const cardMeasurements = (message.cards || []).map(card => {
      const cardMaxW = Math.min(result.width, 280);
      const titlePrep = prepareWithSegments(card.title, CARD_TITLE_FONT);
      const titleShrink = shrinkwrap(titlePrep, cardMaxW, CARD_TITLE_LINE_HEIGHT);
      const bodyText = card.body.slice(0, 120);
      let bodyW = 0, bodyH = 0;
      if (bodyText) {
        const bodyPrep = prepareWithSegments(bodyText, CARD_BODY_FONT);
        const bodyShrink = shrinkwrap(bodyPrep, cardMaxW, CARD_BODY_LINE_HEIGHT);
        bodyW = bodyShrink.width;
        bodyH = bodyShrink.height;
      }
      return {
        titleW: titleShrink.width,
        titleH: titleShrink.height,
        bodyW,
        bodyH,
      };
    });

    setMeasured({ width: result.width, height: result.height, cardMeasurements });
  }, [message.text, message.cards, maxWidth]);

  if (!measured) return null;

  const isUser = message.role === 'user';
  const bubblePadX = 14;
  const bubblePadY = 10;

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      style={{ marginBottom: 6 }}
    >
      <div style={{ maxWidth: maxWidth }}>
        {/* Sender label */}
        {!isUser && (
          <div
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.2)',
              marginBottom: 3,
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '0.03em',
            }}
          >
            kan
          </div>
        )}

        {/* The shrinkwrapped bubble */}
        <div
          style={{
            width: measured.width + bubblePadX * 2,
            background: isUser
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(255,255,255,0.03)',
            border: `1px solid rgba(255,255,255,${isUser ? 0.1 : 0.06})`,
            borderRadius: 14,
            padding: `${bubblePadY}px ${bubblePadX}px`,
          }}
        >
          {/* Text — Pretext measured, CSS renders at the exact shrinkwrap width */}
          <div
            style={{
              font: BUBBLE_FONT,
              lineHeight: `${BUBBLE_LINE_HEIGHT}px`,
              color: isUser ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.6)',
              width: measured.width,
              wordBreak: 'break-word',
            }}
          >
            {message.text}
          </div>

          {/* Embedded card references */}
          {message.cards && message.cards.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {message.cards.map((card, i) => {
                const cm = measured.cardMeasurements[i]!;
                const cardW = Math.max(cm.titleW, cm.bodyW) + 20;
                return (
                  <div
                    key={card.id}
                    style={{
                      width: Math.min(cardW, measured.width),
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        font: CARD_TITLE_FONT,
                        lineHeight: `${CARD_TITLE_LINE_HEIGHT}px`,
                        color: 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {card.title}
                    </div>
                    {card.body && (
                      <div
                        style={{
                          font: CARD_BODY_FONT,
                          lineHeight: `${CARD_BODY_LINE_HEIGHT}px`,
                          color: 'rgba(255,255,255,0.3)',
                          marginTop: 3,
                        }}
                      >
                        {card.body.slice(0, 120)}{card.body.length > 120 ? '...' : ''}
                      </div>
                    )}
                    <div
                      style={{
                        font: '400 10px Inter, system-ui, sans-serif',
                        color: 'rgba(255,255,255,0.15)',
                        marginTop: 4,
                      }}
                    >
                      {card.channel} · {card.column}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Build initial conversation from store data ───────────────────────────────
function buildInitialConversation(
  channels: ReturnType<typeof useStore.getState>['channels'],
  cards: ReturnType<typeof useStore.getState>['cards'],
): Message[] {
  const messages: Message[] = [];
  const allCards: CardRef[] = [];

  const activeChannels = Object.values(channels).filter(ch => ch.status !== 'archived');
  for (const channel of activeChannels) {
    for (const column of channel.columns) {
      for (const cardId of column.cardIds) {
        const card = cards[cardId];
        if (!card) continue;
        if (card.snoozedUntil && new Date(card.snoozedUntil) > new Date()) continue;
        allCards.push({
          id: card.id,
          title: card.title || 'Untitled',
          body: card.summary || card.messages?.[0]?.content || '',
          channel: channel.name,
          column: column.name,
        });
      }
    }
  }

  // Sort by most recent
  const sorted = [...allCards].slice(0, 20);

  const channelCount = activeChannels.length;

  // Simulate a natural conversation
  messages.push({
    id: '1',
    role: 'user',
    text: "What's going on across my channels?",
    timestamp: Date.now() - 60000,
  });

  const recentCards = sorted.slice(0, 5);
  messages.push({
    id: '2',
    role: 'kan',
    text: `You have ${allCards.length} cards across ${channelCount} channels. Here's what's most recent:`,
    cards: recentCards,
    timestamp: Date.now() - 55000,
  });

  // Find cards in specific columns if they exist
  const inboxCards = allCards.filter(c => c.column.toLowerCase() === 'inbox' || c.column.toLowerCase() === 'do these');
  if (inboxCards.length > 0) {
    messages.push({
      id: '3',
      role: 'user',
      text: 'What needs my attention right now?',
      timestamp: Date.now() - 40000,
    });

    messages.push({
      id: '4',
      role: 'kan',
      text: `${inboxCards.length} cards are waiting for you. These feel most urgent:`,
      cards: inboxCards.slice(0, 4),
      timestamp: Date.now() - 35000,
    });
  }

  return messages;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ConversationalSurface() {
  const channels = useStore((s) => s.channels);
  const cards = useStore((s) => s.cards);
  const [mounted, setMounted] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Build initial conversation once mounted
  useEffect(() => {
    if (!mounted) return;
    const initial = buildInitialConversation(channels, cards);
    setMessages(initial);
  }, [mounted, channels, cards]);

  // Track container width for responsive shrinkwrap
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Handle user input
  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: inputValue.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    // Simulate Kan response based on query
    const query = inputValue.toLowerCase();
    const allCards: CardRef[] = [];
    const activeChannels = Object.values(channels).filter(ch => ch.status !== 'archived');
    for (const channel of activeChannels) {
      for (const column of channel.columns) {
        for (const cardId of column.cardIds) {
          const card = cards[cardId];
          if (!card) continue;
          allCards.push({
            id: card.id,
            title: card.title || 'Untitled',
            body: card.summary || card.messages?.[0]?.content || '',
            channel: channel.name,
            column: column.name,
          });
        }
      }
    }

    // Simple keyword matching for demo
    let responseText = '';
    let responseCards: CardRef[] = [];

    if (query.includes('bug') || query.includes('fix')) {
      const bugs = allCards.filter(c =>
        c.title.toLowerCase().includes('bug') ||
        c.title.toLowerCase().includes('fix') ||
        c.column.toLowerCase().includes('bug')
      );
      responseText = bugs.length > 0
        ? `Found ${bugs.length} cards that look bug-related:`
        : "I don't see any bug-related cards right now.";
      responseCards = bugs.slice(0, 5);
    } else if (query.includes('channel')) {
      const channelName = activeChannels.map(c => c.name).find(name =>
        query.includes(name.toLowerCase())
      );
      if (channelName) {
        const channelCards = allCards.filter(c => c.channel === channelName);
        responseText = `${channelName} has ${channelCards.length} cards:`;
        responseCards = channelCards.slice(0, 5);
      } else {
        responseText = `Your channels: ${activeChannels.map(c => c.name).join(', ')}`;
      }
    } else {
      // Fuzzy search across all card titles
      const matches = allCards.filter(c =>
        query.split(/\s+/).some(word =>
          word.length > 2 && (
            c.title.toLowerCase().includes(word) ||
            c.body.toLowerCase().includes(word) ||
            c.channel.toLowerCase().includes(word)
          )
        )
      );
      if (matches.length > 0) {
        responseText = `Found ${matches.length} related cards:`;
        responseCards = matches.slice(0, 5);
      } else {
        responseText = `I searched across ${allCards.length} cards but nothing matched. Try asking about a specific channel or topic.`;
      }
    }

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: `kan-${Date.now()}`,
        role: 'kan',
        text: responseText,
        cards: responseCards.length > 0 ? responseCards : undefined,
        timestamp: Date.now(),
      }]);
    }, 300);
  }, [inputValue, channels, cards]);

  const bubbleMaxWidth = Math.min(containerWidth - 40, 500);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col items-center"
      style={{ paddingTop: 56 }}
    >
      {/* Scrollable conversation */}
      <div
        ref={scrollRef}
        className="flex-1 w-full overflow-y-auto"
        style={{ maxWidth: 640, padding: '20px 20px 0' }}
      >
        {mounted && messages.map(msg => (
          <ShrinkBubble
            key={msg.id}
            message={msg}
            maxWidth={bubbleMaxWidth}
          />
        ))}
        <div style={{ height: 20 }} />
      </div>

      {/* Input */}
      <div style={{ width: '100%', maxWidth: 640, padding: '12px 20px 24px' }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '10px 14px',
          }}
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your work..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.7)',
              font: '14px Inter, system-ui, sans-serif',
            }}
          />
          <button
            onClick={handleSend}
            style={{
              background: inputValue.trim() ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none',
              borderRadius: 8,
              padding: '4px 12px',
              color: inputValue.trim() ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
              font: '13px Inter, system-ui, sans-serif',
              cursor: inputValue.trim() ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}
