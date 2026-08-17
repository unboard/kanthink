'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Palette,
  Archive,
  Headphones,
  Package,
  ChartLine,
  House,
  Star,
  ArrowRight,
} from 'lucide-react';

const TRY_IT_FREE = 'https://www.mycreativeshop.com/snailblast';

/* ------------------------------------------------------------------ mascot */

function Snail({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* foot */}
      <path d="M2.2 17.6h12.4" />
      <path d="M2.2 17.6c0-2.4 1.5-3.9 3.4-4.3" />
      {/* eye stalks */}
      <path d="M4.6 13.3 3.3 10.6" />
      <circle cx="3.1" cy="9.8" r=".95" />
      <path d="M6.9 13 6.7 10.2" />
      <circle cx="6.6" cy="9.4" r=".95" />
      {/* shell */}
      <circle cx="14.4" cy="12.4" r="5.2" />
      <path d="M14.4 9.2a3.2 3.2 0 1 1-3.2 3.2 2.05 2.05 0 1 0 2.05-2.05" />
    </svg>
  );
}

/* ---------------------------------------------------------------- the chart */

/**
 * One measure — response rate — across four channels. Deliberately a single
 * series in a single color: two colors would imply two things being measured,
 * and it would look like the chart was editorialising. It isn't. The lengths
 * are to scale against a shared 9% ceiling, and the sliver at the bottom is
 * email drawn honestly.
 */
const CHANNELS = [
  { label: 'Direct mail — house list', value: 9.0, display: '9.0%' },
  { label: 'Direct mail — prospect list', value: 4.9, display: '4.9%' },
  { label: 'Direct mail — all campaigns', value: 4.4, display: '4.4%' },
  { label: 'Email — all campaigns', value: 0.12, display: '0.12%' },
];

const SCALE_MAX = 9;

