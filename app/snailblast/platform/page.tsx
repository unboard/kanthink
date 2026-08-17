'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Star, ArrowRight, Check, MapPin, Upload, Target, Repeat,
  Package, Headphones, ChartLine, Archive, Palette, House,
} from 'lucide-react';
import '../mcs-theme.css';
import './platform.css';
import { ConceptSwitcher } from '@/components/snailblast/ConceptSwitcher';
import { estimateCost, type AudienceMode } from '@/lib/snailblast/campaign';

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

/* ------------------------------------------------------------------ pricing */

/** Chosen to land one per volume band in estimateCost, so no two columns
 *  repeat the same rate. */
const TIERS = [500, 1_000, 5_000, 10_000, 25_000];

const ROWS: { mode: AudienceMode; name: string; sub: string; badge?: string }[] = [
  { mode: 'eddm', name: 'EDDM postcards', sub: 'Every address on a carrier route', badge: 'Most popular' },
  { mode: 'upload', name: 'Your mailing list', sub: 'Upload a CSV and mail it' },
  { mode: 'targeted', name: 'Targeted list', sub: 'Built from demographics' },
];

/* -------------------------------------------------------------------- data */

const USES = [
  { Icon: MapPin, title: 'Own a neighborhood', body: 'Blanket the streets around your shop with EDDM. No list, no names — every mailbox on the route.' },
  { Icon: Repeat, title: 'Win back quiet customers', body: 'Mail the people who already bought from you once. House lists respond at roughly twice the rate of cold ones.' },
  { Icon: Target, title: 'Reach the right households', body: 'Build a list by radius, income, homeowner status and more, then mail only the ones worth mailing.' },
  { Icon: Upload, title: 'Mail your own list', body: 'Bring a CSV from your CRM. We check every column the Post Office needs before you pay a cent.' },
];

/** Verified against the ANA/DMA Response Rate Report, 2025 edition. */
const CHANNELS = [
  { name: 'House list', value: 9.0, dim: false },
  { name: 'Prospect list', value: 4.9, dim: false },
  { name: 'All mail', value: 4.4, dim: false },
  { name: 'Email', value: 0.12, dim: true },
];

const EXTRAS = [
  { Icon: Palette, title: 'A free editor and 1000s of templates', body: 'Every design ships with the mailing guides that keep it deliverable.' },
  { Icon: Archive, title: 'Unlimited campaign storage', body: 'Lists, designs and history stay where you left them. Nothing expires.' },
  { Icon: ChartLine, title: 'Tracking on every order', body: 'A dedicated tracking page plus status emails as pieces move into mailboxes.' },
  { Icon: Headphones, title: 'Real print experts', body: 'Talk to people who set up presses, in the support portal.' },
  { Icon: Package, title: 'Not just postcards', body: 'Door hangers, yard signs, flyers and more from the same account.' },
  { Icon: House, title: 'Everything under one roof', body: 'Audience, design, print, postage and delivery in one place.' },
];

const QUOTES = [
  { text: 'I tried to go through 6 different vendors to be able to create our own cards and send them. All of them were a bit frustrating. This is the first one we found that we can use EDDM and create our own designs at the same time.', name: 'Brandon V.', co: 'Trimlight' },
  { text: 'Outstanding quality and super easy to use design tool. absolutely love this company!!!', name: 'Joshua N.', co: 'Barry Best Seamless Gutters' },
  { text: 'I’m so happy I found this site! I love how user friendly and fast the process has been!', name: 'Lauren B.', co: 'Main Street Dental & Implants' },
];

/* --------------------------------------------------------------- component */

function ResponseBars() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) { setShown(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`plt-bars${shown ? ' is-shown' : ''}`}>
      {CHANNELS.map((c) => (
        <div key={c.name} className="plt-bar-row" data-dim={c.dim}>
          <span className="plt-bar-name">{c.name}</span>
          <span className="plt-bar-track">
            <span className="plt-bar-fill" style={{ ['--w' as string]: `${(c.value / 9) * 100}%` }} />
          </span>
          <span className="plt-bar-val">{c.value}%</span>
        </div>
      ))}
    </div>
  );
}

