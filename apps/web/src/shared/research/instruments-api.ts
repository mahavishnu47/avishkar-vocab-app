/** F9 instruments API client (uses the shared request()). */
import type {
  FeedbackAnswerWrite, FeedbackRes, FeedbackWindow, ObservationKey, ObservationsRes, StudentFeedbackRes,
} from '@shabd/core';
import { request } from '../api.ts';

const S = { scope: 'student' } as const;
const T = { scope: 'staff' } as const;

export const instrumentsApi = {
  // student
  studentFeedback: () => request<StudentFeedbackRes>('GET', '/student/feedback', undefined, S),
  postFeedback: (answers: FeedbackAnswerWrite[]) => request<{ ok: true }>('POST', '/student/feedback', { answers }, S),
  // teacher
  observations: (studyId: number, week: number) => request<ObservationsRes>('GET', `/studies/${studyId}/observations?week=${week}`, undefined, T),
  putObservation: (studyId: number, studentId: number, week: number, values: Partial<Record<ObservationKey, boolean | null>>) =>
    request<{ ok: true }>('PUT', `/studies/${studyId}/observations`, { studentId, week, values }, T),
  feedback: (studyId: number) => request<FeedbackRes>('GET', `/studies/${studyId}/feedback`, undefined, T),
  setWindow: (studyId: number, open: boolean) => request<FeedbackWindow>('PATCH', `/studies/${studyId}/feedback-window`, { open }, T),
  putPaper: (studyId: number, studentId: number, answers: FeedbackAnswerWrite[]) =>
    request<{ ok: true }>('PUT', `/studies/${studyId}/feedback/${studentId}`, { answers }, T),
};
