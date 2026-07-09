// 压测公共:把 .env 注入 globalThis.__LLM_ENV__(Node 里没有 import.meta.env)
// 必须在动态 import 任何 agent 之前调用。
import { readFileSync } from 'node:fs';

export function loadEnv(overrides: Record<string, string> = {}) {
  const txt = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const env: Record<string, string> = {};
  for (const line of txt.split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  // Node 直连网关(浏览器才需要代理),没有 CORS 问题
  env.VITE_LLM_BASE_URL = 'https://api.ominigate.ai';
  Object.assign(env, overrides);
  (globalThis as Record<string, unknown>).__LLM_ENV__ = env;
  return env;
}

export const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};
