// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setToken } from '../../../shared/api.ts';

const api = vi.hoisted(() => ({ results: vi.fn(), exportPath: vi.fn((id: number, t: string) => `/api/studies/${id}/export.csv?type=${t}`) }));
vi.mock('../../../shared/research/results-api.ts', () => ({ resultsApi: api }));

import Results from '../Results.tsx';

const change = (pre: number, post: number) => ({ pre, post, gain: post - pre, pctGain: ((post - pre) / pre) * 100 });
const person = (code: string, pre: number, post: number) => ({
  studyCode: code, group: 'intervention', complete: true, daysCompleted: 4, completionRate: 0.8,
  pre: { a: pre / 2, b: pre / 2, c: 0, total: pre }, post: { a: post / 2, b: post / 2, c: 0, total: post },
  change: { A: change(pre / 2, post / 2), B: change(pre / 2, post / 2), C: { pre: 0, post: 0, gain: 0, pctGain: null }, total: change(pre, post) },
});
const sum = (section: string, meanPre: number, meanPost: number) => ({
  group: 'intervention', section, n: 3, meanPre, sdPre: 1.5, meanPost, sdPost: 1.2, meanGain: meanPost - meanPre, sdGain: 0.8, pctImprovement: ((meanPost - meanPre) / meanPre) * 100,
});
const tt = (section: string, p: number) => ({ group: 'intervention', section, n: 3, test: { n: 3, meanDiff: 4.5, sdDiff: 0.8, t: 9.74, df: 2, p, ci95: [2.5, 6.5], cohenDz: 5.6 } });

function results(p: number) {
  return {
    studyId: 7, name: 'Word-a-Day', status: 'closed', generatedOn: '2026-11-20', hasComparison: false,
    counts: { enrolled: 5, consented: 4, analysable: 3, analysed: 3, missingPre: 0, missingPost: 0 },
    groupCounts: [],
    participants: [person('S01', 10, 14), person('S02', 12, 17), person('S03', 8, 12)],
    summary: [sum('A', 5, 7), sum('B', 5, 7.5), sum('C', 0, 0), sum('total', 10, 14.5)],
    tTests: [tt('A', 0.2), tt('B', 0.2), tt('C', 0.5), tt('total', p)],
    comparison: null,
    participation: { studyDaysElapsed: 5, schoolDays: 20, days: [{ dayNo: 1, date: '2026-11-16', completed: 2, of: 3, pct: 66.7 }], meanCompletionRate: 0.8 },
    authenticity: null, observations: null, feedback: null,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/teacher/study/:studyId/results/*" element={<Results />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setToken('staff', 't');
  api.results.mockReset();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline')); // Page nav calls
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('study results page', () => {
  it('renders the tiles, charts and statistics table', async () => {
    api.results.mockResolvedValue(results(0.0004));
    renderAt('/teacher/study/7/results');
    const tile = async (label: string) => within(await screen.findByRole('group', { name: label }));
    expect((await tile('Students analysed')).getByText('3')).toBeTruthy();
    expect((await tile('Mean pre-test')).getByText('10.0')).toBeTruthy();
    expect((await tile('Mean post-test')).getByText('14.5')).toBeTruthy();
    expect((await tile('Mean improvement')).getByText('4.5')).toBeTruthy();
    expect((await tile('Improvement')).getByText('45.0%')).toBeTruthy();
    expect((await tile('p-value')).getByText('p < 0.001')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Pre-test and post-test mean score/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /before and after/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Histogram/ })).toBeTruthy();
    expect(screen.getByRole('table', { name: /Statistics by skill/ })).toBeTruthy();
    expect(screen.getByText(/very unlikely to be chance/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download research pack' })).toBeTruthy();
    expect(api.results).toHaveBeenCalledWith(7);
  });

  it('formats a moderate p-value to three decimals and words it in plain English', async () => {
    api.results.mockResolvedValue(results(0.0339));
    renderAt('/teacher/study/7/results');
    expect((await within(await screen.findByRole('group', { name: 'p-value' })).findByText('p = 0.034'))).toBeTruthy();
    expect(screen.getByText(/p < 0.05: the improvement is unlikely to be chance/)).toBeTruthy();
  });

  it('the report route shows the printable report without the export buttons', async () => {
    api.results.mockResolvedValue(results(0.0004));
    renderAt('/teacher/study/7/results/report');
    expect(await screen.findByRole('article', { name: 'Study report' })).toBeTruthy();
    expect(screen.getByText(/Children are identified by study code only/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print or save as PDF' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download research pack' })).toBeNull();
  });
});
