// 压测 5 补充:降级链验证 —— 主通道 key 故意改坏,请求应落到备用通道(PPIO)而不是 mock。
import { loadEnv } from './env';

loadEnv({ VITE_LLM_API_KEY: 'sk-omg-broken-key-for-failover-test' });
const { interpretCommand } = await import('../../src/agents/interpreterAgent');
const { appendicitisCase: c } = await import('../../src/agents/../game/cases/appendicitis');

let fellToMock = false;
const realWarn = console.warn;
console.warn = (...a: unknown[]) => {
  if (String(a[0]).includes('回落规则匹配')) fellToMock = true;
  realWarn(...a);
};

const t0 = Date.now();
const v = await interpretCommand(c, '验个血', null, undefined);
console.log(`\n结果: action=${v.action_type} key=${v.target_key} 耗时=${Date.now() - t0}ms`);
if (fellToMock) console.log('✗ 掉到了 mock —— 备用通道没接住');
else if (v.action_type === 'lab' && v.target_key === 'blood_routine') console.log('✓ 备用通道(PPIO deepseek)接住了,分类正确');
else console.log(`⚠ 备用通道响应了但分类存疑: ${JSON.stringify(v).slice(0, 120)}`);
