export interface UrlMetadata {
  title?: string
  description?: string
  ogImage?: string
  siteName?: string
}

/**
 * Fetch Open Graph and HTML metadata from a URL.
 * Gracefully returns partial/empty results on any failure.
 */
export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Kanthink/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!response.ok) return {}

    // Read only the first 50KB
    const reader = response.body?.getReader()
    if (!reader) return {}

    let html = ''
    const decoder = new TextDecoder()
    let bytesRead = 0
    const maxBytes = 50 * 1024

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      bytesRead += value.length
    }

    reader.cancel().catch(() => {})

    const result: UrlMetadata = {}

    // Extract og:title or <title>
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)
    if (ogTitle) {
      result.title = decodeEntities(ogTitle[1])
    } else {
      const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleTag) result.title = decodeEntities(titleTag[1].trim())
    }

    // Extract og:description or meta description
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)
    if (ogDesc) {
      result.description = decodeEntities(ogDesc[1])
    } else {
      const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
      if (metaDesc) result.description = decodeEntities(metaDesc[1])
    }

    // Extract og:image
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    if (ogImage) result.ogImage = ogImage[1]

    // Extract og:site_name
    const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i)
    if (ogSite) result.siteName = decodeEntities(ogSite[1])

    return result
  } catch {
    return {}
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}
