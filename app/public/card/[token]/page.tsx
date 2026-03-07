'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface PublicCard {
  id: string;
  title: string;
  messages: Array<{ id: string; type: string; content: string; createdAt: string }>;
  coverImageUrl?: string;
  summary?: string;
  tags?: string[];
  source: string;
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
  const userMessages = card.messages.filter(
    (m) => m.type === 'user' || m.type === 'ai_response'
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      {/* Cover image */}
      {card.coverImageUrl && (
        <div className="w-full h-48 md:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.coverImageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="mb-8">
          {/* Channel + author */}
          <div className="flex items-center gap-2 mb-3 text-sm text-neutral-500">
            {author?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={author.image} alt="" className="w-5 h-5 rounded-full" />
            )}
            {author?.name && <span>{author.name}</span>}
            {author?.name && channel?.name && <span>in</span>}
            {channel?.name && (
              <span className="text-neutral-400">{channel.name}</span>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
            {card.title}
          </h1>

          {/* Tags */}
          {card.tags && card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs bg-neutral-800 text-neutral-400 border border-neutral-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {card.summary && (
            <p className="text-neutral-400 text-sm leading-relaxed">
              {card.summary}
            </p>
          )}
        </div>

        {/* Messages */}
        {userMessages.length > 0 && (
          <div className="space-y-4">
            {userMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-xl ${
                  msg.type === 'ai_response'
                    ? 'bg-violet-900/20 border border-violet-800/30'
                    : 'bg-neutral-800/50 border border-neutral-700/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {msg.type === 'ai_response' ? (
                    <KanthinkIcon size={16} className="text-violet-400" />
                  ) : null}
                  <span className="text-xs font-medium text-neutral-500">
                    {msg.type === 'ai_response' ? 'Kan' : 'Note'}
                  </span>
                </div>
                <div className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-600 text-xs">
            <KanthinkIcon size={16} />
            <span>Shared via Kanthink</span>
          </div>
          <span className="text-xs text-neutral-600">
            {new Date(card.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
