// 检查报告生成器 —— 报告不再是病例卡里的死快照,而是按患者当下真实状态现场生成。
// 病例卡的 result 降级为"疾病活动期的基准真相";引擎只管揭示线索和记账。
// 生成失败时返回 null,引擎回落到静态基准单。
import { interpreterLLM } from '../llm';
import type { CaseCard, ExamDef, GameState, LabDef, ResultRow } from '../game/types';

export interface GeneratedResult {
  rows: ResultRow[];
  note?: string;
}

export async function generateResultCard(
  c: CaseCard,
  s: GameState,
  def: ExamDef | LabDef,
  masked: boolean
): Promise<GeneratedResult | null> {
  if (!interpreterLLM) return null;
  try {
    const baseline = masked && 'maskedResult' in def && def.maskedResult ? def.maskedResult : def.result;
    const ops = s.timeline
      .filter((t) => t.action === 'surgery' || t.action === 'medicate')
      .map((t) => `T${t.turn} ${t.detail}(${t.result})`)
      .slice(-6);
    const v = await interpreterLLM.chatJSON<GeneratedResult>(
      [
        {
          role: 'system',
          content: `你是医疗模拟游戏的检查报告生成器,根据患者"此刻"的真实状态生成「${def.label}」的报告。

【幕后真相】
- 真实诊断:${c.trueDiagnosis}
- 当前阶段:${s.phase}${s.phase === 'recovering' ? `(已正确处置,恢复第 ${s.recoverTurns} 回合)` : ''};HP ${s.hp}/100(满血100,越低越危重);第 ${s.turn} 回合
- 本检查在疾病活动期的基准报告(这是出题人设计的真相锚点):${JSON.stringify(baseline.rows)}${baseline.note ? `,备注:${baseline.note}` : ''}
${masked ? '- ⚠ 患者体征正被止痛药掩盖,查体阳性体征应失真(基准报告已是掩盖版)' : ''}
- 已发生的处置:${ops.length ? ops.join(';') : '无'}
- 患者身上的持续影响:${s.activeEffects.length ? s.activeEffects.map((e) => e.label).join('、') : '无'}

【生成规则】
1. 疾病活动期(active/critical):呈现基准报告的异常,数值可做 ±10% 的自然扰动;病情越重(HP越低)异常越显著
2. 恢复期/治愈(recovering/cured):病灶已被处置,炎症指标应明显回落(向参考范围靠拢,恢复越久越接近正常),体征转阴
3. 持续影响若与本检查相关(如胸壁创伤之于心肺听诊),应如实体现
4. 不得编造基准与持续影响之外的重大新异常;行数与基准大体一致
5. abnormal 标记要与数值一致(回到参考范围内就是 false)

只输出严格 JSON:{"rows":[{"name":"项目名","value":"结果","ref":"参考范围(没有就省略该字段)","abnormal":true或false}],"note":"备注,没有则null"}`,
        },
        { role: 'user', content: `生成本次「${def.label}」的报告。` },
      ]
    );
    if (!Array.isArray(v.rows) || v.rows.length === 0) return null;
    const rows: ResultRow[] = v.rows
      .filter((r) => r && typeof r.name === 'string' && typeof r.value === 'string')
      .slice(0, 8)
      .map((r) => ({
        name: r.name,
        value: r.value,
        ref: typeof r.ref === 'string' && r.ref ? r.ref : undefined,
        abnormal: r.abnormal === true,
      }));
    if (!rows.length) return null;
    return { rows, note: typeof v.note === 'string' && v.note ? v.note : undefined };
  } catch (e) {
    console.warn('[resultAgent] 报告生成失败,回落静态基准单:', e);
    return null;
  }
}