function ResponseChart() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`sb-chart${visible ? ' is-visible' : ''}`}>
      <h3 className="sb-chart-title">Response rate by channel</h3>
      <p className="sb-chart-unit">Percent of recipients who responded · same scale</p>

      <div className="sb-bars">
        {CHANNELS.map((c) => {
          const isEmail = c.label.startsWith('Email');
          return (
            <div
              key={c.label}
              className={`sb-bar-row${isEmail ? ' sb-bar-row-email' : ''}`}
            >
              <div className="sb-bar-label">
                <span>{c.label}</span>
                <span className="sb-bar-val">{c.display}</span>
              </div>
              <div
                className="sb-bar-track"
                role="img"
                aria-label={`${c.label}: ${c.display} response rate`}
              >
                <div
                  className="sb-bar-fill"
                  style={
                    {
                      '--sb-w': `${(c.value / SCALE_MAX) * 100}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="sb-chart-note">
        That last sliver is not a rendering bug. <strong>It is email.</strong> Drawn
        to the same scale as everything above it.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ content */

const STEPS = [
  {
    code: 'STEP 01 · AUDIENCE',
    title: 'Build your audience',
    body:
      'Every direct mail campaign requires an audience (i.e. a collection of addresses). With SnailBlast, it’s incredibly easy to target a new or existing audience.',
    items: [
      ['🗺️', 'Target areas on the map (EDDM®)'],
      ['🏙️', 'Build a custom targeted list'],
      ['📄', 'Upload your own list (csv, xls, xlsx)'],
    ],
    foot: (
      <>
        No list at all? <strong>Start with EDDM®.</strong>
      </>
    ),
  },
  {
    code: 'STEP 02 · ARTWORK',
    title: 'Design your postcard',
    body:
      'Don’t have a postcard design? We have the best postcard templates for you to customize (for FREE) using our online editor.',
    items: [
      ['🎨', '1000s of free templates'],
      ['✏️', 'Edit right in the browser'],
      ['📐', 'Mailing guides built into every design'],
    ],
    foot: (
      <>
        Already have a design? <strong>Upload it instead.</strong>
      </>
    ),
  },
  {
    code: 'STEP 03 · IN THE MAIL',
    title: 'Schedule & launch',
    body:
      'Ready to launch? Simply schedule your target in-mailbox date & we’ll handle the rest. Planning ahead and scheduling multiple campaigns at once is all possible when you choose to mail with us.',
    items: [
      ['📬', 'Pick your target in-mailbox date'],
      ['🗓️', 'Queue campaigns months ahead'],
      ['📍', 'Track every piece from our door to theirs'],
    ],
    foot: (
      <>
        Then <strong>go run your business.</strong>
      </>
    ),
  },
];

const REASONS = [
  {
    Icon: Palette,
    title: 'A free editor, and 1000s of templates',
    body:
      'Free access to our online editor & 1000s of custom postcard templates. Every design includes the mailing guides that keep it deliverable.',
  },
  {
    Icon: Archive,
    title: 'Unlimited campaign storage',
    body:
      'You’ll never misplace your lists, your designs, or your history. Every campaign you have ever run stays where you left it.',
  },
  {
    Icon: Headphones,
    title: 'Real print and design experts',
    body:
      'Easily connect with our print & graphic design experts in our support portal — people who set up presses, not a chatbot.',
  },
  {
    Icon: Package,
    title: 'Not just postcards',
    body:
      'We also have door hangers, yard signs, flyers & so much more. One account covers the whole neighborhood.',
  },
  {
    Icon: ChartLine,
    title: 'Campaign tracking',
    body:
      'Track the performance of every campaign with SnailBlast tracking. Every order gets its own tracking page and status emails.',
  },
  {
    Icon: House,
    title: 'Everything under one roof',
    body:
      'Audience, design, print, postage and delivery in one place. You’ll never have to go anywhere else.',
  },
];

const QUOTES = [
  {
    text:
      'I tried to go through 6 different vendors to be able to create our own cards and send them. All of them were a bit frustrating. This is the first one we found that we can use EDDM and create our own designs at the same time.',
    name: 'Brandon V.',
    co: 'Trimlight',
  },
  {
    text: 'Outstanding quality and super easy to use design tool. absolutely love this company!!!',
    name: 'Joshua N.',
    co: 'Barry Best Seamless Gutters',
  },
  {
    text: 'I’m so happy I found this site! I love how user friendly and fast the process has been!',
    name: 'Lauren B.',
    co: 'Main Street Dental & Implants',
  },
];

const FAQS = [
  {
    q: 'What is Every Door Direct Mail® (EDDM®)?',
    a: 'Every Door Direct Mail® (EDDM®) is a cost-effective, targeted marketing solution offered by the United States Postal Service®. It allows businesses to reach potential customers in specific geographic areas without the need for a mailing list. EDDM® is perfect for small businesses, local events, and promotions, as it helps maximize reach and visibility in the community.',
  },
  {
    q: 'How much does it cost & what’s included?',
    a: 'Our pricing includes print, postage, and mailing services, making it a hassle-free and comprehensive solution for your direct mail needs. Pricing is available after you’ve selected your audience in the campaign builder.',
  },
  {
    q: 'What if I don’t have a mailing list?',
    a: 'No problem! We offer two campaign options: EDDM® and our List Builder. EDDM® allows you to mail to any areas on the map and is our lowest-priced campaign option. Our List Builder lets you target by thousands of demographic details and locations without needing a mailing list. Choose the option that best suits your needs and start reaching potential customers today!',
  },
  {
    q: 'When will my postcards be delivered?',
    a: 'Every time you order with us, you’ll be able to use our campaign scheduler to control your target in-mailbox date. This means you can select the earliest date or you can plan months in advance. The earliest available in-mailbox dates are shown in the campaign builder before you pay.',
  },
  {
    q: 'Do you have non-profit pricing?',
    a: 'Yes, we do offer non-profit pricing for our mail-to-a-list campaigns. However, EDDM® does not offer non-profit pricing. You can add your non-profit information directly within the campaign area in SnailBlast, and we will apply the appropriate discounts to your order.',
  },
  {
    q: 'How can I track my campaign?',
    a: 'Every SnailBlast order comes with a dedicated tracking page, where you can view the status and details of your campaign. Additionally, we automatically send tracking emails to keep you informed as your postcards move from our facility into mailboxes. This ensures that you always know the status of your campaign.',
  },
];

/* --------------------------------------------------------------------- page */

export default function SnailBlastPage() {
  return (
    <div className="sb-root">
      <div className="sb-stars" aria-hidden="true" />

      <div className="sb-page">
        {/* ---------------------------------------------------------- nav */}
        <header className="sb-nav">
          <div className="sb-wrap sb-nav-in">
            <a href="#top" className="sb-mark">
              <Snail className="sb-mark-glyph" />
              SnailBlast
            </a>
            <nav className="sb-nav-links">
              <a href="#why">Why mail</a>
              <a href="#how">How it works</a>
              <a href="#reviews">Reviews</a>
              <a href="#faq">FAQ</a>
            </nav>
            <a className="sb-btn sb-btn-primary" href={TRY_IT_FREE}>
              Try it free
            </a>
          </div>
        </header>

        {/* --------------------------------------------------------- hero */}
        <section id="top" className="sb-hero">
          <div className="sb-wrap sb-hero-grid">
            <div>
              <p className="sb-eyebrow sb-anim-1">USPS EDDM® · anywhere in the USA</p>

              <h1 className="sb-h1 sb-anim-1">
                Nobody deletes
                <br />a <em>postcard.</em>
              </h1>

              <p className="sb-hero-sub sb-anim-2">
                Your customer’s inbox is the most contested real estate on earth.
                Their mailbox is not. SnailBlast makes designing &amp; mailing
                postcards ridiculously easy — design, print and mail to anyone,
                anywhere in the USA.
              </p>

              <div className="sb-cta-row sb-anim-3">
                <a className="sb-btn sb-btn-primary sb-btn-lg" href={TRY_IT_FREE}>
                  Try it free <ArrowRight size={17} strokeWidth={2.5} />
                </a>
                <a className="sb-btn sb-btn-ghost sb-btn-lg" href="#how">
                  See how it works
                </a>
              </div>

              <div className="sb-trust sb-anim-4">
                <p className="sb-trust-label">Loved by 1,000s of businesses</p>
                <div className="sb-trust-logos">
                  <span>Sanford</span>
                  <span>UPS</span>
                  <span>American Family Insurance</span>
                </div>
              </div>
            </div>

            {/* --------------------------------------- the signature object */}
            <div className="sb-card-stage">
              <svg
                className="sb-trajectory"
                viewBox="0 0 400 320"
                fill="none"
                aria-hidden="true"
                preserveAspectRatio="none"
              >
                <path
                  className="sb-traj-path"
                  pathLength={620}
                  d="M-20 300 C 60 288, 118 236, 168 168 S 288 40, 404 14"
                />
              </svg>

              <article className="sb-postcard">
                <div className="sb-pc-msg">
                  <p className="sb-pc-hand">
                    Hey neighbor —<br />
                    we’re two streets over.
                  </p>
                  <div className="sb-pc-rule" />
                  <div className="sb-pc-rule" />
                  <div className="sb-pc-rule" style={{ width: '62%' }} />
                </div>

                <div className="sb-pc-right">
                  <div className="sb-pc-stamp-row">
                    <svg
                      className="sb-postmark"
                      viewBox="0 0 100 100"
                      fill="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <path
                          id="sb-pm-arc"
                          d="M50 50 m -33 0 a 33 33 0 1 1 66 0"
                        />
                      </defs>
                      <circle cx="50" cy="50" r="37" stroke="#2d1e3d" strokeWidth="1.5" />
                      <circle cx="50" cy="50" r="30" stroke="#2d1e3d" strokeWidth="1" />
                      <text
                        fill="#2d1e3d"
                        fontSize="8.5"
                        fontWeight="600"
                        letterSpacing="1.6"
                        fontFamily="var(--font-sb-mono), monospace"
                      >
                        <textPath href="#sb-pm-arc" startOffset="50%" textAnchor="middle">
                          SNAILBLAST · USA
                        </textPath>
                      </text>
                      <text
                        x="50"
                        y="53"
                        fill="#2d1e3d"
                        fontSize="9"
                        fontWeight="600"
                        letterSpacing="1"
                        textAnchor="middle"
                        fontFamily="var(--font-sb-mono), monospace"
                      >
                        MAILED
                      </text>
                      <text
                        x="50"
                        y="64"
                        fill="#2d1e3d"
                        fontSize="6.5"
                        letterSpacing="1.2"
                        textAnchor="middle"
                        fontFamily="var(--font-sb-mono), monospace"
                      >
                        ON PURPOSE
                      </text>
                    </svg>

                    <span aria-hidden="true" />

                    <div className="sb-stamp">
                      <Snail className="sb-stamp-snail" />
                      <span className="sb-stamp-val">FIRST CLASS</span>
                    </div>
                  </div>

                  <div className="sb-pc-addr">
                    <span>A potential customer</span>
                    <div className="sb-pc-addr-line" />
                    <div className="sb-pc-addr-line" />
                    <div className="sb-pc-addr-line" style={{ width: '70%' }} />
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- the argument */}
        <section id="why" className="sb-section sb-section-surface">
          <div className="sb-wrap">
            <div className="sb-proof">
              <div>
                <p className="sb-eyebrow">The argument</p>
                <h2 className="sb-h2">
                  The mailbox isn’t crowded.
                  <br />
                  Your inbox is.
                </h2>
                <p className="sb-lede">
                  Every dollar you spend online lands in the busiest room your
                  customer has ever stood in. Meanwhile a piece of mail arrives
                  alone, sits on the counter, and gets picked up by a human hand.
                </p>
              </div>

              <ResponseChart />
            </div>

            <div className="sb-stats">
              <div className="sb-stat">
                <div className="sb-stat-num">113</div>
                <p className="sb-stat-label">
                  emails the average household receives every day
                </p>
              </div>
              <div className="sb-stat">
                <div className="sb-stat-num">1–2</div>
                <p className="sb-stat-label">
                  pieces of marketing mail, over the same day
                </p>
              </div>
              <div className="sb-stat">
                <div className="sb-stat-num">36×</div>
                <p className="sb-stat-label">
                  the response rate of email, per piece sent
                </p>
              </div>
              <div className="sb-stat">
                <div className="sb-stat-num">27%</div>
                <p className="sb-stat-label">
                  response when mail and email run together
                </p>
              </div>
            </div>

            <p className="sb-source">
              Source: ANA/DMA Response Rate Report, 2025 edition. Household mail
              and email volumes per ANA-cited industry benchmarks. Figures are
              category averages, not a guarantee of campaign performance.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------- how it works */}
        <section id="how" className="sb-section">
          <div className="sb-wrap">
            <p className="sb-eyebrow">How it works</p>
            <h2 className="sb-h2">Three steps, then it’s out of your hands.</h2>
            <p className="sb-lede">
              Everything gets easier when you choose SnailBlast. Here’s how it
              works.
            </p>

            <div className="sb-steps">
              {STEPS.map((s) => (
                <article key={s.code} className="sb-step">
                  <p className="sb-step-code">{s.code}</p>
                  <h3 className="sb-step-title">{s.title}</h3>
                  <p className="sb-step-body">{s.body}</p>
                  <ul className="sb-step-list">
                    {s.items.map(([emoji, label]) => (
                      <li key={label}>
                        <span aria-hidden="true">{emoji}</span>
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                  {s.foot && <p className="sb-step-foot">{s.foot}</p>}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- 6 reasons */}
        <section className="sb-section sb-section-surface">
          <div className="sb-wrap">
            <p className="sb-eyebrow">And the rest of it</p>
            <h2 className="sb-h2">Six more reasons to choose SnailBlast.</h2>
            <p className="sb-lede">
              We love making your life easier, so here’s some more great stuff.
            </p>

            <div className="sb-reasons">
              {REASONS.map(({ Icon, title, body }) => (
                <article key={title} className="sb-reason">
                  <div className="sb-reason-icon">
                    <Icon size={19} strokeWidth={2} />
                  </div>
                  <h3 className="sb-reason-title">{title}</h3>
                  <p className="sb-reason-body">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- testimonials */}
        <section id="reviews" className="sb-section sb-section-paper">
          <div className="sb-wrap">
            <p className="sb-eyebrow">The stamp of approval</p>
            <h2 className="sb-h2">Our amazing customers give us the stamp of approval.</h2>

            <div className="sb-quotes">
              {QUOTES.map((q) => (
                <figure key={q.name} className="sb-quote">
                  <div className="sb-quote-stars" aria-label="5 out of 5 stars">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} size={15} fill="currentColor" strokeWidth={0} />
                    ))}
                  </div>
                  <blockquote className="sb-quote-text">{q.text}</blockquote>
                  <figcaption className="sb-quote-by">
                    <div className="sb-quote-name">{q.name}</div>
                    <div className="sb-quote-co">{q.co}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- faq */}
        <section id="faq" className="sb-section">
          <div className="sb-wrap">
            <p className="sb-eyebrow">Frequently asked questions</p>
            <h2 className="sb-h2">Before you mail.</h2>

            <div className="sb-faq">
              {FAQS.map((f) => (
                <details key={f.q} className="sb-q">
                  <summary>
                    {f.q}
                    <span className="sb-q-plus" aria-hidden="true" />
                  </summary>
                  <p className="sb-q-body">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- final cta */}
        <section className="sb-final">
          <div className="sb-wrap">
            <p className="sb-eyebrow">Try SnailBlast today</p>
            <h2 className="sb-h2">Only pay if you mail it.</h2>
            <p className="sb-lede">
              Build a campaign. Design or upload a postcard. Pick the day it lands
              on the counter. You don’t pay a cent until you decide to send it.
            </p>
            <div className="sb-cta-row">
              <a className="sb-btn sb-btn-primary sb-btn-lg" href={TRY_IT_FREE}>
                Try it free <ArrowRight size={17} strokeWidth={2.5} />
              </a>
            </div>
            <p className="sb-final-note">
              Print · postage · mailing included · no subscription
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- footer */}
        <footer className="sb-footer">
          <div className="sb-wrap">
            <div className="sb-footer-in">
              <a href="#top" className="sb-mark">
                <Snail className="sb-mark-glyph" />
                SnailBlast
              </a>
              <span className="sb-trust-label" style={{ marginLeft: 'auto' }}>
                A MyCreativeShop product
              </span>
            </div>
            <p className="sb-footer-legal">
              Every Door Direct Mail® and EDDM® are registered trademarks of the
              United States Postal Service®. Response-rate figures cited on this
              page come from the{' '}
              <a
                href="https://www.ana.net/"
                target="_blank"
                rel="noopener noreferrer"
              >
                ANA/DMA Response Rate Report
              </a>{' '}
              and are category averages across many advertisers — your results
              will depend on your offer, your list and your market. © 2026
              MyCreativeShop. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
