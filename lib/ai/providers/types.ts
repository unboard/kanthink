export type LLMContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LLMContentPart[];
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  complete(messages: LLMMessage[]): Promise<LLMResponse>;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model?: string;
}
