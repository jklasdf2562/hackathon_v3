// GameEngine 状态机 —— 纯代码,无 LLM。病情演化的唯一事实来源。
import type {
  ActiveEffect,
  CaseCard,
  GameEvent,
  GameState,
  PlayerAction,
  Phase,
  ResultCard,
  Vitals,
} from './types';
import { AP_COST } from './types';

const AP_PER_TURN = 2;

let idSeq = 0;
const nextId = () => `e${++idSeq}`;

export function createInitialState(c: CaseCard): GameState {
  return {
    turn: 1,
    hp: c.initialHp,
    hpMax: 100,
    phase: 'active',
    apLeft: AP_PER_TURN,
    vitals: { ...c.vitalsBase },
    revealed: [],
    doneExams: [],
    doneLabs: [],
    activeEffects: [],
    timeline: [],
    recoverTurns: 0,
    expertCallsLeft: 3,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 健康基准值:病因解除后(recovering/cured)生命体征向它渐变
const NORMAL_VITALS: Vitals = { hr: 76, bpSys: 118, bpDia: 76, temp: 36.8, spo2: 98 };

// 按 hp 区间插值生命体征:hp 越低越差;掩盖发热时体温假性正常;
// 恢复期按已撑过的回合数向健康值收敛(vitals_base 是病态基线,不能只往它靠)
export function computeVitals(
  c: CaseCard,
  hp: number,
  effects: ActiveEffect[],
  recovery?: { phase: Phase; recoverTurns: number }
): Vitals {
  const dmg = clamp(c.initialHp - hp, 0, c.initialHp);
  const b = c.vitalsBase;
  let v: Vitals = {
    hr: b.hr + dmg * 1.4,
    bpSys: b.bpSys - dmg * 0.75,
    bpDia: b.bpDia - dmg * 0.55,
    temp: b.temp + dmg * 0.028,
    spo2: b.spo2 - dmg * 0.12,
  };
  if (recovery && (recovery.phase === 'recovering' || recovery.phase === 'cured')) {
    // 术后/正确处置后立刻好转一半,之后每回合再收敛;治愈即完全正常
    const t = recovery.phase === 'cured' ? 1 : clamp(0.5 + 0.25 * recovery.recoverTurns, 0, 1);
    v = {
      hr: lerp(v.hr, NORMAL_VITALS.hr, t),
      bpSys: lerp(v.bpSys, NORMAL_VITALS.bpSys, t),
      bpDia: lerp(v.bpDia, NORMAL_VITALS.bpDia, t),
      temp: lerp(v.temp, NORMAL_VITALS.temp, t),
      spo2: lerp(v.spo2, NORMAL_VITALS.spo2, t),
    };
  }
  const out: Vitals = {
    hr: Math.round(clamp(v.hr, 55, 175)),
    bpSys: Math.round(clamp(v.bpSys, 62, 145)),
    bpDia: Math.round(clamp(v.bpDia, 38, 95)),
    temp: Math.round(clamp(v.temp, 36.4, 40.3) * 10) / 10,
    spo2: Math.round(clamp(v.spo2, 82, 99)),
  };
  if (effects.some((e) => e.mask === 'fever')) out.temp = 37.0;
  return out;
}

function hasMask(s: GameState, kind: 'pain' | 'fever'): boolean {
  return s.activeEffects.some((e) => e.mask === kind);
}

function pushPhaseEvents(s: GameState, events: GameEvent[], prev: Phase) {
  if (s.phase !== prev) events.push({ type: 'phase', phase: s.phase });
}

function applyHp(s: GameState, delta: number, events: GameEvent[]) {
  if (delta === 0) return;
  s.hp = clamp(s.hp + delta, 0, s.hpMax);
  events.push({ type: 'hp', delta, hp: s.hp });
}

// 阶段判定(不覆盖 recovering/cured/dead 的终态逻辑)
function updatePhase(s: GameState, events: GameEvent[]) {
  const prev = s.phase;
  if (s.hp <= 0) {
    s.phase = 'dead';
  } else if (s.phase === 'recovering') {
    // recovering 只在 endTurn 里判 cured
  } else {
    s.phase = s.hp <= 30 ? 'critical' : 'active';
  }
  pushPhaseEvents(s, events, prev);
}

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

// —— 玩家操作 ——(问诊的语义匹配由 Interpreter/Mock 完成,这里接收已判定的结果)
export function applyAction(
  c: CaseCard,
  prev: GameState,
  action: PlayerAction,
  interpreted?: {
    revealedAskKey?: string | null;
    /** LLM 按当下状态生成的检查报告;缺省回落病例卡静态基准单 */
    resultOverride?: { rows: ResultCard['rows']; note?: string };
  }
): ActionResult {
  const s: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const cost = AP_COST[action.type];

  if (s.phase === 'dead' || s.phase === 'cured') return { state: s, events };
  if (s.apLeft < cost) {
    events.push({ type: 'note', text: '行动点不足,请结束回合' });
    return { state: s, events };
  }
  s.apLeft -= cost;

  switch (action.type) {
    case 'ask': {
      const key = interpreted?.revealedAskKey ?? null;
      let result = '常规交流';
      if (key && !s.revealed.includes(key)) {
        const sym = c.hiddenAsk.find((h) => h.key === key);
        if (sym) {
          s.revealed.push(key);
          events.push({ type: 'reveal', key, desc: sym.desc });
          result = `获得线索:${sym.desc}`;
        }
      }
      events.push({ type: 'ask_context', revealedKey: key, question: action.text });
      s.timeline.push({ turn: s.turn, action: 'ask', detail: action.text, result });
      break;
    }

    case 'exam': {
      const exam = c.exams.find((e) => e.key === action.key);
      if (!exam) break;
      const masked = hasMask(s, 'pain') && !!exam.maskedResult;
      const tpl = masked ? exam.maskedResult! : exam.result;
      const card: ResultCard = {
        id: nextId(),
        turn: s.turn,
        title: tpl.title,
        rows: interpreted?.resultOverride?.rows ?? tpl.rows,
        note: interpreted?.resultOverride ? interpreted.resultOverride.note : tpl.note,
      };
      if (!s.doneExams.includes(exam.key)) s.doneExams.push(exam.key);
      let result = `完成${exam.label}`;
      // 线索只在疾病活动期揭示(恢复期/治愈后指标已回落,报告与线索会自相矛盾)
      const active = s.phase === 'active' || s.phase === 'critical';
      if (!masked && active && exam.reveals && !s.revealed.includes(exam.reveals)) {
        const sym = c.hiddenExam.find((h) => h.key === exam.reveals);
        if (sym) {
          s.revealed.push(sym.key);
          events.push({ type: 'reveal', key: sym.key, desc: sym.desc });
          result = `发现:${sym.desc}`;
        }
      }
      if (masked) result = `${exam.label}体征不典型(止痛药掩盖)`;
      events.push({ type: 'card', card });
      s.timeline.push({ turn: s.turn, action: 'exam', detail: exam.label, result });
      break;
    }

    case 'lab': {
      const lab = c.labs.find((l) => l.key === action.key);
      if (!lab) break;
      const card: ResultCard = {
        id: nextId(),
        turn: s.turn,
        title: lab.result.title,
        rows: interpreted?.resultOverride?.rows ?? lab.result.rows,
        note: interpreted?.resultOverride ? interpreted.resultOverride.note : lab.result.note,
      };
      if (!s.doneLabs.includes(lab.key)) s.doneLabs.push(lab.key);
      let result = `完成${lab.label}`;
      const labActive = s.phase === 'active' || s.phase === 'critical';
      if (labActive && lab.reveals && !s.revealed.includes(lab.reveals)) {
        const sym = c.hiddenLab.find((h) => h.key === lab.reveals);
        if (sym) {
          s.revealed.push(sym.key);
          events.push({ type: 'reveal', key: sym.key, desc: sym.desc });
          result = `发现:${sym.desc}`;
        }
      }
      events.push({ type: 'card', card });
      s.timeline.push({ turn: s.turn, action: 'lab', detail: lab.label, result });
      break;
    }

    case 'medicate': {
      const med = c.meds.find((m) => m.key === action.key);
      if (!med) break;
      if (med.cure) {
        // 正确处置用药(如过敏性休克的肾上腺素)→ 直接进入恢复期。
        // 只清除疾病相关效果;医源性并发症(persistent)穿透恢复期
        const prevPhase = s.phase;
        s.phase = 'recovering';
        s.recoverTurns = 0;
        s.activeEffects = s.activeEffects.filter((e) => e.persistent);
        if (s.activeEffects.length) {
          events.push({
            type: 'note',
            text: `⚠ 既往操作造成的并发症仍在拖累恢复:${s.activeEffects.map((e) => e.label).join('、')}`,
          });
        }
        s.vitals = computeVitals(c, s.hp, s.activeEffects, { phase: 'recovering', recoverTurns: 0 });
        pushPhaseEvents(s, events, prevPhase);
        const result = `${med.label}起效,症状迅速缓解,进入恢复期`;
        events.push({ type: 'note', text: result });
        s.timeline.push({ turn: s.turn, action: 'medicate', detail: med.label, result });
        break;
      }
      applyHp(s, med.hpDelta, events);
      // 恢复期病灶已除:掩盖体征无意义,"掩盖导致病情隐性进展"的延迟后果也不再成立
      const recovering = s.phase === 'recovering';
      const mask = recovering ? undefined : med.mask;
      const onExpire = recovering ? undefined : med.onExpire;
      if (med.rateDelta !== 0 || mask || onExpire) {
        s.activeEffects.push({
          id: nextId(),
          source: med.key,
          label: med.label,
          rateDelta: med.rateDelta,
          remaining: med.durationTurns,
          mask,
          onExpire,
        });
        events.push({ type: 'note', text: `用药生效:${med.label}` });
      }
      const result = med.sideEffectNote ?? '已用药';
      if (med.sideEffectNote) events.push({ type: 'note', text: med.sideEffectNote });
      s.timeline.push({ turn: s.turn, action: 'medicate', detail: med.label, result });
      updatePhase(s, events);
      break;
    }

    // —— 菜单外自定义操作:后果处方由判定层 LLM 依医学常识开出,
    //    引擎只做记账员:夹紧范围 → 存入账本 → 逐回合结转 ——
    case 'custom_exam':
    case 'custom_med':
    case 'custom_surgery': {
      const p = action.prescription;
      const tlAction =
        action.type === 'custom_exam' ? 'exam' : action.type === 'custom_med' ? 'medicate' : 'surgery';
      let result: string;
      if (p.death) {
        applyHp(s, -s.hp, events);
        result = `患者${action.type === 'custom_surgery' ? '术中' : '当场'}死亡:${p.rationale || '致死性操作'}`;
        events.push({ type: 'note', text: `☠ ${action.label}:${result}` });
      } else {
        const hpDelta = clamp(Math.round(p.hp_delta), -100, 3); // 正向封顶:处方不可能成为治愈路线
        if (hpDelta !== 0) applyHp(s, hpDelta, events);
        const parts: string[] = [];
        if (hpDelta !== 0) parts.push(`HP ${hpDelta > 0 ? '+' : ''}${hpDelta}`);
        if (p.ongoing) {
          const rate = clamp(Math.round(p.ongoing.rate), -6, 2);
          const duration =
            p.ongoing.duration === null ? null : clamp(Math.round(p.ongoing.duration), 1, 10);
          s.activeEffects.push({
            id: nextId(),
            source: action.type,
            label: p.ongoing.label || action.label,
            rateDelta: rate,
            remaining: duration,
            persistent: !p.ongoing.cured_by_treatment,
          });
          parts.push(`${p.ongoing.label} ${rate > 0 ? '+' : ''}${rate}/回合${duration === null ? '(持续)' : `(${duration}回合)`}`);
        }
        // 针对性处置:消除处方声明的既有并发症
        for (const target of p.resolves ?? []) {
          const idx = s.activeEffects.findIndex(
            (e) => e.label.includes(target) || target.includes(e.label)
          );
          if (idx >= 0) {
            const [removed] = s.activeEffects.splice(idx, 1);
            parts.push(`已处理:${removed.label}`);
            events.push({ type: 'note', text: `✅ 并发症已处理:${removed.label}` });
          }
        }
        result = `${parts.length ? parts.join(',') : '无明显影响'}${p.rationale ? `:${p.rationale}` : ''}`;
        events.push({ type: 'note', text: `${action.label}:${result}` });
        if (action.type === 'custom_exam') {
          const card: ResultCard = {
            id: nextId(),
            turn: s.turn,
            title: action.label,
            rows: [{ name: '结果', value: '未见与主诉明确相关的异常' }],
            note: p.rationale || '与当前主诉相关性低',
          };
          events.push({ type: 'card', card });
        }
      }
      s.timeline.push({ turn: s.turn, action: tlAction, detail: action.label, result });
      updatePhase(s, events);
      break;
    }

    case 'surgery': {
      // (下方各分支同样在函数末尾统一重算 vitals)
      const surg = c.surgeries.find((x) => x.key === action.key);
      if (!surg) break;
      if (surg.correct) {
        const hasEvidence =
          !surg.requiresAny || surg.requiresAny.some((k) => s.revealed.includes(k));
        const prevPhase = s.phase;
        s.phase = 'recovering';
        s.recoverTurns = 0;
        // 清除疾病相关效果(掩盖/炎症进展);医源性并发症(persistent)穿透恢复期
        s.activeEffects = s.activeEffects.filter((e) => e.persistent);
        if (s.activeEffects.length) {
          events.push({
            type: 'note',
            text: `⚠ 既往操作造成的并发症仍在拖累恢复:${s.activeEffects.map((e) => e.label).join('、')}`,
          });
        }
        s.vitals = computeVitals(c, s.hp, s.activeEffects, { phase: 'recovering', recoverTurns: 0 });
        pushPhaseEvents(s, events, prevPhase);
        const result = hasEvidence
          ? `手术成功:${surg.label}顺利完成,病灶已处置,进入恢复期`
          : `术中侥幸确诊${c.trueDiagnosis},手术成功(术前无任何依据,属赌博式手术)`;
        events.push({ type: 'note', text: result });
        s.timeline.push({ turn: s.turn, action: 'surgery', detail: surg.label, result });
      } else {
        applyHp(s, surg.wrongHpDelta ?? -30, events);
        if (surg.wrongEffect) {
          s.activeEffects.push({
            id: nextId(),
            source: surg.key,
            label: surg.wrongEffect.label,
            rateDelta: surg.wrongEffect.rateDelta,
            remaining: null,
            persistent: true,
          });
        }
        const result = `手术失败:术中未见病灶。${surg.wrongEffect?.label ?? ''}`;
        events.push({ type: 'note', text: result });
        s.timeline.push({ turn: s.turn, action: 'surgery', detail: surg.label, result });
        updatePhase(s, events);
      }
      break;
    }
  }

  // 监护仪即时反馈:任何操作后立刻重算生命体征,不等回合结束
  s.vitals = computeVitals(c, s.hp, s.activeEffects, { phase: s.phase, recoverTurns: s.recoverTurns });
  return { state: s, events };
}

// 呼叫专家:不耗行动点,每局限 3 次,写入 timeline(评估时扣分)
export function recordExpertCall(prev: GameState, hint: string): GameState {
  const s: GameState = structuredClone(prev);
  if (s.expertCallsLeft <= 0) return s;
  s.expertCallsLeft -= 1;
  s.timeline.push({ turn: s.turn, action: 'system', detail: '呼叫专家', result: hint });
  return s;
}

// —— 回合结束:hp += 恶化速率 + Σ(效果),效果计时,延迟后果触发,阶段判定,vitals 更新 ——
export function endTurn(c: CaseCard, prev: GameState): ActionResult {
  const s: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  if (s.phase === 'dead' || s.phase === 'cured') return { state: s, events };

  const baseRate = s.phase === 'recovering' ? 8 : c.deteriorationRate;
  const effectRate = s.activeEffects.reduce((sum, e) => sum + e.rateDelta, 0);
  applyHp(s, baseRate + effectRate, events);

  // 效果计时与延迟后果(核心卖点:止痛药到期 → 永久 -3)
  const kept: ActiveEffect[] = [];
  for (const e of s.activeEffects) {
    if (e.remaining === null) {
      kept.push(e);
      continue;
    }
    e.remaining -= 1;
    if (e.remaining > 0) {
      kept.push(e);
    } else if (e.onExpire) {
      kept.push({
        id: nextId(),
        source: e.source,
        label: e.onExpire.label,
        rateDelta: e.onExpire.rateDelta,
        remaining: null,
      });
      events.push({ type: 'note', text: `⚠ 延迟后果:${e.onExpire.label}(每回合 ${e.onExpire.rateDelta})` });
      s.timeline.push({
        turn: s.turn,
        action: 'system',
        detail: '延迟后果触发',
        result: e.onExpire.label,
      });
    }
  }
  s.activeEffects = kept;

  // 阶段判定
  const prevPhase = s.phase;
  if (s.hp <= 0) {
    s.hp = 0;
    s.phase = 'dead';
  } else if (s.phase === 'recovering') {
    s.recoverTurns += 1;
    // 出院标准:撑满 2 回合 + HP≥50 + 身上没有未处理的恶化性并发症
    const openComplications = s.activeEffects.filter((e) => e.rateDelta < 0);
    if (s.recoverTurns >= 2 && s.hp >= 50) {
      if (openComplications.length === 0) {
        s.phase = 'cured';
      } else {
        events.push({
          type: 'note',
          text: `🏥 未达出院标准:${openComplications.map((e) => e.label).join('、')}仍未处理`,
        });
      }
    }
  } else {
    s.phase = s.hp <= 30 ? 'critical' : 'active';
  }
  pushPhaseEvents(s, events, prevPhase);

  s.vitals = computeVitals(c, s.hp, s.activeEffects, { phase: s.phase, recoverTurns: s.recoverTurns });
  s.turn += 1;
  s.apLeft = AP_PER_TURN;
  s.timeline.push({
    turn: s.turn - 1,
    action: 'system',
    detail: '回合结束',
    result: `HP ${prev.hp} → ${s.hp}(${s.phase})`,
  });
  return { state: s, events };
}
