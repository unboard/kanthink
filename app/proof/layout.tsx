import type { Metadata, Viewport } from 'next'
import { Instrument_Sans } from 'next/font/google'
import '../print/print.css'
import '@/components/proof/proof.css'

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-print', weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f3ef' }

/** A printer's page for their customer: their brand, none of the app around it. */
export default function ProofLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} fixed inset-0 z-[60] proof`}>{children}</div>
}
