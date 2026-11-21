/** F2 word plan client. Uses the shared request(); shared/api.ts is not edited. */
import type { StudyDayRes, StudyPlanRes } from '@shabd/core';
import { request } from '../api.ts';

export const wordPlanApi = {
  plan: (studyId: number) => request<StudyPlanRes>('GET', `/studies/${studyId}/plan`, undefined, { scope: 'staff' }),
  setDay: (studyId: number, dayNo: number, wordIds: string[]) =>
    request<StudyPlanRes>('PUT', `/studies/${studyId}/plan/${dayNo}`, { wordIds }, { scope: 'staff' }),
  setHolidays: (studyId: number, dates: string[]) =>
    request<StudyPlanRes>('PUT', `/studies/${studyId}/holidays`, { dates }, { scope: 'staff' }),
  studyDay: () => request<StudyDayRes>('GET', '/student/study-day', undefined, { scope: 'student' }),
};
