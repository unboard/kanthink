/**
 * SnailBlast campaign domain rules.
 *
 * Everything the assistant is allowed to state as fact about sizes, mailing
 * guides, dates and cost is computed here and injected into the prompt. The
 * model is explicitly forbidden from inventing any of it — a wrong in-home date
 * or a postcard that fails EDDM at the dock is a real cost to a real business.
 */

export type AudienceMode = 'eddm' | 'upload' | 'targeted';
export type ArtworkMode = 'upload' | 'ai' | 'template';

// ---------------------------------------------------------------- sizes

export interface PostcardSize {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  /** Sold by MyCreativeShop as an EDDM size. */
  eddm: boolean;
  note?: string;
}

/**
 * EDDM sizes are MyCreativeShop's own catalog (mycreativeshop.com/postcards/eddm).
 * The First-Class sizes are the standard USPS postcard trims used for addressed
 * mail — they are NOT claimed to be the full MCS catalog, which lists "7+ sizes".
 */
export const POSTCARD_SIZES: PostcardSize[] = [
  { id: '9x6.5', label: '9" × 6.5"', widthIn: 9, heightIn: 6.5, eddm: true, note: 'The EDDM workhorse.' },
  { id: '12x6.5', label: '12" × 6.5"', widthIn: 12, heightIn: 6.5, eddm: true, note: 'Maximum shelf presence.' },
  { id: '6x11', label: '6" × 11"', widthIn: 11, heightIn: 6, eddm: true, note: 'Long format.' },
  { id: '4x6', label: '4" × 6"', widthIn: 6, heightIn: 4, eddm: false, note: 'Lowest postage for addressed mail.' },
  { id: '5x7', label: '5" × 7"', widthIn: 7, heightIn: 5, eddm: false },
  { id: '6x9', label: '6" × 9"', widthIn: 9, heightIn: 6, eddm: false, note: 'Most popular for list mailing.' },
];

// ------------------------------------------------------- EDDM eligibility

export interface EddmCheck {
  eligible: boolean;
  reasons: string[];
}

/**
 * USPS EDDM Retail dimensional rules.
 *
 * The rule people get wrong: a piece must EXCEED at least one of 10.5" long or
 * 6.125" high — not both. A 6" × 9" postcard fails, because 9 < 10.5 and 6 <
 * 6.125, which is why it is the single most common EDDM rejection.
 */
export function checkEddmEligibility(widthIn: number, heightIn: number): EddmCheck {
  const long = Math.max(widthIn, heightIn);
  const short = Math.min(widthIn, heightIn);
  const reasons: string[] = [];

  const exceedsLength = long > 10.5;
  const exceedsHeight = short > 6.125;

  if (!exceedsLength && !exceedsHeight) {
    reasons.push(
      `Must exceed 10.5" on the long side or 6.125" on the short side — this piece is ${long}" × ${short}".`
    );
  }
  if (long > 15) reasons.push(`Long side must not exceed 15" — this is ${long}".`);
  if (short > 12) reasons.push(`Short side must not exceed 12" — this is ${short}".`);

  return { eligible: reasons.length === 0, reasons };
}

// ------------------------------------------------------- mailing guides

export interface MailingGuide {
  title: string;
  rules: string[];
}

/**
 * What has to be reserved on the address side, by campaign type. This is what
 * the artwork review checks against, and what makes a design "mailable".
 */
export function mailingGuide(mode: AudienceMode): MailingGuide {
  if (mode === 'eddm') {
    return {
      title: 'EDDM address side',
      rules: [
        'Everything postal lives on the TOP HALF of the address side — leave it clear of artwork.',
        'EDDM indicia in the top-right corner, within 1.625" of the right edge and 1.375" of the top.',
        'Indicia must read "ECRWSS", "EDDM", "U.S. POSTAGE PAID" and your city/state, in a sans-serif face at 4pt minimum (8pt recommended).',
        'Address block reads "LOCAL POSTAL CUSTOMER" — no names, no addresses.',
        'Optional return address goes top-left.',
      ],
    };
  }
  return {
    title: 'Addressed mail address side',
    rules: [
      'Reserve a clear address block on the lower-right of the address side for the recipient name and address.',
      'Postage indicia sits in the top-right corner.',
      'Keep the address area free of background art, dark fills and barcodes so it scans cleanly.',
      'Optional return address goes top-left.',
    ],
  };
}

