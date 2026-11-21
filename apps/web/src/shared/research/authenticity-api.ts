/** F5 authenticity API client (teacher). */
import type { AuthenticityKind, AuthenticityRes, ReviewStatus } from '@shabd/core';
import { request } from '../api.ts';

const T = { scope: 'staff' } as const;

export const authenticityApi = {
  get: (classId: number, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const s = qs.toString();
    return request<AuthenticityRes>('GET', `/classes/${classId}/authenticity${s ? `?${s}` : ''}`, undefined, T);
  },
  review: (classId: number, kind: AuthenticityKind, id: number | string, status: ReviewStatus | null) =>
    request<{ ok: true }>('PATCH', `/classes/${classId}/authenticity/${kind}/${encodeURIComponent(String(id))}`, { status }, T),
};
