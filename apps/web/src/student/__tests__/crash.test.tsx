import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../../shared/ErrorBoundary.tsx';
import { getProfiles } from '../profiles.ts';
import { storedHome } from '../common.tsx';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('damaged saved data never crashes the app (K-2)', () => {
  it('ignores malformed profiles instead of returning nulls', () => {
    localStorage.setItem('shabd.profiles.v1', '[null, {}, 5, {"studentId":"x"}, {"studentId":2,"firstName":"Riya","avatar":"🦁","classCode":"ABC123","token":"t","className":"5A","schoolName":"S","lastUsedAt":1}]');
    const p = getProfiles();
    expect(p).toHaveLength(1);
    expect(p[0]!.firstName).toBe('Riya');
    for (const bad of ['not json{{', '{"a":1}', '"str"', 'null']) {
      localStorage.setItem('shabd.profiles.v1', bad);
      expect(getProfiles()).toEqual([]);
    }
  });

  it('a profile missing optional fields still works', () => {
    localStorage.setItem('shabd.profiles.v1', '[{"studentId":2,"firstName":"Riya","avatar":"🦁","classCode":"ABC123","token":null}]');
    expect(getProfiles()[0]).toMatchObject({ className: '', schoolName: '', lastUsedAt: 0 });
  });

  it('a damaged home cache reads as "no cache"', () => {
    localStorage.setItem('shabd.profiles.v1', '[{"studentId":2,"firstName":"Riya","avatar":"🦁","classCode":"ABC123","token":"t"}]');
    localStorage.setItem('shabd.activeStudentId', '2');
    localStorage.setItem('shabd.home.2', '{"student":null}');
    expect(storedHome()).toBeNull();
    localStorage.setItem('shabd.home.2', 'garbage');
    expect(storedHome()).toBeNull();
  });
});

describe('error boundary', () => {
  function Bomb(): never { throw new Error('boom'); }

  it('shows a kind screen instead of a blank page, and Start fresh clears only this app\'s data', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('shabd.profiles.v1', '[]');
    localStorage.setItem('other.site.data', 'keep me');
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, configurable: true });

    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toMatch(/Something went wrong/);
    expect(screen.queryByText(/Start fresh/)).toBeNull(); // first offer: just try again
    fireEvent.click(screen.getByText('Try again'));
    expect(screen.getByText(/Start fresh/)).toBeTruthy(); // it crashed again: offer the reset
    fireEvent.click(screen.getByText(/Start fresh/));
    expect(localStorage.getItem('shabd.profiles.v1')).toBeNull();
    expect(localStorage.getItem('other.site.data')).toBe('keep me');
    expect(replace).toHaveBeenCalledWith('/');
  });
});
