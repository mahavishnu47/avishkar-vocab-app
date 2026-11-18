import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, makeClass, registerTeacher, setup, type Ctx } from './helpers.ts';
import { loadWordBank } from '../src/db/seed.ts';
import { getDailySet } from '../src/services/dailySet.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ctx: Ctx;
beforeEach(async () => { ctx = await setup(); });

describe('daily words', () => {
  it('auto set -> teacher override -> reset', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya'], '2026-11-19'); // 2026-11-20 is day 2
    const get = (date?: string) => request(ctx.app).get(`/api/classes/${cls.id}/daily-words${date ? `?date=${date}` : ''}`).set(auth(t));

    const auto = await get();
    expect(auto.status).toBe(200);
    expect(auto.body).toMatchObject({ classId: cls.id, date: '2026-11-20', dayIndex: 2, source: 'auto' });
    expect(auto.body.words.map((w: { id: string }) => w.id)).toEqual(['d002-1', 'd002-2', 'd002-3', 'd002-4', 'd002-5']);
    expect(auto.body.words[0]).toMatchObject({ word: 'school', source: 'bank', dayIndex: 2 });
    expect((await get('2026-11-19')).body.dayIndex).toBe(1);
    expect((await get('2026-11-18')).body.dayIndex).toBe(366); // before startDate wraps to 366

    const ids = ['d005-1', 'd001-2', 'd010-5', 'd003-3', 'd004-4'];
    const put = await request(ctx.app).put(`/api/classes/${cls.id}/daily-words/2026-11-20`).set(auth(t)).send({ wordIds: ids });
    expect(put.status).toBe(200);
    expect(put.body.source).toBe('teacher');
    expect(put.body.words.map((w: { id: string }) => w.id)).toEqual(ids);
    expect((await get()).body.source).toBe('teacher');
    expect((await get('2026-11-21')).body.source).toBe('auto'); // other dates unaffected

    // replace again
    const ids2 = [...ids].reverse();
    expect((await request(ctx.app).put(`/api/classes/${cls.id}/daily-words/2026-11-20`).set(auth(t)).send({ wordIds: ids2 })).body.words[0].id).toBe('d004-4');

    const del = await request(ctx.app).delete(`/api/classes/${cls.id}/daily-words/2026-11-20`).set(auth(t));
    expect(del.status).toBe(200);
    expect(del.body.source).toBe('auto');
    expect(del.body.words[0].id).toBe('d002-1');
  });

  it('validates PUT bodies and supports custom words in a set', async () => {
    const t = await registerTeacher(ctx.app);
    const { cls } = await makeClass(ctx.app, t, ['Riya']);
    const put = (wordIds: unknown, date = '2026-11-20') => request(ctx.app).put(`/api/classes/${cls.id}/daily-words/${date}`).set(auth(t)).send({ wordIds });
    expect((await put(['d001-1', 'd001-2'])).status).toBe(400);
    expect((await put(['d001-1', 'd001-1', 'd001-2', 'd001-3', 'd001-4'])).status).toBe(400);
    expect((await put(['d001-1', 'd001-2', 'd001-3', 'd001-4', 'nope'])).status).toBe(400);
    expect((await put(['d001-1', 'd001-2', 'd001-3', 'd001-4', 'd001-5'], 'tomorrow')).status).toBe(400);

    const custom = await request(ctx.app).post('/api/words').set(auth(t)).send({
      word: 'monsoon', partOfSpeech: 'noun', difficulty: 2, meaning: 'the rainy season in India',
      meaningMarathi: 'मान्सून', exampleSentence: 'The monsoon arrives in June.', distractorMeanings: ['the hot dry season', 'a festival of lights'],
      syllables: ['mon', 'soon'], tags: ['weather-seasons'], contextWords: ['rain', 'june', 'farmer'],
    });
    expect(custom.status).toBe(201);
    expect(custom.body).toMatchObject({ id: 'c-1', source: 'teacher', dayIndex: null, word: 'monsoon' });
    const mixed = await put(['c-1', 'd001-2', 'd001-3', 'd001-4', 'd001-5']);
    expect(mixed.status).toBe(200);
    expect(mixed.body.words[0].source).toBe('teacher');
  });
});

