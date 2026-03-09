'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

type ThemeKey = 'conversational' | 'editorial' | 'terminal' | 'poster';

interface ThemeConfig {
  page: string;
  container: string;
  coverImage: string;
  coverWrapper: string;
  metaText: string;
  title: string;
  tagContainer: string;
  tag: string;
  summary: string;
  messageSpacing: string;
  aiMessage: string;
  userMessage: string;
  aiLabel: string;
  userLabel: string;
  messageText: string;
  footer: string;
  footerText: string;
  kanIcon: string;
}

const themes: Record<ThemeKey, ThemeConfig> = {
  conversational: {
    page: 'min-h-screen bg-[#0e0e0e]',
    container: 'max-w-2xl mx-auto px-4 py-8 md:py-12',
    coverImage: 'w-full h-full object-cover',
    coverWrapper: 'w-full h-48 md:h-64',
    metaText: 'text-sm text-neutral-500',
    title: 'text-2xl md:text-3xl font-bold text-white mb-3',
    tagContainer: 'flex flex-wrap gap-1.5 mb-4',
    tag: 'px-2 py-0.5 rounded-full text-xs bg-neutral-800 text-neutral-400 border border-neutral-700',
    summary: 'text-neutral-400 text-sm leading-relaxed',
    messageSpacing: 'space-y-4',
    aiMessage: 'p-4 rounded-xl bg-violet-900/20 border border-violet-800/30',
    userMessage: 'p-4 rounded-xl bg-neutral-800/50 border border-neutral-700/50',
    aiLabel: 'text-xs font-medium text-neutral-500',
    userLabel: 'text-xs font-medium text-neutral-500',
    messageText: 'text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed',
    footer: 'mt-12 pt-6 border-t border-neutral-800 flex items-center justify-between',
    footerText: 'text-neutral-600 text-xs',
    kanIcon: 'text-violet-400',
  },
  editorial: {
    page: 'min-h-screen bg-[#fafaf9]',
    container: 'max-w-2xl mx-auto px-6 py-12 md:py-16',
    coverImage: 'w-full h-full object-cover',
    coverWrapper: 'w-full h-48 md:h-64',
    metaText: 'text-sm text-stone-500 border-b border-stone-200 pb-6 mb-6',
    title: 'text-3xl md:text-4xl font-bold text-stone-900 mb-3 font-serif leading-tight',
    tagContainer: 'flex flex-wrap gap-1.5 mb-4',
    tag: 'px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600 border border-stone-200',
    summary: 'text-stone-600 text-base leading-relaxed italic',
    messageSpacing: 'space-y-6',
    aiMessage: 'py-2 pl-4 border-l-2 border-violet-400',
    userMessage: 'py-2 pl-4 border-l-2 border-stone-300',
    aiLabel: 'text-xs font-medium text-violet-600',
    userLabel: 'text-xs font-medium text-stone-400',
    messageText: 'text-sm text-stone-700 whitespace-pre-wrap leading-relaxed',
    footer: 'mt-12 pt-6 border-t border-stone-200 flex items-center justify-between',
    footerText: 'text-stone-400 text-xs',
    kanIcon: 'text-violet-600',
  },
  terminal: {
    page: 'min-h-screen bg-[#0a0a0a]',
    container: 'max-w-3xl mx-auto px-4 py-8 md:py-12 font-mono',
    coverImage: 'w-full h-full object-cover opacity-80 grayscale',
    coverWrapper: 'w-full h-48 md:h-64 border-b border-green-900/30',
    metaText: 'text-xs text-neutral-600 font-mono',
    title: 'text-xl md:text-2xl font-bold text-green-400 mb-3 font-mono uppercase tracking-wide',
    tagContainer: 'flex flex-wrap gap-1.5 mb-4',
    tag: 'px-2 py-0.5 rounded text-xs bg-transparent text-green-600 border border-green-900/50 font-mono',
    summary: 'text-neutral-500 text-sm font-mono border border-neutral-800 p-3 bg-neutral-900/50',
    messageSpacing: 'space-y-3',
    aiMessage: 'p-4 bg-neutral-900 border border-neutral-800 font-mono text-sm',
    userMessage: 'p-4 bg-transparent border border-neutral-800 font-mono text-sm',
    aiLabel: 'text-xs font-medium text-green-500 font-mono',
    userLabel: 'text-xs font-medium text-neutral-500 font-mono',
    messageText: 'text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed font-mono',
    footer: 'mt-12 pt-6 border-t border-neutral-800 flex items-center justify-between',
    footerText: 'text-neutral-700 text-xs font-mono',
    kanIcon: 'text-green-500',
  },
  poster: {
    page: 'min-h-screen bg-[#121214]',
    container: 'max-w-2xl mx-auto px-4 py-8 md:py-12',
    coverImage: 'w-full h-full object-cover',
    coverWrapper: 'w-full h-64 md:h-80 relative',
    metaText: 'text-xs text-neutral-400 uppercase tracking-widest mb-2',
    title: 'text-3xl md:text-5xl font-extrabold text-white mb-3 leading-tight tracking-tight',
    tagContainer: 'flex flex-wrap gap-1.5 mb-4',
    tag: 'px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/70 backdrop-blur-sm',
    summary: 'text-neutral-300 text-base md:text-lg leading-relaxed',
    messageSpacing: 'space-y-5',
    aiMessage: 'p-5 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10',
    userMessage: 'p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]',
    aiLabel: 'text-xs font-medium text-violet-400',
    userLabel: 'text-xs font-medium text-neutral-500',
    messageText: 'text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed',
    footer: 'mt-12 pt-6 border-t border-white/10 flex items-center justify-between',
    footerText: 'text-neutral-600 text-xs',
    kanIcon: 'text-violet-400',
  },
};

