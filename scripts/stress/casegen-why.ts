// 诊断:AI 出题为何频繁返工——连生成 2 张,打印每轮校验错误
import { loadEnv } from './env';
loadEnv();
const { generateCase } = await import('../../src/agents/caseGenAgent');
for (let i = 1; i <= 2; i++) {
  console.log(`\n===== 第 ${i} 张 =====`);
  const t0 = Date.now();
  const r = await generateCase({ mode: 'random', difficulty: 'advanced' } as never, (m) => console.log('  …', m));
  console.log(r.ok ? `✓ 成功 ${((Date.now() - t0) / 1000).toFixed(0)}s: ${(r as { card: { trueDiagnosis: string } }).card.trueDiagnosis}` : `✗ 失败: ${(r as { errors: string[] }).errors.slice(0, 3).join(' | ')}`);
}
