/**
 * Just enough color science to build a palette that reads.
 *
 * Contrast is WCAG 2 relative luminance, the check every accessibility tool
 * reports against. Palettes are built in OKLCH, which keeps lightness
 * perceptually even, so a brand color can be lightened or darkened until text
 * on it passes without its hue drifting. No dependencies: the conversions are a
 * few dozen lines, and this module also runs in the browser.
 */

export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex([r, g, b]: Rgb): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && hexToRgb(value) !== null
}

/** "R G B", the form Tailwind's `<alpha-value>` colors read from a CSS variable. */
export function rgbChannels(hex: string): string {
  const rgb = hexToRgb(hex) ?? [0, 0, 0]
  return rgb.join(' ')
}

function channelToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function linearToChannel(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return s * 255
}

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map(channelToLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// --- OKLCH -----------------------------------------------------------------

export type Oklch = { l: number; c: number; h: number }

export function hexToOklch(hex: string): Oklch {
  const rgb = hexToRgb(hex) ?? [0, 0, 0]
  const [r, g, b] = rgb.map(channelToLinear)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.sqrt(A * A + B * B)
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const A = c * Math.cos(hr)
  const B = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

/** Back to hex, pulling chroma in until the color fits in sRGB rather than clipping it. */
export function oklchToHex(color: Oklch): string {
  let c = color.c
  for (let i = 0; i < 24; i++) {
    const lin = oklchToLinear({ ...color, c })
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) {
      return rgbToHex(lin.map((v) => linearToChannel(Math.min(1, Math.max(0, v)))) as Rgb)
    }
    c *= 0.88
  }
  return rgbToHex(oklchToLinear({ ...color, c: 0 }).map((v) => linearToChannel(Math.min(1, Math.max(0, v)))) as Rgb)
}

/** Whichever of two text colors reads better on `bg`. */
export function bestText(bg: string, light = '#FFFFFF', dark = '#14151A'): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark
}

/**
 * Move a color's lightness, keeping its hue, until `text` on it reaches `min`.
 * Used to make a brand color safe as a button without making it a different color.
 */
export function fitForText(color: string, text: string, min = 4.5): string {
  if (contrast(color, text) >= min) return color
  const start = hexToOklch(color)
  const darker = luminance(text) > 0.5
  for (let step = 1; step <= 40; step++) {
    const l = start.l + (darker ? -1 : 1) * step * 0.015
    if (l <= 0.05 || l >= 0.98) break
    const candidate = oklchToHex({ ...start, l })
    if (contrast(candidate, text) >= min) return candidate
  }
  return darker ? '#1A1A1A' : '#F5F5F5'
}

/**
 * The colors an image is mostly made of, most prominent first, skipping
 * near-white, near-black and grays — a logo's background is rarely its brand.
 * Takes raw RGBA pixels so it works on a canvas in the browser and in tests.
 */
export function dominantColors(pixels: Uint8ClampedArray | number[], max = 3): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number; chroma: number }>()
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]
    if (a < 128) continue
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b)
    const chroma = hi - lo
    if (chroma < 28 || hi < 30 || lo > 235) continue
    const key = `${r >> 4},${g >> 4},${b >> 4}`
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, chroma: 0 }
    bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b; bucket.chroma += chroma
    buckets.set(key, bucket)
  }
  const ranked = [...buckets.values()]
    .map((b) => ({ hex: rgbToHex([b.r / b.n, b.g / b.n, b.b / b.n]), score: b.n * (0.5 + b.chroma / b.n / 255) }))
    .sort((a, b) => b.score - a.score)
  const picked: string[] = []
  for (const { hex } of ranked) {
    const o = hexToOklch(hex)
    // One entry per hue family: two shades of the same red are one brand color.
    if (picked.some((p) => Math.abs(hexToOklch(p).h - o.h) < 25)) continue
    picked.push(hex)
    if (picked.length >= max) break
  }
  return picked
}
