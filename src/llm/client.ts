// LLM API 适配层 —— 唯一允许发起模型请求的模块。
// 业务代码不接触任何厂商 SDK;真实实现(OpenAI-compatible fetch)后续接入,
// 当前使用 MockLLMClient 跑通全流程(断网开发 / demo 兜底)。

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  /** 直接并入请求体的厂商特定参数,如 { enable_thinking: false } */
  extraBody?: Record<string, unknown>;
}

export interface LLMClient {
  chat(messages: ChatMessage[], opts?: Partial<LLMConfig>): Promise<string>;
  chatJSON<T>(messages: ChatMessage[], opts?: Partial<LLMConfig>): Promise<T>;
  chatStream(messages: ChatMessage[], onDelta: (s: string) => void): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock 实现:resolver 根据 messages 返回剧本文本;
 * chatStream 以打字机节奏逐字回吐,模拟真实流式。
 */
export class MockLLMClient implements LLMClient {
  private resolver: (messages: ChatMessage[]) => string;
  private charDelayMs: number;

  constructor(resolver: (messages: ChatMessage[]) => string, charDelayMs = 35) {
    this.resolver = resolver;
    this.charDelayMs = charDelayMs;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    await sleep(300);
    return this.resolver(messages);
  }

  async chatJSON<T>(messages: ChatMessage[]): Promise<T> {
    await sleep(200);
    return JSON.parse(this.resolver(messages)) as T;
  }

  async chatStream(messages: ChatMessage[], onDelta: (s: string) => void): Promise<void> {
    const text = this.resolver(messages);
    await sleep(350); // 模拟首 token 延迟
    for (const ch of text) {
      onDelta(ch);
      await sleep(this.charDelayMs);
    }
  }
}
