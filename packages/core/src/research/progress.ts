/** F7: Vocabulary Progress Tracker and participation record. Shared by server and web. */

export interface ProgressStudentRow {
  studentId: number;
  rollNo: number;
  firstName: string;
  /** S01.. / C01.. when the class is in a study, else null. */
  studyCode: string | null;
  /** Days with a session started in the window. */
  daysActive: number;
  /** Days with a finished session (completed_at set). */
  daysCompleted: number;
  /** Words with a word_scores row in the window. */
  wordsCompleted: number;
  /** Percentages 0..100 (one decimal); null when there is no data. */
  meaningFirstTryPct: number | null;
  posFirstTryPct: number | null;
  sentenceAvgPct: number | null;
  recallPct: number | null;
  lastActive: string | null;
  /** date -> words done that day (0..5), null when no session that day. */
  grid: Record<string, number | null>;
}

export interface ProgressRes {
  classId: number;
  from: string;
  to: string;
  /** True when the window follows a study's school days. */
  inStudy: boolean;
  /** Study school days (or weekdays) inside the window, ascending. */
  days: string[];
  wordsPerDay: number;
  students: ProgressStudentRow[];
}
