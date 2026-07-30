import type { Card, ColumnSortOrder } from '@/lib/types';

export const COLUMN_SORT_LABELS: Record<ColumnSortOrder, string> = {
  manual: 'Manual (drag to arrange)',
  created_newest: 'Created date (newest)',
  created_oldest: 'Created date (oldest)',
  updated_newest: 'Modified date (newest)',
  updated_oldest: 'Modified date (oldest)',
};

/** The options offered in the sort menu, in display order. */
export const COLUMN_SORT_OPTIONS: ColumnSortOrder[] = [
  'created_newest',
  'created_oldest',
  'updated_newest',
  'updated_oldest',
  'manual',
];

/**
 * True when the column's rule puts the freshest card first, which means a newly
 * created card belongs at the top rather than appended to the bottom.
 */
export function newCardGoesFirst(sortOrder: ColumnSortOrder | undefined): boolean {
  return sortOrder === 'created_newest' || sortOrder === 'updated_newest';
}

/**
 * True when the rule puts the freshest card last. 'manual' is neither — the app's
 * long-standing default is to drop new cards at the top and let the user drag.
 */
export function newCardGoesLast(sortOrder: ColumnSortOrder | undefined): boolean {
  return sortOrder === 'created_oldest' || sortOrder === 'updated_oldest';
}

/** Order a set of cards by a column's sort rule. 'manual' leaves them untouched. */
export function sortCardsBy(cards: Card[], sortOrder: ColumnSortOrder): Card[] {
  if (sortOrder === 'manual') return cards;
  const time = (value: string | undefined) => (value ? new Date(value).getTime() : 0);
  return [...cards].sort((a, b) => {
    switch (sortOrder) {
      case 'created_newest':
        return time(b.createdAt) - time(a.createdAt);
      case 'created_oldest':
        return time(a.createdAt) - time(b.createdAt);
      case 'updated_newest':
        return time(b.updatedAt) - time(a.updatedAt);
      case 'updated_oldest':
        return time(a.updatedAt) - time(b.updatedAt);
    }
  });
}
