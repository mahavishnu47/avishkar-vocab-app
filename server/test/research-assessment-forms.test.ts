import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acceptedForms } from '@shabd/core';
import { getForm, itemsForStudent, printableForm } from '../src/services/research/assessment.ts';

const A = getForm('A');
const B = getForm('B');
const bank = readdirSync(new URL('../../content/words/', import.meta.url))
  .filter((f) => f.startsWith('part-'))
  .flatMap((f) => JSON.parse(readFileSync(new URL(`../../content/words/${f}`, import.meta.url), 'utf8')) as { id: string; dayIndex: number; word: string; partOfSpeech: string; difficulty: number; meaning: string }[]);
const byId = new Map(bank.map((w) => [w.id, w]));

describe('assessment forms', () => {
  it('have 10 + 10 + 5 items with the specified POS mix in section B', () => {
    for (const f of [A, B]) {
      expect(f.sectionA).toHaveLength(10);
      expect(f.sectionB).toHaveLength(10);
      expect(f.sectionC).toHaveLength(5);
      const mix = (k: string) => f.sectionB.filter((i) => i.answer === k).length;
      expect([mix('noun'), mix('verb'), mix('adjective'), mix('adverb')]).toEqual([3, 3, 2, 2]);
    }
  });

  it('use different words in form A and form B', () => {
    const words = (f: typeof A) => [...f.sectionA, ...f.sectionB, ...f.sectionC].map((i) => i.word);
    const wa = words(A), wb = words(B);
    expect(new Set(wa).size).toBe(wa.length); // no word twice within a form
    expect(new Set(wb).size).toBe(wb.length);
    expect(wa.filter((w) => wb.includes(w))).toEqual([]);
  });

  it('match item for item on part of speech and difficulty, and come from the real bank', () => {
    for (const sec of ['sectionA', 'sectionB', 'sectionC'] as const) {
      A[sec].forEach((a, i) => {
        const b = B[sec][i]!;
        const wa = byId.get(a.wordId)!, wb = byId.get(b.wordId)!;
        expect(wa, a.wordId).toBeTruthy();
        expect(wb, b.wordId).toBeTruthy();
        expect(wa.word).toBe(a.word);
        expect(wa.partOfSpeech, `${sec}[${i}] ${a.word}/${b.word}`).toBe(wb.partOfSpeech);
        expect(wa.difficulty, `${sec}[${i}] ${a.word}/${b.word}`).toBe(wb.difficulty);
      });
    }
  });

  it('draw words from bank days 1-20 or bank adverbs; Section A answers match the bank meaning', () => {
    for (const f of [A, B]) {
      for (const i of [...f.sectionA, ...f.sectionB, ...f.sectionC]) {
        const w = byId.get(i.wordId)!;
        expect(w.dayIndex <= 20 || w.partOfSpeech === 'adverb').toBe(true);
      }
      for (const i of f.sectionA) {
        expect(i.correct).toBe(byId.get(i.wordId)!.meaning);
        expect(new Set([i.correct, ...i.distractors]).size).toBe(4);
      }
    }
  });

  it('section B sentences contain the underlined word form', () => {
    for (const f of [A, B]) {
      for (const i of f.sectionB) {
        const forms = acceptedForms(i.word);
        expect(forms).toContain(i.target.toLowerCase());
        expect(i.sentence).toContain(i.target);
      }
    }
  });

  it('student items never carry answers and are stable per seed', () => {
    const items = itemsForStudent(A, 12345);
    expect(items).toHaveLength(25);
    expect(JSON.stringify(items)).not.toMatch(/"(correct|answer|distractors|pos|meaning)"/);
    expect(itemsForStudent(A, 12345)).toEqual(items);
    expect(itemsForStudent(A, 999).map((i) => i.id)).not.toEqual(items.map((i) => i.id));
    expect(items.slice(0, 10).every((i) => i.section === 'A')).toBe(true);
  });

  it('printable form includes the key and the marking scheme', () => {
    const p = printableForm(A);
    expect(p.sectionA[0]!.options).toContain(p.sectionA[0]!.answer);
    expect(p.scheme.length).toBeGreaterThan(2);
  });
});
