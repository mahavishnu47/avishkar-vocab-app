// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { StudentHomeRes } from '@shabd/core';

const api = vi.hoisted(() => ({ studyDay: vi.fn() }));
vi.mock('../../../shared/research/wordplan-api.ts', () => ({ wordPlanApi: api }));

import { StudyDayCard } from '../cards/StudyDayCard.tsx';

const home = {} as StudentHomeRes;
beforeEach(() => { api.studyDay.mockReset(); });
afterEach(cleanup);

describe('StudyDayCard', () => {
  it('shows the rest-day message on a weekend', async () => {
    api.studyDay.mockResolvedValue({ inStudy: false, group: 'intervention', dayNo: null, totalDays: 20, reason: 'weekend' });
    render(<StudyDayCard home={home} />);
    expect(await screen.findByText(/No new words today/)).toBeTruthy();
    expect(screen.getByText('Come back on Monday!')).toBeTruthy();
  });
  it('shows nothing on a study day or when there is no study', async () => {
    api.studyDay.mockResolvedValue({ inStudy: true, group: 'intervention', dayNo: 3, totalDays: 20, reason: 'study_day' });
    const { container } = render(<StudyDayCard home={home} />);
    await waitFor(() => expect(api.studyDay).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
  it('shows nothing when offline', async () => {
    api.studyDay.mockRejectedValue(new Error('offline'));
    const { container } = render(<StudyDayCard home={home} />);
    await waitFor(() => expect(api.studyDay).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
  it('tells a comparison class there are no daily words', async () => {
    api.studyDay.mockResolvedValue({ inStudy: false, group: 'comparison', dayNo: null, totalDays: 20, reason: 'comparison' });
    render(<StudyDayCard home={home} />);
    expect(await screen.findByText(/test/)).toBeTruthy();
  });
});
