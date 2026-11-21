import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StudentApp } from '../StudentApp.tsx';
import { _resetChosenForTests, getProfiles } from '../profiles.ts';

const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><StudentApp /></MemoryRouter>);
const pin = (p: string) => { for (const d of p) fireEvent.click(screen.getByLabelText(d)); };

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); _resetChosenForTests(); sessionStorage.setItem('shabd.mock', '1'); });
afterEach(cleanup);

describe('student onboarding flow (mock server)', () => {
  it('link -> name -> PIN -> welcome -> home, then remembers the child', async () => {
    open('/j/K7Q2MX');
    fireEvent.click(await screen.findByText('Aarav'));
    pin('1234');
    expect(await screen.findByText('Listen and spell')).toBeTruthy();
    expect(getProfiles()).toHaveLength(1);
    fireEvent.click(screen.getByText('Skip'));
    expect(await screen.findByText(/Hi Aarav/)).toBeTruthy();
  });

  it('a wrong PIN says "Try again" and Forgot PIN shows the teacher message', async () => {
    open('/j/K7Q2MX');
    fireEvent.click(await screen.findByText('Aarav'));
    pin('0000');
    expect(await screen.findByText(/Try again/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Forgot PIN/));
    expect(screen.getByText(/Ask your teacher for your PIN card/)).toBeTruthy();
  });

  it('a bad link shows a kind message', async () => {
    open('/j/ZZZZZZ');
    await waitFor(() => expect(screen.getByText(/Ask your teacher for a new one/)).toBeTruthy());
  });

  it('a phone with two children asks who is playing', async () => {
    open('/j/K7Q2MX');
    fireEvent.click(await screen.findByText('Aarav')); pin('1234'); await screen.findByText('Listen and spell'); fireEvent.click(screen.getByText('Skip'));
    await screen.findByText(/Hi Aarav/);
    cleanup(); sessionStorage.setItem('shabd.mock', '1');
    open('/j/K7Q2MX');
    fireEvent.click(await screen.findByText('Sai')); pin('1234'); await screen.findByText('Listen and spell');
    expect(getProfiles()).toHaveLength(2);
    cleanup(); sessionStorage.clear(); _resetChosenForTests(); sessionStorage.setItem('shabd.mock', '1');
    open('/');
    expect(await screen.findByText(/Who's playing/)).toBeTruthy();
  });
});
