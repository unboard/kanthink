'use client';

import { useState, useEffect } from 'react';

interface OGData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

// YouTube-specific rendering
function isYouTubeUrl(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<OGData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchPreview() {
      try {
        const res = await fetch(`/api/og-preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error();
        const ogData = await res.json();
        if (!cancelled) setData(ogData);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchPreview();
    return () => { cancelled = true; };
  }, [url]);

  if (isLoading) {
    return (
      <div className="mt-2 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 animate-pulse">
        <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4 mb-2" />
        <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2" />
      </div>
    );
  }

  if (error || !data) return null;

  // YouTube embed
  const youtubeId = isYouTubeUrl(url);
  if (youtubeId) {
    return (
      <div className="mt-2 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title={data.title || 'YouTube video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        {data.title && (
          <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-violet-600 line-clamp-1">
              {data.title}
            </a>
          </div>
        )}
      </div>
    );
  }

  // Standard link preview
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors group"
    >
      <div className="flex">
        {/* Image */}
        {data.image && (
          <div className="w-24 sm:w-32 flex-shrink-0 bg-neutral-100 dark:bg-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.image}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
        {/* Content */}
        <div className="flex-1 min-w-0 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            {data.favicon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.favicon}
                alt=""
                className="w-3.5 h-3.5 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
              {data.siteName || new URL(url).hostname}
            </span>
          </div>
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 line-clamp-1 group-hover:text-violet-600 dark:group-hover:text-violet-400">
            {data.title}
          </p>
          {data.description && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5">
              {data.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

// Extract URLs from text content
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const matches = text.match(urlRegex) || [];
  // Deduplicate and limit to 3
  return [...new Set(matches)].slice(0, 3);
}
