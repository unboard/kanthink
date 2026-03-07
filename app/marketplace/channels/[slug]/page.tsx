import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { channels, getChannel } from '@/lib/marketplace-data'
import { ChannelProductClient } from './client'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return channels.map(c => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const channel = getChannel(slug)
  if (!channel) return {}

  return {
    title: channel.name,
    description: channel.description,
    openGraph: {
      title: `${channel.name} — Kanthink Channel`,
      description: channel.tagline,
      siteName: 'Kanthink Marketplace',
      type: 'website',
    },
  }
}

export default async function ChannelPage({ params }: Props) {
  const { slug } = await params
  const channel = getChannel(slug)
  if (!channel) notFound()

  return <ChannelProductClient channel={channel} />
}
