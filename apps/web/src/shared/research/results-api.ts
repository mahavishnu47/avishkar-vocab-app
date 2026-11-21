/** F8 results API client (uses the shared request()). */
import type { ExportType, StudyResultsRes } from '@shabd/core';
import { request } from '../api.ts';

const T = { scope: 'staff' } as const;

export const resultsApi = {
  results: (studyId: number) => request<StudyResultsRes>('GET', `/studies/${studyId}/results`, undefined, T),
  /** URL for downloadCsv() (a plain link cannot send the bearer token). */
  exportPath: (studyId: number, type: ExportType) => `/api/studies/${studyId}/export.csv?type=${type}`,
};
