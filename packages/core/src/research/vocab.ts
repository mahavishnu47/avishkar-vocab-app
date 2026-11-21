/** F6: Recall challenge (yesterday's words) and My Vocabulary Bank. Items never carry the answer. */
import type { IsoDate } from '../types.ts';

export type RecallKind = 'meaning' | 'pos';

export interface RecallItem {
  /** `${wordId}:${kind}` */
  itemId: string;
  wordId: string;
  kind: RecallKind;
  /** the question shown to the child */
  prompt: string;
  word: string;
  options: string[];
}

export interface RecallTodayRes {
  date: IsoDate;
  items: RecallItem[];
  /** the child already played today's first (counted) set */
  alreadyDone: boolean;
}

export interface RecallAnswerWrite { clientId: string; itemId: string; chosen: string; msElapsed: number; clientTs: string }
export interface RecallAnswersReq { answers: RecallAnswerWrite[] }
export interface RecallResult { itemId: string; isCorrect: boolean; correctAnswer: string; counted: boolean }
export interface RecallAnswersRes { results: RecallResult[] }

export interface BankWord {
  wordId: string;
  word: string;
  partOfSpeech: string;
  meaning: string;
  exampleSentence: string;
  /** the child's own best counted sentence, if any */
  bestSentence: string | null;
  stars: number;
  /** percent 0..100 of counted recall answers that were right; null if never revised */
  recallPct: number | null;
}
export interface BankRes { words: BankWord[] }

export const RECALL_SET_SIZE = 5;
