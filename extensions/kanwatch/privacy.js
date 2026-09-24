/**
 * Kanwatch privacy rules — the single source of truth.
 *
 * Imported by the extension (before anything is stored or sent) AND by the server
 * (again, on arrival), so a bug or an old version of the extension can never leak
 * more than these rules allow. Plain JS with no dependencies, so both can load it.
 *
 * The threat model is identity theft and account takeover, so the rules lean hard
 * toward hiding too much:
 *
 *   - Sensitive sites (money, government, health, email, passwords, identity) are
 *     PRIVATE: only "private, N minutes" is kept. No URL, no title, nothing else.
 *   - Any sign-in, checkout, payment, password or account-security page is private
 *     too, on any site, judged from its path and its title.
 *   - Everywhere else, the query string and #fragment are dropped (that is where
 *     session tokens, reset links and search-result state live), and anything that
 *     looks like an email, phone number, card/account/SSN number or secret token is
 *     masked in every text field.
 *
 * Nothing typed is ever captured anywhere — only a count of keystrokes.
 */

/** Suffix-matched: "chase.com" also covers "secure.chase.com". */
export const PRIVATE_DOMAINS = [
  // Banks, cards, brokerages, payments
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'citibank.com', 'capitalone.com',
  'usbank.com', 'pnc.com', 'truist.com', 'td.com', 'tdbank.com', 'ally.com', 'discover.com',
  'americanexpress.com', 'synchrony.com', 'barclays.com', 'barclaycardus.com', 'hsbc.com', 'navyfederal.org',
  'usaa.com', 'schwab.com', 'fidelity.com', 'vanguard.com', 'etrade.com', 'morganstanley.com',
  'robinhood.com', 'wealthfront.com', 'betterment.com', 'sofi.com', 'chime.com', 'marcus.com',
  'paypal.com', 'venmo.com', 'cash.app', 'zellepay.com', 'wise.com', 'revolut.com',
  // Stripe's docs are work research; its dashboards hold customers' payment details.
  'dashboard.stripe.com', 'connect.stripe.com', 'checkout.stripe.com', 'billing.stripe.com', 'invoice.stripe.com',
  'coinbase.com', 'kraken.com', 'binance.com', 'binance.us', 'gemini.com', 'crypto.com', 'metamask.io',
  // Credit, tax, identity
  'creditkarma.com', 'experian.com', 'equifax.com', 'transunion.com', 'annualcreditreport.com',
  'turbotax.intuit.com', 'hrblock.com', 'taxact.com', 'freetaxusa.com', 'mint.intuit.com', 'id.me',
  'login.gov', 'lifelock.com',
  // Email and messaging inboxes
  'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'mail.yahoo.com',
  'mail.proton.me', 'proton.me', 'fastmail.com', 'mail.aol.com', 'hey.com',
  // Passwords and accounts
  '1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com', 'keepersecurity.com',
  'accounts.google.com', 'myaccount.google.com', 'passwords.google.com', 'appleid.apple.com',
  'account.microsoft.com', 'login.microsoftonline.com', 'account.live.com',
  // Health and insurance
  'mychart.com', 'kp.org', 'myhealth.va.gov', 'healthcare.gov', 'cvs.com', 'walgreens.com',
  'goodrx.com', 'zocdoc.com', 'teladoc.com', 'onemedical.com', 'anthem.com', 'aetna.com',
  'cigna.com', 'uhc.com', 'bcbs.com', 'humana.com', 'geico.com', 'progressive.com', 'statefarm.com',
  'allstate.com', 'libertymutual.com',
];

/** Whole top-level domains that are private: government and military. */
const PRIVATE_TLDS = ['.gov', '.mil'];

/** Any of these inside a hostname makes it private ("firstbankohio.com", "mychart.acme.org"). */
const PRIVATE_HOST_WORDS = [
  'bank', 'creditunion', 'fcu', 'mychart', 'patient', 'pharmacy', 'health', 'medical', 'clinic',
  'hospital', 'insurance', 'mortgage', 'loan', 'wallet', 'payroll', 'adp', 'gusto', 'tax',
];

/** A path containing any of these, as a whole segment or word, is private on any site. */
const PRIVATE_PATH_WORDS = [
  'login', 'log-in', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'logout', 'oauth', 'oauth2',
  'auth', 'sso', 'saml', 'password', 'passwords', 'reset', 'forgot', 'recover', '2fa', 'mfa', 'otp',
  'verify', 'verification', 'checkout', 'payment', 'payments', 'pay', 'billing', 'wallet', 'invoice',
  'invoices', 'security', 'credentials', 'tokens', 'api-keys', 'apikeys', 'secrets', 'bank', 'tax',
];

