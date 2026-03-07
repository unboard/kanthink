import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | Kanthink Marketplace',
    default: 'Marketplace | Kanthink',
  },
  description: 'Discover pre-built AI shrooms and channels to supercharge your Kanthink boards. Browse automation templates, team workflows, and community spaces — all free.',
  openGraph: {
    title: 'Kanthink Marketplace',
    description: 'Pre-built AI automations and channels for your Kanban boards',
    siteName: 'Kanthink',
    type: 'website',
  },
}

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0e0e0e]">
      {children}
    </div>
  )
}
