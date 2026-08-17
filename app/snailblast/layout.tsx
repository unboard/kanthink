import type { Metadata } from 'next';
import { Inter, IBM_Plex_Mono, Poppins } from 'next/font/google';
import './snailblast.css';

// Inter is shipaton.com's face, so it comes with the borrowed UI style.
// IBM Plex Mono carries the postal layer — routing codes, ZIPs, sources. It was
// drawn for institutional/technical text, which is exactly the register a piece
// of addressed mail speaks in.
const sbSans = Inter({
  subsets: ['latin'],
  variable: '--font-sb-sans',
  display: 'swap',
});

const sbMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sb-mono',
  display: 'swap',
});

// MyCreativeShop's own brand face, for the concept pages rendered in MCS theme.
const mcsSans = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-mcs-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SnailBlast — nobody deletes a postcard',
  description:
    'Design, print & mail postcards to anyone, anywhere in the USA. Direct mail gets a 4.4% response rate. Email gets 0.12%. Try it free — pay only if you mail.',
};

export default function SnailBlastLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${sbSans.variable} ${sbMono.variable} ${mcsSans.variable}`}>{children}</div>
  );
}
