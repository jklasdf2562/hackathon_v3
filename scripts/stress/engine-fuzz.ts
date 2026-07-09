// 压测 1:引擎蒙特卡洛 —— 随机动作序列打 N 局,逐步断言不变量。零 LLM,免费。
import { appendicitisCase } from '../../src/game/cases/appendicitis';
import { anaphylaxisCase } from '../../src/game/cases/anaphylaxis';
import { applyAction, createInitialState, endTurn } from '../../src/game/engine';
import type { CaseCard, GameState, PlayerAction, Prescription } from '../../src/game/types';

const GAMES = 1500;
const MAX_TURNS = 60;
const violations: string[] = [];
let vCount = 0;

function violate(game: number, step: string, msg: string, s: GameState) {
  vCount++;
  if (violations.length < 30) {
    violations.push(`局${game} [${step}] ${msg} | hp=${s.hp} ap=${s.apLeft} phase=${s.phase} turn=${s.turn}`);
  }
}

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randPrescription(): Prescription {
  // 故意给越界值,验证 clamp
  return {
    hp_delta: Math.floor(Math.random() * 400) - 300, // -300..100
    death: Math.random() < 0.03,
    ongoing:
      Math.random() < 0.5
        ? {
            label: '压测效果' + Math.floor(Math.random() * 5),
            rate: Math.floor(Math.random() * 40) - 30, // -30..10 越界
            duration: Math.random() < 0.3 ? null : Math.floor(Math.random() * 30) - 5,
            cured_by_treatment: Math.random() < 0.5,
          }
        : null,
    resolves: Math.random() < 0.2 ? ['不存在的效果', '压测效果0'] : null,
    rationale: 'fuzz',
  };
}

function randAction(c: CaseCard): PlayerAction {
  const roll = Math.random();
  if (roll < 0.2) return { type: 'ask', text: '随便问问' };
  if (roll < 0.35) return { type: 'exam', key: rnd(c.exams).key };
  if (roll < 0.5) return { type: 'lab', key: rnd(c.labs).key };
  if (roll < 0.65) return { type: 'medicate', key: rnd(c.meds).key };
  if (roll < 0.78) return { type: 'surgery', key: rnd(c.surgeries).key };
  if (roll < 0.86) return { type: 'custom_exam', label: '自定义检查', prescription: randPrescription() };
  if (roll < 0.94) return { type: 'custom_med', label: '自定义用药', prescription: randPrescription() };
  return { type: 'custom_surgery', label: '自定义手术', prescription: randPrescription() };
}

const ORDER: Record<string, number> = { active: 0, critical: 0, recovering: 1, dead: 2, cured: 2 };

function checkInvariants(game: number, step: string, prev: GameState, s: GameState) {
  if (s.hp < 0 || s.hp > s.hpMax) violate(game, step, `HP 越界 ${s.hp}`, s);
  if (s.apLeft < 0) violate(game, step, `AP 为负 ${s.apLeft}`, s);
  if (s.phase === 'dead' && s.hp !== 0) violate(game, step, `死亡但 HP=${s.hp}`, s);
  if (prev.phase === 'dead' && s.phase !== 'dead') violate(game, step, `死人复活 ${prev.phase}→${s.phase}`, s);
  if (prev.phase === 'cured' && s.phase !== 'cured') violate(game, step, `治愈反悔 ${prev.phase}→${s.phase}`, s);
  if (ORDER[s.phase] < ORDER[prev.phase]) violate(game, step, `阶段倒退 ${prev.phase}→${s.phase}`, s);
  if (s.turn < prev.turn) violate(game, step, `回合倒退 ${prev.turn}→${s.turn}`, s);
  for (const e of s.activeEffects) {
    if (e.remaining !== null && e.remaining < 0) violate(game, step, `效果剩余为负 ${e.label}=${e.remaining}`, s);
  }
  if (s.phase === 'cured') {
    if (s.recoverTurns < 2 || s.hp < 50) violate(game, step, `未达标准就出院 recover=${s.recoverTurns} hp=${s.hp}`, s);
    if (s.activeEffects.some((e) => e.rateDelta < 0)) violate(game, step, `带着负面效果出院`, s);
  }
  // 死人/治愈后动作不该改变实质状态(由调用方终局,引擎至少不能崩)
}

let deads = 0, cureds = 0, timeouts = 0;
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  const c = g % 2 === 0 ? appendicitisCase : anaphylaxisCase;
  let s = createInitialState(c);
  let guard = 0;
  while (s.phase !== 'dead' && s.phase !== 'cured' && s.turn < MAX_TURNS && guard < 500) {
    guard++;
    const prev = s;
    try {
      if (s.apLeft <= 0 || Math.random() < 0.25) {
        s = endTurn(c, s).state;
        checkInvariants(g, '回合结束', prev, s);
      } else {
        const a = randAction(c);
        const revealed = a.type === 'ask' && Math.random() < 0.3 ? rnd(c.hiddenAsk).key : null;
        s = applyAction(c, s, a, { revealedAskKey: revealed }).state;
        checkInvariants(g, a.type, prev, s);
      }
    } catch (e) {
      violate(g, 'exception', `引擎抛异常: ${(e as Error).message}`, prev);
      break;
    }
  }
  if (s.phase === 'dead') deads++;
  else if (s.phase === 'cured') cureds++;
  else timeouts++;
  // 终局后再乱打 3 拳,引擎不能崩、不能复活
  for (let i = 0; i < 3; i++) {
    const prev = s;
    try {
      s = applyAction(c, s, randAction(c), {}).state;
      checkInvariants(g, '终局后操作', prev, s);
    } catch (e) {
      violate(g, '终局后异常', (e as Error).message, prev);
    }
  }
}

console.log(`\n===== 引擎蒙特卡洛:${GAMES} 局,耗时 ${Date.now() - t0}ms =====`);
console.log(`结局分布:死亡 ${deads} / 治愈 ${cureds} / 超时未终局 ${timeouts}`);
console.log(`不变量违规:${vCount} 起`);
for (const v of violations) console.log('  ✗', v);
if (vCount === 0) console.log('  ✓ 全部通过');
