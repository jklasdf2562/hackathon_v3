// 快捷问题生成器 —— 每次患者说完话后台生成 3 个候选提问:
// 2 个自然有价值的追问 + 1 个混淆项(听着专业但诊断价值低)。
// 只喂"患者已说出口的信息",不喂解锁条件和真实诊断,防止变成答案钥匙。
import { interpreterLLM } from '../llm';
import type { CaseCard, GameState } from '../game/types';
import type { DialogueTurn } from './patientAgent';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function suggestAsks(
  c: CaseCard,
  s: GameState,
  history: DialogueTurn[]
): Promise<string[] | null> {
  if (!interpreterLLM) return null;
  try {
    const revealedDesc = [...c.hiddenAsk, ...c.hiddenExam, ...c.hiddenLab]
      .filter((h) => s.revealed.includes(h.key))
      .map((h) => h.desc);
    const convo = history
      .slice(-8)
      .map((h) => `${h.role === 'doctor' ? '医生' : '患者'}:${h.text}`)
      .join('\n');

    const raw = await interpreterLLM.chat(
      [
        {
          role: 'system',
          content: `你是医疗问诊游戏的提示生成器,为玩家(医生)生成 3 个下一步可以问患者的短问题。

规则:
- 只能基于患者已经说出口的信息和常规问诊思路展开
- 其中 2 个是当下临床上自然、有价值的追问
- 恰好 1 个是混淆项:听起来专业、与症状沾边,但对当前情况诊断价值低,或把思路往另一种常见病带偏
- 不要以任何方式标注哪个是混淆项,三个问题风格一致
- 口语化、以医生口吻向患者提问,每个不超过 18 个字
- 不要重复医生已经问过的问题

只输出严格 JSON:{"questions":["...","...","..."]}`,
        },
        {
          role: 'user',
          content: `患者:${c.patient.name},${c.patient.age}岁${c.patient.gender}性。主诉:${c.volunteered.join('、')}。${
            revealedDesc.length ? `已问出的情况:${revealedDesc.join(';')}。` : ''
          }
对话记录:
${convo || '(尚未开始对话)'}`,
        },
      ],
      { temperature: 0.9 }
    );
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
    const qs = (parsed.questions ?? []).filter((q: unknown) => typeof q === 'string' && q).slice(0, 3);
    return qs.length === 3 ? shuffle(qs) : null;
  } catch (e) {
    console.warn('[suggest] 快捷问题生成失败,保留现有 chips:', e);
    return null;
  }
}
