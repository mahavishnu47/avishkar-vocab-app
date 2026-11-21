import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('../../shared/api.ts', () => ({ getToken: () => null, setToken: () => {}, ApiRequestError: class extends Error {} }));

import { PinPad } from '../PinPad.tsx';
import { displayNames, isInAppBrowser, letterOf, presentLetters } from '../PickName.tsx';
import { shouldShowInstall } from '../InstallPrompt.tsx';
import { sortClasses } from '../PickClass.tsx';
import { kidError } from '../common.tsx';
import { WELCOME_CARDS } from '../Welcome.tsx';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('PinPad', () => {
  it('uses buttons only (no text input, so no native keyboard) and auto-submits on the 4th digit', () => {
    const onSubmit = vi.fn();
    const { container } = render(<PinPad onSubmit={onSubmit} />);
    expect(container.querySelector('input')).toBeNull();
    for (const d of ['1', '2', '3']) fireEvent.click(screen.getByLabelText(d));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('4'));
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });
  it('backspace removes a digit and extra presses after 4 are ignored', () => {
    const onSubmit = vi.fn();
    render(<PinPad onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText('9')); fireEvent.click(screen.getByLabelText('backspace'));
    for (const d of ['1', '2', '3', '4', '5']) fireEvent.click(screen.getByLabelText(d));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });
  it('ignores taps while disabled', () => {
    const onSubmit = vi.fn();
    render(<PinPad onSubmit={onSubmit} disabled />);
    for (const d of ['1', '2', '3', '4']) fireEvent.click(screen.getByLabelText(d));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('clears the dots when resetKey changes', () => {
    const { rerender } = render(<PinPad onSubmit={() => {}} resetKey={0} />);
    fireEvent.click(screen.getByLabelText('1'));
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('1 of 4 digits');
    rerender(<PinPad onSubmit={() => {}} resetKey={1} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 of 4 digits');
  });
});

describe('name grid helpers', () => {
  const S = (id: number, firstName: string, rollNo: number) => ({ id, firstName, avatar: '🦁', rollNo });
  it('shows the roll number only for duplicate first names', () => {
    const m = displayNames([S(1, 'Riya', 1), S(2, 'riya', 7), S(3, 'Sai', 3)]);
    expect(m.get(1)).toBe('Riya · 1');
    expect(m.get(2)).toBe('riya · 7');
    expect(m.get(3)).toBe('Sai');
  });
  it('lists only letters that are present', () => {
    expect(presentLetters([S(1, 'Zoya', 1), S(2, 'Aarav', 2), S(3, 'Asha', 3)])).toEqual(['A', 'Z']);
    expect(letterOf('  éva')).toBe('#');
  });
  it('detects the WhatsApp in-app browser', () => {
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 12; wv) WhatsApp/2.23')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 12) Chrome/120 Mobile Safari')).toBe(false);
  });
});

describe('install prompt rules', () => {
  const base = { dismissedAt: 0, dismissals: 0, now: 10 * 86400000, standalone: false };
  it('shows by default, hides when installed', () => {
    expect(shouldShowInstall(base)).toBe(true);
    expect(shouldShowInstall({ ...base, standalone: true })).toBe(false);
  });
  it('"Not now" hides for 7 days, then shows again; never after 3 dismissals', () => {
    expect(shouldShowInstall({ ...base, dismissedAt: base.now - 6 * 86400000, dismissals: 1 })).toBe(false);
    expect(shouldShowInstall({ ...base, dismissedAt: base.now - 8 * 86400000, dismissals: 1 })).toBe(true);
    expect(shouldShowInstall({ ...base, dismissedAt: base.now - 30 * 86400000, dismissals: 3 })).toBe(false);
  });
});

describe('misc', () => {
  it('sorts classes by standard then division', () => {
    const c = (name: string, standard: number, division: string) => ({ name, classCode: name, standard, division });
    expect(sortClasses([c('6A', 6, 'A'), c('5B', 5, 'B'), c('5A', 5, 'A')]).map((x) => x.name)).toEqual(['5A', '5B', '6A']);
  });
  it('welcome has the 3 stages', () => {
    expect(WELCOME_CARDS.map((c) => c.title)).toEqual(['Listen and spell', 'Learn the meaning', 'Write a sentence']);
  });
  it('error text is kid-friendly and says who to ask', () => {
    expect(kidError(new Error('boom'))).toContain('grown-up');
  });
});
