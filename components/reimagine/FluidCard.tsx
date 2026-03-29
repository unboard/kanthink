'use client';

import { useState, CSSProperties } from 'react';
import type { MeasuredCard } from './ReimagineCanvas';

// Color palette for channel indicators
const CHANNEL_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#eab308', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#2563eb', '#7c3aed',
];

function getChannelColor(channelId: string): string {
  if (!CHANNEL_COLORS[channelId]) {
    const idx = Object.keys(CHANNEL_COLORS).length % COLOR_PALETTE.length;
    CHANNEL_COLORS[channelId] = COLOR_PALETTE[idx];
  }
  return CHANNEL_COLORS[channelId];
}

// Card accent colors
const CARD_ACCENT_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

interface FluidCardProps {
  measured: MeasuredCard;
  width: number;
  style?: CSSProperties;
}

export function FluidCard({ measured, width, style }: FluidCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { card, channel, columnName, tags, age, activity } = measured;

  const channelColor = getChannelColor(channel.id);
  const accentColor = card.color ? CARD_ACCENT_MAP[card.color] || channelColor : channelColor;

  // Age indicator: newer cards are brighter
  const freshness = Math.max(0.4, 1 - age / 30); // fade over 30 days
  const activityGlow = activity > 3 ? 0.08 : activity > 1 ? 0.04 : 0;

  const bodyText = card.summary || card.messages?.[0]?.content || '';
  const truncatedBody = bodyText.slice(0, 200);

  return (
    <div
      className="group relative transition-all duration-200 cursor-pointer"
      style={{
        width,
        ...style,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div
        className="relative rounded-lg overflow-hidden transition-all duration-200"
        style={{
          background: isHovered
            ? `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)`
            : `rgba(255,255,255,${0.025 + activityGlow})`,
          border: `1px solid rgba(255,255,255,${isHovered ? 0.12 : 0.06})`,
          boxShadow: isHovered
            ? `0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)`
            : 'none',
          transform: isHovered ? 'translateY(-1px)' : 'none',
        }}
      >
        {/* Accent line */}
        <div
          className="absolute top-0 left-0 w-full h-[2px]"
          style={{
            background: `linear-gradient(90deg, ${accentColor}${Math.round(freshness * 80).toString(16).padStart(2, '0')} 0%, transparent 100%)`,
          }}
        />

        <div className="p-3">
          {/* Channel + column context */}
          <div className="flex items-center gap-1.5 mb-2">
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: channelColor, opacity: freshness }}
            />
            <span className="text-[10px] text-white/25 truncate font-mono">
              {channel.name}
            </span>
            <span className="text-[10px] text-white/15">in</span>
            <span className="text-[10px] text-white/20 truncate">
              {columnName}
            </span>
          </div>

          {/* Title */}
          <h3
            className="text-[15px] font-semibold leading-[22px] text-white/80 mb-0"
            style={{ opacity: freshness }}
          >
            {card.title || 'Untitled'}
          </h3>

          {/* Body preview */}
          {truncatedBody && (
            <p
              className={`text-[13px] leading-[19px] text-white/40 mt-1.5 ${
                isExpanded ? '' : 'line-clamp-4'
              }`}
            >
              {truncatedBody}
            </p>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.slice(0, isExpanded ? undefined : 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-white/5 text-white/30 border border-white/5"
                >
                  {tag}
                </span>
              ))}
              {!isExpanded && tags.length > 3 && (
                <span className="text-[10px] text-white/15">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Activity indicator */}
          {activity > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <div className="flex -space-x-0.5">
                {Array.from({ length: Math.min(activity, 5) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full bg-white/20"
                  />
                ))}
              </div>
              <span className="text-[10px] text-white/15 font-mono">
                {activity} {activity === 1 ? 'msg' : 'msgs'}
              </span>
            </div>
          )}

          {/* Expanded: show full messages */}
          {isExpanded && card.messages && card.messages.length > 1 && (
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              {card.messages.slice(1, 5).map((msg) => (
                <div key={msg.id} className="text-[12px] text-white/30 leading-relaxed">
                  <span className="text-white/15 text-[10px] font-mono mr-1">
                    {msg.type === 'ai_response' ? 'kan' : msg.authorName || 'you'}:
                  </span>
                  {msg.content.slice(0, 150)}
                  {msg.content.length > 150 && '...'}
                </div>
              ))}
            </div>
          )}

          {/* Age whisper */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-white/10 font-mono">
              {age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`}
            </span>
            {card.assignedTo && card.assignedTo.length > 0 && (
              <div className="flex -space-x-1">
                {card.assignedTo.slice(0, 3).map((_, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full bg-white/8 border border-white/5"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
