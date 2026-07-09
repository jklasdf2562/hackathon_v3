// 评估 Agent —— 游戏结束时调用一次,全部标准由 LLM 对照 timeline 判定(三档:met/partial/missed)。
// 护栏:① 总分算术在代码(met=1,partial=0.5,加权求和);② 提示词强制每条先引用 timeline 再下结论。
import { evaluatorLLM } from '../llm';
import type { CaseCard, GameState } from '../game/types';

export type MetState = 'met' | 'partial' | 'missed';

export interface RubricResult {
  id: string;
  domain: string;
  label: string;
  weight: number;
  met: MetState;
  evidence: string; // LLM 引用 timeline 的判定依据
}

export interface Evaluation {
  score: number; // 0-100,代码按权重算出
  outcome_summary: string;
  root_cause: { turn: number; text: string }[]; // 结局溯源链,精确到回合
  rubric_results: RubricResult[]; // 规则兜底模式下为空
  suggestions: string[];
  source: 'llm' | 'rule';
}

interface LLMVerdict {
  criteria: { id: string; met: string; evidence: string }[];
  outcome_summary: string;
  root_cause: { turn: number; text: string }[];
  suggestions: string[];
}

const CREDIT: Record<MetState, number> = { met: 1, partial: 0.5, missed: 0 };

function normalizeMet(v: string): MetState {
  if (v === 'met' || v === 'partial' || v === 'missed') return v;
  return 'missed';
}

function computeScore(results: RubricResult[], expertCalls: number): number {
  const totalW = results.reduce((n, r) => n + r.weight, 0);
  const gotW = results.reduce((n, r) => n + r.weight * CREDIT[r.met], 0);
  const base = totalW > 0 ? Math.round((100 * gotW) / totalW) : 0;
  return Math.min(100, Math.max(0, base - 5 * expertCalls));
}

export async function evaluateGame(
  c: CaseCard,
  s: GameState,
  outcome: 'dead' | 'cured'
): Promise<Evaluation> {
  const expertCalls = s.timeline.filter((t) => t.detail === '呼叫专家').length;

  if (evaluatorLLM) {
    try {
      const rubricDesc = c.rubric
        .map((cr) => `- ${cr.id} | ${cr.domain} | ${cr.label} | 权重${cr.weight} | 判定口径:${cr.evidence}`)
        .join('\n');

      const v = await evaluatorLLM.chatJSON<LLMVerdict>([
        {
          role: 'system',
          content: `你是医疗诊断模拟游戏的评估专家,像资深主任医师点评规培生,语气专业但犀利。

【本局真相】
- 真实诊断:${c.trueDiagnosis};患者:${c.patient.name},${c.patient.age}岁${c.patient.gender}性
- ${c.evalNotes}
- 决策原则:${c.principles.join(';')}

【评分表】对下列每一条标准做三档判定:met(达标)/ partial(部分达标)/ missed(未达标)。总分由引擎按权重计算,你不打总分:
${rubricDesc}

【判定纪律 —— 必须遵守】
- 每条标准必须先在 timeline 里找证据、在 evidence 字段引用具体回合和操作/原话("T2 开血常规见白细胞13.5↑"),再下结论。没有证据支撑的结论无效
- 涉及"做没做某事"的事实类标准,必须逐条核对 timeline 记录,不允许凭印象
- 玩家用等效替代路线达成目标(如 B超代替查体取得依据、凭临床表现直接给药)按达标处理
- 拿不准就 missed;evidence 里写清缺了什么
- "'没做好问诊'不算合格的证据;'只问了一句哪里疼,没有追问起病和变化,错过了转移痛'才是合格线"

【另需输出】outcome_summary(一句话定性)、root_cause(2~4 条因果链,精确到回合)、suggestions(1~3 条)

【输出】只输出严格 JSON:
{"criteria":[{"id":"dg-01","met":"met|partial|missed","evidence":"..."}],"outcome_summary":"...","root_cause":[{"turn":1,"text":"..."}],"suggestions":["..."]}`,
        },
        {
          role: 'user',
          content: `【结局】${outcome === 'dead' ? `患者于第 ${s.turn} 回合死亡` : `患者治愈,共用 ${s.turn} 回合`}${
            expertCalls ? `;呼叫专家 ${expertCalls} 次(每次 -5 分,引擎已计)` : ''
          }
【操作时间线】
${JSON.stringify(s.timeline, null, 2)}`,
        },
      ], { maxTokens: 3500, temperature: 0.1, json: true });

      const byId = new Map(v.criteria?.map((x) => [x.id, x]) ?? []);
      const results: RubricResult[] = c.rubric.map((cr) => {
        const llm = byId.get(cr.id);
        return {
          id: cr.id,
          domain: cr.domain,
          label: cr.label,
          weight: cr.weight,
          met: normalizeMet(llm?.met ?? 'missed'),
          evidence: llm?.evidence?.trim() || '未能判定',
        };
      });

      return {
        score: computeScore(results, expertCalls),
        outcome_summary: v.outcome_summary ?? '',
        root_cause: Array.isArray(v.root_cause) ? v.root_cause : [],
        rubric_results: results,
        suggestions: Array.isArray(v.suggestions) ? v.suggestions : [],
        source: 'llm',
      };
    } catch (e) {
      console.warn('[evaluator] LLM 失败,回落简版复盘:', e);
    }
  }
  return ruleEvaluate(c, s, outcome, expertCalls);
}

// —— 兜底(LLM 不可用):不做逐条判定,给结局分 + timeline 硬推导的溯源 ——
function ruleEvaluate(
  c: CaseCard,
  s: GameState,
  outcome: 'dead' | 'cured',
  expertCalls: number
): Evaluation {
  const tl = s.timeline;
  const rootCause: { turn: number; text: string }[] = [];
  const painkiller = tl.find((t) => t.action === 'medicate' && t.detail.includes('止痛'));
  if (painkiller) {
    rootCause.push({
      turn: painkiller.turn,
      text: `第 ${painkiller.turn} 回合使用止痛药,掩盖体征并触发延迟恶化`,
    });
  }
  const badSurgery = tl.find((t) => t.action === 'surgery' && t.result.includes('失败'));
  if (badSurgery) {
    rootCause.push({
      turn: badSurgery.turn,
      text: `第 ${badSurgery.turn} 回合「${badSurgery.detail}」未切中病灶,重创患者`,
    });
  }
  const cureAction = tl.find(
    (t) => (t.action === 'surgery' || t.action === 'medicate') && t.result.includes('进入恢复期')
  );
  if (outcome === 'cured' && cureAction) {
    rootCause.push({
      turn: cureAction.turn,
      text: `第 ${cureAction.turn} 回合「${cureAction.detail}」正确处置,病情转入恢复期直至治愈`,
    });
  }
  if (outcome === 'dead' && rootCause.length === 0) {
    rootCause.push({ turn: s.turn, text: `始终未针对${c.trueDiagnosis}有效处置,病情持续恶化直至死亡` });
  }

  return {
    score: Math.min(100, Math.max(0, (outcome === 'cured' ? 75 : 25) - 5 * expertCalls)),
    outcome_summary:
      outcome === 'cured'
        ? `${s.turn} 回合内正确处置${c.trueDiagnosis},患者治愈出院`
        : `未能正确处置${c.trueDiagnosis},患者于第 ${s.turn} 回合死亡`,
    root_cause: rootCause.sort((a, b) => a.turn - b.turn),
    rubric_results: [],
    suggestions: c.principles.slice(0, 2),
    source: 'rule',
  };
}
