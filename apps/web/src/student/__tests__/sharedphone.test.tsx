import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StudentApp } from '../StudentApp.tsx';
import { _resetChosenForTests, getActiveId, getProfiles } from '../profiles.ts';
import { isStudentDevice } from '../../shared/persist.ts';

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><StudentApp /></MemoryRouter>);
const pin = (p: string) => { for (const d of p) fireEvent.click(screen.getByLabelText(d)); };
const fresh = () => { cleanup(); sessionStorage.clear(); _resetChosenForTests(); sessionStorage.setItem('shabd.mock', '1'); };

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); _resetChosenForTests(); sessionStorage.setItem('shabd.mock', '1'); });
afterEach(cleanup);
vi.setConfig({ testTimeout: 30000 });
configure({ asyncUtilTimeout: 8000 });

async function twoChildren() {
  open('/j/K7Q2MX');
  fireEvent.click(await screen.findByText('Aarav')); pin('1234'); await screen.findByText('Listen and spell');
  fresh();
  open('/j/K7Q2MX');
  fireEvent.click(await screen.findByText('Sai')); pin('1234'); await screen.findByText('Listen and spell');
  expect(getProfiles()).toHaveLength(2);
  fresh();
}

describe('shared phone safety', () => {
  it('switching to another child needs their PIN, even with a saved token', async () => {
    await twoChildren();
    open('/who');
    fireEvent.click(await screen.findByText('Aarav'));
    expect(await screen.findByText('Type your PIN')).toBeTruthy();
    pin('0000');
    expect(await screen.findByText(/Try again/)).toBeTruthy(); await screen.findByLabelText('0 of 4 digits');
    const before = getActiveId();
    pin('1234');
    expect(await screen.findByText(/Hi Aarav/)).toBeTruthy();
    expect(getActiveId()).not.toBe(before);
  });

  it('tapping the already-active child needs no PIN', async () => {
    await twoChildren();
    open('/who');
    fireEvent.click(await screen.findByText('Sai'));
    expect(await screen.findByText(/Hi Sai/)).toBeTruthy();
  });

  it("removing a profile needs that child's PIN", async () => {
    await twoChildren();
    open('/who');
    fireEvent.click(await screen.findByText('Edit'));
    fireEvent.click(await screen.findByText('Aarav'));
    fireEvent.click(screen.getByText('Yes, remove'));
    expect(await screen.findByText('Type your PIN')).toBeTruthy();
    pin('0000');
    expect(await screen.findByText(/Try again/)).toBeTruthy(); await screen.findByLabelText('0 of 4 digits');
    expect(getProfiles()).toHaveLength(2);
    pin('1234');
    await screen.findByText(/Who's playing/);
    expect(getProfiles().map((p) => p.firstName)).toEqual(['Sai']);
  });
});

describe('student log out', () => {
  it('logs out the active child and shows Welcome back when nobody is left', async () => {
    open('/j/K7Q2MX');
    fireEvent.click(await screen.findByText('Aarav')); pin('1234'); await screen.findByText('Listen and spell');
    fireEvent.click(screen.getByText('Skip'));
    await screen.findByText(/Hi Aarav/);
    fireEvent.click(screen.getByText('Log out'));
    expect(screen.getByText('Log out Aarav from this phone?')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, log out'));
    expect(await screen.findByText(/Welcome back/i)).toBeTruthy();
    expect(getProfiles()).toHaveLength(0);
    expect(isStudentDevice()).toBe(true);
  });

  it("goes to Who's playing when other children remain", async () => {
    await twoChildren();
    open('/who');
    fireEvent.click(await screen.findByText('Sai'));
    await screen.findByText(/Hi Sai/);
    fireEvent.click(screen.getByText('Log out'));
    fireEvent.click(screen.getByText('Yes, log out'));
    await screen.findByText(/Who's playing/);
    expect(getProfiles().map((p) => p.firstName)).toEqual(['Aarav']);
  });
});
