'use client';

import { createContext, useContext } from 'react';

/** Board-scoped "compact cards" flag. When true, Card renders a minimal title-only view. */
export const CompactCardsContext = createContext(false);

export function useCompactCards(): boolean {
  return useContext(CompactCardsContext);
}
