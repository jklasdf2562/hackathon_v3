// 出题 Agent 实弹验证:生成 → 校验门 → 打印摘要。
import { loadEnv } from './env';

loadEnv();
const { generateCase, validateCase } = await import('../../src/agents/caseGenAgent');

const t0 = Date.now();
const card = await generateCase((m) => console.log('  …', m));
if (!card) {
  console.log('✗ 三轮内未产出合格病例');
  process.exit(1);
}
console.log(`\n✓ 出题成功(${((Date.now() - t0) / 1000).toFixed(1)}s),复检: ${validateCase(card).length === 0 ? '通过' : '有残留问题!'}`);
console.log(`诊断: ${card.trueDiagnosis}`);
console.log(`患者: ${card.patient.name} ${card.patient.age}岁${card.patient.gender} | ${card.patient.personality}`);
console.log(`HP ${card.initialHp} 恶化 ${card.deteriorationRate}/回合 | 主诉: ${card.volunteered.join('、')}`);
console.log(`隐藏线索: ask×${card.hiddenAsk.length} exam×${card.hiddenExam.length} lab×${card.hiddenLab.length}`);
console.log(`操作: 查体×${card.exams.length} 化验×${card.labs.length} 药×${card.meds.length} 手术×${card.surgeries.length}`);
const cure = card.meds.find((m) => m.cure)?.label ?? card.surgeries.find((s) => s.correct)?.label;
console.log(`治愈路径: ${cure}`);
console.log(`陷阱: ${card.evalNotes}`);
console.log(`评分表 ${card.rubric.length} 条: ${card.rubric.map((r) => r.label).join(' / ')}`);
