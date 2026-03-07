import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { shrooms, getShroom } from '@/lib/marketplace-data'
import { ShroomProductClient } from './client'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return shrooms.map(s => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const shroom = getShroom(slug)
  if (!shroom) return {}

  return {
    title: shroom.name,
    description: shroom.description,
    openGraph: {
      title: `${shroom.name} — Kanthink Shroom`,
      description: shroom.tagline,
      siteName: 'Kanthink Marketplace',
      type: 'website',
    },
  }
}

export default async function ShroomPage({ params }: Props) {
  const { slug } = await params
  const shroom = getShroom(slug)
  if (!shroom) notFound()

  return <ShroomProductClient shroom={shroom} />
}
