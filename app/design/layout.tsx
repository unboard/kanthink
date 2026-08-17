import type { Metadata } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import './design.css';

// The studio's utility face. Plex Mono was drawn for institutional and technical
// text, which is the exact register of a press spec — trim, bleed, safe margin,
// the dimensions printed under a proof. It carries that layer; everything else
// stays in the app's Geist so the chrome never competes with the artwork.
const dsMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ds-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Design — Kanthink',
  description: 'Describe a print piece, upload your logo, and get a print-ready design back.',
};

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${dsMono.variable} h-full min-h-0`}>{children}</div>;
}
