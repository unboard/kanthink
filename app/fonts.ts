/**
 * Every font the app uses, self-hosted from ./fonts (latin subsets, from Fontsource, OFL).
 *
 * These used to come from next/font/google, which downloads from Google at build time.
 * On Vercel that download failed often enough ("next/font/google queries have exactly one
 * entry", "Can't resolve '@vercel/turbopack-next/internal/font/google/font'") to break
 * deploys. Local files can't fail that way. Don't go back to next/font/google: to add a
 * font, drop its woff2 into ./fonts and declare it here.
 */
import localFont from 'next/font/local'

export const geistSans = localFont({
  src: './fonts/geist-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-geist-sans',
})

export const geistMono = localFont({
  src: './fonts/geist-mono-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-geist-mono',
})

export const instrumentSans = localFont({
  src: './fonts/instrument-sans-latin-wght-normal.woff2',
  weight: '400 700',
  variable: '--font-print',
})

export const fredoka = localFont({
  src: './fonts/fredoka-latin-wght-normal.woff2',
  weight: '300 700',
  variable: '--font-easy',
})

export const bricolageStudio = localFont({
  src: './fonts/bricolage-grotesque-latin-opsz-normal.woff2',
  weight: '200 800',
  variable: '--font-studio',
})

export const bricolageSparks = localFont({
  src: './fonts/bricolage-grotesque-latin-opsz-normal.woff2',
  weight: '200 800',
  variable: '--font-sparks',
})

export const fraunces = localFont({
  src: './fonts/fraunces-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-fraunces',
})

export const spectral = localFont({
  src: [
    { path: './fonts/spectral-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/spectral-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/spectral-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/spectral-latin-600-italic.woff2', weight: '600', style: 'italic' },
    { path: './fonts/spectral-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './fonts/spectral-latin-700-italic.woff2', weight: '700', style: 'italic' },
  ],
  variable: '--font-spectral',
})

export const anton = localFont({
  src: './fonts/anton-latin-400-normal.woff2',
  weight: '400',
  variable: '--font-anton',
})

export const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-inter',
})

export const baloo = localFont({
  src: './fonts/baloo-2-latin-wght-normal.woff2',
  weight: '400 800',
  variable: '--font-baloo',
})

export const nunito = localFont({
  src: './fonts/nunito-latin-wght-normal.woff2',
  weight: '200 1000',
  variable: '--font-nunito',
})
