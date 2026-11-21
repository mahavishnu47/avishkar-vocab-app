/** F6 recall + vocabulary bank API client (student scope). */
import type { BankRes, RecallAnswerWrite, RecallAnswersRes, RecallTodayRes } from '@shabd/core';
import { getActiveId } from '../../student/profiles.ts';
import { request } from '../api.ts';

const S = { scope: 'student' } as const;

export const vocabApi = {
  recallToday: () => request<RecallTodayRes>('GET', '/student/recall/today', undefined, S),
  recallAnswers: (answers: RecallAnswerWrite[]) => request<RecallAnswersRes>('POST', '/student/recall/answers', { answers }, S),
  bank: () => request<BankRes>('GET', '/student/bank', undefined, S),
};

/** The bank is cached per child so it opens offline. Never throws. */
const bankKey = () => `shabd.bank.${getActiveId() ?? 'x'}`;
export function readBankCache(): BankRes | null {
  try {
    const v = JSON.parse(localStorage.getItem(bankKey()) ?? 'null') as BankRes | null;
    return v && Array.isArray(v.words) ? v : null;
  } catch { return null; }
}
export function writeBankCache(b: BankRes): void {
  try { localStorage.setItem(bankKey(), JSON.stringify(b)); } catch { /* storage full or blocked */ }
}
