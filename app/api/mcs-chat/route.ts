import { NextResponse } from 'next/server';
import { createLLMClient } from '@/lib/ai/llm';
import type { LLMMessage } from '@/lib/ai/providers/types';
import type { MCSProduct, DebugInfo } from '@/lib/mcs/types';
import { searchProducts, buildProductContext } from '@/lib/mcs/retrieval';
import { buildSystemPrompt, buildCatalogSummary } from '@/lib/mcs/system-prompt';

export const runtime = 'nodejs';

// Load product data at module level
let products: MCSProduct[] = [];
let catalogSummary = '';

async function loadProducts() {
  if (products.length > 0) return;
  try {
    const data = await import('@/lib/mcs/product-data.json');
    products = (data.default || data) as MCSProduct[];
    catalogSummary = buildCatalogSummary(
      products.map(p => ({ name: p.name, category: p.category, url: p.url }))
    );
    console.log(`[MCS] Loaded ${products.length} products`);
  } catch (err) {
    console.error('[MCS] Failed to load product data:', err);
    products = [];
  }
}

interface ChatRequest {
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export async function POST(req: Request) {
  await loadProducts();

  const apiKey = process.env.OWNER_OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  const body: ChatRequest = await req.json();
  const { messages } = body;

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  // Get the latest user message for retrieval
  const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Search for relevant products
  const matches = searchProducts(latestUserMessage, products, 5);

  // Build product context
  const productContext = buildProductContext(matches);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(productContext, catalogSummary);

  // Build LLM messages
  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  try {
    const client = createLLMClient({
      provider: 'openai',
      apiKey,
      model: 'gpt-4.1',
    });

    const response = await client.complete(llmMessages, { maxTokens: 2048 });

    // Parse the JSON response
    let parsedResponse: { message: string; debug: DebugInfo };
    try {
      // Try to extract JSON from the response (might be wrapped in markdown code blocks)
      let jsonStr = response.content;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      parsedResponse = JSON.parse(jsonStr.trim());
    } catch {
      // If JSON parsing fails, treat the whole response as the message
      parsedResponse = {
        message: response.content,
        debug: {
          intent: 'general',
          entities: { product: null, quantity: null, size: null, material: null, finish: null, turnaround: null },
          matchedProducts: matches.map(m => ({
            id: m.product.id,
            name: m.product.name,
            confidence: Math.min(m.score / 100, 1),
            reason: m.reason,
          })),
          missingFields: [],
          responseStrategy: 'fallback - could not parse structured response',
          answerSource: 'fallback' as const,
          conversationState: {
            intent: 'general',
            productType: null,
            productUrl: null,
            quantity: null,
            size: null,
            material: null,
            finish: null,
            turnaround: null,
            shippingInfo: null,
            missingFields: [],
            stage: 'general' as const,
            pricingMode: 'none' as const,
            matchedProducts: [],
          },
        },
      };
    }

    // Enrich debug with retrieval-level info
    if (parsedResponse.debug) {
      // Add retrieval matches if the LLM didn't provide them
      if (!parsedResponse.debug.matchedProducts || parsedResponse.debug.matchedProducts.length === 0) {
        parsedResponse.debug.matchedProducts = matches.map(m => ({
          id: m.product.id,
          name: m.product.name,
          confidence: Math.min(m.score / 100, 1),
          reason: m.reason,
        }));
      }
    }

    return NextResponse.json({
      message: parsedResponse.message,
      debug: parsedResponse.debug,
      tokenUsage: response.usage ? {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens,
      } : undefined,
    });
  } catch (err: unknown) {
    console.error('[MCS Chat] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Chat failed: ${errorMessage}` }, { status: 500 });
  }
}
