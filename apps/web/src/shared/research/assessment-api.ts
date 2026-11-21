/** F4 assessment API client (uses the shared request()). */
import type {
  AssessmentResultsRes, AssessmentWindowRes, CreateAssessmentReq, ManualScoresReq, PatchAssessmentReq, PrintableForm,
  ResponseWrite, SaveResponsesRes, StartAssessmentRes, StudentAssessmentCurrentRes, StudentAssessmentRes, SubmitAssessmentRes,
} from '@shabd/core';
import { request } from '../api.ts';

const S = { scope: 'student' } as const;
const T = { scope: 'staff' } as const;

export const assessmentApi = {
  // student
  current: () => request<StudentAssessmentCurrentRes>('GET', '/student/assessments/current', undefined, S),
  start: (windowId: number, accessCode?: string) => request<StartAssessmentRes>('POST', `/student/assessments/${windowId}/start`, accessCode ? { accessCode } : {}, S),
  save: (windowId: number, items: ResponseWrite[]) => request<SaveResponsesRes>('PUT', `/student/assessments/${windowId}/responses`, { items }, S),
  submit: (windowId: number) => request<SubmitAssessmentRes>('POST', `/student/assessments/${windowId}/submit`, {}, S),
  // teacher
  list: (classId: number) => request<AssessmentWindowRes[]>('GET', `/classes/${classId}/assessments`, undefined, T),
  create: (classId: number, body: CreateAssessmentReq) => request<AssessmentWindowRes>('POST', `/classes/${classId}/assessments`, body, T),
  patch: (classId: number, windowId: number, body: PatchAssessmentReq) => request<AssessmentWindowRes>('PATCH', `/classes/${classId}/assessments/${windowId}`, body, T),
  results: (classId: number, windowId: number) => request<AssessmentResultsRes>('GET', `/classes/${classId}/assessments/${windowId}/results`, undefined, T),
  studentDetail: (classId: number, windowId: number, studentId: number) => request<StudentAssessmentRes>('GET', `/classes/${classId}/assessments/${windowId}/students/${studentId}`, undefined, T),
  override: (classId: number, windowId: number, studentId: number, itemId: string, overrideMarks: number | null) =>
    request<{ ok: true }>('PATCH', `/classes/${classId}/assessments/${windowId}/students/${studentId}/items/${itemId}`, { overrideMarks }, T),
  manual: (classId: number, windowId: number, studentId: number, body: ManualScoresReq) =>
    request<{ ok: true }>('PUT', `/classes/${classId}/assessments/${windowId}/students/${studentId}/manual`, body, T),
  printForm: (formId: 'A' | 'B') => request<PrintableForm>('GET', `/assessment-forms/${formId}/print`, undefined, T),
};