interface PublicCard {
  id: string;
  title: string;
  messages: Array<{ id: string; type: string; content: string; createdAt: string }>;
  coverImageUrl?: string;
  summary?: string;
  tags?: string[];
  source: string;
  shareTheme?: string;
  createdAt: string;
}

interface PublicCardData {
  card: PublicCard;
  channel: { name: string } | null;
  author: { name: string; image: string | null } | null;
}

export default function PublicCardPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/cards/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          setError('This card is not available or has been made private.');
          return;
        }
        setData(await res.json());
      })
      .catch(() => setError('Failed to load card.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="text-center">
          <KanthinkIcon size={48} className="text-neutral-600 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Card not found</h1>
          <p className="text-neutral-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const { card, channel, author } = data;
  const themeKey = (card.shareTheme || 'conversational') as ThemeKey;
  const t = themes[themeKey] || themes.conversational;
  const userMessages = card.messages.filter(
    (m) => m.type === 'user' || m.type === 'ai_response'
  );

  return (
    <div className={t.page}>
      {/* Cover image */}
      {card.coverImageUrl && (
        <div className={t.coverWrapper}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.coverImageUrl}
            alt=""
            className={t.coverImage}
          />
          {/* Poster gradient overlay */}
          {themeKey === 'poster' && (
            <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-[#121214]/60 to-transparent" />
          )}
        </div>
      )}

      {/* Poster: gradient fallback when no cover */}
      {!card.coverImageUrl && themeKey === 'poster' && (
        <div className="w-full h-48 bg-gradient-to-b from-violet-900/30 to-[#121214]" />
      )}

      <div className={t.container}>
        {/* Header */}
        <div className="mb-8">
          {/* Channel + author */}
          <div className={`flex items-center gap-2 mb-3 ${t.metaText}`}>
            {themeKey === 'terminal' && <span>&gt;</span>}
            {author?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={author.image} alt="" className="w-5 h-5 rounded-full" />
            )}
            {author?.name && <span>{author.name}</span>}
            {author?.name && channel?.name && <span>in</span>}
            {channel?.name && <span>{themeKey === 'editorial' ? channel.name : channel.name}</span>}
          </div>

          <h1 className={t.title}>
            {card.title}
          </h1>

          {/* Tags */}
          {card.tags && card.tags.length > 0 && (
            <div className={t.tagContainer}>
              {card.tags.map((tag) => (
                <span key={tag} className={t.tag}>
                  {themeKey === 'terminal' ? `#${tag}` : tag}
                </span>
              ))}
            </div>
          )}

          {card.summary && (
            <p className={t.summary}>
              {card.summary}
            </p>
          )}
        </div>

        {/* Messages */}
        {userMessages.length > 0 && (
          <div className={t.messageSpacing}>
            {userMessages.map((msg) => (
              <div
                key={msg.id}
                className={msg.type === 'ai_response' ? t.aiMessage : t.userMessage}
              >
                <div className="flex items-center gap-2 mb-2">
                  {msg.type === 'ai_response' ? (
                    <KanthinkIcon size={16} className={t.kanIcon} />
                  ) : null}
                  <span className={msg.type === 'ai_response' ? t.aiLabel : t.userLabel}>
                    {msg.type === 'ai_response'
                      ? (themeKey === 'terminal' ? '[kan]' : 'Kan')
                      : (themeKey === 'terminal' ? '[note]' : 'Note')}
                  </span>
                </div>
                <div className={t.messageText}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className={t.footer}>
          <div className={`flex items-center gap-2 ${t.footerText}`}>
            <KanthinkIcon size={16} className={t.kanIcon} />
            <span>Shared via Kanthink</span>
          </div>
          <span className={t.footerText}>
            {new Date(card.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
