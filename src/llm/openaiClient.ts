// OpenAI-compatible 客户端 —— 任何 /chat/completions 中转端点均可接入
import type { ChatMessage, LLMClient, LLMConfig } from './client';

function endpointOf(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  if (b.endsWith('/chat/completions')) return b;
  return `${b}/v1/chat/completions`;
}

export class OpenAICompatClient implements LLMClient {
  private cfg: LLMConfig;

  constructor(cfg: LLMConfig) {
    this.cfg = cfg;
  }

  private async request(messages: ChatMessage[], opts: Partial<LLMConfig> & { stream?: boolean; json?: boolean }) {
    const cfg = { ...this.cfg, ...opts };
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      temperature: cfg.temperature ?? 0.7,
      max_tokens: cfg.maxTokens ?? 1024,
      stream: opts.stream ?? false,
      ...cfg.extraBody,
    };
    if (opts.json) body.response_format = { type: 'json_object' };
    const res = await fetch(endpointOf(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return res;
  }

  async chat(messages: ChatMessage[], opts?: Partial<LLMConfig>): Promise<string> {
    const res = await this.request(messages, { ...opts });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  // 判定层/评估层用:优先 JSON mode,不支持 response_format 的中转会自动降级普通模式。
  async chatJSON<T>(messages: ChatMessage[], opts?: Partial<LLMConfig>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        const text = await this.request(messages, { temperature: 0.1, ...opts, json: i === 0 })
          .then((res) => res.json())
          .then((data) => data.choices?.[0]?.message?.content ?? '');
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start < 0 || end < start) throw new Error('LLM did not return a JSON object');
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  // 患者对话用:SSE 流式
  async chatStream(messages: ChatMessage[], onDelta: (s: string) => void): Promise<void> {
    const res = await this.request(messages, { stream: true });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch {
          /* 跳过不完整帧 */
        }
      }
    }
  }
}
