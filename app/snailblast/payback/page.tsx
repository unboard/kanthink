'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import '../mcs-theme.css';
import './payback.css';
import { ConceptSwitcher } from '@/components/snailblast/ConceptSwitcher';
import { estimateCost, inHomeWindow, type AudienceMode } from '@/lib/snailblast/campaign';

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

/**
 * Default value of one won customer, by trade. These are starting points the
 * visitor is expected to overwrite — the field is editable and the number is
 * theirs, not ours. Nothing downstream treats them as fact.
 */
const TRADES = [
  { id: 'lawn', label: 'lawn care company', value: 600 },
  { id: 'hvac', label: 'HVAC business', value: 450 },
  { id: 'dental', label: 'dental practice', value: 800 },
  { id: 'roofing', label: 'roofing company', value: 9000 },
  { id: 'cleaning', label: 'house cleaning business', value: 400 },
  { id: 'auto', label: 'auto detailing shop', value: 200 },
  { id: 'restaurant', label: 'restaurant', value: 60 },
  { id: 'realestate', label: 'real estate agent', value: 7500 },
  { id: 'salon', label: 'salon or spa', value: 250 },
];

/**
 * Benchmark response rates, ANA/DMA Response Rate Report 2025 edition.
 * These seed the slider; the visitor can move it, which is the point — the
 * assumption is on screen and adjustable rather than hidden inside the result.
 */
const AUDIENCES: { id: AudienceMode; label: string; rate: number; note: string }[] = [
  { id: 'upload', label: 'my own customer list', rate: 9.0, note: 'House lists average 9%.' },
  { id: 'targeted', label: 'a targeted list I build', rate: 4.9, note: 'Prospect lists average 4.9%.' },
  { id: 'eddm', label: 'every home in my area', rate: 4.4, note: 'All direct mail averages 4.4%.' },
];

