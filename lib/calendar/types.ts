// Shared types + constants for the /calendar marketing calendar.

export type MarketingChannel =
  | 'email'
  | 'blog'
  | 'seo'
  | 'ads'
  | 'direct_mail'
  | 'social'
  | 'product'
  | 'automation'
  | 'other';

export type IdeaStatus = 'idea' | 'planned' | 'in_progress' | 'done' | 'skipped';
export type Effort = 'S' | 'M' | 'L';
export type Owner = 'Dustin' | 'Jason' | 'Erica';

// The client-facing idea shape (dates are plain 'YYYY-MM-DD' strings).
export interface Idea {
  id: string;
  business: string;
  title: string;
  date: string | null;
  channel: MarketingChannel;
  audience: string;
  objective: string;
  justification: string;
  metric: string;
  owner: string;
  collaborators: string[];
  tools: string[];
  effort: Effort;
  status: IdeaStatus;
  notes: string;
  position: number;
}

// ----- Knowledge base assets -----
export type AssetKind = 'audience' | 'tool' | 'product' | 'page' | 'offer';

export interface Asset {
  id: string;
  business: string;
  kind: AssetKind;
  name: string;
  description: string;
  url: string;
  tags: string[];
  notes: string;
  position: number;
}

export const ASSET_KINDS: { key: AssetKind; label: string; plural: string; hint: string; color: string; icon: string }[] = [
  { key: 'audience', label: 'Audience', plural: 'Audiences', hint: 'An industry or topic you market to (e.g. Pressure washing)', color: '#7c3aed', icon: 'users' },
  { key: 'product',  label: 'Product',  plural: 'Products',  hint: 'Something you can sell or have them print (e.g. Yard signs)', color: '#2563eb', icon: 'box' },
  { key: 'page',     label: 'Page',     plural: 'Pages',     hint: 'A page you can send people to (e.g. /for/roofers, /design)', color: '#059669', icon: 'link' },
  { key: 'tool',     label: 'Tool',     plural: 'Tools',     hint: 'A marketing tool you use (e.g. Customer.io, EDDM)', color: '#0d9488', icon: 'wrench' },
  { key: 'offer',    label: 'Offer',    plural: 'Offers',    hint: 'A conversion goal or plan (e.g. Pro plan, print order)', color: '#d97706', icon: 'tag' },
];

export function assetKindMeta(key: string) {
  return ASSET_KINDS.find((k) => k.key === key) || ASSET_KINDS[0];
}

// ----- Businesses -----
export interface Business {
  slug: string;
  name: string;
  tagline: string;
  url: string;
  accent: string; // hex, used for the picker card
}

export const BUSINESSES: Business[] = [
  {
    slug: 'mycreativeshop',
    name: 'MyCreativeShop',
    tagline: 'Design & print marketing that drives local business.',
    url: 'https://www.mycreativeshop.com',
    accent: '#2563eb',
  },
];

export function getBusiness(slug: string): Business | undefined {
  return BUSINESSES.find((b) => b.slug === slug);
}

// ----- Channels (marketing tactic type) -----
export interface ChannelMeta {
  key: MarketingChannel;
  label: string;
  // Tailwind-independent hex tokens so we can style chips/legend consistently.
  color: string;   // solid accent
  bg: string;      // light chip background
  text: string;    // chip text color
}

export const CHANNELS: ChannelMeta[] = [
  { key: 'email',       label: 'Email',        color: '#2563eb', bg: '#eff6ff', text: '#1d4ed8' },
  { key: 'seo',         label: 'SEO / AEO',    color: '#059669', bg: '#ecfdf5', text: '#047857' },
  { key: 'blog',        label: 'Blog',         color: '#7c3aed', bg: '#f5f3ff', text: '#6d28d9' },
  { key: 'ads',         label: 'Ads',          color: '#d97706', bg: '#fffbeb', text: '#b45309' },
  { key: 'direct_mail', label: 'Direct Mail',  color: '#e11d48', bg: '#fff1f2', text: '#be123c' },
  { key: 'social',      label: 'Social',       color: '#0891b2', bg: '#ecfeff', text: '#0e7490' },
  { key: 'product',     label: 'Product',      color: '#4f46e5', bg: '#eef2ff', text: '#4338ca' },
  { key: 'automation',  label: 'Automation',   color: '#0d9488', bg: '#f0fdfa', text: '#0f766e' },
  { key: 'other',       label: 'Other',        color: '#64748b', bg: '#f8fafc', text: '#475569' },
];

export function channelMeta(key: string): ChannelMeta {
  return CHANNELS.find((c) => c.key === key) || CHANNELS[CHANNELS.length - 1];
}

export const OWNERS: { key: Owner; label: string; role: string; color: string }[] = [
  { key: 'Dustin', label: 'Dustin', role: 'Design & marketing lead', color: '#2563eb' },
  { key: 'Jason',  label: 'Jason',  role: 'Product / editor & designer', color: '#7c3aed' },
  { key: 'Erica',  label: 'Erica',  role: 'Automations & tooling', color: '#0d9488' },
];

export const STATUSES: { key: IdeaStatus; label: string; color: string }[] = [
  { key: 'idea',        label: 'Idea',        color: '#94a3b8' },
  { key: 'planned',     label: 'Planned',     color: '#2563eb' },
  { key: 'in_progress', label: 'In progress', color: '#d97706' },
  { key: 'done',        label: 'Done',        color: '#059669' },
  { key: 'skipped',     label: 'Skipped',     color: '#cbd5e1' },
];

export function statusMeta(key: string) {
  return STATUSES.find((s) => s.key === key) || STATUSES[0];
}
