import type { Metadata, Viewport } from 'next'
import { instrumentSans as sans } from '@/app/fonts'
import '../print/print.css'
import '@/components/proof/proof.css'

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f4f3ef' }

/** A printer's page for their customer: their brand, none of the app around it. */
export default function ProofLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} fixed inset-0 z-[60] proof`}>{children}</div>
}
