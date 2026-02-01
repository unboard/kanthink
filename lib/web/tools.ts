/**
 * Web Tools for Kan AI
 * Provides URL fetching with SSRF protection, caching, and HTML-to-text conversion
 */

import * as cheerio from 'cheerio';

// ============================================================================
// Types
// ============================================================================

export interface FetchedPage {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  excerpt: string;
  status: number;
  contentType: string;
  cached: boolean;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Timeouts and limits
  TIMEOUT_MS: 10000,
  MAX_BYTES: 2 * 1024 * 1024, // 2MB
  MAX_REDIRECTS: 5,
  MAX_TEXT_CHARS: 30000,
  MAX_URLS_PER_REQUEST: 3,

  // Cache
  CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutes

  // Allowed content types
  ALLOWED_CONTENT_TYPES: [
    'text/html',
    'text/plain',
    'application/xhtml+xml',
  ],
};

// ============================================================================
// SSRF Protection
// ============================================================================

// Private IP ranges and blocked hosts
const BLOCKED_PATTERNS = [
  // Localhost
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^::1$/,

  // Private networks (RFC 1918)
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,

  // Link-local
  /^169\.254\.\d+\.\d+$/,
  /^fe80:/i,

  // .local domains
  /\.local$/i,

  // Cloud metadata endpoints
  /^169\.254\.169\.254$/,
  /^metadata\.google\.internal$/i,
  /^metadata\.aws\.internal$/i,

  // Internal hostnames
  /^internal\./i,
  /^private\./i,
  /^intranet\./i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(hostname));
}

function isBlockedUrl(url: string): { blocked: boolean; reason?: string } {
  try {
    const parsed = new URL(url);

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { blocked: true, reason: 'Only HTTP/HTTPS URLs are allowed' };
    }

    // Check hostname against blocklist
    if (isBlockedHost(parsed.hostname)) {
      return { blocked: true, reason: 'This address is not accessible' };
    }

    // Block URLs with credentials
    if (parsed.username || parsed.password) {
      return { blocked: true, reason: 'URLs with credentials are not allowed' };
    }

    return { blocked: false };
  } catch {
    return { blocked: true, reason: 'Invalid URL format' };
  }
}

// ============================================================================
// URL Extraction
// ============================================================================

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

// Match domain names like "jace.ai", "example.com", "sub.domain.co.uk"
const DOMAIN_REGEX = /\b([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;

// Common TLDs to help identify domains vs normal words
const COMMON_TLDS = new Set([
  'com', 'org', 'net', 'io', 'ai', 'co', 'app', 'dev', 'xyz', 'info',
  'biz', 'me', 'tv', 'cc', 'us', 'uk', 'ca', 'de', 'fr', 'jp', 'au',
  'edu', 'gov', 'tech', 'online', 'site', 'store', 'blog', 'cloud',
]);

function extractDomains(text: string): string[] {
  const matches = text.match(DOMAIN_REGEX) || [];

  // Filter to only include likely domains (with common TLDs)
  return matches.filter(domain => {
    const tld = domain.split('.').pop()?.toLowerCase();
    return tld && COMMON_TLDS.has(tld);
  });
}

export function extractUrls(text: string): string[] {
  // First, extract full URLs
  const urlMatches = text.match(URL_REGEX) || [];
  const cleanedUrls = urlMatches.map(url => url.replace(/[.,;:!?)]+$/, ''));

  // Then, extract bare domains and convert to URLs
  const domains = extractDomains(text);
  const domainUrls = domains
    .filter(domain => {
      // Don't convert if it's already part of a full URL
      return !cleanedUrls.some(url => url.includes(domain));
    })
    .map(domain => `https://${domain}`);

  // Combine and deduplicate
  const allUrls = [...cleanedUrls, ...domainUrls];
  const unique = [...new Set(allUrls)];

  // Limit to max URLs per request
  return unique.slice(0, CONFIG.MAX_URLS_PER_REQUEST);
}

// ============================================================================
// HTML to Text Conversion
// ============================================================================

function htmlToText(html: string): { title: string; text: string; excerpt: string } {
  try {
    const $ = cheerio.load(html);

    // Get title
    const title = $('title').text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      '';

    // Remove non-content elements
    $('script, style, nav, footer, header, aside, noscript, iframe, svg').remove();
    $('[role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]').remove();
    $('form, button, input, select, textarea').remove();

    // Try to find main content
    let contentElement = $('main, article, [role="main"]').first();
    if (contentElement.length === 0) {
      contentElement = $('body');
    }

    // Extract text, preserving some structure
    const text = contentElement
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, CONFIG.MAX_TEXT_CHARS);

    return {
      title,
      text,
      excerpt: text.slice(0, 300) + (text.length > 300 ? '...' : ''),
    };
  } catch (error) {
    console.error('HTML parsing error:', error);
    return { title: '', text: '', excerpt: '' };
  }
}

