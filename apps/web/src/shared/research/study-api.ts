/** F1 study API client (staff scope). Uses the shared request(); shared/api.ts is not edited. */
import type { CreateStudyReq, Study, StudyGroup, StudyParticipant, UpdateParticipantReq, UpdateStudyReq } from '@shabd/core';
import { request } from '../api.ts';

const staff = <T>(method: string, path: string, body?: unknown) => request<T>(method, path, body, { scope: 'staff' });

export const studyApi = {
  list: () => staff<Study[]>('GET', '/studies'),
  create: (b: CreateStudyReq) => staff<Study>('POST', '/studies', b),
  get: (id: number) => staff<Study>('GET', `/studies/${id}`),
  update: (id: number, b: UpdateStudyReq) => staff<Study>('PATCH', `/studies/${id}`, b),
  attachClass: (id: number, classId: number, group: StudyGroup) => staff<Study>('PUT', `/studies/${id}/classes/${classId}`, { group }),
  detachClass: (id: number, classId: number) => staff<Study>('DELETE', `/studies/${id}/classes/${classId}`),
  participants: (id: number) => staff<StudyParticipant[]>('GET', `/studies/${id}/participants`),
  sync: (id: number) => staff<StudyParticipant[]>('POST', `/studies/${id}/participants/sync`),
  updateParticipant: (id: number, studentId: number, b: UpdateParticipantReq) =>
    staff<StudyParticipant>('PATCH', `/studies/${id}/participants/${studentId}`, b),
  withdraw: (id: number, studentId: number) => staff<StudyParticipant>('DELETE', `/studies/${id}/participants/${studentId}/research-data`),
};
