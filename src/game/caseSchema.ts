import type { CaseCard } from './types';

export interface CaseValidationOk {
  ok: true;
  card: CaseCard;
}

export interface CaseValidationFail {
  ok: false;
  errors: string[];
}

export type CaseValidation = CaseValidationOk | CaseValidationFail;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function checkRows(errors: string[], value: unknown, path: string) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} 必须至少包含 1 行结果`);
    return;
  }
  value.forEach((row, i) => {
    if (!isObj(row)) {
      errors.push(`${path}[${i}] 必须是对象`);
      return;
    }
    if (!isString(row.name)) errors.push(`${path}[${i}].name 必须是非空字符串`);
    if (!isString(row.value)) errors.push(`${path}[${i}].value 必须是非空字符串`);
    if (row.ref !== undefined && typeof row.ref !== 'string') errors.push(`${path}[${i}].ref 必须是字符串`);
    if (row.abnormal !== undefined && typeof row.abnormal !== 'boolean') errors.push(`${path}[${i}].abnormal 必须是布尔值`);
  });
}

function checkHidden(errors: string[], value: unknown, path: string, min: number): string[] {
  const keys: string[] = [];
  if (!Array.isArray(value) || value.length < min) {
    errors.push(`${path} 必须至少包含 ${min} 项线索`);
    return keys;
  }
  value.forEach((item, i) => {
    if (!isObj(item)) {
      errors.push(`${path}[${i}] 必须是对象`);
      return;
    }
    for (const k of ['key', 'desc', 'unlock']) {
      if (!isString(item[k])) errors.push(`${path}[${i}].${k} 必须是非空字符串`);
    }
    if (Array.isArray(item.keywords) && item.keywords.some((x) => typeof x !== 'string')) {
      errors.push(`${path}[${i}].keywords 必须是字符串数组`);
    }
    if (isString(item.key)) keys.push(item.key);
  });
  return keys;
}

function unique(errors: string[], keys: string[], label: string) {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) errors.push(`${label} key 重复:${key}`);
    seen.add(key);
  }
}

function validateCaseShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObj(value)) return ['病例必须是 JSON 对象'];

  if (!isString(value.caseId)) errors.push('caseId 必须是非空字符串');
  if (!isString(value.trueDiagnosis)) errors.push('trueDiagnosis 必须是非空字符串');
  if (!isNumber(value.initialHp) || value.initialHp < 1 || value.initialHp > 100) errors.push('initialHp 必须是 1~100 的数字');
  if (!isNumber(value.deteriorationRate) || value.deteriorationRate < -20 || value.deteriorationRate > 0) {
    errors.push('deteriorationRate 必须是 -20~0 的数字');
  }
  if (!Array.isArray(value.volunteered) || value.volunteered.length < 1 || value.volunteered.some((x) => !isString(x))) {
    errors.push('volunteered 必须是至少 1 项的字符串数组');
  }
  if (!isObj(value.patient)) {
    errors.push('patient 必须是对象');
  } else {
    if (!isString(value.patient.name)) errors.push('patient.name 必须是非空字符串');
    if (!isNumber(value.patient.age) || value.patient.age < 0 || value.patient.age > 120) errors.push('patient.age 必须是 0~120 的数字');
    if (!isString(value.patient.gender)) errors.push('patient.gender 必须是非空字符串');
    if (!isString(value.patient.personality)) errors.push('patient.personality 必须是非空字符串');
    // 家属可选;儿童(<14)必须有家属陪同代诉
    const g = (value.patient as Record<string, unknown>).guardian;
    if (g !== undefined) {
      if (!isObj(g) || !isString(g.relation) || !isString(g.personality))
        errors.push('patient.guardian 需为 {relation, personality} 且均为非空字符串');
    } else if (isNumber(value.patient.age) && value.patient.age < 14) {
      errors.push('患者是儿童(<14岁),必须提供 patient.guardian(陪同家属)');
    }
  }

  if (!isObj(value.vitalsBase)) {
    errors.push('vitalsBase 必须是对象');
  } else {
    for (const key of ['hr', 'bpSys', 'bpDia', 'temp', 'spo2']) {
      if (!isNumber(value.vitalsBase[key])) errors.push(`vitalsBase.${key} 必须是数字`);
    }
  }

  const askKeys = checkHidden(errors, value.hiddenAsk, 'hiddenAsk', 2);
  const examKeys = checkHidden(errors, value.hiddenExam, 'hiddenExam', 1);
  const labKeys = checkHidden(errors, value.hiddenLab, 'hiddenLab', 1);
  const clueKeys = new Set([...askKeys, ...examKeys, ...labKeys]);
  unique(errors, [...askKeys, ...examKeys, ...labKeys], 'hidden');

  const opKeys: string[] = [];
  const zones: string[] = [];
  if (!Array.isArray(value.exams) || value.exams.length < 1) {
    errors.push('exams 必须至少包含 1 项');
  } else {
    value.exams.forEach((item, i) => {
      if (!isObj(item)) {
        errors.push(`exams[${i}] 必须是对象`);
        return;
      }
      if (!isString(item.key)) errors.push(`exams[${i}].key 必须是非空字符串`);
      else opKeys.push(item.key);
      if (!isString(item.label)) errors.push(`exams[${i}].label 必须是非空字符串`);
      if (item.reveals !== undefined && (!isString(item.reveals) || !clueKeys.has(item.reveals))) {
        errors.push(`exams[${i}].reveals 必须引用已存在的 hidden key`);
      }
      if (item.zone !== undefined) {
        if (item.zone !== 'chest' && item.zone !== 'abdomen') errors.push(`exams[${i}].zone 只能是 chest 或 abdomen`);
        else zones.push(item.zone);
      }
      if (item.onBed !== undefined && typeof item.onBed !== 'boolean') errors.push(`exams[${i}].onBed 必须是布尔值`);
      if (!isObj(item.result)) errors.push(`exams[${i}].result 必须是对象`);
      else checkRows(errors, item.result.rows, `exams[${i}].result.rows`);
      if (item.maskedResult !== undefined) {
        if (!isObj(item.maskedResult)) errors.push(`exams[${i}].maskedResult 必须是对象`);
        else checkRows(errors, item.maskedResult.rows, `exams[${i}].maskedResult.rows`);
      }
    });
  }
  if (zones.filter((z) => z === 'chest').length > 1) errors.push('最多只能有 1 个 chest 热区检查');
  if (zones.filter((z) => z === 'abdomen').length > 1) errors.push('最多只能有 1 个 abdomen 热区检查');

  if (!Array.isArray(value.labs) || value.labs.length < 1) {
    errors.push('labs 必须至少包含 1 项');
  } else {
    value.labs.forEach((item, i) => {
      if (!isObj(item)) {
        errors.push(`labs[${i}] 必须是对象`);
        return;
      }
      if (!isString(item.key)) errors.push(`labs[${i}].key 必须是非空字符串`);
      else opKeys.push(item.key);
      if (!isString(item.label)) errors.push(`labs[${i}].label 必须是非空字符串`);
      if (item.reveals !== undefined && (!isString(item.reveals) || !clueKeys.has(item.reveals))) {
        errors.push(`labs[${i}].reveals 必须引用已存在的 hidden key`);
      }
      if (item.onBed !== undefined && typeof item.onBed !== 'boolean') errors.push(`labs[${i}].onBed 必须是布尔值`);
      if (!isObj(item.result)) errors.push(`labs[${i}].result 必须是对象`);
      else checkRows(errors, item.result.rows, `labs[${i}].result.rows`);
    });
  }

  let hasCure = false;
  if (!Array.isArray(value.meds) || value.meds.length < 1) {
    errors.push('meds 必须至少包含 1 项');
  } else {
    value.meds.forEach((item, i) => {
      if (!isObj(item)) {
        errors.push(`meds[${i}] 必须是对象`);
        return;
      }
      if (!isString(item.key)) errors.push(`meds[${i}].key 必须是非空字符串`);
      else opKeys.push(item.key);
      if (!isString(item.label)) errors.push(`meds[${i}].label 必须是非空字符串`);
      if (!isNumber(item.hpDelta)) errors.push(`meds[${i}].hpDelta 必须是数字`);
      if (!isNumber(item.rateDelta)) errors.push(`meds[${i}].rateDelta 必须是数字`);
      if (item.durationTurns !== null && (!isNumber(item.durationTurns) || item.durationTurns < 1)) {
        errors.push(`meds[${i}].durationTurns 必须是正数或 null`);
      }
      if (item.cure === true) hasCure = true;
    });
  }

  if (!Array.isArray(value.surgeries)) {
    errors.push('surgeries 必须是数组');
  } else {
    value.surgeries.forEach((item, i) => {
      if (!isObj(item)) {
        errors.push(`surgeries[${i}] 必须是对象`);
        return;
      }
      if (!isString(item.key)) errors.push(`surgeries[${i}].key 必须是非空字符串`);
      else opKeys.push(item.key);
      if (!isString(item.label)) errors.push(`surgeries[${i}].label 必须是非空字符串`);
      if (typeof item.correct !== 'boolean') errors.push(`surgeries[${i}].correct 必须是布尔值`);
      if (item.correct === true) hasCure = true;
      if (item.requiresAny !== undefined) {
        if (!Array.isArray(item.requiresAny) || item.requiresAny.some((x) => !isString(x) || !clueKeys.has(x))) {
          errors.push(`surgeries[${i}].requiresAny 必须引用已存在的 hidden key`);
        }
      }
    });
  }
  unique(errors, opKeys, '操作菜单');
  if (!hasCure) errors.push('病例必须至少包含一个正确治愈路径:med.cure=true 或 surgery.correct=true');

  if (!Array.isArray(value.referencePath) || value.referencePath.length < 1) errors.push('referencePath 至少 1 条');
  if (!Array.isArray(value.principles) || value.principles.length < 1) errors.push('principles 至少 1 条');
  if (!isString(value.evalNotes)) errors.push('evalNotes 必须是非空字符串');
  if (!Array.isArray(value.rubric) || value.rubric.length < 4) {
    errors.push('rubric 必须至少包含 4 条');
  }

  return errors;
}

export function validateCaseCard(value: unknown): CaseValidation {
  const errors = validateCaseShape(value);
  if (errors.length) return { ok: false, errors };
  return { ok: true, card: value as CaseCard };
}

export function summarizeCaseIntake(card: CaseCard): string {
  return [
    `${card.patient.name} · ${card.patient.age}岁 · ${card.patient.gender}`,
    `主诉:${card.volunteered.join('、')}`,
  ].join('\n');
}
