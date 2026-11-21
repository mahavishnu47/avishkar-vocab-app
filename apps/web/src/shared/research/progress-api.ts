/** F7 progress API client (teacher). */
import type { ProgressRes } from '@shabd/core';
import { request } from '../api.ts';

export const progressApi = {
  get: (classId: number, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const s = qs.toString();
    return request<ProgressRes>('GET', `/classes/${classId}/progress${s ? `?${s}` : ''}`, undefined, { scope: 'staff' });
  },
};
