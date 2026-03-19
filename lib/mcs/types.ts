export interface MCSProduct {
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
  pricingStrategy: 'calculator_tool' | 'contact' | 'unknown';
  relatedProducts: string[];
  rawContent: string;
  options: Record<string, string[]>;
}

export interface ConversationState {
  intent: string | null;
  productType: string | null;
  productUrl: string | null;
  quantity: number | null;
  size: string | null;
  material: string | null;
  finish: string | null;
  turnaround: string | null;
  shippingInfo: string | null;
  missingFields: string[];
  stage: 'greeting' | 'product_lookup' | 'comparison' | 'recommendation' | 'pricing' | 'clarification' | 'general';
  pricingMode: 'none' | 'gathering_info' | 'ready' | 'quoted';
  matchedProducts: string[];
}

export interface DebugInfo {
  intent: string;
  entities: Record<string, string | number | null>;
  matchedProducts: { id: string; name: string; confidence: number; reason: string }[];
  missingFields: string[];
  responseStrategy: string;
  answerSource: 'structured_knowledge' | 'retrieved_content' | 'pricing_tool' | 'fallback';
  conversationState: ConversationState;
  tokenUsage?: { input: number; output: number };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  debug?: DebugInfo;
}

export interface MCSScrapeResult {
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