/** Sign goes outside the symbol — "-$820", not "$-820". */
const money = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}$${Math.abs(r).toLocaleString()}`;
};

export default function PaybackConcept() {
  const [tradeId, setTradeId] = useState('lawn');
  const [audienceId, setAudienceId] = useState<AudienceMode>('eddm');
  const [pieces, setPieces] = useState(2000);
  const [value, setValue] = useState(600);
  const [rate, setRate] = useState(4.4);
  // A reply is not a sale. Modelling them as the same thing is the single
  // biggest way these calculators flatter themselves, so closing is its own
  // input and starts deliberately conservative.
  const [close, setClose] = useState(30);

  const audience = AUDIENCES.find((a) => a.id === audienceId) ?? AUDIENCES[2];

  const onTrade = (id: string) => {
    setTradeId(id);
    const t = TRADES.find((x) => x.id === id);
    if (t) setValue(t.value);
  };

  const onAudience = (id: AudienceMode) => {
    setAudienceId(id);
    const a = AUDIENCES.find((x) => x.id === id);
    if (a) setRate(a.rate);
  };

  const result = useMemo(() => {
    const safePieces = Math.max(100, Math.min(100_000, pieces || 0));
    const cost = estimateCost(audienceId, safePieces);
    const window = inHomeWindow(audienceId);
    const responses = (safePieces * rate) / 100;
    const customers = (responses * close) / 100;
    const revenue = customers * Math.max(0, value || 0);
    // Judged against the top of the cost range, so the number shown is the
    // conservative one. A calculator that flatters itself is worthless.
    const net = revenue - cost.totalHigh;
    const multiple = cost.totalHigh > 0 ? revenue / cost.totalHigh : 0;
    return { safePieces, cost, window, responses, customers, revenue, net, multiple };
  }, [audienceId, pieces, rate, value, close]);

  const profitable = result.net > 0;

  return (
    <div className="mcs-root">
      <div className="mcs-wrap pb-nav">
        <Link href="/snailblast/payback" className="pb-mark">
          <Snail className="pb-mark-glyph" /> SnailBlast
        </Link>
        <a className="mcs-btn mcs-btn-ghost" href={START}>Start a campaign</a>
      </div>

      {/* ------------------------------------------------------------ hero */}
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

        {/* The signature: inputs read as a sentence, answer sits beside them. */}
        <div className="pb-slab">
          <div className="pb-inputs">
            <p className="pb-sentence">
              I run a{' '}
              <select className="pb-slot" value={tradeId} aria-label="Your trade"
                onChange={(e) => onTrade(e.target.value)}>
                {TRADES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              . I want to mail{' '}
              <input className="pb-slot pb-slot-num" type="number" min={100} max={100000} step={100}
                value={pieces} aria-label="Number of postcards"
                onChange={(e) => setPieces(Number(e.target.value))} />
              {' '}postcards to{' '}
              <select className="pb-slot" value={audienceId} aria-label="Audience"
                onChange={(e) => onAudience(e.target.value as AudienceMode)}>
                {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              . One new customer is worth about{' '}
              <input className="pb-slot pb-slot-money" type="number" min={0} step={10}
                value={value} aria-label="Value of one customer"
                onChange={(e) => setValue(Number(e.target.value))} />
              {' '}to me.
            </p>

            <div className="pb-rate">
              <div className="pb-rate-top">
                <span className="pb-rate-label">Response rate I&apos;m assuming</span>
                <span className="pb-rate-val">{rate.toFixed(2)}%</span>
              </div>
              <input className="pb-range" type="range" min={0.1} max={12} step={0.1}
                value={rate} aria-label="Assumed response rate"
                onChange={(e) => setRate(Number(e.target.value))} />
              <p className="pb-rate-note">
                <strong>{audience.note}</strong> That benchmark is a category
                average across many advertisers, so drag it to whatever you
                actually believe. Every number on the right moves with it.
              </p>
            </div>

            <div className="pb-rate">
              <div className="pb-rate-top">
                <span className="pb-rate-label">And I close</span>
                <span className="pb-rate-val">{close}%</span>
              </div>
              <input className="pb-range" type="range" min={1} max={100} step={1}
                value={close} aria-label="Percentage of responses you close"
                onChange={(e) => setClose(Number(e.target.value))} />
              <p className="pb-rate-note">
                <strong>Of the people who reply, how many actually buy?</strong>{' '}
                Someone calling for a quote is not yet a customer. Most
                calculators skip this step, which is how they end up promising
                returns nobody sees.
              </p>
            </div>
          </div>

          <div className="pb-out">
            <div>
              <div className="pb-hero-num">
                {profitable ? `${result.multiple.toFixed(1)}×` : money(result.net)}
              </div>
              <div className="pb-hero-num-sub">
                {profitable
                  ? `back on what you spend — ${money(result.net)} net`
                  : 'you would lose money at these numbers'}
              </div>
            </div>

            <div className="pb-breakdown">
              <div className="pb-line">
                <span className="pb-line-key">{result.safePieces.toLocaleString()} postcards</span>
                <span className="pb-line-val">
                  {money(result.cost.totalLow)}–{money(result.cost.totalHigh)}
                </span>
              </div>
              <div className="pb-line">
                <span className="pb-line-key">Replies at {rate.toFixed(2)}%</span>
                <span className="pb-line-val">
                  {result.responses < 1 ? result.responses.toFixed(1) : Math.round(result.responses).toLocaleString()}
                </span>
              </div>
              <div className="pb-line">
                <span className="pb-line-key">Customers won at {close}%</span>
                <span className="pb-line-val">
                  {result.customers < 1 ? result.customers.toFixed(1) : Math.round(result.customers).toLocaleString()}
                </span>
              </div>
              <div className="pb-line">
                <span className="pb-line-key">What they&apos;re worth</span>
                <span className="pb-line-val">{money(result.revenue)}</span>
              </div>
              <div className="pb-line pb-line-strong">
                <span className="pb-line-key">In mailboxes</span>
                <span className="pb-line-val">{result.window.earliest}</span>
              </div>
            </div>

            {!profitable && (
              <div className="pb-warn">
                <TriangleAlert size={16} style={{ flex: 'none', marginTop: '0.125rem' }} />
                <span>
                  At this response rate and customer value, the mail costs more
                  than it returns. Raise the value of a customer, mail a warmer
                  list, or don&apos;t run it.
                </span>
              </div>
            )}

            <div className="pb-out-foot">
              <a className="mcs-btn mcs-btn-primary mcs-btn-lg" href={START} style={{ width: '100%' }}>
                Build this campaign <ArrowRight size={16} strokeWidth={2.5} />
              </a>
              <p className="pb-out-note">
                Cost is an estimate covering print, postage and mailing; exact
                price is set in the campaign builder. Response and revenue are
                your assumptions, not a forecast or a guarantee.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- the maths */}
      <section className="mcs-section mcs-section-alt">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">No black box</span>
          <h2 className="mcs-h2">Every number above, and where it comes from.</h2>
          <p className="mcs-lede">
            Five inputs, one multiplication. If a calculator won&apos;t show you its
            working, it is selling you something.
          </p>

          <div className="pb-math">
            {[
              { k: 'Input 1', t: 'What you spend', b: 'Piece count times a per-piece rate covering print, postage and mailing. The rate falls as volume climbs. Shown as a range because paper stock and finish move it.' },
              { k: 'Input 2', t: 'Who you mail', b: 'Your own customers respond roughly twice as often as a cold list. That single choice moves the answer more than anything else on this page.' },
              { k: 'Input 3', t: 'How many reply', b: 'Piece count times the response rate you set. Seeded with the ANA/DMA category average for the audience you picked, then yours to change.' },
              { k: 'Input 4', t: 'How many you close', b: 'A reply is not a sale. Somebody ringing for a quote still has to become a customer, and skipping that step is how these calculators end up promising returns nobody ever sees.' },
              { k: 'Input 5', t: 'What a customer is worth', b: 'Your number, not ours. A roofer and a coffee shop are not in the same business, and one won customer is worth wildly different amounts to each.' },
            ].map((m) => (
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

      {/* ---------------------------------------------------------- routes */}
      <section className="mcs-section">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">The lever that matters most</span>
          <h2 className="mcs-h2">Who you mail beats what you mail.</h2>

          <div className="pb-routes">
            {[
              { rate: '9%', who: 'Your own customers', body: 'Upload a CSV from your CRM. They already bought once, they know your name, and they respond at roughly double the rate of strangers.' },
              { rate: '4.9%', who: 'A targeted list', body: 'Build one by radius, income, homeowner status and more. Colder than your own list, but you choose exactly who gets it.' },
              { rate: '4.4%', who: 'Every home in an area', body: 'EDDM mails a whole carrier route with no list at all. The cheapest per piece, and the right call when your customer is simply "nearby".' },
            ].map((r) => (
              <article key={r.who} className="mcs-card mcs-card-hover">
                <div className="pb-route-rate">{r.rate}<span>avg response</span></div>
                <h3 className="mcs-h3" style={{ marginTop: '0.5rem' }}>{r.who}</h3>
                <p className="pb-route-body">{r.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- final cta */}
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
