import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, makeClass, registerTeacher, setup, studentLogin, type Ctx } from './helpers.ts';

let ctx: Ctx;
let teacher: string;
beforeEach(async () => {
  ctx = await setup();
  teacher = await registerTeacher(ctx.app);
});

/** Minimal RFC 4180 parser for assertions. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const ts = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

describe('CSV export', () => {
  it('has a BOM, a header row, CRLF, quoting and a download filename for every type', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['=cmd', 'Aarav, "Jr"']);
    const tok = await studentLogin(ctx.app, cls, students[0]!);
    const today = (await request(ctx.app).post('/api/student/sessions/today').set(auth(tok)).send({})).body;
    const w = today.words[0];
    const sid = today.session.id;
    await request(ctx.app).post(`/api/student/sessions/${sid}/attempts`).set(auth(tok)).send({
      spell: [{ clientId: uuid(), wordId: w.id, attemptNo: 1, input: 'kichen', hints: ['first_letter'], audioPlays: 2, msElapsed: 900, clientTs: ts() }],
    });
    const text = 'The kitchen, said "Aai", is big.';
    await request(ctx.app).post(`/api/student/sessions/${sid}/sentences`).set(auth(tok))
      .send({ clientId: uuid(), wordId: w.id, submissionNo: 1, text, starterHintUsed: false, msElapsed: 5, clientTs: ts() });
    await request(ctx.app).post(`/api/student/sessions/${sid}/complete`).set(auth(tok)).send({});

    const get = (type: string, id = cls.id) => request(ctx.app).get(`/api/classes/${id}/export.csv?type=${type}`).set(auth(teacher)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

    const att = await get('attempts');
    expect(att.status).toBe(200);
    expect(att.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(att.headers['content-disposition']).toBe('attachment; filename="5A-attempts-2026-11-20.csv"');
    const raw = (att.body as Buffer);
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const rows = parseCsv(raw.toString('utf8').slice(1));
    expect(rows[0]).toEqual(['date', 'roll_no', 'first_name', 'word', 'stage', 'attempt_no', 'input_text', 'is_correct', 'primary_error', 'error_tags', 'hints', 'audio_plays', 'ms_elapsed', 'client_ts']);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.slice(0, 8)).toEqual(['2026-11-20', '1', "'=cmd", 'kitchen', 'spell', '1', 'kichen', '0']); // formula guard
    expect(rows[1]![10]).toBe('first_letter');
    expect(raw.toString('utf8')).toContain('\r\n');

    const sent = parseCsv(((await get('sentences')).body as Buffer).toString('utf8').slice(1));
    expect(sent[0]).toEqual(['date', 'roll_no', 'first_name', 'word', 'submission_no', 'text', 'gate', 'counted', 'r_use', 'r_grammar', 'r_relevance', 'r_length', 'raw_total', 'final_marks', 'error_codes', 'evaluator', 'confidence', 'tip']);
    expect(sent[1]![5]).toBe(text); // commas and quotes survive a round trip
    expect(sent[1]![6]).toBe('ok');

    const daily = parseCsv(((await get('daily')).body as Buffer).toString('utf8').slice(1));
    expect(daily[0]).toEqual(['date', 'roll_no', 'first_name', 'word_position', 'word', 'spelling', 'meaning', 'sentence', 'total', 'stars', 'spell_first_try']);
    expect(daily).toHaveLength(6); // 5 words scored at completion

    const studs = parseCsv(((await get('students')).body as Buffer).toString('utf8').slice(1));
    expect(studs[0]).toEqual(['roll_no', 'first_name', 'sessions_completed', 'xp_total', 'streak_current', 'streak_best', 'spelling_strength', 'sentence_strength', 'top_spelling_error', 'top_sentence_error', 'weakness_labels']);
    expect(studs).toHaveLength(3);
    expect(studs[2]![1]).toBe('Aarav, "Jr"');
    expect(studs[1]![2]).toBe('1');

    expect((await get('bogus')).status).toBe(400);
    expect((await request(ctx.app).get(`/api/classes/${cls.id}/export.csv`).set(auth(teacher))).status).toBe(400);
    expect((await request(ctx.app).get(`/api/classes/${cls.id}/export.csv?type=students`)).status).toBe(401);
  });

  it('exports header-only CSVs for an empty class', async () => {
    const { cls } = await makeClass(ctx.app, teacher, ['Riya']);
    const r = await request(ctx.app).get(`/api/classes/${cls.id}/export.csv?type=attempts`).set(auth(teacher));
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('weakness labels and hardest words', () => {
  /** Insert a finished-looking session with n wrong spell attempts of the given primary code (direct SQL: no need to play). */
  async function seedWrong(studentId: number, classId: number, date: string, code: string, n: number, wordIds = ['d001-1']) {
    const ins = await ctx.db.run(
      'INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, scoring_version) VALUES (?, ?, ?, 1, ?, ?) RETURNING id',
      [studentId, classId, date, JSON.stringify(wordIds), 'mvp-1.0'],
    );
    const sid = Number(ins.rows[0]!.id);
    for (let i = 0; i < n; i++) {
      await ctx.db.run(
        `INSERT INTO word_attempts (client_id, session_id, student_id, word_id, stage, attempt_no, input_text, is_correct, error_tags_json, primary_error, client_ts)
         VALUES (?, ?, ?, ?, 'spell', 1, 'x', 0, ?, ?, ?)`,
        [crypto.randomUUID(), sid, studentId, wordIds[i % wordIds.length], JSON.stringify([code]), code, ts()],
      );
    }
  }

  it('labels a student with >= 10 events at >= 1.5x the class rate, at most 2 labels', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya', 'Aarav', 'Kabir', 'Sai']);
    await seedWrong(students[0]!.id, cls.id, '2026-11-18', 'SP_SILENT', 11);
    await seedWrong(students[0]!.id, cls.id, '2026-11-19', 'SP_VOWEL', 1);
    for (const s of students.slice(1)) await seedWrong(s.id, cls.id, '2026-11-18', 'SP_VOWEL', 10);

    const an = (await request(ctx.app).get(`/api/classes/${cls.id}/analytics`).set(auth(teacher))).body;
    const by = (name: string) => an.students.find((s: { firstName: string }) => s.firstName === name);
    expect(by('Riya').weaknessLabels).toEqual(['Needs support: Silent letters']);
    expect(by('Riya').spellingErrorCounts).toEqual({ SP_SILENT: 11, SP_VOWEL: 1 });
    expect(by('Aarav').weaknessLabels).toEqual([]);
    expect(an.classSpellingRates.SP_SILENT).toBeCloseTo(11 / 42, 5);
    expect(an.classSpellingRates.SP_VOWEL).toBeCloseTo(31 / 42, 5);

    // fewer than 10 events -> no label even at a high ratio
    const t2 = await registerTeacher(ctx.app, 'other@x.in');
    const c2 = await makeClass(ctx.app, t2, ['A', 'B']);
    await seedWrong(c2.students[0]!.id, c2.cls.id, '2026-11-18', 'SP_SILENT', 9);
    await seedWrong(c2.students[1]!.id, c2.cls.id, '2026-11-18', 'SP_VOWEL', 30);
    const an2 = (await request(ctx.app).get(`/api/classes/${c2.cls.id}/analytics`).set(auth(t2))).body;
    expect(an2.students[0].weaknessLabels).toEqual([]);

    const detail = (await request(ctx.app).get(`/api/students/${students[0]!.id}/analytics`).set(auth(teacher))).body;
    expect(detail.profile.weaknessLabels).toEqual(['Needs support: Silent letters']);
    expect(detail.spellingErrors).toHaveLength(12);
  });

  it('lists hardest words (>= 3 students, lowest first-attempt accuracy first)', async () => {
    const { cls, students } = await makeClass(ctx.app, teacher, ['Riya', 'Aarav', 'Kabir', 'Sai']);
    // d001-1: 3 students all wrong at attempt 1 (accuracy 0); d001-2: 4 students, 2 right (0.5); d001-3: only 2 students (excluded)
    for (const s of students.slice(0, 3)) await seedWrong(s.id, cls.id, '2026-11-18', 'SP_OMISSION', 1, ['d001-1']);
    for (const [i, s] of students.entries()) {
      const ins = await ctx.db.run(
        'INSERT INTO sessions (student_id, class_id, date, day_index, word_ids_json, scoring_version) VALUES (?, ?, ?, 1, ?, ?) RETURNING id',
        [s.id, cls.id, '2026-11-19', '["d001-2"]', 'mvp-1.0'],
      );
      await ctx.db.run(
        `INSERT INTO word_attempts (client_id, session_id, student_id, word_id, stage, attempt_no, input_text, is_correct, primary_error, client_ts)
         VALUES (?, ?, ?, 'd001-2', 'spell', 1, 'x', ?, ?, ?)`,
        [crypto.randomUUID(), Number(ins.rows[0]!.id), s.id, i < 2 ? 1 : 0, i < 2 ? 'SP_CORRECT' : 'SP_OMISSION', ts()],
      );
    }
    for (const s of students.slice(0, 2)) await seedWrong(s.id, cls.id, '2026-11-17', 'SP_OMISSION', 1, ['d001-3']);
    const an = (await request(ctx.app).get(`/api/classes/${cls.id}/analytics`).set(auth(teacher))).body;
    expect(an.hardestWords).toEqual([
      { wordId: 'd001-1', word: 'kitchen', attempts: 3, firstAttemptAccuracy: 0 },
      { wordId: 'd001-2', word: 'wash', attempts: 4, firstAttemptAccuracy: 0.5 },
    ]);
  });
});
