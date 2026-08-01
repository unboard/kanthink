export type LLMContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LLMContentPart[];
}

export interface LLMResponse {
  content: string;
  /**
   * The model ran out of output budget mid-sentence.
   *
   * Callers that parse JSON out of `content` need this: a truncated response
   * looks exactly like a model that decided to do nothing, and silently doing
   * nothing is the worst of the two outcomes to be wrong about.
   */
  truncated?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  // Web search results (if web search was used)
  webSearchResults?: {
    url: string;
    title: string;
    snippet: string;
  }[];
}

export interface LLMCompleteOptions {
  maxTokens?: number;
}

export interface LLMProvider {
  name: string;
  complete(messages: LLMMessage[], options?: LLMCompleteOptions): Promise<LLMResponse>;
  // Optional web search capability
  webSearch?(query: string, systemPrompt?: string): Promise<LLMResponse>;
}

export interface LLMConfig {
  provider: 'openai' | 'google';
  apiKey: string;
  model?: string;
}
