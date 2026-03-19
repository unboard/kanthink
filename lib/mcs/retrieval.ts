import type { MCSProduct } from './types';

/**
 * Simple keyword-based product retrieval.
 * Scores products against a query using term matching.
 */
export function searchProducts(
  query: string,
  products: MCSProduct[],
  limit = 5
): { product: MCSProduct; score: number; reason: string }[] {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(t => t.length > 2);

  const scored = products.map(product => {
    let score = 0;
    const reasons: string[] = [];

    // Exact name match (highest signal)
    if (q.includes(product.name.toLowerCase())) {
      score += 100;
      reasons.push('exact name match');
    }

    // Alias match
    for (const alias of product.aliases) {
      if (q.includes(alias)) {
        score += 80;
        reasons.push(`alias match: ${alias}`);
        break;
      }
    }

    // Category match
    if (q.includes(product.category)) {
      score += 40;
      reasons.push('category match');
    }

    // Term-by-term matching
    for (const term of terms) {
      if (product.name.toLowerCase().includes(term)) {
        score += 20;
        reasons.push(`name contains: ${term}`);
      }
      if (product.description.toLowerCase().includes(term)) {
        score += 10;
        reasons.push(`description contains: ${term}`);
      }
      if (product.rawContent.toLowerCase().includes(term)) {
        score += 5;
        reasons.push(`content contains: ${term}`);
      }
      for (const useCase of product.useCases) {
        if (useCase.toLowerCase().includes(term)) {
          score += 15;
          reasons.push(`use case match: ${term}`);
          break;
        }
      }
      for (const material of product.materials) {
        if (material.includes(term)) {
          score += 10;
          reasons.push(`material match: ${term}`);
          break;
        }
      }
    }

    // Boost parent categories (they're more general/useful for broad queries)
    if (!product.parentCategory && score > 0) {
      score += 5;
    }

    return {
      product,
      score,
      reason: [...new Set(reasons)].join(', '),
    };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get products by category
 */
export function getProductsByCategory(
  category: string,
  products: MCSProduct[]
): MCSProduct[] {
  return products.filter(
    p => p.category === category || p.productFamily === category
  );
}

/**
 * Get a specific product by ID or slug
 */
export function getProductById(
  id: string,
  products: MCSProduct[]
): MCSProduct | undefined {
  return products.find(p => p.id === id || p.slug === id);
}

/**
 * Find similar/related products
 */
export function getRelatedProducts(
  product: MCSProduct,
  products: MCSProduct[]
): MCSProduct[] {
  const related = new Set<string>(product.relatedProducts);
  return products.filter(p =>
    p.id !== product.id && (
      related.has(p.id) ||
      related.has(p.slug) ||
      p.category === product.category
    )
  );
}

/**
 * Build a product context string for the LLM
 */
export function buildProductContext(
  matches: { product: MCSProduct; score: number; reason: string }[]
): string {
  if (matches.length === 0) return 'No specific products matched the query.';

  return matches.map(m => {
    const p = m.product;
    let ctx = `## ${p.name}\n`;
    ctx += `URL: ${p.url}\n`;
    ctx += `Category: ${p.category}${p.parentCategory ? ` (sub of ${p.parentCategory})` : ''}\n`;
    if (p.description) ctx += `Description: ${p.description}\n`;
    if (p.sizes.length > 0) ctx += `Sizes: ${p.sizes.join(', ')}\n`;
    if (p.materials.length > 0) ctx += `Materials: ${p.materials.join(', ')}\n`;
    if (p.finishes.length > 0) ctx += `Finishes: ${p.finishes.join(', ')}\n`;
    if (p.useCases.length > 0) ctx += `Use cases: ${p.useCases.join('; ')}\n`;
    if (p.calculatorInputs.length > 0) ctx += `Pricing inputs needed: ${p.calculatorInputs.join(', ')}\n`;
    if (p.rawContent) ctx += `\nAdditional info:\n${p.rawContent.slice(0, 500)}\n`;
    return ctx;
  }).join('\n---\n');
}
