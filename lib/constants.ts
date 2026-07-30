export const DEFAULT_COLUMN_NAMES = [
  'Inbox',
  'Like',
  'Dislike',
  'This Week',
] as const;

export const STORAGE_KEY = 'kanthink-storage';

/**
 * Why a generated card was rejected. Stored server-side against the shroom that made it
 * and fed back into its future prompts, so rejecting is how a shroom learns.
 */
export const REJECTION_REASONS = [
  { key: 'too_similar', label: 'Too similar' },
  { key: 'not_relevant', label: 'Not relevant' },
  { key: 'too_vague', label: 'Too vague' },
  { key: 'not_for_me', label: 'Not for me' },
  { key: 'already_know', label: 'Already know this' },
] as const;
