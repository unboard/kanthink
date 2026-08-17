'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import './payback-calculator.css';
import { estimateCost, inHomeWindow, type AudienceMode } from '@/lib/snailblast/campaign';

const START = '/snailblast/start';

/**
 * Default value of one won customer, by trade. Starting points the visitor is
 * expected to overwrite — the field is editable and the number is theirs, not
 * ours. Nothing downstream treats them as fact.
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
 * Benchmark response rates, ANA/DMA Response Rate Report 2025 edition. These
 * seed the slider; the visitor can move it, which is the point — the assumption
 * is on screen and adjustable rather than hidden inside the result.
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

export function PaybackCalculator() {
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
    <div className="pbc">
      <div className="pbc-inputs">
        <p className="pbc-sentence">
          I run a{' '}
          <select className="pbc-slot" value={tradeId} aria-label="Your trade"
            onChange={(e) => onTrade(e.target.value)}>
            {TRADES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          . I want to mail{' '}
          <input className="pbc-slot pbc-slot-num" type="number" min={100} max={100000} step={100}
            value={pieces} aria-label="Number of postcards"
            onChange={(e) => setPieces(Number(e.target.value))} />
          {' '}postcards to{' '}
          <select className="pbc-slot" value={audienceId} aria-label="Audience"
            onChange={(e) => onAudience(e.target.value as AudienceMode)}>
            {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          . One new customer is worth about{' '}
          <input className="pbc-slot pbc-slot-money" type="number" min={0} step={10}
            value={value} aria-label="Value of one customer"
            onChange={(e) => setValue(Number(e.target.value))} />
          {' '}to me.
        </p>

        <div className="pbc-dial">
          <div className="pbc-dial-top">
            <span className="pbc-dial-label">Response rate I&apos;m assuming</span>
            <span className="pbc-dial-val">{rate.toFixed(2)}%</span>
          </div>
          <input className="pbc-range" type="range" min={0.1} max={12} step={0.1}
            value={rate} aria-label="Assumed response rate"
            onChange={(e) => setRate(Number(e.target.value))} />
          <p className="pbc-dial-note">
            <strong>{audience.note}</strong> That benchmark is a category average
            across many advertisers, so drag it to whatever you actually believe.
            Every number beside it moves with it.
          </p>
        </div>

        <div className="pbc-dial">
          <div className="pbc-dial-top">
            <span className="pbc-dial-label">And I close</span>
            <span className="pbc-dial-val">{close}%</span>
          </div>
          <input className="pbc-range" type="range" min={1} max={100} step={1}
            value={close} aria-label="Percentage of responses you close"
            onChange={(e) => setClose(Number(e.target.value))} />
          <p className="pbc-dial-note">
            <strong>Of the people who reply, how many actually buy?</strong>{' '}
            Someone calling for a quote is not yet a customer. Most calculators
            skip this step, which is how they end up promising returns nobody sees.
          </p>
        </div>
      </div>

      <div className="pbc-out">
        <div>
          <div className="pbc-big">
            {profitable ? `${result.multiple.toFixed(1)}×` : money(result.net)}
          </div>
          <p className="pbc-big-sub">
            {profitable
              ? `back on what you spend — ${money(result.net)} net`
              : 'you would lose money at these numbers'}
          </p>
        </div>

        <div className="pbc-lines">
          <div className="pbc-line">
            <span className="pbc-line-key">{result.safePieces.toLocaleString()} postcards</span>
            <span className="pbc-line-val">
              {money(result.cost.totalLow)}–{money(result.cost.totalHigh)}
            </span>
          </div>
          <div className="pbc-line">
            <span className="pbc-line-key">Replies at {rate.toFixed(2)}%</span>
            <span className="pbc-line-val">
              {result.responses < 1 ? result.responses.toFixed(1) : Math.round(result.responses).toLocaleString()}
            </span>
          </div>
          <div className="pbc-line">
            <span className="pbc-line-key">Customers won at {close}%</span>
            <span className="pbc-line-val">
              {result.customers < 1 ? result.customers.toFixed(1) : Math.round(result.customers).toLocaleString()}
            </span>
          </div>
          <div className="pbc-line">
            <span className="pbc-line-key">What they&apos;re worth</span>
            <span className="pbc-line-val">{money(result.revenue)}</span>
          </div>
          <div className="pbc-line pbc-line-strong">
            <span className="pbc-line-key">In mailboxes</span>
            <span className="pbc-line-val">{result.window.earliest}</span>
          </div>
        </div>

        {!profitable && (
          <div className="pbc-warn">
            <TriangleAlert size={16} style={{ flex: 'none', marginTop: '0.125rem' }} />
            <span>
              At this response rate and customer value, the mail costs more than
              it returns. Raise the value of a customer, mail a warmer list, or
              don&apos;t run it.
            </span>
          </div>
        )}

        <div className="pbc-foot">
          <a className="pbc-cta" href={START}>
            Build this campaign <ArrowRight size={16} strokeWidth={2.5} />
          </a>
          <p className="pbc-note">
            Cost is an estimate covering print, postage and mailing; exact price
            is set in the campaign builder. Response and revenue are your
            assumptions, not a forecast or a guarantee.
          </p>
        </div>
      </div>
    </div>
  );
}
