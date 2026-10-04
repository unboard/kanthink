/**
 * Brand colors from a logo.
 *
 * Buckets opaque pixels coarsely, then merges buckets that look the same, so a logo
 * with anti-aliased edges yields its three or four real colors rather than forty
 * shades of its edges. Near-white is skipped (it's usually the ground, not the brand);
 * near-black is kept only when it is a real part of the mark.
 */

export function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function normalizeHex(hex: string): string | null {
  const rgb = hexToRgb(hex)
  return rgb ? toHex(...rgb) : null
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  // Weighted RGB ("redmean") — cheap and close enough to perceptual for merging.
  const rm = (a[0] + b[0]) / 2
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
}

export function extractPalette(
  pixels: Uint8Array | Uint8ClampedArray,
  channels: 3 | 4,
  max = 5,
): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  let counted = 0
  for (let i = 0; i < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 200) continue
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    if (Math.min(r, g, b) > 238) continue
    // Light grays are anti-aliasing and paper, not brand.
    if (Math.min(r, g, b) > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 24) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n++
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
    counted++
  }
  if (counted === 0) return []

  const colors = [...buckets.values()]
    .map((c) => ({ n: c.n, rgb: [c.r / c.n, c.g / c.n, c.b / c.n] as [number, number, number] }))
    .sort((a, b) => b.n - a.n)

  const merged: { n: number; rgb: [number, number, number] }[] = []
  for (const c of colors) {
    const near = merged.find((m) => distance(m.rgb, c.rgb) < 70)
    if (near) {
      const total = near.n + c.n
      near.rgb = near.rgb.map((v, k) => (v * near.n + c.rgb[k] * c.n) / total) as [number, number, number]
      near.n = total
    } else {
      merged.push({ ...c })
    }
  }

  return merged
    .filter((c) => c.n / counted > 0.015)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => toHex(...c.rgb))
}
