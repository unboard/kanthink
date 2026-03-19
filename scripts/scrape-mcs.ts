/**
 * MCS Product Page Scraper
 *
 * Run: npx tsx scripts/scrape-mcs.ts
 * Output: lib/mcs/product-data.json
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

interface ScrapeResult {
  url: string;
  title: string;
  description: string;
  headings: string[];
  bulletPoints: string[];
  specText: string[];
  calculatorLabels: string[];
  relatedLinks: { text: string; href: string }[];
  rawText: string;
  options: Record<string, string[]>;
}

interface ProductRecord {
  id: string;
  name: string;
  slug: string;
  url: string;
  category: string;
  parentCategory: string | null;
  aliases: string[];
  productFamily: string;
  description: string;
  sizes: string[];
  materials: string[];
  finishes: string[];
  useCases: string[];
  calculatorInputs: string[];
  pricingStrategy: string;
  relatedProducts: string[];
  rawContent: string;
  options: Record<string, string[]>;
}

const PRODUCT_MAP: Record<string, { name: string; url: string }[]> = {
  "signs": [
    { "name": "A-Frame Signs", "url": "https://www.mycreativeshop.com/signs/a-frame-signs" },
    { "name": "Counter Cards", "url": "https://www.mycreativeshop.com/signs/counter-cards" },
    { "name": "Foam Boards", "url": "https://www.mycreativeshop.com/signs/foam-board-signs" },
    { "name": "Signs", "url": "https://www.mycreativeshop.com/signs" }
  ],
  "banners": [
    { "name": "Banners", "url": "https://www.mycreativeshop.com/banners" },
    { "name": "Fabric Banners", "url": "https://www.mycreativeshop.com/banners/fabric-banners" },
    { "name": "Retractable Banners", "url": "https://www.mycreativeshop.com/banners/retractable-banners" },
    { "name": "Step and Repeat Banners", "url": "https://www.mycreativeshop.com/banners/step-and-repeat-banners" },
    { "name": "Table Top Banners", "url": "https://www.mycreativeshop.com/banners/table-top-banners" },
    { "name": "Tension Fabric Displays", "url": "https://www.mycreativeshop.com/banners/tension-fabric-displays" }
  ],
  "brochures": [
    { "name": "Brochures", "url": "https://www.mycreativeshop.com/brochures" },
    { "name": "Bi-Fold Brochures", "url": "https://www.mycreativeshop.com/brochures/bi-fold-brochures" },
    { "name": "Tri-Fold Brochures", "url": "https://www.mycreativeshop.com/brochures/tri-fold-brochures" }
  ],
  "bookmarks": [
    { "name": "Bookmarks", "url": "https://www.mycreativeshop.com/bookmarks" }
  ],
  "tags": [
    { "name": "Tags", "url": "https://www.mycreativeshop.com/tags" },
    { "name": "Bottle Tags", "url": "https://www.mycreativeshop.com/tags/bottle-tags" },
    { "name": "Hang Tags", "url": "https://www.mycreativeshop.com/tags/hang-tags" }
  ],
  "stickers": [
    { "name": "Stickers", "url": "https://www.mycreativeshop.com/stickers" },
    { "name": "Bumper Stickers", "url": "https://www.mycreativeshop.com/stickers/bumper-stickers" },
    { "name": "Circle Stickers", "url": "https://www.mycreativeshop.com/stickers/circle-stickers" },
    { "name": "Square Stickers", "url": "https://www.mycreativeshop.com/stickers/square-stickers" }
  ],
  "magnets": [
    { "name": "Magnets", "url": "https://www.mycreativeshop.com/magnets" },
    { "name": "Business Card Magnets", "url": "https://www.mycreativeshop.com/magnets/business-card-magnets" },
    { "name": "Car Magnets", "url": "https://www.mycreativeshop.com/magnets/car-magnets" },
    { "name": "Postcard Magnets", "url": "https://www.mycreativeshop.com/magnets/postcard-magnets" }
  ],
  "business-cards": [
    { "name": "Business Cards", "url": "https://www.mycreativeshop.com/business-cards" },
    { "name": "QR Code Business Cards", "url": "https://www.mycreativeshop.com/business-cards/qr-code" }
  ],
  "buttons": [
    { "name": "Buttons", "url": "https://www.mycreativeshop.com/buttons" }
  ],
  "cards": [
    { "name": "Cards", "url": "https://www.mycreativeshop.com/cards" },
    { "name": "Reminder Cards", "url": "https://www.mycreativeshop.com/reminder-cards" }
  ],
  "coasters": [
    { "name": "Coasters", "url": "https://www.mycreativeshop.com/coasters" }
  ],
  "decals": [
    { "name": "Decals", "url": "https://www.mycreativeshop.com/decals" },
    { "name": "Floor Decals", "url": "https://www.mycreativeshop.com/decals/floor-decals" },
    { "name": "Perforated Window Decals", "url": "https://www.mycreativeshop.com/decals/perforated-window-decals" },
    { "name": "Wall Decals", "url": "https://www.mycreativeshop.com/decals/wall-decals" },
    { "name": "Window Decals", "url": "https://www.mycreativeshop.com/decals/window-decals" }
  ],
  "doorhangers": [
    { "name": "Door Hangers", "url": "https://www.mycreativeshop.com/doorhangers" }
  ],
  "postcards": [
    { "name": "Postcards", "url": "https://www.mycreativeshop.com/postcards" },
    { "name": "EDDM Postcards", "url": "https://www.mycreativeshop.com/postcards/eddm" }
  ],
  "envelopes": [
    { "name": "Envelopes", "url": "https://www.mycreativeshop.com/envelopes" }
  ],
  "flags": [
    { "name": "Flags", "url": "https://www.mycreativeshop.com/flags" },
    { "name": "Feather Flags", "url": "https://www.mycreativeshop.com/flags/feather-flags" },
    { "name": "Teardrop Flags", "url": "https://www.mycreativeshop.com/flags/teardrop-flags" }
  ],
  "flyers": [
    { "name": "Flyers", "url": "https://www.mycreativeshop.com/flyers" },
    { "name": "Rack Cards", "url": "https://www.mycreativeshop.com/flyers/rack-cards" }
  ],
  "gift-certificates": [
    { "name": "Gift Certificates", "url": "https://www.mycreativeshop.com/gift-certificates" }
  ],
  "kpop": [
    { "name": "Kpop", "url": "https://www.mycreativeshop.com/kpop" },
    { "name": "Kpop Cup Sleeves", "url": "https://www.mycreativeshop.com/kpop/cupsleeves" },
    { "name": "Kpop Fabric Slogans", "url": "https://www.mycreativeshop.com/kpop/fabric-slogans" },
    { "name": "Kpop Filmstrips", "url": "https://www.mycreativeshop.com/kpop/film-strips" },
    { "name": "Kpop Hand Banners", "url": "https://www.mycreativeshop.com/kpop/hand-banners" },
    { "name": "Kpop Magnets", "url": "https://www.mycreativeshop.com/kpop/magnets" },
    { "name": "Kpop Posters", "url": "https://www.mycreativeshop.com/kpop/posters" },
    { "name": "Kpop Tickets", "url": "https://www.mycreativeshop.com/kpop/tickets" }
  ],
  "letterheads": [
    { "name": "Letterheads", "url": "https://www.mycreativeshop.com/letterheads" }
  ],
  "loyalty-cards": [
    { "name": "Loyalty Cards", "url": "https://www.mycreativeshop.com/loyalty-cards" }
  ],
  "menus": [
    { "name": "Menus", "url": "https://www.mycreativeshop.com/menus" }
  ],
  "newsletters": [
    { "name": "Newsletters", "url": "https://www.mycreativeshop.com/newsletters" }
  ],
  "notepads": [
    { "name": "Notepads", "url": "https://www.mycreativeshop.com/notepads" }
  ],
  "pocket-folders": [
    { "name": "Pocket Folders", "url": "https://www.mycreativeshop.com/pocket-folders" }
  ],
  "posters": [
    { "name": "Posters", "url": "https://www.mycreativeshop.com/posters" }
  ],
  "table-tents": [
    { "name": "Table Tents", "url": "https://www.mycreativeshop.com/table-tents" }
  ],
  "tickets": [
    { "name": "Tickets", "url": "https://www.mycreativeshop.com/tickets" }
  ],
  "wristbands": [
    { "name": "Wristbands", "url": "https://www.mycreativeshop.com/wristbands" }
  ],
  "yardsigns": [
    { "name": "Yard Signs", "url": "https://www.mycreativeshop.com/yardsigns" }
  ]
};

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MCSBot/1.0)',
        'Accept': 'text/html',
      },
    });
    if (!response.ok) {
      console.error(`  Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.error(`  Error fetching ${url}:`, err);
    return null;
  }
}

function scrapePage(html: string, url: string): ScrapeResult {
  const $ = cheerio.load(html);

  // Remove scripts, styles, nav, footer
  $('script, style, nav, footer, header, .cookie-banner, .modal').remove();

  const title = $('h1').first().text().trim() || $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';

  // Headings
  const headings: string[] = [];
  $('h1, h2, h3, h4').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });

  // Bullet points
  const bulletPoints: string[] = [];
  $('ul li, ol li').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 300 && text.length > 5) bulletPoints.push(text);
  });

  // Spec-like text (tables, dt/dd, strong labels)
  const specText: string[] = [];
  $('table tr').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text && text.length < 300) specText.push(text);
  });
  $('dl dt, dl dd').each((_, el) => {
    const text = $(el).text().trim();
    if (text) specText.push(text);
  });

  // Calculator labels (look for form labels, select options)
  const calculatorLabels: string[] = [];
  $('label, .calculator label, select option, [class*="calc"] label').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 100) calculatorLabels.push(text);
  });
  // Also look for common calculator-related elements
  $('select').each((_, el) => {
    const name = $(el).attr('name') || $(el).attr('id') || '';
    if (name) calculatorLabels.push(`[select: ${name}]`);
    $(el).find('option').each((_, opt) => {
      const val = $(opt).text().trim();
      if (val && val !== 'Select' && val.length < 100) calculatorLabels.push(val);
    });
  });

  // Related links
  const relatedLinks: { text: string; href: string }[] = [];
  $('a[href*="mycreativeshop.com"]').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (text && href && text.length < 100 && !href.includes('#')) {
      relatedLinks.push({ text, href });
    }
  });

  // Options (look for grouped selections)
  const options: Record<string, string[]> = {};
  $('select, [role="listbox"]').each((_, el) => {
    const label = $(el).attr('name') || $(el).attr('aria-label') || $(el).prev('label').text().trim() || 'unknown';
    const vals: string[] = [];
    $(el).find('option').each((_, opt) => {
      const v = $(opt).text().trim();
      if (v && v !== 'Select' && v !== '--') vals.push(v);
    });
    if (vals.length > 0) options[label] = vals;
  });

  // Raw text (main content area)
  const mainContent = $('main, [role="main"], .content, .page-content, article, #content').first();
  const rawText = (mainContent.length ? mainContent.text() : $('body').text())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);

  return {
    url,
    title,
    description: metaDesc,
    headings,
    bulletPoints: [...new Set(bulletPoints)].slice(0, 30),
    specText: [...new Set(specText)].slice(0, 20),
    calculatorLabels: [...new Set(calculatorLabels)].slice(0, 30),
    relatedLinks: relatedLinks.slice(0, 20),
    rawText,
    options,
  };
}

function buildProductRecord(
  name: string,
  category: string,
  parentCategory: string | null,
  scrapeResult: ScrapeResult | null
): ProductRecord {
  const url = scrapeResult?.url || '';
  const slug = url.split('/').filter(Boolean).pop() || name.toLowerCase().replace(/\s+/g, '-');

  // Build aliases
  const aliases = [name.toLowerCase()];
  const singularName = name.replace(/s$/, '').toLowerCase();
  if (singularName !== name.toLowerCase()) aliases.push(singularName);
  // Add common variations
  const dashName = name.toLowerCase().replace(/\s+/g, '-');
  if (!aliases.includes(dashName)) aliases.push(dashName);
  const noSpaceName = name.toLowerCase().replace(/\s+/g, '');
  if (!aliases.includes(noSpaceName)) aliases.push(noSpaceName);

  // Extract sizes from content
  const sizes: string[] = [];
  const sizePatterns = /(\d+(?:\.\d+)?)\s*[""x×]\s*(\d+(?:\.\d+)?)/gi;
  const rawText = scrapeResult?.rawText || '';
  let match;
  while ((match = sizePatterns.exec(rawText)) !== null) {
    sizes.push(match[0]);
  }
  // Also check bullet points for size info
  const sizeBullets = (scrapeResult?.bulletPoints || []).filter(b =>
    /\d+\s*[""x×]\s*\d+|inch|size|dimension/i.test(b)
  );
  sizeBullets.forEach(b => { if (!sizes.includes(b)) sizes.push(b); });

  // Extract materials
  const materials: string[] = [];
  const materialKeywords = ['vinyl', 'paper', 'cardstock', 'foam', 'fabric', 'canvas', 'polyester',
    'coroplast', 'corrugated', 'glossy', 'matte', 'satin', 'linen', 'kraft', 'magnetic',
    'aluminum', 'acrylic', 'pvc', 'mesh', 'adhesive', 'laminate'];
  materialKeywords.forEach(kw => {
    if (rawText.toLowerCase().includes(kw)) materials.push(kw);
  });

  // Extract finishes
  const finishes: string[] = [];
  const finishKeywords = ['gloss', 'matte', 'satin', 'uv coating', 'lamination', 'spot uv', 'foil', 'embossed', 'uncoated'];
  finishKeywords.forEach(kw => {
    if (rawText.toLowerCase().includes(kw)) finishes.push(kw);
  });

  // Infer calculator inputs
  const calcInputs: string[] = ['quantity'];
  if (sizes.length > 0 || rawText.toLowerCase().includes('size')) calcInputs.push('size');
  if (materials.length > 0 || rawText.toLowerCase().includes('material') || rawText.toLowerCase().includes('stock')) calcInputs.push('material');
  if (finishes.length > 0 || rawText.toLowerCase().includes('finish') || rawText.toLowerCase().includes('coating')) calcInputs.push('finish');
  if (rawText.toLowerCase().includes('turnaround') || rawText.toLowerCase().includes('delivery') || rawText.toLowerCase().includes('shipping')) calcInputs.push('turnaround');
  if (rawText.toLowerCase().includes('single') && rawText.toLowerCase().includes('double') || rawText.toLowerCase().includes('sided')) calcInputs.push('sides');

  // Build description
  const description = scrapeResult?.description ||
    (scrapeResult?.headings?.[0] ? `${name} - ${scrapeResult.headings[0]}` : `${name} from MyCreativeShop`);

  // Related products from links
  const relatedProducts: string[] = [];
  (scrapeResult?.relatedLinks || []).forEach(link => {
    if (link.href.includes('mycreativeshop.com/') && !link.href.includes(slug)) {
      const relSlug = link.href.split('/').filter(Boolean).pop();
      if (relSlug && relSlug !== 'mycreativeshop.com') relatedProducts.push(relSlug);
    }
  });

  return {
    id: slug,
    name,
    slug,
    url,
    category,
    parentCategory,
    aliases: [...new Set(aliases)],
    productFamily: parentCategory || category,
    description: description.slice(0, 500),
    sizes: [...new Set(sizes)].slice(0, 10),
    materials: [...new Set(materials)],
    finishes: [...new Set(finishes)],
    useCases: extractUseCases(rawText, name),
    calculatorInputs: calcInputs,
    pricingStrategy: 'calculator_tool',
    relatedProducts: [...new Set(relatedProducts)].slice(0, 10),
    rawContent: (scrapeResult?.bulletPoints || []).join('\n').slice(0, 1500),
    options: scrapeResult?.options || {},
  };
}

function extractUseCases(text: string, productName: string): string[] {
  const useCases: string[] = [];
  const useCaseKeywords = [
    'perfect for', 'great for', 'ideal for', 'use for', 'used for',
    'promote', 'advertise', 'marketing', 'event', 'trade show',
    'restaurant', 'retail', 'real estate', 'church', 'school',
    'business', 'wedding', 'party', 'campaign', 'fundraiser'
  ];
  const sentences = text.split(/[.!?]+/);
  sentences.forEach(sentence => {
    const lower = sentence.toLowerCase().trim();
    if (useCaseKeywords.some(kw => lower.includes(kw)) && lower.length < 200) {
      useCases.push(sentence.trim());
    }
  });
  return [...new Set(useCases)].slice(0, 5);
}

async function main() {
  console.log('Starting MCS product scrape...\n');

  const allProducts: ProductRecord[] = [];
  const scrapeResults: Record<string, ScrapeResult> = {};
  let total = 0;
  let scraped = 0;
  let failed = 0;

  // Count total
  for (const products of Object.values(PRODUCT_MAP)) {
    total += products.length;
  }
  console.log(`Total products to scrape: ${total}\n`);

  for (const [category, products] of Object.entries(PRODUCT_MAP)) {
    console.log(`\n--- Category: ${category} ---`);

    for (const product of products) {
      console.log(`  Scraping: ${product.name} (${product.url})`);

      const html = await fetchPage(product.url);
      if (html) {
        const result = scrapePage(html, product.url);
        scrapeResults[product.url] = result;
        scraped++;
        console.log(`    ✓ Title: ${result.title}`);
        console.log(`    ✓ Headings: ${result.headings.length}, Bullets: ${result.bulletPoints.length}`);
      } else {
        failed++;
        console.log(`    ✗ Failed`);
      }

      // Determine parent category
      const isSubProduct = product.url.split('/').filter(Boolean).length > 4;
      const parentCategory = isSubProduct ? category : null;

      const record = buildProductRecord(
        product.name,
        category,
        parentCategory,
        scrapeResults[product.url] || null
      );
      allProducts.push(record);

      // Rate limit
      await delay(500);
    }
  }

  console.log(`\n\n=== Scrape Complete ===`);
  console.log(`Scraped: ${scraped}/${total}`);
  console.log(`Failed: ${failed}/${total}`);

  // Write output
  const outputPath = path.join(__dirname, '..', 'lib', 'mcs', 'product-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2));
  console.log(`\nProduct data written to: ${outputPath}`);

  // Also write scrape results for debugging
  const scrapeOutputPath = path.join(__dirname, '..', 'lib', 'mcs', 'scrape-results.json');
  fs.writeFileSync(scrapeOutputPath, JSON.stringify(scrapeResults, null, 2));
  console.log(`Scrape results written to: ${scrapeOutputPath}`);
}

main().catch(console.error);
