import { NextResponse } from 'next/server';

// Simple in-memory cache for OG previews (24h TTL)
const cache = new Map<string, { data: OGData; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface OGData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  type?: string;
}

function extractMetaContent(html: string, property: string): string | undefined {
  // Try og: property first
  const ogRegex = new RegExp(
    `<meta[^>]*(?:property|name)=["'](?:og:|twitter:)?${property}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  let match = html.match(ogRegex);
  if (match) return match[1];

  // Try reversed attribute order (content before property)
  const reversedRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:|twitter:)?${property}["']`,
    'i'
  );
  match = html.match(reversedRegex);
  if (match) return match[1];

  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    // Fetch the page with a timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Kanthink-Bot/1.0 (Link Preview)',
        'Accept': 'text/html',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ url, title: new URL(url).hostname }, { status: 200 });
    }

    // Only read first 50KB to avoid huge pages
    const text = await res.text();
    const html = text.slice(0, 50000);

    // Extract metadata
    const title = extractMetaContent(html, 'title')
      || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    const description = extractMetaContent(html, 'description');
    const image = extractMetaContent(html, 'image');
    const siteName = extractMetaContent(html, 'site_name');
    const type = extractMetaContent(html, 'type');

    // Get favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i)
      || html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    let favicon = faviconMatch?.[1];
    if (favicon && !favicon.startsWith('http')) {
      const base = new URL(url);
      favicon = favicon.startsWith('/') ? `${base.origin}${favicon}` : `${base.origin}/${favicon}`;
    }
    if (!favicon) {
      favicon = `${new URL(url).origin}/favicon.ico`;
    }

    const data: OGData = {
      url,
      title: title || new URL(url).hostname,
      description: description?.slice(0, 200),
      image,
      siteName,
      favicon,
      type,
    };

    // Cache the result
    cache.set(url, { data, expires: Date.now() + CACHE_TTL });

    // Clean old cache entries periodically
    if (cache.size > 500) {
      const now = Date.now();
      for (const [key, val] of cache) {
        if (val.expires < now) cache.delete(key);
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ url, title: new URL(url).hostname }, { status: 200 });
    }
    return NextResponse.json({ url, title: url }, { status: 200 });
  }
}