/** Titles that give a sensitive page away even when its URL does not. */
const PRIVATE_TITLE_PATTERN =
  /\b(sign[ -]?in|log[ -]?in|password|passcode|verification code|security code|two[- ]factor|2fa|checkout|payment|billing|bank|account number|routing number|social security|tax return|medical|prescription|diagnosis)\b/i;

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** True for pages that must never be recorded beyond "private time". */
export function isPrivateUrl(url, extraDomains = []) {
  const host = hostOf(url);
  if (!host) return true;
  const domains = [...PRIVATE_DOMAINS, ...extraDomains.map((d) => String(d).toLowerCase().replace(/^www\./, ''))];
  if (domains.some((d) => d && (host === d || host.endsWith(`.${d}`)))) return true;
  if (PRIVATE_TLDS.some((tld) => host.endsWith(tld))) return true;
  // Short words must match a whole label ("adp", "tax"); longer ones anywhere in one
  // ("firstbankohio"), which is where over-matching is rare.
  const hostWords = host.split(/[.\-]/);
  if (PRIVATE_HOST_WORDS.some((w) => hostWords.some((part) => part === w || (w.length >= 4 && part.includes(w))))) return true;

  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return true;
  }
  const segments = path.split(/[/_.]+/).filter(Boolean);
  if (segments.some((s) => PRIVATE_PATH_WORDS.includes(s))) return true;
  return false;
}

export function isPrivateTitle(title) {
  return !!title && PRIVATE_TITLE_PATTERN.test(title);
}

// ---- Masking -------------------------------------------------------------

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SSN = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g;
// 13–19 digits, optionally split by spaces or dashes: card numbers.
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const PHONE = /(?:\+\d{1,3}[ .-]?)?\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g;
// Any remaining run of 6+ digits: account, order, member, routing numbers.
const LONG_NUMBER = /\b\d{6,}\b/g;
// Long mixed letter+digit strings: API keys, session ids, reset tokens.
const TOKEN = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}\b/g;

/** Mask anything in free text that could identify an account or a person's credentials. */
export function scrubText(text, maxLength = 200) {
  if (!text) return '';
  return String(text)
    .replace(EMAIL, '[email]')
    .replace(SSN, '[number]')
    .replace(CARD, '[number]')
    .replace(PHONE, '[phone]')
    .replace(TOKEN, '[token]')
    .replace(LONG_NUMBER, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The parts of a URL worth keeping: host and a masked path. The query string and
 * fragment are always dropped; path segments that look like ids, numbers, emails or
 * tokens become ":id". At most four segments, so deep links cannot smuggle data.
 */
export function scrubUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const domain = u.hostname.toLowerCase().replace(/^www\./, '') + (u.port ? `:${u.port}` : '');
  const segments = u.pathname
    .split('/')
    .filter(Boolean)
    .slice(0, 4)
    .map((seg) => {
      let s;
      try {
        s = decodeURIComponent(seg);
      } catch {
        s = seg;
      }
      if (UUID.test(s) || /\d{4,}/.test(s) || EMAIL.test(s) || /^[A-Za-z0-9_-]{20,}$/.test(s)) {
        EMAIL.lastIndex = 0;
        return ':id';
      }
      EMAIL.lastIndex = 0;
      return scrubText(s, 60);
    });
  return { domain, path: segments.length ? `/${segments.join('/')}` : '/' };
}

/** Search engines whose query is worth keeping (scrubbed): it says what you were looking for. */
const SEARCH_PARAMS = {
  'google.com': 'q',
  'bing.com': 'q',
  'duckduckgo.com': 'q',
  'search.brave.com': 'q',
  'kagi.com': 'q',
  'youtube.com': 'search_query',
  'github.com': 'q',
  'stackoverflow.com': 'q',
  'perplexity.ai': 'q',
};

export function searchQueryOf(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const key = Object.entries(SEARCH_PARAMS).find(([d]) => host === d || host.endsWith(`.${d}`))?.[1];
    if (!key) return '';
    const q = u.searchParams.get(key);
    return q ? scrubText(q, 120) : '';
  } catch {
    return '';
  }
}

/**
 * One visit, reduced to what may be kept. Private visits keep timing only.
 *
 * @param {{ url: string, title?: string, heading?: string, description?: string,
 *           includeSearch?: boolean, extraPrivateDomains?: string[] }} raw
 */
export function sanitizeVisit(raw) {
  const extra = raw.extraPrivateDomains || [];
  if (
    isPrivateUrl(raw.url, extra) ||
    isPrivateTitle(raw.title) ||
    isPrivateTitle(raw.heading)
  ) {
    return { private: true };
  }
  const where = scrubUrl(raw.url);
  if (!where) return { private: true };
  return {
    private: false,
    domain: where.domain,
    path: where.path,
    title: scrubText(raw.title, 200),
    heading: scrubText(raw.heading, 200),
    description: scrubText(raw.description, 300),
    searchQuery: raw.includeSearch === false ? '' : searchQueryOf(raw.url),
  };
}