describe('word bank', () => {
  it('searches by prefix before substring, filters and paginates', async () => {
    const t = await registerTeacher(ctx.app);
    const g = (qs: string) => request(ctx.app).get(`/api/words?${qs}`).set(auth(t));
    const all = await g('');
    expect(all.body.total).toBe(50);
    expect(all.body.items).toHaveLength(50);
    expect((await g('limit=5&offset=48')).body.items).toHaveLength(2);
    expect((await g('limit=500')).status).toBe(400);

    const r = await g('q=ri'); // river, ripe (prefix) before riya-containing meanings / substrings e.g. 'bridge', 'friend'
    const words = r.body.items.map((w: { word: string }) => w.word);
    expect(words.slice(0, 2).sort()).toEqual(['ripe', 'river']);
    expect(words).toContain('bridge');
    expect(words.indexOf('bridge')).toBeGreaterThan(1);

    expect((await g('q=school')).body.items[0].word).toBe('school');
    expect((await g('dayIndex=3')).body.total).toBe(5);
    expect((await g('difficulty=3')).body.items.every((w: { difficulty: number }) => w.difficulty === 3)).toBe(true);
    expect((await g('partOfSpeech=verb&dayIndex=1')).body.items.map((w: { word: string }) => w.word)).toEqual(['wash']);
    expect((await g('tag=weather-seasons')).body.total).toBeGreaterThanOrEqual(5);
    expect((await g('q=zzzzqq')).body.total).toBe(0);
    expect((await g('partOfSpeech=bogus')).status).toBe(400);
    expect((await g('q=100%25')).body.total).toBe(0); // % is not a wildcard
  });

  it('validates custom words', async () => {
    const t = await registerTeacher(ctx.app);
    const good = {
      word: 'monsoon', partOfSpeech: 'noun', difficulty: 2, meaning: 'the rainy season in India',
      exampleSentence: 'The monsoon arrives in June.', distractorMeanings: ['the hot dry season', 'a festival of lights'], contextWords: ['rain', 'june', 'farmer'],
    };
    const post = (over: object) => request(ctx.app).post('/api/words').set(auth(t)).send({ ...good, ...over });
    expect((await post({})).status).toBe(201); // optional fields may be missing
    expect((await post({ word: 'Mon' })).status).toBe(201); // lower-cased
    expect((await post({ word: 'mo' })).status).toBe(400);
    expect((await post({ word: 'two words' })).status).toBe(400);
    expect((await post({ partOfSpeech: 'thing' })).status).toBe(400);
    expect((await post({ difficulty: 4 })).status).toBe(400);
    expect((await post({ meaning: 'rain' })).status).toBe(400);
    expect((await post({ meaning: 'the monsoon season of rain' })).status).toBe(400);
    expect((await post({ exampleSentence: 'It rains in June.' })).status).toBe(400);
    expect((await post({ distractorMeanings: ['same one', 'same one'] })).status).toBe(400);
    expect((await post({ distractorMeanings: ['only one'] })).status).toBe(400);
    expect((await post({ contextWords: ['a', 'b'] })).status).toBe(400);
    expect((await post({ syllables: ['mon', 'son'] })).status).toBe(400);
    const second = await post({ word: 'rainy', meaning: 'the season of heavy water falls', exampleSentence: 'A rainy day is nice.' });
    expect(second.body.id).toBe('c-3');
  });
});

describe('word bank loading', () => {
  it('loads part files, skips _files and bad entries, is idempotent, and only falls back to the fixture when empty', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bank-'));
    const entry = (id: string, day: number, word: string) => ({
      id, dayIndex: day, word, partOfSpeech: 'noun', difficulty: 1, meaning: 'a thing here', meaningMarathi: 'x',
      exampleSentence: `The ${word} is here today.`, distractorMeanings: ['one thing', 'two thing'], syllables: [word], tags: ['home'], contextWords: ['a', 'b', 'c'],
    });
    writeFileSync(join(dir, 'part-01.json'), JSON.stringify([entry('d001-1', 1, 'apple'), entry('bad', 1, 'x'), entry('d001-2', 1, 'mango')]));
    writeFileSync(join(dir, 'part-02.json'), '{ not json');
    writeFileSync(join(dir, '_example.json'), JSON.stringify([entry('d300-1', 300, 'ghost')]));
    const { db } = ctx;
    await db.exec('DELETE FROM words');
    expect(await loadWordBank(db, dir)).toBe(2);
    expect(await loadWordBank(db, dir)).toBe(2);
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM words'))!.n).toBe(2);
    await expect(getDailySet(db, 1, '2026-11-20')).rejects.toThrow(); // no class, and fewer than 5 words
  });
});