// ============================================================================
// Caching
// ============================================================================

interface CacheEntry {
  page: FetchedPage;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(url: string): FetchedPage | null {
  const entry = cache.get(url);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return null;
  }

  return { ...entry.page, cached: true };
}

function setCache(url: string, page: FetchedPage): void {
  cache.set(url, {
    page,
    expiresAt: Date.now() + CONFIG.CACHE_TTL_MS,
  });

  // Simple cache cleanup - remove expired entries periodically
  if (cache.size > 100) {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiresAt) {
        cache.delete(key);
      }
    }
  }
}

// ============================================================================
// URL Fetching
// ============================================================================

export async function fetchUrl(url: string): Promise<FetchedPage> {
  // Check cache first
  const cached = getCached(url);
  if (cached) return cached;

  // SSRF check
  const ssrfCheck = isBlockedUrl(url);
  if (ssrfCheck.blocked) {
    return {
      url,
      finalUrl: url,
      title: '',
      text: '',
      excerpt: '',
      status: 0,
      contentType: '',
      cached: false,
      error: ssrfCheck.reason,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KanthinkBot/1.0 (+https://kanthink.com)',
        'Accept': 'text/html,text/plain,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    // Check final URL after redirects (SSRF check again)
    const finalUrl = response.url;
    const finalSsrfCheck = isBlockedUrl(finalUrl);
    if (finalSsrfCheck.blocked) {
      return {
        url,
        finalUrl,
        title: '',
        text: '',
        excerpt: '',
        status: response.status,
        contentType: '',
        cached: false,
        error: 'Redirect led to blocked address',
      };
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    const isAllowedType = CONFIG.ALLOWED_CONTENT_TYPES.some(t =>
      contentType.toLowerCase().includes(t)
    );

    if (!isAllowedType) {
      return {
        url,
        finalUrl,
        title: '',
        text: '',
        excerpt: '',
        status: response.status,
        contentType,
        cached: false,
        error: `Unsupported content type: ${contentType}`,
      };
    }

    // Read body with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > CONFIG.MAX_BYTES) {
        reader.cancel();
        break;
      }

      chunks.push(value);
    }

    const html = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const combined = new Uint8Array(acc.length + chunk.length);
        combined.set(acc);
        combined.set(chunk, acc.length);
        return combined;
      }, new Uint8Array())
    );

    // Parse HTML to text
    const { title, text, excerpt } = htmlToText(html);

    const page: FetchedPage = {
      url,
      finalUrl,
      title,
      text,
      excerpt,
      status: response.status,
      contentType,
      cached: false,
    };

    // Cache successful fetches
    if (response.ok && text) {
      setCache(url, page);
    }

    return page;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      url,
      finalUrl: url,
      title: '',
      text: '',
      excerpt: '',
      status: 0,
      contentType: '',
      cached: false,
      error: errorMessage.includes('abort')
        ? 'Request timed out'
        : `Failed to fetch: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Batch Fetch (for multiple URLs)
// ============================================================================

export async function fetchUrls(urls: string[]): Promise<FetchedPage[]> {
  const limited = urls.slice(0, CONFIG.MAX_URLS_PER_REQUEST);
  return Promise.all(limited.map(fetchUrl));
}

// ============================================================================
// Format for LLM Context
// ============================================================================

export function formatWebContext(pages: FetchedPage[]): string {
  const successful = pages.filter(p => !p.error && p.text);

  if (successful.length === 0) {
    return '';
  }

  const formatted = successful.map(page => {
    const lines = [
      `URL: ${page.finalUrl}`,
      page.title && `Title: ${page.title}`,
      `Content:\n${page.text}`,
    ].filter(Boolean);

    return lines.join('\n');
  });

  return `
=== WEB_CONTEXT (fetched pages) ===
${formatted.join('\n\n---\n\n')}
=== END WEB_CONTEXT ===

INSTRUCTION: The content above was fetched from the web. Use it as the source of truth for claims about these pages. If you reference information from these pages, mention that it comes from the fetched content.
`.trim();
}

// ============================================================================
// Intent Detection (for web search)
// ============================================================================

const SEARCH_INTENT_PATTERNS = [
  /\b(search|look up|find|google|lookup)\b/i,
  /\b(latest|recent|current|news|today)\b/i,
  /\b(what is|who is|where is|when is|how to)\b/i,
  /\btell me about\b/i,
  /\bwhat do you know about\b/i,
  /\binfo on\b|information (on|about)\b/i,
  /\b(compare|vs|versus|difference between)\b/i,
  /\b(best|top|popular|trending)\b/i,
  /\b(price|cost|review|rating)\b/i,
];

export function detectsSearchIntent(text: string): boolean {
  // If there's a URL, don't treat as search intent
  if (extractUrls(text).length > 0) {
    return false;
  }

  return SEARCH_INTENT_PATTERNS.some(pattern => pattern.test(text));
}
