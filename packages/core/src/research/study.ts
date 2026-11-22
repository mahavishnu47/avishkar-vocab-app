/** F1: study setup, anonymous study codes, per-student consent. Shared by server and web. */

export type StudyGroup = 'intervention' | 'comparison';
export type StudyStatus = 'setup' | 'running' | 'closed';
export type ConsentStatus = 'pending' | 'given' | 'declined' | 'withdrawn';

export const STUDY_GROUPS: readonly StudyGroup[] = ['intervention', 'comparison'];
export const STUDY_STATUSES: readonly StudyStatus[] = ['setup', 'running', 'closed'];
export const CONSENT_STATUSES: readonly ConsentStatus[] = ['pending', 'given', 'declined', 'withdrawn'];

export const DEFAULT_SCHOOL_DAYS = 10;
export const DEFAULT_WORDS_PER_DAY = 5;

/** S01, S02 ... for the intervention group; C01, C02 ... for the comparison group. Two digits minimum. */
export function formatStudyCode(group: StudyGroup, n: number): string {
  return `${group === 'intervention' ? 'S' : 'C'}${String(n).padStart(2, '0')}`;
}

/** Only children with consent "given" who are not excluded count in research data. */
export function isAnalysable(p: { consent: ConsentStatus; excluded: boolean }): boolean {
  return p.consent === 'given' && !p.excluded;
}

export interface ConsentCounts {
  pending: number; given: number; declined: number; withdrawn: number; excluded: number; analysable: number; total: number;
}

export interface StudyClassInfo {
  classId: number;
  className: string;
  group: StudyGroup;
  studentCount: number;
}

export interface Study {
  id: number;
  name: string;
  startDate: string;
  schoolDays: number;
  wordsPerDay: number;
  status: StudyStatus;
  createdAt: string;
  classes: StudyClassInfo[];
  consent: ConsentCounts;
}

export interface StudyParticipant {
  studentId: number;
  studyCode: string;
  group: StudyGroup;
  classId: number;
  className: string;
  rollNo: number;
  firstName: string;
  consent: ConsentStatus;
  excluded: boolean;
  analysable: boolean;
  consentUpdatedAt: string | null;
}

/** What other features get from getStudyForClass(db, classId). */
export interface ClassStudy {
  studyId: number;
  group: StudyGroup;
  startDate: string;
  schoolDays: number;
  status: StudyStatus;
}

export interface CreateStudyReq {
  name: string;
  startDate?: string;
  schoolDays?: number;
  wordsPerDay?: number;
  classes?: { classId: number; group: StudyGroup }[];
}
export interface UpdateStudyReq {
  name?: string;
  startDate?: string;
  schoolDays?: number;
  wordsPerDay?: number;
  status?: StudyStatus;
}
export interface SetStudyClassReq { group: StudyGroup }
export interface UpdateParticipantReq { consent?: ConsentStatus; excluded?: boolean }
