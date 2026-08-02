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
  /** The model id actually being called, so callers can report and compare it. */
  model: string;
  complete(messages: LLMMessage[], options?: LLMCompleteOptions): Promise<LLMResponse>;
  /**
   * The same credentials pointed at a model with more room, or null when
   * already at the top of the ladder.
   *
   * This exists so a caller that gets a `truncated` response can retry without
   * ever handling an API key: the key stays inside the provider closure.
   */
  escalate?(): LLMProvider | null;
  // Optional web search capability
  webSearch?(query: string, systemPrompt?: string): Promise<LLMResponse>;
}

export interface LLMConfig {
  provider: 'openai' | 'google';
  apiKey: string;
  model?: string;
}
