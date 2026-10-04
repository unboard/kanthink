import type { Metadata, Viewport } from 'next'
import { Instrument_Sans } from 'next/font/google'
import './print.css'

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-print', weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Print studio · Kanthink',
  description: 'Describe a print piece and get a print-ready design: right size, full bleed, safe margins, your brand.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className={`print-studio ${sans.variable}`}>{children}</div>
}
