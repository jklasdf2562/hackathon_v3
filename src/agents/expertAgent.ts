// 专家 Agent —— 按钮触发,每局限 3 次。只给方向性提示,绝不直接给诊断和药名。
import { expertLLM } from '../llm';
import type { CaseCard, GameState } from '../game/types';

export async function getExpertHint(c: CaseCard, s: GameState): Promise<string> {
  if (expertLLM) {
    try {
      const unrevealedAsk = c.hiddenAsk.filter((h) => !s.revealed.includes(h.key));
      const unrevealedExam = [...c.hiddenExam, ...c.hiddenLab].filter((h) => !s.revealed.includes(h.key));
      const hint = await expertLLM.chat([
        {
          role: 'system',
          content: `你是医疗诊断游戏里被电话连线的资深专家。玩家(主治医生)向你求助,你只能给**方向性提示**,帮他自己想明白。

【你知道的真相(绝不能直说)】
- 真实诊断:${c.trueDiagnosis}
- ${c.evalNotes}
- 本病例的决策原则(你的提示方向必须与之一致):${c.principles.join(';')}
- 患者还没被问出的病史线索:${unrevealedAsk.map((h) => `${h.desc}(需${h.unlock})`).join(';') || '无'}
- 还没做的关键检查发现:${unrevealedExam.map((h) => `${h.desc}(需${h.unlock})`).join(';') || '无'}

【铁律】
- 禁止说出任何疾病名称、药物名称、手术名称、检查项目的确切名称
- 只用引导式的话点方向,如"注意他按压右下腹时的反应""问问他这之前进嘴的东西"
- 如果玩家已被某个药物的掩盖效应误导,可以提醒"别全信现在的体征"
- timeline 里可能有玩家的自定义操作及其后果(医源性损伤/并发症)。如果玩家自己造的伤正在拖累患者,直说这个问题,如"病人现在的麻烦有一半是你上一刀添的"
- 如果线索已足够,就催促果断处置,别再拖
- 优先点当下最致命的一件事:病情危急时别聊问诊技巧,先救命
- 1~2 句话,口语,像老专家在电话里点拨,不要客套`,
        },
        {
          role: 'user',
          content: `当前第 ${s.turn} 回合,患者 HP ${s.hp}/100(${s.phase}),已获线索:${
            s.revealed.length ? s.revealed.join(',') : '无'
          }。
操作时间线:${JSON.stringify(s.timeline)}
请给出这一次的提示。`,
        },
      ]);
      if (hint.trim()) return hint.trim();
    } catch (e) {
      console.warn('[expert] LLM 失败,回落规则版提示:', e);
    }
  }
  return ruleHint(c, s);
}

// 规则版兜底:按"还缺什么线索"给方向
function ruleHint(c: CaseCard, s: GameState): string {
  const missAsk = c.hiddenAsk.find((h) => !s.revealed.includes(h.key));
  if (missAsk) return `病史还没问透,围绕「${missAsk.unlock}」再多问一句,病人嘴里有东西没说出来。`;
  const missExam = c.hiddenExam.find((h) => !s.revealed.includes(h.key));
  if (missExam) return `有些体征病人自己说不出来,动手做「${missExam.unlock}」方向的检查,眼见为实。`;
  return '线索已经摆在你面前了,想想哪一步处置能直接扭转病程——病人等不起,果断点。';
}
