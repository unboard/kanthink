import type { DbMarketingIdea, DbMarketingAsset } from '@/lib/db/schema';
import type { Idea, MarketingChannel, IdeaStatus, Effort, Asset, AssetKind } from './types';

const VALID_CHANNELS: MarketingChannel[] = [
  'email', 'blog', 'seo', 'ads', 'direct_mail', 'social', 'product', 'automation', 'other',
];
const VALID_STATUS: IdeaStatus[] = ['idea', 'planned', 'in_progress', 'done', 'skipped'];
const VALID_EFFORT: Effort[] = ['S', 'M', 'L'];

export function toIdea(row: DbMarketingIdea): Idea {
  const channel = VALID_CHANNELS.includes(row.channel as MarketingChannel)
    ? (row.channel as MarketingChannel) : 'other';
  const status = VALID_STATUS.includes(row.status as IdeaStatus)
    ? (row.status as IdeaStatus) : 'planned';
  const effort = VALID_EFFORT.includes(row.effort as Effort)
    ? (row.effort as Effort) : 'M';
  return {
    id: row.id,
    business: row.business,
    title: row.title,
    date: row.date ?? null,
    channel,
    audience: row.audience ?? '',
    objective: row.objective ?? '',
    justification: row.justification ?? '',
    metric: row.metric ?? '',
    owner: row.owner ?? 'Dustin',
    collaborators: Array.isArray(row.collaborators) ? row.collaborators : [],
    tools: Array.isArray(row.tools) ? row.tools : [],
    effort,
    status,
    notes: row.notes ?? '',
    position: row.position ?? 0,
  };
}

const VALID_KINDS: AssetKind[] = ['audience', 'tool', 'product', 'page', 'offer'];

export function toAsset(row: DbMarketingAsset): Asset {
  const kind = VALID_KINDS.includes(row.kind as AssetKind) ? (row.kind as AssetKind) : 'product';
  return {
    id: row.id,
    business: row.business,
    kind,
    name: row.name,
    description: row.description ?? '',
    url: row.url ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    notes: row.notes ?? '',
    position: row.position ?? 0,
  };
}
