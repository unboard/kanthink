/**
 * Web Tools for Kan AI
 * Provides URL fetching with SSRF protection, caching, and HTML-to-text conversion
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

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

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];

  // Deduplicate and clean up trailing punctuation
  const cleaned = matches.map(url => {
    // Remove trailing punctuation that's likely not part of the URL
    return url.replace(/[.,;:!?)]+$/, '');
  });

  // Deduplicate
  const unique = [...new Set(cleaned)];

  // Limit to max URLs per request
  return unique.slice(0, CONFIG.MAX_URLS_PER_REQUEST);
}

// ============================================================================
// HTML to Text Conversion
// ============================================================================

function htmlToText(html: string, url: string): { title: string; text: string; excerpt: string } {
  try {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    // Try Readability first for article-like content
    const reader = new Readability(document.cloneNode(true) as Document);
    const article = reader.parse();

    if (article && article.textContent) {
      const text = article.textContent
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, CONFIG.MAX_TEXT_CHARS);

      return {
        title: article.title || document.title || '',
        text,
        excerpt: article.excerpt || text.slice(0, 300) + '...',
      };
    }

    // Fallback: extract text from body
    const body = document.body;
    if (!body) {
      return { title: document.title || '', text: '', excerpt: '' };
    }

    // Remove script, style, nav, footer, etc.
    const elementsToRemove = body.querySelectorAll(
      'script, style, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"]'
    );
    elementsToRemove.forEach(el => el.remove());

    const text = (body.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, CONFIG.MAX_TEXT_CHARS);

    return {
      title: document.title || '',
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
    const { title, text, excerpt } = htmlToText(html, finalUrl);

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