// ---------------------------------------------------------------- dates

const MS_DAY = 86_400_000;

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    d.setTime(d.getTime() + MS_DAY);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

export interface InHomeWindow {
  mode: AudienceMode;
  earliest: string;
  latest: string;
}

/**
 * Estimated in-home window: production time plus mail transit, in business days.
 *
 * PLACEHOLDER TIMINGS — the live site reads real dates from
 * /snailblast/getDates. Wire that endpoint in and delete these constants before
 * this is shown to a paying customer.
 */
const PRODUCTION_DAYS = 3;
const TRANSIT_DAYS: Record<AudienceMode, [number, number]> = {
  eddm: [5, 8],
  upload: [3, 7],
  targeted: [3, 7],
};

export function inHomeWindow(mode: AudienceMode, from = new Date()): InHomeWindow {
  const [minTransit, maxTransit] = TRANSIT_DAYS[mode];
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return {
    mode,
    earliest: fmt(addBusinessDays(from, PRODUCTION_DAYS + minTransit)),
    latest: fmt(addBusinessDays(from, PRODUCTION_DAYS + maxTransit)),
  };
}

// ----------------------------------------------------------------- cost

export interface CostEstimate {
  pieces: number;
  perPieceLow: number;
  perPieceHigh: number;
  totalLow: number;
  totalHigh: number;
  includes: string[];
}

/**
 * PLACEHOLDER RATES. The mechanism is real; these per-piece bands are not
 * MyCreativeShop's pricing and must be replaced with the real rate card before
 * this is shown to a customer. Everything downstream reads from this one block,
 * so swapping it is a single edit.
 */
const RATE_BANDS: Record<AudienceMode, [number, number]> = {
  eddm: [0.42, 0.68],
  upload: [0.65, 0.95],
  targeted: [0.72, 1.05],
};

/** Volume relief, applied to the low end of the band. */
function volumeFactor(pieces: number): number {
  if (pieces >= 25_000) return 0.82;
  if (pieces >= 10_000) return 0.88;
  if (pieces >= 5_000) return 0.93;
  if (pieces >= 1_000) return 0.97;
  return 1;
}

export function estimateCost(mode: AudienceMode, pieces: number): CostEstimate {
  const [low, high] = RATE_BANDS[mode];
  const f = volumeFactor(pieces);
  const perPieceLow = Math.round(low * f * 100) / 100;
  const perPieceHigh = Math.round(high * 100) / 100;
  return {
    pieces,
    perPieceLow,
    perPieceHigh,
    totalLow: Math.round(pieces * perPieceLow),
    totalHigh: Math.round(pieces * perPieceHigh),
    includes: ['Printing', 'Postage', 'Mailing'],
  };
}

// -------------------------------------------------------- mailing list

export interface ListColumnCheck {
  detected: Record<string, string | null>;
  missing: string[];
  warnings: string[];
  rows: number;
}

const COLUMN_SYNONYMS: Record<string, string[]> = {
  name: ['name', 'full name', 'fullname', 'first name', 'firstname', 'contact', 'recipient'],
  address1: ['address', 'address1', 'address 1', 'street', 'street address', 'addr', 'line1'],
  address2: ['address2', 'address 2', 'apt', 'suite', 'unit', 'line2'],
  city: ['city', 'town', 'municipality'],
  state: ['state', 'st', 'province', 'region'],
  zip: ['zip', 'zipcode', 'zip code', 'postal', 'postal code', 'postcode'],
};

/** Required for a piece to be deliverable. `name` is optional — "Current Resident" works. */
const REQUIRED = ['address1', 'city', 'state', 'zip'];

/**
 * Map a spreadsheet's headers onto the fields USPS needs, and say plainly which
 * ones are missing. This is the "help them with formatting questions" surface —
 * a customer with a CRM export should not have to guess why their file bounced.
 */
