// 诊室舞台 —— 诊桌区(医生+病人凳)+ 病床区 + 墙面道具(手术门/药柜/挂钟/电话)。
// 纯展示组件:不做任何判定,只把 GameState 和位置画出来;所有热区把操作转发回 App。
// 病人位置三层控制在 App:生理否决 > 显式医嘱 > 隐含医嘱(onBed 检查)。
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CaseCard, GameState } from '../game/types';

interface Bubble {
  text: string;
  done: boolean;
}

/** 场景热区:病人身体 + 桌上文件 + 墙面道具 + 挪位置 */
export interface StageZones {
  enabled: boolean; // 需要 AP 且不忙的操作类热区
  clockEnabled: boolean; // 结束回合(只要不忙)
  phoneEnabled: boolean; // 呼叫专家
  expertLeft: number;
  onHead: () => void;
  chest?: { label: string; onClick: () => void };
  abdomen?: { label: string; onPalpate: () => void };
  onOrders: () => void; // 桌上的检查申请单
  onBook: () => void; // 桌上的病历本(完整记录抽屉)
  onCabinet: () => void;
  onSurgery: () => void;
  onClock: () => void;
  onPhone: () => void;
  onBedMove?: () => void; // 点床:让病人上床躺(仅坐着时提供)
  onStoolMove?: () => void; // 点凳:让病人坐回去(仅躺着且起得来时提供)
}

interface Props {
  card: CaseCard;
  game: GameState;
  bubble: Bubble | null;
  /** 病人此刻在哪(App 按三层规则推导) */
  loc: 'stool' | 'bed';
  /** 医生此刻在哪个锚位 */
  doctorAt: 'desk' | 'bed' | 'phone';
  /** 引导触诊:腹部高亮脉动,等待亲手按压 */
  guide?: boolean;
  zones?: StageZones;
  /** App 注入的场景弹层/提示 */
  overlay?: ReactNode;
}

const PALPATE_MS = 550; // 按住多久算一次有效触诊

type Mood = 'mild' | 'strained' | 'agony' | 'calm' | 'happy' | 'dead';
type Spot =
  | 'head' | 'chest' | 'abdomen'
  | 'book' | 'paper'
  | 'door' | 'cabinet' | 'clock' | 'phone'
  | 'bedspot' | 'stoolspot';

