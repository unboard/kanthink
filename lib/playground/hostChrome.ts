import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { findAppOwnerId } from './publicApp'
import { resolveStyle, tokenColors, type AppStyle } from './style/tokens'
import { rgbChannels, contrast } from './style/color'

/**
 * What the page around a published app looks like: its footer, the conversation
 * with the maker, the sign-in sheet.
 *
 * All three take their colours from the app's own style, so a dark arcade game gets
 * a dark footer and a newsprint puzzle gets a paper one, and nothing looks bolted
 * on. An app without a style gets a quiet neutral that sits under anything.
 *
 * Handed to the client as CSS variables holding "R G B" channels, so components
 * write rgb(var(--kp-primary)) and opacity variants just work.
 */

export type HostTheme = {
  mode: 'light' | 'dark'
  vars: Record<string, string>
}

export type HostChrome = {
  theme: HostTheme
  maker: { name: string | null; image: string | null }
}

const NEUTRAL = {
  mode: 'light' as const,
  background: '#FFFFFF',
  foreground: '#18181B',
  card: '#FFFFFF',
  muted: '#F4F4F5',
  mutedForeground: '#71717A',
  border: '#E4E4E7',
  primary: '#18181B',
  primaryForeground: '#FFFFFF',
}

export function hostTheme(style: AppStyle | null | undefined): HostTheme {
  const c = style ? (() => {
    const resolved = resolveStyle(style)
    const t = tokenColors(resolved.palette)
    return { mode: resolved.palette.mode, ...t }
  })() : NEUTRAL
  // The bar under the app is its card colour where that stands apart from the page,
  // otherwise the muted fill, so the footer reads as part of the app, not of the page.
  const bar = contrast(c.card, c.background) > 1.05 ? c.card : c.muted
  return {
    mode: c.mode,
    vars: {
      '--kp-bg': rgbChannels(c.background),
      '--kp-fg': rgbChannels(c.foreground),
      '--kp-card': rgbChannels(c.card),
      '--kp-bar': rgbChannels(bar),
      '--kp-muted': rgbChannels(c.muted),
      '--kp-muted-fg': rgbChannels(c.mutedForeground),
      '--kp-border': rgbChannels(c.border),
      '--kp-primary': rgbChannels(c.primary),
      '--kp-primary-fg': rgbChannels(c.primaryForeground),
    },
  }
}

/** The theme, plus who made the app, for the conversation header. */
export async function hostChrome(app: { channelId: string; createdBy?: string | null }, style: AppStyle | null | undefined): Promise<HostChrome> {
  let maker: HostChrome['maker'] = { name: null, image: null }
  try {
    const ownerId = await findAppOwnerId(app)
    const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { name: true, image: true } })
    if (owner) maker = { name: owner.name, image: owner.image }
  } catch { /* the conversation still works without a face */ }
  return { theme: hostTheme(style), maker }
}
