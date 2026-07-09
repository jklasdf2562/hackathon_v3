// 双通道降级客户端:主通道(OminiGate)失败 → 自动切备用通道(PPIO deepseek)。
// 备用也挂了才轮到各 agent 自己的 mock 兜底,形成三级降级。
import type { ChatMessage, LLMClient, LLMConfig } from './client';

export class FailoverClient implements LLMClient {
  private primary: LLMClient;
  private backup: LLMClient;

  constructor(primary: LLMClient, backup: LLMClient) {
    this.primary = primary;
    this.backup = backup;
  }

  async chat(messages: ChatMessage[], opts?: Partial<LLMConfig>): Promise<string> {
    try {
      return await this.primary.chat(messages, opts);
    } catch (e) {
      console.warn('[LLM] 主通道失败,降级备用通道:', (e as Error).message?.slice(0, 120));
      return this.backup.chat(messages, opts);
    }
  }

  async chatJSON<T>(messages: ChatMessage[], opts?: Partial<LLMConfig>): Promise<T> {
    try {
      return await this.primary.chatJSON<T>(messages, opts);
    } catch (e) {
      console.warn('[LLM] 主通道 JSON 失败,降级备用通道:', (e as Error).message?.slice(0, 120));
      return this.backup.chatJSON<T>(messages, opts);
    }
  }

  async chatStream(messages: ChatMessage[], onDelta: (s: string) => void): Promise<void> {
    let emitted = false;
    try {
      await this.primary.chatStream(messages, (s) => {
        emitted = true;
        onDelta(s);
      });
    } catch (e) {
      // 已经吐过字就不能换人重说,只能报错;一字未出才无缝换备用
      if (emitted) throw e;
      console.warn('[LLM] 主通道流式失败,降级备用通道:', (e as Error).message?.slice(0, 120));
      await this.backup.chatStream(messages, onDelta);
    }
  }
}
