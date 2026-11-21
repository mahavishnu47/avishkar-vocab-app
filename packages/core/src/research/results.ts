/** F8: study results dashboard and research export types. Everything here is anonymous: study codes only. */
import type { InstrumentSummary } from './instruments.ts';
import type { PairedTTest, WelchTTest } from './stats.ts';
import type { StudyGroup, StudyStatus } from './study.ts';

export type ResultSection = 'A' | 'B' | 'C' | 'total';
export const RESULT_SECTIONS: readonly ResultSection[] = ['A', 'B', 'C', 'total'];
export const RESULT_SECTION_LABEL: Record<ResultSection, string> = {
  A: 'A: Meanings', B: 'B: Part of speech in a sentence', C: 'C: Own sentences', total: 'Total',
};

export type ExportType = 'pack' | 'scores' | 'summary' | 'participation' | 'feedback' | 'observations' | 'authenticity';
export const EXPORT_TYPES: readonly ExportType[] = ['pack', 'scores', 'summary', 'participation', 'feedback', 'observations', 'authenticity'];

export interface ScoreSet { a: number; b: number; c: number; total: number }
export interface SectionChange { pre: number; post: number; gain: number; pctGain: number | null }

/** One analysable student (consent given, not excluded), identified by study code only. */
export interface ResultParticipant {
  studyCode: string;
  group: StudyGroup;
  pre: ScoreSet | null;
  post: ScoreSet | null;
  /** pre and post both complete: this student is in the analysed sample */
  complete: boolean;
  change: Record<ResultSection, SectionChange> | null;
  /** study days completed (intervention group only) */
  daysCompleted: number | null;
  /** daysCompleted / study days elapsed, 0..1; null when not applicable */
  completionRate: number | null;
}

export interface ResultCounts {
  enrolled: number;
  consented: number;
  /** consented and not excluded */
  analysable: number;
  /** analysable with both pre and post complete */
  analysed: number;
  missingPre: number;
  missingPost: number;
}

export interface GroupSummary {
  group: StudyGroup;
  section: ResultSection;
  n: number;
  meanPre: number | null;
  sdPre: number | null;
  meanPost: number | null;
  sdPost: number | null;
  meanGain: number | null;
  sdGain: number | null;
  pctImprovement: number | null;
}

export interface TTestRow { group: StudyGroup; section: ResultSection; n: number; test: PairedTTest | null }

export interface ComparisonRow {
  section: ResultSection;
  intervention: { n: number; meanGain: number | null; sdGain: number | null };
  comparison: { n: number; meanGain: number | null; sdGain: number | null };
  /** intervention gains minus comparison gains */
  welch: WelchTTest | null;
}

export interface ParticipationDay { dayNo: number; date: string; completed: number; of: number; pct: number | null }
export interface Participation {
  /** study days that have already happened */
  studyDaysElapsed: number;
  schoolDays: number;
  days: ParticipationDay[];
  /** mean completion rate of analysable intervention students, 0..1 */
  meanCompletionRate: number | null;
}

/** Counts only: no names, no sentence texts. Analysable students' daily sentences and test section C answers. */
export interface AuthenticityCounts {
  sentences: number;
  noFlag: number;
  flagged: number;
  teacherConfirmedCopy: number;
  noFlagPct: number | null;
}

export interface StudyResultsRes {
  studyId: number;
  name: string;
  status: StudyStatus;
  generatedOn: string;
  hasComparison: boolean;
  counts: ResultCounts;
  groupCounts: { group: StudyGroup; counts: ResultCounts }[];
  participants: ResultParticipant[];
  summary: GroupSummary[];
  tTests: TTestRow[];
  /** null when the study has no analysed comparison students */
  comparison: ComparisonRow[] | null;
  participation: Participation;
  /** null (section skipped) when there is no data */
  authenticity: AuthenticityCounts | null;
  observations: InstrumentSummary['observation'] | null;
  feedback: InstrumentSummary['feedback'] | null;
}
