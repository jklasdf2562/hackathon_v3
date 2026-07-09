// 压测 3:评估器一致性 —— 三种打法的固定对局,各评 3 次,看分数方差和逐条判定翻转。
import { loadEnv } from './env';

loadEnv();
const { appendicitisCase: c } = await import('../../src/game/cases/appendicitis');
const { applyAction, createInitialState, endTurn } = await import('../../src/game/engine');
const { evaluateGame } = await import('../../src/agents/evaluatorAgent');
import type { GameState, PlayerAction } from '../../src/game/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function play(steps: Array<PlayerAction | 'END' | { ask: string; reveal: string }>): GameState {
  let s = createInitialState(c);
  for (const st of steps) {
    if (s.phase === 'dead' || s.phase === 'cured') break;
    if (st === 'END') s = endTurn(c, s).state;
    else if ('ask' in st) s = applyAction(c, s, { type: 'ask', text: st.ask }, { revealedAskKey: st.reveal }).state;
    else s = applyAction(c, s, st, {}).state;
  }
  return s;
}

// 教科书局:问诊→查体→手术→观察出院
const textbook = play([
  { ask: '疼的位置有变化吗', reveal: 'migrating_pain' },
  { type: 'exam', key: 'abd_exam' },
  'END',
  { type: 'surgery', key: 'appendectomy' },
  'END', 'END', 'END', 'END',
]);
// 补救局:先止痛(掩盖)再用血常规补救确诊,手术偏晚
const salvage = play([
  { type: 'medicate', key: 'painkiller' },
  { ask: '哪里不舒服', reveal: null as unknown as string },
  'END',
  { type: 'lab', key: 'blood_routine' },
  { type: 'exam', key: 'heart_exam' },
  'END',
  { type: 'surgery', key: 'appendectomy' },
  'END', 'END', 'END', 'END',
]);
// 乱杀局:无依据错刀+无适应证用药到死
const disaster = play([
  { type: 'medicate', key: 'epinephrine' },
  { type: 'surgery', key: 'cholecystectomy' },
  'END',
  { type: 'surgery', key: 'laparotomy' },
  'END', 'END', 'END', 'END', 'END', 'END', 'END', 'END', 'END', 'END',
]);

const scenarios: Array<{ name: string; g: GameState; ended: 'dead' | 'cured' }> = [
  { name: '教科书局', g: textbook, ended: textbook.phase === 'cured' ? 'cured' : 'dead' },
  { name: '补救局', g: salvage, ended: salvage.phase === 'cured' ? 'cured' : 'dead' },
  { name: '乱杀局', g: disaster, ended: disaster.phase === 'dead' ? 'dead' : 'cured' },
];

console.log('===== 评估器一致性(每局评 3 次)=====');
for (const sc of scenarios) {
  console.log(`\n—— ${sc.name}(结局 ${sc.ended},hp=${sc.g.hp},turn=${sc.g.turn},timeline ${sc.g.timeline.length} 条)——`);
  const scores: number[] = [];
  const verdicts: Array<Record<string, string>> = [];
  for (let i = 0; i < 3; i++) {
    await sleep(5000);
    const t0 = Date.now();
    const ev = await evaluateGame(c, sc.g, sc.ended);
    if (ev.source === 'rule') {
      console.log(`  ✗ 第${i + 1}次落到规则兜底(LLM 失败/限流),本次作废`);
      continue;
    }
    scores.push(ev.score);
    verdicts.push(Object.fromEntries(ev.rubric_results.map((r) => [r.id, r.met])));
    console.log(`  第${i + 1}次:${ev.score} 分 (${Date.now() - t0}ms)`);
  }
  if (scores.length >= 2) {
    const spread = Math.max(...scores) - Math.min(...scores);
    console.log(`  分差:${spread}${spread > 10 ? ' ✗ 超阈值(>10)' : ' ✓'}`);
    // 逐条 verdict 翻转
    const ids = Object.keys(verdicts[0] ?? {});
    const flips = ids.filter((id) => new Set(verdicts.map((v) => v[id])).size > 1);
    if (flips.length) console.log(`  ✗ 判定翻转 ${flips.length} 条: ${flips.join(', ')}`);
    else console.log('  ✓ 逐条判定零翻转');
  }
}
