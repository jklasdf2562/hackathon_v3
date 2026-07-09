import { anaphylaxisCase } from './anaphylaxis';
import { appendicitisCase } from './appendicitis';
import type { CaseCard } from '../types';

export interface BuiltinCase {
  card: CaseCard;
  brief: string;
}

export const BUILTIN_CASES: BuiltinCase[] = [
  { card: appendicitisCase, brief: '62岁大爷,直嚷"肚子不得劲"——经典教学局,节奏稳' },
  { card: anaphylaxisCase, brief: '24岁姑娘,喉咙发紧、头晕——恶化极快,生死几回合' },
];
