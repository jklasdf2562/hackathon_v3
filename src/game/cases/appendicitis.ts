import type { CaseCard } from '../types';

export const appendicitisCase: CaseCard = {
  caseId: 'appendicitis_01',
  trueDiagnosis: '急性阑尾炎',
  patient: {
    name: '王大爷',
    age: 62,
    gender: '男',
    personality: '怕花钱,轻描淡写症状,说方言式口语',
  },
  initialHp: 75,
  deteriorationRate: -5,
  volunteered: ['肚子不舒服', '有点恶心'],
  hiddenAsk: [
    {
      key: 'migrating_pain',
      desc: '疼痛从肚脐周围转移到右下腹',
      unlock: '问疼痛位置/变化',
      keywords: ['哪里疼', '哪疼', '哪儿疼', '位置', '部位', '转移', '挪', '变化', '移', '右下', '肚脐', '什么地方疼'],
    },
    {
      key: 'anorexia',
      desc: '从昨晚开始没胃口,一口饭没吃',
      unlock: '问饮食/胃口',
      keywords: ['胃口', '吃饭', '食欲', '吃东西', '想吃', '吃了', '饭'],
    },
  ],
  hiddenExam: [
    { key: 'rebound_tenderness', desc: '右下腹反跳痛(+)', unlock: '腹部查体' },
  ],
  hiddenLab: [
    { key: 'wbc_high', desc: '白细胞及中性粒细胞明显升高(炎症血象)', unlock: '血常规' },
    { key: 'us_appendix', desc: 'B超:阑尾增粗伴周围渗出', unlock: '腹部B超' },
  ],
  exams: [
    {
      key: 'abd_exam',
      label: '腹部查体',
      reveals: 'rebound_tenderness',
      zone: 'abdomen',
      onBed: true,
      result: {
        title: '腹部查体',
        rows: [
          { name: '腹部外观', value: '平坦,未见肠型' },
          { name: '压痛', value: '右下腹麦氏点压痛(+)', abnormal: true },
          { name: '反跳痛', value: '(+)', abnormal: true },
          { name: '肌紧张', value: '局部轻度', abnormal: true },
        ],
      },
      maskedResult: {
        title: '腹部查体',
        rows: [
          { name: '腹部外观', value: '平坦,未见肠型' },
          { name: '压痛', value: '腹软,压痛不明显' },
          { name: '反跳痛', value: '(-)' },
          { name: '肌紧张', value: '无' },
        ],
        note: '⚠ 患者近期使用了止痛药,体征可能失真',
      },
    },
    {
      key: 'heart_exam',
      label: '心肺听诊',
      zone: 'chest',
      result: {
        title: '心肺听诊',
        rows: [
          { name: '心律', value: '齐,心率稍快' },
          { name: '心音', value: '未闻及杂音' },
          { name: '呼吸音', value: '双肺清' },
        ],
      },
    },
  ],
  labs: [
    {
      key: 'blood_routine',
      label: '血常规',
      reveals: 'wbc_high',
      result: {
        title: '血常规',
        rows: [
          { name: '白细胞 WBC', value: '13.5×10⁹/L', ref: '3.5–9.5', abnormal: true },
          { name: '中性粒细胞 NE%', value: '85.2%', ref: '40–75', abnormal: true },
          { name: '血红蛋白 Hb', value: '138 g/L', ref: '130–175' },
          { name: '血小板 PLT', value: '212×10⁹/L', ref: '125–350' },
        ],
      },
    },
    {
      key: 'abd_us',
      label: '腹部B超',
      reveals: 'us_appendix',
      onBed: true,
      result: {
        title: '腹部B超',
        rows: [
          { name: '阑尾', value: '增粗,直径约 9mm', ref: '<6mm', abnormal: true },
          { name: '周围', value: '少量渗出液', abnormal: true },
          { name: '肝胆胰脾', value: '未见明显异常' },
        ],
      },
    },
    {
      key: 'ecg',
      label: '心电图',
      onBed: true,
      result: {
        title: '心电图',
        rows: [
          { name: '节律', value: '窦性心动过速' },
          { name: 'ST-T', value: '未见明显异常' },
        ],
        note: '与主诉相关性低',
      },
    },
  ],
  meds: [
    {
      key: 'painkiller',
      label: '布洛芬(止痛)',
      hpDelta: 0,
      rateDelta: 0,
      durationTurns: 2,
      mask: 'pain',
      onExpire: { rateDelta: -3, label: '止痛掩盖病情,炎症隐性进展' },
      sideEffectNote: '疼痛缓解,但腹部体征被掩盖,查体结果将失真',
    },
    {
      key: 'antibiotics',
      label: '头孢曲松(抗生素)',
      hpDelta: 0,
      rateDelta: 2,
      durationTurns: 3,
      mask: 'fever',
      sideEffectNote: '体温假性正常,可能掩盖发热体征',
    },
    {
      key: 'fluid',
      label: '生理盐水(补液)',
      hpDelta: 0,
      rateDelta: 1,
      durationTurns: 2,
      sideEffectNote: '支持治疗,轻微延缓恶化',
    },
    {
      key: 'epinephrine',
      label: '肾上腺素',
      hpDelta: -8,
      rateDelta: 0,
      durationTurns: 1,
      sideEffectNote: '无适应证!心率骤升,患者受到惊吓',
    },
  ],
  surgeries: [
    {
      key: 'appendectomy',
      label: '阑尾切除术',
      correct: true,
      requiresAny: ['rebound_tenderness', 'wbc_high', 'us_appendix'],
    },
    {
      key: 'cholecystectomy',
      label: '胆囊切除术',
      correct: false,
      wrongHpDelta: -30,
      wrongEffect: { rateDelta: -4, label: '误切胆囊,术后感染' },
    },
    {
      key: 'laparotomy',
      label: '剖腹探查术',
      correct: false,
      wrongHpDelta: -30,
      wrongEffect: { rateDelta: -4, label: '创伤性探查,术后感染' },
    },
  ],
  vitalsBase: { hr: 92, bpSys: 128, bpDia: 82, temp: 38.1, spo2: 97 },
  referencePath: [
    '问诊疼痛位置及变化,获取转移性右下腹痛(阑尾炎典型征)',
    '腹部查体(反跳痛)或血常规(白细胞↑)获取客观依据,忌先用止痛药掩盖体征',
    '取得依据后尽早行阑尾切除术(每拖一回合病情持续恶化)',
    '术后恢复期观察,避免多余操作',
  ],
  principles: [
    '不可逆处置(手术)前必须有客观依据——反跳痛、血象升高、B超影像任取其一即可,路线不限',
    '慎用掩盖体征的药物;若已使用,应改用不受其影响的检查(如血常规/B超)获取依据',
    '依据到手后尽快手术,拖延只有代价没有收益',
    '与主诉无关的检查和无适应证用药属过度医疗',
  ],
  evalNotes:
    '关键陷阱:止痛药会掩盖腹部体征使查体失真,且2回合后触发隐性恶化;抗生素只能延缓不能治愈;错误手术直接重创患者。',
  rubric: [
    {
      id: 'dg-01',
      domain: '病史采集',
      label: '问出疼痛转移(脐周→右下腹)',
      weight: 2,
      evidence: 'timeline 中问诊获得转移性腹痛线索;问了但没问到点上算 partial',
    },
    {
      id: 'dg-02',
      domain: '病史采集',
      label: '问诊系统且有针对性(起病/饮食/伴随症状)',
      weight: 1,
      evidence: '问诊覆盖面与针对性,引用具体问题;完全没问诊则 missed',
    },
    {
      id: 'ev-01',
      domain: '客观依据',
      label: '不可逆处置前取得客观依据(反跳痛/血象/影像任一)',
      weight: 3,
      evidence: '核对 timeline:手术发生前已揭示任一客观依据;无依据的赌博式手术 missed',
    },
    {
      id: 'ev-02',
      domain: '客观依据',
      label: '未被掩盖体征误导',
      weight: 2,
      evidence: '若用了止痛药,是否改用不受掩盖影响的检查(血常规/B超)补救;未用止痛药则自动达标',
    },
    {
      id: 'tx-01',
      domain: '处置决策',
      label: '实施正确处置(阑尾切除术)',
      weight: 3,
      evidence: '核对 timeline:存在成功的阑尾切除术记录',
    },
    {
      id: 'tx-02',
      domain: '处置决策',
      label: '镇痛使用得当(不掩盖诊断)',
      weight: 2,
      evidence:
        '按时序和情境判断:确诊/手术前用止痛药掩盖腹部体征属违规;术后镇痛是规范操作,应达标;全程未用也达标。用错了但随后用血象/影像补救确诊,判 partial',
    },
    {
      id: 'tx-03',
      domain: '处置决策',
      label: '依据齐备后果断处置(1 回合内)',
      weight: 2,
      evidence: '对比首个客观依据揭示的回合与手术回合;拖 1 回合 partial,更久 missed',
    },
    {
      id: 'ru-01',
      domain: '资源使用',
      label: '无与主诉无关的检查',
      weight: 1,
      evidence: '心电图、心肺听诊及菜单外无关检查通常属过度医疗;若当时情境下有合理理由(如高龄+心率异常排查心源性)可酌情',
    },
    {
      id: 'ru-02',
      domain: '资源使用',
      label: '无适应证外用药',
      weight: 1,
      evidence: '肾上腺素等无关用药、有害自定义用药均不达标',
    },
  ],
};