function moodOf(g: GameState): Mood {
  if (g.phase === 'dead') return 'dead';
  if (g.phase === 'cured') return 'happy';
  if (g.phase === 'recovering') return 'calm';
  if (g.phase === 'critical' || g.hp <= 30) return 'agony';
  if (g.hp < 55) return 'strained';
  return 'mild';
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    '#' +
    pa
      .map((v, i) =>
        Math.round(v + (pb[i] - v) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

// 医生锚位(脚底 x 坐标,y 固定 418)
const DOC_X: Record<'desk' | 'bed' | 'phone', number> = { desk: 410, bed: 738, phone: 560 };

export function PatientStage({ card, game, bubble, loc, doctorAt, guide, zones, overlay }: Props) {
  const [pressing, setPressing] = useState(false);
  const [hovered, setHovered] = useState<Spot | null>(null);
  const [pressHint, setPressHint] = useState(false);
  const pressAt = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bedSitting = loc === 'bed' && (game.phase === 'recovering' || game.phase === 'cured');
  const elderly = card.patient.age >= 45;
  const genderText = card.patient.gender.toLowerCase();
  const isFemale = genderText.includes('女') || /female|woman/.test(genderText);
  const olderMale = !isFemale && elderly;
  const painMasked = game.activeEffects.some((e) => e.mask === 'pain');
  // 按压腹部时的即时反应:疼就是疼——除非止痛药把体征掩盖了
  const baseMood = moodOf(game);
  const mood: Mood =
    pressing && baseMood !== 'dead' && baseMood !== 'agony' && !painMasked ? 'strained' : baseMood;

  // 脸色:HP 越低越苍白;死亡发灰,恢复期回到血色
  const skin =
    mood === 'dead'
      ? '#D8D4CB'
      : mood === 'calm' || mood === 'happy'
        ? '#FFD9AF'
        : lerpHex('#FFD9AF', '#EDE2D3', Math.max(0, Math.min(1, 1 - game.hp / 80)));
  const fever = game.vitals.temp >= 37.7 && mood !== 'dead';
  const sweating = mood === 'strained' || mood === 'agony';
  const holdBelly = mood === 'mild' || mood === 'strained' || mood === 'agony';
  const iv = game.activeEffects.some((e) => e.rateDelta > 0);
  const breathDur = Math.max(0.7, Math.min(2.2, 120 / Math.max(40, game.vitals.hr)));
  const animClass = game.phase === 'critical' ? 'p-shake' : game.phase === 'dead' ? '' : 'p-breath';
  // 触诊进行时医生自动到床边
  const docAt = pressing ? 'bed' : doctorAt;

  const drop = (x: number, y: number) =>
    `M ${x} ${y - 7} Q ${x + 5.5} ${y + 1} ${x} ${y + 5} Q ${x - 5.5} ${y + 1} ${x} ${y - 7} Z`;

  const brows = (cx: number, cy: number) => {
    if (mood === 'dead' || mood === 'happy') return null;
    const c = elderly ? '#B9B3A8' : 'var(--line)';
    const w = elderly ? 5 : 3.5;
    if (mood === 'agony' || mood === 'strained') {
      return (
        <g stroke={c} strokeWidth={w} strokeLinecap="round" fill="none">
          <path d={`M ${cx - 21} ${cy - 18} Q ${cx - 13} ${cy - 15} ${cx - 6} ${cy - 11}`} />
          <path d={`M ${cx + 6} ${cy - 11} Q ${cx + 13} ${cy - 15} ${cx + 21} ${cy - 18}`} />
        </g>
      );
    }
    return (
      <g stroke={c} strokeWidth={w} strokeLinecap="round" fill="none">
        <path d={`M ${cx - 20} ${cy - 14} Q ${cx - 13} ${cy - 17} ${cx - 6} ${cy - 14}`} />
        <path d={`M ${cx + 6} ${cy - 14} Q ${cx + 13} ${cy - 17} ${cx + 20} ${cy - 14}`} />
      </g>
    );
  };

  const eye = (x: number, y: number) => {
    switch (mood) {
      case 'dead':
        return (
          <g stroke="var(--line)" strokeWidth={3} strokeLinecap="round">
            <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} />
            <line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} />
          </g>
        );
      case 'agony':
      case 'strained':
      case 'happy':
        return (
          <path
            d={`M ${x - 7} ${y + 3} Q ${x} ${y - 6} ${x + 7} ${y + 3}`}
            fill="none"
            stroke="var(--line)"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        );
      default:
        return <ellipse cx={x} cy={y} rx={3.2} ry={4.5} fill="var(--line)" />;
    }
  };

  const mouth = (cx: number, cy: number) => {
    const y = cy + 15;
    const s = { fill: 'none', stroke: 'var(--line)', strokeWidth: 3.5, strokeLinecap: 'round' as const };
    switch (mood) {
      case 'agony':
        return <ellipse cx={cx} cy={y + 2} rx={7} ry={8} fill="#8A4A44" stroke="var(--line)" strokeWidth={3} />;
      case 'strained':
        return <path d={`M ${cx - 9} ${y + 4} Q ${cx} ${y - 5} ${cx + 9} ${y + 4}`} {...s} />;
      case 'mild':
        return <path d={`M ${cx - 8} ${y + 3} Q ${cx} ${y - 3} ${cx + 8} ${y + 3}`} {...s} />;
      case 'calm':
        return <path d={`M ${cx - 7} ${y - 1} Q ${cx} ${y + 5} ${cx + 7} ${y - 1}`} {...s} />;
      case 'happy':
        return <path d={`M ${cx - 10} ${y - 3} Q ${cx} ${y + 9} ${cx + 10} ${y - 3}`} {...s} />;
      case 'dead':
        return <line x1={cx - 7} y1={y} x2={cx + 7} y2={y} stroke="var(--line)" strokeWidth={3.5} strokeLinecap="round" />;
    }
  };

  const face = (cx: number, cy: number) => (
    <g>
      <circle cx={cx} cy={cy} r={34} fill={skin} stroke="var(--line)" strokeWidth={3.5} />
      {olderMale ? (
        <g>
          <circle cx={cx - 31} cy={cy + 2} r={8.5} fill="#D8D2C6" stroke="var(--line)" strokeWidth={3} />
          <circle cx={cx + 31} cy={cy + 2} r={8.5} fill="#D8D2C6" stroke="var(--line)" strokeWidth={3} />
          <path d={`M ${cx - 8} ${cy - 33} Q ${cx - 2} ${cy - 41} ${cx + 2} ${cy - 33}`} fill="none" stroke="#B9B3A8" strokeWidth={3} strokeLinecap="round" />
          <path d={`M ${cx + 4} ${cy - 32} Q ${cx + 10} ${cy - 39} ${cx + 13} ${cy - 31}`} fill="none" stroke="#B9B3A8" strokeWidth={3} strokeLinecap="round" />
        </g>
      ) : !isFemale ? (
        <g>
          <path
            d={`M ${cx - 33} ${cy - 5} Q ${cx - 27} ${cy - 34} ${cx - 2} ${cy - 38} Q ${cx + 25} ${cy - 35} ${cx + 33} ${cy - 6} L ${cx + 29} ${cy + 2} Q ${cx + 14} ${cy - 12} ${cx + 2} ${cy - 12} Q ${cx - 14} ${cy - 14} ${cx - 29} ${cy + 2} Z`}
            fill="#4A3A30"
            stroke="var(--line)"
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <path d={`M ${cx - 24} ${cy - 25} Q ${cx - 15} ${cy - 34} ${cx - 3} ${cy - 36}`} fill="none" stroke="#6B4A3A" strokeWidth={3} strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path
            d={`M ${cx - 34} ${cy + 2} A 34 34 0 0 1 ${cx + 34} ${cy + 2} L ${cx + 31} ${cy + 8} Q ${cx + 18} ${cy - 4} ${cx + 9} ${cy - 8} Q ${cx - 8} ${cy - 2} ${cx - 31} ${cy + 8} Z`}
            fill={elderly ? '#AFAAA2' : '#6B4A3A'}
            stroke="var(--line)"
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <path d={`M ${cx - 33} ${cy + 2} Q ${cx - 42} ${cy + 26} ${cx - 33} ${cy + 44}`} stroke={elderly ? '#AFAAA2' : '#6B4A3A'} strokeWidth={10} strokeLinecap="round" fill="none" />
          <path d={`M ${cx + 33} ${cy + 2} Q ${cx + 42} ${cy + 26} ${cx + 33} ${cy + 44}`} stroke={elderly ? '#AFAAA2' : '#6B4A3A'} strokeWidth={10} strokeLinecap="round" fill="none" />
        </g>
      )}
      {brows(cx, cy)}
      {eye(cx - 13, cy - 2)}
      {eye(cx + 13, cy - 2)}
      {fever && (
        <g fill="var(--rose)" opacity={0.75}>
          <ellipse cx={cx - 19} cy={cy + 9} rx={6.5} ry={4} />
          <ellipse cx={cx + 19} cy={cy + 9} rx={6.5} ry={4} />
        </g>
      )}
      {mouth(cx, cy)}
      {olderMale && mood !== 'dead' && (
        <g stroke="#B9B3A8" strokeWidth={4} strokeLinecap="round" fill="none">
          <path d={`M ${cx - 12} ${cy + 12} Q ${cx - 6} ${cy + 8} ${cx - 2} ${cy + 11}`} />
          <path d={`M ${cx + 2} ${cy + 11} Q ${cx + 6} ${cy + 8} ${cx + 12} ${cy + 12}`} />
        </g>
      )}
      {sweating && (
        <g className="sweat" fill="#8FC4EE" stroke="var(--line)" strokeWidth={2}>
          <path className="drop" d={drop(cx + 30, cy - 18)} />
          <path className="drop d2" d={drop(cx - 28, cy - 22)} />
        </g>
      )}
    </g>
  );

  const arm = (d: string, hx: number, hy: number) => (
    <g>
      <path d={d} stroke="var(--line)" strokeWidth={14} strokeLinecap="round" fill="none" />
      <path d={d} stroke={skin} strokeWidth={8.5} strokeLinecap="round" fill="none" />
      <circle cx={hx} cy={hy} r={8.5} fill={skin} stroke="var(--line)" strokeWidth={3} />
    </g>
  );

  // ===== 病人三种姿势 =====
  // 坐在诊凳上(便服),画布坐标
  const stoolPose = (
    <g>
      {/* 腿脚 */}
      <path d="M672 350 L666 408" stroke="var(--line)" strokeWidth={17} strokeLinecap="round" fill="none" />
      <path d="M672 350 L666 408" stroke="#6E5A48" strokeWidth={12} strokeLinecap="round" fill="none" />
      <path d="M708 350 L714 408" stroke="var(--line)" strokeWidth={17} strokeLinecap="round" fill="none" />
      <path d="M708 350 L714 408" stroke="#6E5A48" strokeWidth={12} strokeLinecap="round" fill="none" />
      <ellipse cx={662} cy={414} rx={12} ry={5.5} fill="#fff" stroke="var(--line)" strokeWidth={2.5} />
      <ellipse cx={719} cy={414} rx={12} ry={5.5} fill="#fff" stroke="var(--line)" strokeWidth={2.5} />
      {/* 上身便服 */}
      <rect x={656} y={246} width={68} height={110} rx={22} fill="#EADFC9" stroke="var(--line)" strokeWidth={3.5} />
      <path d="M678 250 L690 262 L702 250" fill="none" stroke="var(--line)" strokeWidth={2.5} strokeLinejoin="round" />
      {/* 左手扶膝 */}
      {arm('M666 274 Q656 302 664 324', 666, 326)}
      {/* 右手:难受时捂肚子 */}
      {holdBelly ? arm('M712 272 Q726 294 702 310', 700, 312) : arm('M714 274 Q724 302 716 324', 714, 326)}
      {face(690, 212)}
    </g>
  );

  // 躺在床上(床组内部坐标)
  const lyingPose = (
    <g>
      <rect x={92} y={130} width={96} height={42} rx={16} fill="#fff" stroke="var(--line)" strokeWidth={3.5} />
      <path
        d="M112 204 L112 178 Q112 162 134 160 L176 156 Q208 138 246 152 L430 150 Q462 150 462 178 L462 204 Z"
        fill="var(--mint)"
        stroke="var(--line)"
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <path d="M124 190 Q290 182 452 184" stroke="#fff" strokeWidth={3} strokeDasharray="7 7" fill="none" opacity={0.9} />
      {holdBelly && (
        <g>
          <path d="M184 168 Q208 148 230 156" stroke="var(--line)" strokeWidth={14.5} strokeLinecap="round" fill="none" />
          <path d="M184 168 Q208 148 230 156" stroke={skin} strokeWidth={9} strokeLinecap="round" fill="none" />
          <circle cx={232} cy={156} r={9} fill={skin} stroke="var(--line)" strokeWidth={3} />
        </g>
      )}
      {face(148, 116)}
    </g>
  );

  // 床上坐起(恢复期/治愈,床组内部坐标)
  const bedSitPose = (
    <g>
      <rect x={88} y={96} width={32} height={88} rx={13} fill="#fff" stroke="var(--line)" strokeWidth={3.5} />
      <path
        d="M132 204 L132 188 Q132 174 156 172 L430 168 Q462 168 462 188 L462 204 Z"
        fill="var(--mint)"
        stroke="var(--line)"
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <rect x={132} y={112} width={78} height={76} rx={24} fill="var(--sky)" stroke="var(--line)" strokeWidth={3.5} />
      <path d="M158 115 L171 127 L184 115" fill="none" stroke="var(--line)" strokeWidth={3} strokeLinejoin="round" />
      {arm('M146 140 Q134 164 144 182', 145, 184)}
      {game.phase === 'cured' ? (
        <g className="wave-arm">{arm('M198 140 Q222 118 232 98', 234, 94)}</g>
      ) : (
        arm('M196 140 Q210 164 200 182', 199, 184)
      )}
      {face(170, 82)}
    </g>
  );

  // ===== 热区坐标(画布坐标,按当前姿势) =====
  const zg =
    loc === 'stool'
      ? {
          head: { cx: 690, cy: 212, r: 42 },
          chest: { cx: 690, cy: 268, rx: 28, ry: 16 },
          abdomen: { cx: 690, cy: 312, rx: 30, ry: 14 },
        }
      : bedSitting
        ? {
            head: { cx: 860, cy: 243, r: 42 },
            chest: { cx: 861, cy: 303, rx: 32, ry: 18 },
            abdomen: { cx: 870, cy: 337, rx: 34, ry: 13 },
          }
        : {
            head: { cx: 838, cy: 277, r: 42 },
            chest: { cx: 893, cy: 311, rx: 30, ry: 16 },
            abdomen: { cx: 962, cy: 319, rx: 40, ry: 16 },
          };

  const startPress = () => {
    pressAt.current = Date.now();
    setPressing(true);
  };
  const endPress = (fire: boolean) => {
    if (!pressing) return;
    setPressing(false);
    if (!fire) return;
    if (Date.now() - pressAt.current >= PALPATE_MS) {
      zones?.abdomen?.onPalpate();
    } else {
      setPressHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setPressHint(false), 1600);
    }
  };

  const chip = (x: number, y: number, text: string, warn = false) => {
    const w = text.length * 12.5 + 22;
    return (
      <g pointerEvents="none">
        <rect x={x - w / 2} y={y - 26} width={w} height={25} rx={12.5} fill={warn ? 'var(--rose)' : '#fff'} stroke="var(--line)" strokeWidth={2.5} />
        <text x={x} y={y - 8} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="var(--line)">
          {text}
        </text>
      </g>
    );
  };
  const abdChipY = zg.abdomen.cy - zg.abdomen.ry - 8;

  const spotProps = (s: Spot, onClick?: () => void) => ({
    onClick,
    onPointerEnter: () => setHovered(s),
    onPointerLeave: () => setHovered(null),
  });

  const clockAngle = (game.turn * 55) % 360;

  // ===== 医生(白大褂,三锚位滑动) =====
  const doctorFig = (
    <g>
      <rect x={-19} y={-22} width={15} height={18} rx={4} fill="#5A4A3E" stroke="var(--line)" strokeWidth={2.5} />
      <rect x={4} y={-22} width={15} height={18} rx={4} fill="#5A4A3E" stroke="var(--line)" strokeWidth={2.5} />
      <ellipse cx={-12} cy={-4} rx={13} ry={5.5} fill="#fff" stroke="var(--line)" strokeWidth={2.5} />
      <ellipse cx={13} cy={-4} rx={13} ry={5.5} fill="#fff" stroke="var(--line)" strokeWidth={2.5} />
      {/* 白大褂 */}
      <path d="M -27 -188 Q 0 -198 27 -188 L 37 -20 L -37 -20 Z" fill="#fff" stroke="var(--line)" strokeWidth={3.5} strokeLinejoin="round" />
      <line x1={0} y1={-150} x2={0} y2={-26} stroke="var(--line)" strokeWidth={2} opacity={0.3} />
      <path d="M -14 -190 L 0 -168 L 14 -190 Z" fill="var(--sky)" stroke="var(--line)" strokeWidth={2.5} strokeLinejoin="round" />
      {/* 听诊器 */}
      <path d="M -16 -184 Q -21 -150 -7 -138" fill="none" stroke="var(--sky-deep)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={-6} cy={-136} r={5} fill="var(--sky-deep)" stroke="var(--line)" strokeWidth={2} />
      {/* 胸牌 */}
      <rect x={10} y={-162} width={16} height={11} rx={2.5} fill="var(--butter)" stroke="var(--line)" strokeWidth={2} />
      {/* 头 */}
      <circle cx={0} cy={-218} r={26} fill="#FFD9AF" stroke="var(--line)" strokeWidth={3.5} />
      <path d="M -26 -222 A 26 26 0 0 1 26 -222 L 22 -214 Q 10 -228 2 -230 Q -12 -226 -22 -212 Z" fill="#4A3A30" stroke="var(--line)" strokeWidth={2.5} strokeLinejoin="round" />
      <ellipse cx={-9} cy={-215} rx={2.6} ry={3.6} fill="var(--line)" />
      <ellipse cx={9} cy={-215} rx={2.6} ry={3.6} fill="var(--line)" />
      <path d="M -6 -203 Q 0 -198 6 -203" fill="none" stroke="var(--line)" strokeWidth={3} strokeLinecap="round" />
    </g>
  );

  const bubbleLeft = loc === 'stool' ? '33%' : '47%';

  return (
    <div className={`stage phase-${game.phase}`}>
      <svg viewBox="0 0 1180 540" preserveAspectRatio="xMidYMid meet" role="img" aria-label="诊室">
        {/* ===== 背景 ===== */}
        <rect x={0} y={0} width={1180} height={540} fill="var(--paper)" />
        <rect x={0} y={420} width={1180} height={120} fill="var(--cream-2)" />
        <line x1={0} y1={420} x2={1180} y2={420} stroke="var(--line)" strokeWidth={3} opacity={0.22} />
        {/* 窗户 + 窗帘(床头上方) */}
        <rect x={800} y={62} width={150} height={110} rx={12} fill="#EAF5FF" stroke="var(--line)" strokeWidth={3.5} />
        <line x1={875} y1={64} x2={875} y2={170} stroke="var(--line)" strokeWidth={3} />
        <line x1={802} y1={117} x2={948} y2={117} stroke="var(--line)" strokeWidth={3} />
        <g fill="#fff" stroke="var(--line)" strokeWidth={2.5}>
          <ellipse cx={842} cy={94} rx={16} ry={9} />
          <ellipse cx={858} cy={89} rx={12} ry={8} />
        </g>
        <rect x={766} y={56} width={26} height={122} rx={10} fill="var(--lav)" stroke="var(--line)" strokeWidth={3.5} />
        <line x1={775} y1={66} x2={775} y2={168} stroke="var(--line)" strokeWidth={2} opacity={0.3} />
        <line x1={784} y1={66} x2={784} y2={168} stroke="var(--line)" strokeWidth={2} opacity={0.3} />

        {/* ===== 手术室门(左墙) ===== */}
        <g>
          <rect x={52} y={134} width={84} height={27} rx={8} fill="var(--rose)" stroke="var(--line)" strokeWidth={3} />
          <text x={94} y={153} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--line)">手术室</text>
          <rect x={38} y={172} width={112} height={248} rx={6} fill="#F6EEDF" stroke="var(--line)" strokeWidth={3.5} />
          <line x1={94} y1={174} x2={94} y2={418} stroke="var(--line)" strokeWidth={3} />
          <circle cx={66} cy={252} r={13} fill="#EAF5FF" stroke="var(--line)" strokeWidth={3} />
          <circle cx={122} cy={252} r={13} fill="#EAF5FF" stroke="var(--line)" strokeWidth={3} />
          <rect x={84} y={306} width={5} height={17} rx={2.5} fill="var(--line)" />
          <rect x={99} y={306} width={5} height={17} rx={2.5} fill="var(--line)" />
        </g>

        {/* ===== 药柜(门旁) ===== */}
        <g>
          <rect x={192} y={150} width={92} height={26} rx={8} fill="var(--mint)" stroke="var(--line)" strokeWidth={3} />
          <text x={238} y={168} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--line)">药 房</text>
          <rect x={176} y={190} width={124} height={230} rx={10} fill="var(--butter)" stroke="var(--line)" strokeWidth={3.5} />
          <line x1={238} y1={194} x2={238} y2={416} stroke="var(--line)" strokeWidth={3} />
          <rect x={226} y={296} width={5} height={18} rx={2.5} fill="var(--line)" />
          <rect x={246} y={296} width={5} height={18} rx={2.5} fill="var(--line)" />
          <g fill="var(--rose-deep)">
            <rect x={203} y={222} width={8} height={24} rx={2} />
            <rect x={195} y={230} width={24} height={8} rx={2} />
          </g>
        </g>

        {/* ===== 挂钟 ===== */}
        <g>
          <circle cx={430} cy={90} r={34} fill="#fff" stroke="var(--line)" strokeWidth={4} />
          <g stroke="var(--line)" strokeWidth={3} strokeLinecap="round">
            <line x1={430} y1={62} x2={430} y2={68} />
            <line x1={430} y1={112} x2={430} y2={118} />
            <line x1={402} y1={90} x2={408} y2={90} />
            <line x1={452} y1={90} x2={458} y2={90} />
          </g>
          <g transform={`rotate(${clockAngle} 430 90)`}>
            <line x1={430} y1={90} x2={430} y2={70} stroke="var(--line)" strokeWidth={3.5} strokeLinecap="round" />
          </g>
          <g transform={`rotate(${clockAngle * 2 + 120} 430 90)`}>
            <line x1={430} y1={90} x2={430} y2={76} stroke="var(--rose-deep)" strokeWidth={3} strokeLinecap="round" />
          </g>
          <circle cx={430} cy={90} r={3.5} fill="var(--line)" />
        </g>

        {/* ===== 墙上电话 + 专家便签 ===== */}
        <g>
          <rect x={522} y={86} width={12} height={54} rx={6} fill="#fff" stroke="var(--line)" strokeWidth={3} />
          <rect x={538} y={88} width={44} height={62} rx={10} fill="var(--lav)" stroke="var(--line)" strokeWidth={3.5} />
          <circle cx={560} cy={108} r={8.5} fill="#fff" stroke="var(--line)" strokeWidth={2.5} />
          <rect x={553} y={124} width={14} height={16} rx={4} fill="#fff" stroke="var(--line)" strokeWidth={2.5} />
          <path d="M528 142 q -6 14 6 20" stroke="var(--line)" strokeWidth={2.5} fill="none" />
          <g transform="rotate(4 610 185)">
            <rect x={588} y={166} width={46} height={40} fill="var(--butter)" stroke="var(--line)" strokeWidth={2.5} />
            <text x={611} y={183} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="var(--line)">专家</text>
            <text x={611} y={198} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--line)">×{zones?.expertLeft ?? 0}</text>
          </g>
        </g>

        {/* ===== 医生(滑动到锚位) ===== */}
        <g
          style={{
            transform: `translate(${DOC_X[docAt]}px, 418px)`,
            transition: 'transform 0.6s cubic-bezier(0.5, 1.4, 0.4, 1)',
          }}
        >
          {doctorFig}
        </g>

        {/* ===== 诊桌(挡住医生下半身) ===== */}
        <g>
          <rect x={372} y={320} width={236} height={100} rx={6} fill="var(--cream-2)" stroke="var(--line)" strokeWidth={3.5} />
          <rect x={350} y={298} width={280} height={22} rx={9} fill="#E9D9B8" stroke="var(--line)" strokeWidth={3.5} />
          {/* 病历本 */}
          <rect x={385} y={282} width={52} height={17} rx={4} fill="var(--sky)" stroke="var(--line)" strokeWidth={2.5} />
          <line x1={411} y1={284} x2={411} y2={297} stroke="var(--line)" strokeWidth={2} opacity={0.5} />
          {/* 检查申请单 */}
          <g transform="rotate(-3 480 291)">
            <rect x={455} y={281} width={50} height={19} rx={3} fill="#fff" stroke="var(--line)" strokeWidth={2.5} />
            <line x1={461} y1={288} x2={499} y2={288} stroke="var(--line)" strokeWidth={1.8} opacity={0.45} />
            <line x1={461} y1={294} x2={491} y2={294} stroke="var(--line)" strokeWidth={1.8} opacity={0.45} />
          </g>
          {/* 笔筒 */}
          <rect x={578} y={276} width={22} height={23} rx={5} fill="var(--mint)" stroke="var(--line)" strokeWidth={2.5} />
          <line x1={585} y1={278} x2={588} y2={266} stroke="var(--line)" strokeWidth={2.5} strokeLinecap="round" />
          <line x1={593} y1={278} x2={594} y2={264} stroke="var(--sky-deep)" strokeWidth={2.5} strokeLinecap="round" />
        </g>

        {/* ===== 病人凳 ===== */}
        <g>
          <ellipse cx={690} cy={348} rx={36} ry={13} fill="var(--butter)" stroke="var(--line)" strokeWidth={3.5} />
          <line x1={664} y1={356} x2={656} y2={416} stroke="var(--line)" strokeWidth={4} strokeLinecap="round" />
          <line x1={716} y1={356} x2={724} y2={416} stroke="var(--line)" strokeWidth={4} strokeLinecap="round" />
          <line x1={690} y1={360} x2={690} y2={416} stroke="var(--line)" strokeWidth={4} strokeLinecap="round" />
        </g>

        {/* ===== 坐在凳子上的病人 ===== */}
        {loc === 'stool' && (
          <g key="p-stool" className="p-appear">
            <g className={animClass} style={{ '--breath-dur': `${breathDur.toFixed(2)}s` } as CSSProperties}>
              {stoolPose}
            </g>
          </g>
        )}

        {/* ===== 病床(右侧) ===== */}
        <g transform="translate(690, 161)">
          <rect x={64} y={92} width={18} height={126} rx={7} fill="var(--butter)" stroke="var(--line)" strokeWidth={3.5} />
          <rect x={470} y={134} width={16} height={84} rx={7} fill="var(--butter)" stroke="var(--line)" strokeWidth={3.5} />
          <rect x={78} y={166} width={396} height={36} rx={13} fill="#fff" stroke="var(--line)" strokeWidth={3.5} />
          <rect x={90} y={202} width={372} height={12} fill="var(--cream-2)" stroke="var(--line)" strokeWidth={3} />
          <g stroke="var(--line)" strokeWidth={3.5}>
            <line x1={106} y1={214} x2={106} y2={246} />
            <line x1={446} y1={214} x2={446} y2={246} />
          </g>
          <circle cx={106} cy={252} r={7} fill="#fff" stroke="var(--line)" strokeWidth={3} />
          <circle cx={446} cy={252} r={7} fill="#fff" stroke="var(--line)" strokeWidth={3} />

          {loc === 'bed' && (
            <g key={`p-bed-${bedSitting ? 's' : 'l'}`} className="p-appear">
              <g className={animClass} style={{ '--breath-dur': `${breathDur.toFixed(2)}s` } as CSSProperties}>
                {bedSitting ? bedSitPose : lyingPose}
              </g>
            </g>
          )}

          {/* 输液架(有正向药效时出现,床头侧) */}
          {iv && (
            <g>
              <line x1={44} y1={250} x2={44} y2={66} stroke="var(--line)" strokeWidth={4} strokeLinecap="round" />
              <line x1={26} y1={66} x2={62} y2={66} stroke="var(--line)" strokeWidth={4} strokeLinecap="round" />
              <line x1={28} y1={250} x2={60} y2={250} stroke="var(--line)" strokeWidth={4} strokeLinecap="round" />
              <line x1={34} y1={66} x2={34} y2={72} stroke="var(--line)" strokeWidth={3} />
              <rect x={24} y={72} width={20} height={32} rx={7} fill="var(--sky)" stroke="var(--line)" strokeWidth={3} />
              <path d="M34 104 C 34 150, 70 160, 96 166" stroke="#9FBCD1" strokeWidth={3} fill="none" />
              <circle className="iv-drip" cx={34} cy={110} r={2.6} fill="var(--sky-deep)" />
            </g>
          )}

          {game.phase === 'cured' && loc === 'bed' && (
            <g style={{ fontSize: 24 }}>
              <text className="tw" x={88} y={72}>✨</text>
              <text className="tw t2" x={252} y={52}>✨</text>
            </g>
          )}
        </g>

        {/* ===== 热区层(画布坐标) ===== */}
        {/* 病历本永远可翻 */}
        <g className="zone" {...spotProps('book', zones?.onBook)}>
          <circle className="hit" cx={411} cy={290} r={26} />
        </g>
        {hovered === 'book' && chip(411, 256, '📖 病历本 · 完整记录')}

        {zones?.enabled && (
          <g>
            {/* 病人身体 */}
            <g className="zone" {...spotProps('head', zones.onHead)}>
              <circle className="hit" cx={zg.head.cx} cy={zg.head.cy} r={zg.head.r} />
            </g>
            {zones.chest && (
              <g className="zone" {...spotProps('chest', zones.chest.onClick)}>
                <ellipse className="hit" cx={zg.chest.cx} cy={zg.chest.cy} rx={zg.chest.rx} ry={zg.chest.ry} />
              </g>
            )}
            {zones.abdomen && (
              <g
                className="zone"
                onPointerEnter={() => setHovered('abdomen')}
                onPointerLeave={() => {
                  setHovered(null);
                  endPress(false);
                }}
                onPointerDown={startPress}
                onPointerUp={() => endPress(true)}
              >
                <ellipse className="hit" cx={zg.abdomen.cx} cy={zg.abdomen.cy} rx={zg.abdomen.rx} ry={zg.abdomen.ry} />
              </g>
            )}
            {/* 桌上申请单 */}
            <g className="zone" {...spotProps('paper', zones.onOrders)}>
              <circle className="hit" cx={480} cy={290} r={26} />
            </g>
            {/* 墙面道具 */}
            <g className="zone" {...spotProps('door', zones.onSurgery)}>
              <rect className="hit" x={32} y={128} width={124} height={296} rx={14} />
            </g>
            <g className="zone" {...spotProps('cabinet', zones.onCabinet)}>
              <rect className="hit" x={170} y={144} width={136} height={280} rx={14} />
            </g>
            {/* 挪位置:点床让他躺 / 点凳让他坐回 */}
            {zones.onBedMove && (
              <g className="zone" {...spotProps('bedspot', zones.onBedMove)}>
                <rect className="hit" x={780} y={300} width={370} height={80} rx={16} />
              </g>
            )}
            {zones.onStoolMove && (
              <g className="zone" {...spotProps('stoolspot', zones.onStoolMove)}>
                <circle className="hit" cx={690} cy={344} r={42} />
              </g>
            )}
            {/* 引导触诊:腹部脉动指引,等待按压 */}
            {guide && zones.abdomen && !pressing && (
              <g pointerEvents="none">
                <ellipse
                  className="guide-ring"
                  cx={zg.abdomen.cx}
                  cy={zg.abdomen.cy}
                  rx={zg.abdomen.rx + 10}
                  ry={zg.abdomen.ry + 10}
                />
                {chip(zg.abdomen.cx, abdChipY - 14, '👉 按住他的腹部触诊,松手看反应')}
              </g>
            )}
            {/* 按压中的医生手套 */}
            {pressing && (
              <g pointerEvents="none">
                <rect x={zg.abdomen.cx - 8} y={zg.abdomen.cy - 30} width={16} height={16} rx={5} fill="var(--sky)" stroke="var(--line)" strokeWidth={2.5} />
                <circle cx={zg.abdomen.cx} cy={zg.abdomen.cy - 6} r={12} fill="#fff" stroke="var(--line)" strokeWidth={3} />
                <path d={`M ${zg.abdomen.cx - 22} ${zg.abdomen.cy + 6} q 4 4 0 8 M ${zg.abdomen.cx + 22} ${zg.abdomen.cy + 6} q -4 4 0 8`} stroke="var(--line)" strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.5} />
              </g>
            )}
            {hovered === 'head' && !pressing && chip(zg.head.cx, zg.head.cy - zg.head.r - 8, '🗣 问诊 · 跟他说话')}
            {hovered === 'chest' && zones.chest && !pressing && chip(zg.chest.cx, zg.chest.cy - zg.chest.ry - 8, `🩺 ${zones.chest.label}`)}
            {hovered === 'abdomen' && zones.abdomen && !pressing && !pressHint && chip(zg.abdomen.cx, abdChipY, `🖐 ${zones.abdomen.label} · 按住再松开`)}
            {hovered === 'paper' && chip(480, 256, '📋 检查申请单')}
            {hovered === 'door' && chip(94, 120, '🚪 手术室 · 2点')}
            {hovered === 'cabinet' && chip(238, 136, '💊 药房 · 1点')}
            {hovered === 'bedspot' && chip(960, 290, '🛏 让他上床躺下')}
            {hovered === 'stoolspot' && chip(690, 292, '🪑 让他回凳子坐')}
            {pressing && chip(zg.abdomen.cx, abdChipY, '正在按压…松手看反应')}
            {pressHint && chip(zg.abdomen.cx, abdChipY, '触诊要按住一会儿再松开', true)}
          </g>
        )}
        {zones?.clockEnabled && (
          <g>
            <g className="zone" {...spotProps('clock', zones.onClock)}>
              <circle className="hit" cx={430} cy={90} r={42} />
            </g>
            {hovered === 'clock' && chip(430, 36, '🕐 结束回合 · 让时间过去')}
          </g>
        )}
        {zones?.phoneEnabled && (
          <g>
            <g className="zone" {...spotProps('phone', zones.onPhone)}>
              <rect className="hit" x={514} y={78} width={76} height={78} rx={12} />
            </g>
            {hovered === 'phone' && chip(556, 72, `📞 呼叫专家 · 剩${zones.expertLeft}次`)}
          </g>
        )}
      </svg>

      {/* 病人的漫画气泡(跟随位置) */}
      {bubble && bubble.text && (
        <div className="stage-bubble" style={{ left: bubbleLeft }}>
          {bubble.text}
          {!bubble.done && <span className="cursor">▌</span>}
        </div>
      )}
      {zones?.enabled && (
        <div className="stage-hint">🖱 都能点:病人 · 桌上病历本/申请单 · 药柜 · 手术门 · 挂钟 · 电话 · 床/凳(挪人)</div>
      )}
      {overlay}
    </div>
  );
}