export default function PlatformConcept() {
  return (
    <div className="mcs-root">
      <div className="plt-banner">
        Print, postage and mailing included — <strong>you only pay if you mail it.</strong>
      </div>

      <header className="plt-nav">
        <div className="mcs-wrap plt-nav-in">
          <Link href="/snailblast/platform" className="plt-mark">
            <Snail className="plt-mark-glyph" /> SnailBlast
          </Link>
          <nav className="plt-nav-links">
            <a href="#uses">Solutions</a>
            <a href="#pricing">Pricing</a>
            <a href="#why">Why mail</a>
            <a href="#reviews">Customers</a>
          </nav>
          <div className="plt-nav-cta">
            <a className="mcs-btn mcs-btn-ghost" href={START}>Sign in</a>
            <a className="mcs-btn mcs-btn-primary" href={START}>Get started</a>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="plt-hero">
        <div className="mcs-wrap plt-hero-grid">
          <div>
            <span className="mcs-pill">Direct mail, without the agency</span>
            <h1 className="mcs-h1" style={{ marginTop: '1rem' }}>
              Put your business on the kitchen counter.
            </h1>
            <p className="mcs-lede">
              Design, print and mail postcards to any address in the USA. Pick a
              neighborhood on the map, upload your own list, or build one from
              scratch — then schedule the day it lands.
            </p>
            <div className="plt-hero-cta">
              <a className="mcs-btn mcs-btn-primary mcs-btn-lg" href={START}>
                Start a campaign <ArrowRight size={16} strokeWidth={2.5} />
              </a>
              <a className="mcs-btn mcs-btn-ghost mcs-btn-lg" href="#pricing">See pricing</a>
            </div>
            <ul className="plt-hero-points">
              <li><Check size={15} strokeWidth={3} color="#00a651" /> No minimums</li>
              <li><Check size={15} strokeWidth={3} color="#00a651" /> No subscription</li>
              <li><Check size={15} strokeWidth={3} color="#00a651" /> Postage included</li>
            </ul>
          </div>

          {/* Product mock — the platform promise, shown rather than described. */}
          <div className="plt-mock" aria-hidden="true">
            <div className="plt-mock-bar">
              <span className="plt-dot" /><span className="plt-dot" /><span className="plt-dot" />
              <span className="plt-mock-title">Campaign builder — Spring cleanup</span>
            </div>
            <div className="plt-mock-body">
              <div className="plt-mock-rows">
                {[
                  ['Maple — Route C001', '311', true],
                  ['Oakwood — Route C002', '352', true],
                  ['Kingsley — Route C003', '308', true],
                  ['Fairview — Route C004', '580', false],
                ].map(([n, c, on]) => (
                  <div key={n as string} className="plt-mock-row" data-on={on}>
                    <span className="plt-mock-tick" />
                    {n}
                    <span className="plt-mock-count">{c}</span>
                  </div>
                ))}
              </div>
              <div className="plt-mock-card">
                <span className="plt-mock-card-kicker">9&quot; × 6.5&quot; · EDDM</span>
                <span className="plt-mock-card-head">Spring cleanup<br />20% off</span>
                <span className="plt-mock-card-foot">Front · address side ready</span>
              </div>
            </div>
            <div className="plt-mock-strip">
              <span>971 addresses selected</span>
              <strong>In mailboxes Sep 2–5</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- trust */}
      <section style={{ paddingBlock: '2.5rem', borderBlock: '1px solid var(--mcs-line)' }}>
        <div className="mcs-wrap mcs-center">
          <p className="mcs-note" style={{ marginBottom: '1.25rem', fontSize: '0.8125rem' }}>
            Loved by 1,000s of businesses
          </p>
          <div className="mcs-logos">
            <span>Sanford</span><span>UPS</span><span>American Family Insurance</span>
            <span>Trimlight</span><span>Barry Best</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ uses */}
      <section id="uses" className="mcs-section">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">Solutions</span>
          <h2 className="mcs-h2">Four ways businesses use SnailBlast.</h2>
          <p className="mcs-lede">
            Same platform underneath. The only thing that changes is who gets the postcard.
          </p>

          <div className="plt-uses">
            {USES.map(({ Icon, title, body }) => (
              <article key={title} className="mcs-card mcs-card-hover">
                <div className="mcs-icon"><Icon size={19} strokeWidth={2} /></div>
                <h3 className="mcs-h3">{title}</h3>
                <p className="plt-use-body">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- pricing */}
      <section id="pricing" className="mcs-section mcs-section-alt">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">Pricing</span>
          <h2 className="mcs-h2">One price. Print, postage and mailing.</h2>
          <p className="mcs-lede">
            Per-piece, in US dollars, falling as volume climbs. Nothing is charged
            until you send.
          </p>

          <div className="plt-price-wrap">
            <table className="plt-table">
              <thead>
                <tr>
                  <th>Campaign type</th>
                  {TIERS.map((t) => <th key={t}>{t.toLocaleString()}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.mode}>
                    <td>
                      <span className="plt-row-name">
                        {row.name}
                        {row.badge && <span className="plt-badge">{row.badge}</span>}
                      </span>
                      <span className="plt-row-sub">{row.sub}</span>
                    </td>
                    {TIERS.map((t) => {
                      const per = estimateCost(row.mode, t).perPieceLow;
                      const best = row.mode === 'eddm' && t === 25_000;
                      return (
                        <td key={t} className={best ? 'plt-cell-best' : undefined}>
                          ${per.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mcs-note" style={{ marginTop: '1rem' }}>
            Illustrative per-piece rates from the campaign estimator — your exact
            price is calculated in the campaign builder once your audience is set.
            Non-profit pricing is available on list campaigns.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- why */}
      <section id="why" className="mcs-section">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">Why mail</span>
          <h2 className="mcs-h2">The numbers that make the case.</h2>

          <div className="plt-stats">
            <div className="mcs-card">
              <div className="plt-stat-num">4.4%</div>
              <div className="plt-stat-label">average response rate</div>
              <p className="plt-stat-sub">
                Across all direct mail campaigns. Email averages 0.12% — roughly
                36 times lower per piece sent.
              </p>
            </div>
            <div className="mcs-card">
              <div className="plt-stat-num">9%</div>
              <div className="plt-stat-label">when you mail your own customers</div>
              <p className="plt-stat-sub">
                House lists outperform cold prospect lists, which average 4.9%.
                The people who already bought are the cheapest to reach again.
              </p>
            </div>
            <div className="mcs-card">
              <div className="plt-stat-num">1–2</div>
              <div className="plt-stat-label">pieces of mail a day</div>
              <p className="plt-stat-sub">
                Against 113 emails. The mailbox is the least contested space your
                customer looks at all day.
              </p>
            </div>
          </div>

          <div className="mcs-card" style={{ marginTop: '1.25rem' }}>
            <h3 className="mcs-h3">Response rate by channel</h3>
            <p className="mcs-note" style={{ marginTop: '0.25rem' }}>
              Percent of recipients who responded · same scale
            </p>
            <ResponseBars />
          </div>

          <p className="mcs-note" style={{ marginTop: '1rem' }}>
            Source: ANA/DMA Response Rate Report, 2025 edition. Household mail and
            email volumes per ANA-cited industry benchmarks. Category averages, not
            a guarantee of campaign performance.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- extras */}
      <section className="mcs-section mcs-section-alt">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">What&apos;s included</span>
          <h2 className="mcs-h2">Everything under one roof.</h2>
          <p className="mcs-lede">
            No agency, no separate printer, no trip to the Post Office.
          </p>

          <div className="plt-grid3">
            {EXTRAS.map(({ Icon, title, body }) => (
              <article key={title} className="mcs-card mcs-card-hover">
                <div className="mcs-icon mcs-icon-accent"><Icon size={19} strokeWidth={2} /></div>
                <h3 className="mcs-h3">{title}</h3>
                <p className="plt-use-body">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- customers */}
      <section id="reviews" className="mcs-section">
        <div className="mcs-wrap">
          <span className="mcs-eyebrow">Customers</span>
          <h2 className="mcs-h2">The stamp of approval.</h2>

          <div className="plt-quotes">
            {QUOTES.map((q) => (
              <figure key={q.name} className="mcs-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="plt-stars">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={14} fill="currentColor" strokeWidth={0} />)}
                </div>
                <blockquote className="plt-quote-text">{q.text}</blockquote>
                <figcaption className="plt-quote-by">
                  <div className="plt-quote-name">{q.name}</div>
                  <div className="plt-quote-co">{q.co}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- last cta */}
      <section className="mcs-section" style={{ paddingTop: 0 }}>
        <div className="mcs-wrap">
          <div className="plt-final">
            <span className="mcs-eyebrow">Get started</span>
            <h2 className="mcs-h2">Build a campaign in about five minutes.</h2>
            <p className="mcs-lede">
              Pick your audience, design or upload a postcard, choose the day it
              lands. You don&apos;t pay until you decide to send it.
            </p>
            <div style={{ marginTop: '1.75rem' }}>
              <a className="mcs-btn mcs-btn-primary mcs-btn-lg" href={START}>
                Start a campaign <ArrowRight size={16} strokeWidth={2.5} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="plt-foot">
        <div className="mcs-wrap plt-foot-grid">
          <div>
            <span className="plt-mark"><Snail className="plt-mark-glyph" /> SnailBlast</span>
            <p className="mcs-note" style={{ marginTop: '0.75rem', maxWidth: '28ch' }}>
              A MyCreativeShop product. Design, print and mail, in one place.
            </p>
          </div>
          <div>
            <div className="plt-foot-h">Product</div>
            <div className="plt-foot-list">
              <a href="#pricing">Pricing</a><a href="#uses">EDDM</a>
              <a href="#uses">Mailing lists</a><a href={START}>Campaign builder</a>
            </div>
          </div>
          <div>
            <div className="plt-foot-h">Print</div>
            <div className="plt-foot-list">
              <a href="#">Postcards</a><a href="#">Door hangers</a>
              <a href="#">Yard signs</a><a href="#">Flyers</a>
            </div>
          </div>
          <div>
            <div className="plt-foot-h">Company</div>
            <div className="plt-foot-list">
              <a href="#">About</a><a href="#">Help center</a><a href="#reviews">Reviews</a>
            </div>
          </div>
        </div>
        <div className="mcs-wrap">
          <p className="mcs-note" style={{ marginTop: '2rem' }}>
            Every Door Direct Mail® and EDDM® are registered trademarks of the
            United States Postal Service®. © 2026 MyCreativeShop.
          </p>
        </div>
      </footer>

      <ConceptSwitcher />
    </div>
  );
}