export function checkListColumns(headers: string[], rows: number): ListColumnCheck {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const detected: Record<string, string | null> = {};

  for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    const idx = normalized.findIndex((h) => synonyms.includes(h));
    detected[field] = idx >= 0 ? headers[idx] : null;
  }

  const missing = REQUIRED.filter((f) => !detected[f]);
  const warnings: string[] = [];

  if (!detected.name) {
    warnings.push('No name column found — pieces will address to "Current Resident" unless you add one.');
  }
  if (rows === 0) warnings.push('The file has a header row but no records.');
  if (rows > 0 && rows < 200) {
    warnings.push(
      `Only ${rows} ${rows === 1 ? 'address' : 'addresses'}. Small lists are fine, but EDDM is usually cheaper per piece above ~1,000.`
    );
  }

  return { detected, missing, warnings, rows };
}

// -------------------------------------------------------- campaign state

export interface CampaignState {
  industry: string | null;
  goal: string | null;
  audience: {
    mode: AudienceMode | null;
    label: string | null;
    pieces: number | null;
  };
  artwork: {
    mode: ArtworkMode | null;
    sizeId: string | null;
    frontUrl: string | null;
    backUrl: string | null;
    reviewed: boolean;
  };
  schedule: { inHomeDate: string | null };
}

export function emptyCampaign(): CampaignState {
  return {
    industry: null,
    goal: null,
    audience: { mode: null, label: null, pieces: null },
    artwork: { mode: null, sizeId: null, frontUrl: null, backUrl: null, reviewed: false },
    schedule: { inHomeDate: null },
  };
}

export interface CampaignStep {
  id: 'audience' | 'artwork' | 'schedule';
  label: string;
  done: boolean;
  detail: string | null;
}

/** The spine of the UI: what is collected, what is still open. */
export function campaignSteps(s: CampaignState): CampaignStep[] {
  const size = s.artwork.sizeId ? POSTCARD_SIZES.find((p) => p.id === s.artwork.sizeId) : null;
  return [
    {
      id: 'audience',
      label: 'Audience',
      done: !!s.audience.mode && !!s.audience.pieces,
      detail: s.audience.label,
    },
    {
      id: 'artwork',
      label: 'Artwork',
      done: !!s.artwork.mode && !!s.artwork.sizeId,
      detail: size ? size.label : null,
    },
    {
      id: 'schedule',
      label: 'In-home date',
      done: !!s.schedule.inHomeDate,
      detail: s.schedule.inHomeDate,
    },
  ];
}

export function isReadyToLaunch(s: CampaignState): boolean {
  return campaignSteps(s).every((step) => step.done);
}

/**
 * Everything the model is allowed to state as fact this turn, derived from
 * state. Injected into the prompt so numbers are computed, never generated.
 */
export function buildFactSheet(s: CampaignState): string {
  const lines: string[] = [];

  if (s.audience.mode && s.audience.pieces) {
    const cost = estimateCost(s.audience.mode, s.audience.pieces);
    lines.push(
      `COST ESTIMATE (${cost.pieces.toLocaleString()} pieces, ${s.audience.mode}): ` +
        `$${cost.totalLow.toLocaleString()}–$${cost.totalHigh.toLocaleString()} total, ` +
        `$${cost.perPieceLow.toFixed(2)}–$${cost.perPieceHigh.toFixed(2)} per piece, includes print + postage + mailing. ` +
        `Always call this an estimate; exact price is set in the campaign builder at checkout.`
    );
  }

  if (s.audience.mode) {
    const w = inHomeWindow(s.audience.mode);
    lines.push(`IN-HOME WINDOW if they submit today: ${w.earliest} to ${w.latest}.`);

    const g = mailingGuide(s.audience.mode);
    lines.push(`MAILING GUIDE (${g.title}): ${g.rules.join(' ')}`);
  }

  if (s.artwork.sizeId) {
    const size = POSTCARD_SIZES.find((p) => p.id === s.artwork.sizeId);
    if (size) {
      const check = checkEddmEligibility(size.widthIn, size.heightIn);
      lines.push(
        `SELECTED SIZE: ${size.label}. EDDM eligible: ${check.eligible ? 'yes' : 'NO — ' + check.reasons.join(' ')}`
      );
    }
  }

  lines.push(
    `EDDM SIZES SOLD: ${POSTCARD_SIZES.filter((p) => p.eddm).map((p) => p.label).join(', ')}.`,
    `ADDRESSED-MAIL SIZES: ${POSTCARD_SIZES.filter((p) => !p.eddm).map((p) => p.label).join(', ')}.`
  );

  return lines.join('\n');
}
