import type { CaseCard } from '../types';

// Demo 主打病例:因果链短、恶化极快,几回合定生死。
// 核心考点:肾上腺素是唯一一线药,做检查等结果 = 等死。
export const anaphylaxisCase: CaseCard = {
  caseId: 'anaphylaxis_01',
  trueDiagnosis: '过敏性休克(坚果过敏)',
  patient: {
    name: '林小雨',
    age: 24,
    gender: '女',
    personality: '社恐,说话小声,怕给人添麻烦,不好意思说自己偷吃了同事的零食',
  },
  initialHp: 60,
  deteriorationRate: -8,
  volunteered: ['喉咙发紧', '有点头晕'],
  hiddenAsk: [
    {
      key: 'nut_exposure',
      desc: '半小时前吃了同事带的曲奇,里面有坚果碎(既往吃坚果嘴麻)',
      unlock: '问饮食/接触史/过敏史',
      keywords: ['吃', '食物', '零食', '接触', '过敏', '喝', '碰过', '之前干了什么'],
    },
    {
      key: 'skin_itch',
      desc: '身上起了红疹,越来越痒',
      unlock: '问皮肤/瘙痒',
      keywords: ['痒', '疹', '皮肤', '红', '抓'],
    },
  ],
  hiddenExam: [
    { key: 'urticaria', desc: '全身散在荨麻疹,口唇轻度水肿', unlock: '皮肤查体' },
    { key: 'wheeze', desc: '双肺满布哮鸣音', unlock: '心肺听诊' },
  ],
  hiddenLab: [
    { key: 'allergen_ige', desc: '坚果特异性 IgE 强阳性', unlock: '过敏原检测' },
  ],
  exams: [
    {
      key: 'skin_exam',
      label: '皮肤查体',
      reveals: 'urticaria',
      zone: 'abdomen',
      onBed: true,
      result: {
        title: '皮肤查体',
        rows: [
          { name: '皮疹', value: '全身散在荨麻疹,风团样', abnormal: true },
          { name: '口唇', value: '轻度水肿', abnormal: true },
          { name: '甲床', value: '稍苍白' },
        ],
      },
    },
    {
      key: 'heart_exam',
      label: '心肺听诊',
      reveals: 'wheeze',
      zone: 'chest',
      result: {
        title: '心肺听诊',
        rows: [
          { name: '呼吸音', value: '双肺满布哮鸣音', abnormal: true },
          { name: '心率', value: '窦速,>110次/分', abnormal: true },
        ],
      },
    },
  ],
  labs: [
    {
      key: 'allergen_test',
      label: '过敏原检测',
      reveals: 'allergen_ige',
      result: {
        title: '过敏原检测',
        rows: [
          { name: '坚果 IgE', value: '强阳性(4级)', ref: '阴性', abnormal: true },
          { name: '尘螨 IgE', value: '阴性', ref: '阴性' },
        ],
        note: '⚠ 送检等待期间病情不会等你',
      },
    },
    {
      key: 'blood_routine',
      label: '血常规',
      result: {
        title: '血常规',
        rows: [
          { name: '白细胞 WBC', value: '9.2×10⁹/L', ref: '3.5–9.5' },
          { name: '嗜酸性粒细胞', value: '0.8×10⁹/L', ref: '0.02–0.52', abnormal: true },
        ],
        note: '对休克鉴别帮助有限',
      },
    },
  ],
  meds: [
    {
      key: 'epinephrine',
      label: '肾上腺素(肌注)',
      hpDelta: 0,
      rateDelta: 0,
      durationTurns: null,
      cure: true,
      sideEffectNote: '过敏性休克一线用药',
    },
    {
      key: 'antihistamine',
      label: '苯海拉明(抗组胺)',
      hpDelta: 0,
      rateDelta: 3,
      durationTurns: 2,
      sideEffectNote: '皮疹瘙痒略缓解,但救不了休克——只是辅助药',
    },
    {
      key: 'steroid',
      label: '地塞米松(激素)',
      hpDelta: 0,
      rateDelta: 2,
      durationTurns: 2,
      sideEffectNote: '起效需要数小时,不能替代一线抢救药',
    },
    {
      key: 'painkiller',
      label: '布洛芬(止痛)',
      hpDelta: -5,
      rateDelta: -2,
      durationTurns: 2,
      sideEffectNote: 'NSAID 可能加重过敏反应!喉头水肿加剧',
    },
    {
      key: 'fluid',
      label: '生理盐水(快速补液)',
      hpDelta: 0,
      rateDelta: 2,
      durationTurns: 2,
      sideEffectNote: '抗休克辅助,争取一点时间',
    },
  ],
  surgeries: [
    {
      key: 'tracheotomy',
      label: '气管切开术',
      correct: false,
      wrongHpDelta: -15,
      wrongEffect: { rateDelta: -2, label: '有创气道,创伤打击' },
    },
    {
      key: 'appendectomy',
      label: '阑尾切除术',
      correct: false,
      wrongHpDelta: -30,
      wrongEffect: { rateDelta: -4, label: '莫名其妙的开腹,术后感染' },
    },
  ],
  vitalsBase: { hr: 118, bpSys: 86, bpDia: 52, temp: 36.9, spo2: 91 },
  referencePath: [
    '问诊接触史/过敏史,锁定坚果暴露(半小时前吃了含坚果曲奇)',
    '皮肤查体(荨麻疹、口唇水肿)或心肺听诊(哮鸣音)快速确认过敏反应',
    '立即肌注肾上腺素——过敏性休克唯一一线药,一个回合都不能等',
    '恢复期观察,警惕双相反应,避免多余操作',
  ],
  principles: [
    '临床表现(接触史、荨麻疹、哮鸣音任一)即足以支持立即用一线抢救药,不需要也不应该等实验室结果',
    '一线抢救药一刻不能等;抗组胺药和激素只是辅助,不能作为替代——凭临床判断直接给药同样正确甚至更优',
    '任何"等待型"操作(送检等结果、反复观察)都在消耗黄金抢救窗口',
    '一线药未用之前就上有创操作(如气管切开)属过度创伤',
  ],
  evalNotes:
    '关键陷阱:过敏性休克黄金抢救窗口极短(恶化速率-8/回合),肾上腺素是唯一一线药;抗组胺药和激素只能辅助、救不了命;送过敏原检测等结果=等死;气管切开属过度创伤操作;NSAID会加重过敏。',
  rubric: [
    {
      id: 'dg-01',
      domain: '病史采集',
      label: '问出过敏原接触史(含坚果曲奇)',
      weight: 2,
      evidence: 'timeline 中问诊获得坚果暴露线索;问了饮食但没深挖算 partial',
    },
    {
      id: 'dg-02',
      domain: '病史采集',
      label: '快速聚焦过敏相关线索(皮肤/呼吸)',
      weight: 1,
      evidence: '问诊或查体是否围绕过敏展开,而非漫无目的',
    },
    {
      id: 'ev-01',
      domain: '客观依据',
      label: '临床确认过敏反应(接触史/荨麻疹/哮鸣音任一)',
      weight: 2,
      evidence: '核对 timeline:任一线索已揭示即达标——临床表现足以支持诊断,不需要实验室结果',
    },
    {
      id: 'tx-01',
      domain: '处置决策',
      label: '肌注肾上腺素(唯一一线药)',
      weight: 3,
      evidence: '核对 timeline:存在肾上腺素给药且起效的记录',
    },
    {
      id: 'tx-02',
      domain: '处置决策',
      label: '黄金窗口内给药(前 2 回合)',
      weight: 3,
      evidence: '核对肾上腺素给药回合:≤2 达标,第 3 回合 partial,更晚或未给 missed',
    },
    {
      id: 'tx-03',
      domain: '处置决策',
      label: '未以抗组胺/激素替代一线药',
      weight: 2,
      evidence: '辅助药可以用,但把它当唯一处置、拖延肾上腺素则不达标;肾上腺素之后用辅助药不扣',
    },
    {
      id: 'ru-01',
      domain: '资源使用',
      label: '未用"等待型"检查消耗抢救窗口',
      weight: 2,
      evidence: '送过敏原检测等结果属于典型延误;若在肾上腺素已给、病情稳定后送检,判 partial 或达标',
    },
    {
      id: 'ru-02',
      domain: '资源使用',
      label: '无有创过度操作',
      weight: 2,
      evidence: '一线药未用就气管切开等手术属过度创伤',
    },
  ],
};
