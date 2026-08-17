'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import '../mcs-theme.css';
import './payback.css';
import { ConceptSwitcher } from '@/components/snailblast/ConceptSwitcher';
import { PaybackCalculator } from '@/components/snailblast/PaybackCalculator';

const START = '/snailblast/start';

function Snail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.2 17.6h12.4" /><path d="M2.2 17.6c0-2.4 1.5-3.9 3.4-4.3" />
      <path d="M4.6 13.3 3.3 10.6" /><circle cx="3.1" cy="9.8" r=".95" />
      <path d="M6.9 13 6.7 10.2" /><circle cx="6.6" cy="9.4" r=".95" />
      <circle cx="14.4" cy="12.4" r="5.2" />
      <path d="M14.4 9.2a3.2 3.2 0 1 1-3.2 3.2 2.05 2.05 0 1 0 2.05-2.05" />
    </svg>
  );
}

const MATH = [
  { k: 'Input 1', t: 'What you spend', b: 'Piece count times a per-piece rate covering print, postage and mailing. The rate falls as volume climbs. Shown as a range because paper stock and finish move it.' },
  { k: 'Input 2', t: 'Who you mail', b: 'Your own customers respond roughly twice as often as a cold list. That single choice moves the answer more than anything else on this page.' },
  { k: 'Input 3', t: 'How many reply', b: 'Piece count times the response rate you set. Seeded with the ANA/DMA category average for the audience you picked, then yours to change.' },
  { k: 'Input 4', t: 'How many you close', b: 'A reply is not a sale. Somebody ringing for a quote still has to become a customer, and skipping that step is how these calculators end up promising returns nobody ever sees.' },
  { k: 'Input 5', t: 'What a customer is worth', b: 'Your number, not ours. A roofer and a coffee shop are not in the same business, and one won customer is worth wildly different amounts to each.' },
];

const ROUTES = [
  { rate: '9%', who: 'Your own customers', body: 'Upload a CSV from your CRM. They already bought once, they know your name, and they respond at roughly double the rate of strangers.' },
  { rate: '4.9%', who: 'A targeted list', body: 'Build one by radius, income, homeowner status and more. Colder than your own list, but you choose exactly who gets it.' },
  { rate: '4.4%', who: 'Every home in an area', body: 'EDDM mails a whole carrier route with no list at all. The cheapest per piece, and the right call when your customer is simply "nearby".' },
];

export default function PaybackConcept() {
  return (
    <div className="mcs-root">
      <div className="mcs-wrap pb-nav">
        <Link href="/snailblast/payback" className="pb-mark">
          <Snail className="pb-mark-glyph" /> SnailBlast
        </Link>
        <a className="mcs-btn mcs-btn-ghost" href={START}>Start a campaign</a>
      </div>

      <section className="mcs-wrap pb-hero">
        <div className="pb-hero-head">
          <div>
            <span className="mcs-pill">Direct mail, costed honestly</span>
            <h1 className="mcs-h1" style={{ marginTop: '1rem' }}>
              Work out what a mailer is <em>actually</em> worth to you.
            </h1>
          </div>
          <p className="mcs-lede">
            Not a brochure. Change the numbers to match your business and watch
            the answer move — including when the answer is no.
          </p>
        </div>

        <div className="pb-slab-wrap">
          <PaybackCalculator />
        </div>
      </section>

      <section className="mcs-section mcs-section-alt">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">No black box</span>
          <h2 className="mcs-h2">Every number above, and where it comes from.</h2>
          <p className="mcs-lede">
            Five inputs, one multiplication. If a calculator won&apos;t show you its
            working, it is selling you something.
          </p>

          <div className="pb-math">
            {MATH.map((m) => (
              <article key={m.k} className="mcs-card">
                <span className="pb-math-key">{m.k}</span>
                <h3 className="pb-math-title">{m.t}</h3>
                <p className="pb-math-body">{m.b}</p>
              </article>
            ))}
          </div>

          <p className="mcs-note" style={{ marginTop: '1.5rem' }}>
            Response benchmarks: ANA/DMA Response Rate Report, 2025 edition —
            house lists 9%, prospect lists 4.9%, all direct mail 4.4%, email
            0.12%. Category averages across many advertisers, not a prediction
            for your campaign.
          </p>
        </div>
      </section>

      <section className="mcs-section">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">The lever that matters most</span>
          <h2 className="mcs-h2">Who you mail beats what you mail.</h2>

          <div className="pb-routes">
            {ROUTES.map((r) => (
              <article key={r.who} className="mcs-card mcs-card-hover">
                <div className="pb-route-rate">{r.rate}<span>avg response</span></div>
                <h3 className="mcs-h3" style={{ marginTop: '0.5rem' }}>{r.who}</h3>
                <p className="pb-route-body">{r.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mcs-section-alt">
        <div className="mcs-wrap pb-final">
          <span className="mcs-eyebrow">When the number works</span>
          <h2 className="mcs-h2">Build it in about five minutes.</h2>
          <p className="mcs-lede">
            Pick your audience, design or upload a postcard, choose the day it
            lands. You don&apos;t pay until you decide to send.
          </p>
          <div style={{ marginTop: '1.75rem' }}>
            <a className="mcs-btn mcs-btn-primary mcs-btn-lg" href={START}>
              Start a campaign <ArrowRight size={16} strokeWidth={2.5} />
            </a>
          </div>
        </div>
      </section>

      <footer className="pb-foot">
        <div className="mcs-wrap">
          <span className="pb-mark"><Snail className="pb-mark-glyph" /> SnailBlast</span>
          <p className="mcs-note" style={{ marginTop: '0.875rem', maxWidth: '70ch' }}>
            A MyCreativeShop product. Every Door Direct Mail® and EDDM® are
            registered trademarks of the United States Postal Service®. Figures
            on this page are estimates and modelled assumptions — your results
            depend on your offer, your list and your market. © 2026
            MyCreativeShop.
          </p>
        </div>
      </footer>

      <ConceptSwitcher />
    </div>
  );
}
