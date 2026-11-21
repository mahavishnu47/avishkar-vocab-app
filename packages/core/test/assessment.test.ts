import { describe, expect, it } from 'vitest';
import { finalMarks, markSentenceItem } from '../src/research/assessment.ts';
import type { SentenceWordContext } from '../src/types.ts';

const smoky: SentenceWordContext = {
  word: 'smoky', partOfSpeech: 'adjective', exampleSentence: 'The kitchen became smoky when the wood fire was lit.',
  contextWords: ['smoke', 'fire', 'kitchen', 'wood', 'eyes', 'cough'],
};
const hall: SentenceWordContext = {
  word: 'hall', partOfSpeech: 'noun', exampleSentence: 'The annual day programme was held in the school hall.',
  contextWords: ['school', 'programme', 'stage', 'meeting', 'big', 'chairs'],
};

describe('markSentenceItem (Section C, rules only)', () => {
  it('gives 2 marks for a correct, meaningful sentence using the word', () => {
    const m = markSentenceItem('The smoky kitchen made my eyes water.', smoky);
    expect(m.useMark).toBe(1);
    expect(m.meaningMark).toBe(1);
    expect(m.marks).toBe(2);
    expect(m.detail.gate).toBe('ok');
    expect(m.detail.evaluator).toBe('rules-1');
  });

  it('gives 0 marks and no review flag for a blank answer', () => {
    const m = markSentenceItem('', hall);
    expect(m.marks).toBe(0);
    expect(m.needsReview).toBe(false);
    expect(m.detail.gate).toBe('empty');
  });

  it('gives 0 marks but flags review when the word is missing (non-empty gated answer)', () => {
    const m = markSentenceItem('I went to the big room with my friends.', hall);
    expect(m.marks).toBe(0);
    expect(m.detail.gate).toBe('word_missing');
    expect(m.needsReview).toBe(true);
  });

  it('gives no meaning mark to a copied example sentence and flags it', () => {
    const m = markSentenceItem(hall.exampleSentence, hall);
    expect(m.useMark).toBe(1);
    expect(m.meaningMark).toBe(0);
    expect(m.marks).toBe(1);
    expect(m.detail.errorCodes).toContain('SN_COPIED');
    expect(m.needsReview).toBe(true);
  });

  it('gives no marks for non-English writing', () => {
    const m = markSentenceItem('मला हॉल आवडतो', hall);
    expect(m.marks).toBe(0);
    expect(m.needsReview).toBe(true);
  });

  it('does not give a meaning mark to a sentence without a verb or enough words', () => {
    const m = markSentenceItem('Smoky.', smoky);
    expect(m.meaningMark).toBe(0);
    expect(m.marks).toBeLessThan(2);
  });

  it('is deterministic', () => {
    const t = 'The hall was full of children.';
    expect(markSentenceItem(t, hall)).toEqual(markSentenceItem(t, hall));
  });
});

describe('finalMarks', () => {
  it('override wins over auto, including an override of 0', () => {
    expect(finalMarks(2, 0)).toBe(0);
    expect(finalMarks(1, 2)).toBe(2);
    expect(finalMarks(1, null)).toBe(1);
    expect(finalMarks(null, null)).toBe(0);
  });
});
