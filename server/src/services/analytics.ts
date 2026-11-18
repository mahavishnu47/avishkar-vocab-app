/**
 * Teacher analytics queries. OWNER: Lane A (server).
 * Weakness label rule (PRD US-T6 AC2, simplified): for each category, student rate = count / relevant events
 * (wrong spelling attempts for SP_*, scored+gated submissions for SN_*). Label when events >= 10 AND
 * rate >= 1.5 x class rate. At most 2 labels, highest ratio first. Label text: `Needs support: ${ERROR_LABELS[code]}`.
 */
import type { ClassAnalyticsRes, ClassDashboardRes, IsoDate, LeaderboardRes, StudentDetailRes } from '@shabd/core';
import type { DB } from '../db/db.ts';

export function classDashboard(db: DB, classId: number, date: IsoDate): ClassDashboardRes {
  void db; void classId; void date; throw new Error('not implemented');
}
export function leaderboard(db: DB, classId: number, period: 'week' | 'all', today: IsoDate, meStudentId?: number): LeaderboardRes {
  void db; void classId; void period; void today; void meStudentId; throw new Error('not implemented');
}
export function classAnalytics(db: DB, classId: number, from: IsoDate, to: IsoDate): ClassAnalyticsRes {
  void db; void classId; void from; void to; throw new Error('not implemented');
}
export function studentDetail(db: DB, studentId: number): StudentDetailRes {
  void db; void studentId; throw new Error('not implemented');
}

/**
 * CSV export (UTF-8 with BOM, CRLF, RFC 4180 quoting). Columns in docs/API.md section 6.
 * type: 'attempts' | 'sentences' | 'daily' | 'students'
 */
export function exportCsv(db: DB, classId: number, type: 'attempts' | 'sentences' | 'daily' | 'students'): string {
  void db; void classId; void type; throw new Error('not implemented');
}
