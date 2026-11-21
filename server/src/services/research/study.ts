/**
 * F1 study service: studies, classes, anonymous study codes (S01../C01..), per-student consent, withdrawal.
 * Study codes are the only research identifier; names never leave the teacher UI. Spec: docs/RESEARCH_FEATURES.md F1.
 */
import type { ClassStudy, ConsentCounts, ConsentStatus, Study, StudyClassInfo, StudyGroup, StudyParticipant, StudyStatus } from '@shabd/core';
import { formatStudyCode, isAnalysable } from '@shabd/core';
import type { TeacherAuth } from '../../auth.ts';
import { getDb, type Queryable, type Row } from '../../db/db.ts';
import { HttpError, notFound } from '../../http.ts';
import { assertCanAccessClass } from '../../tenancy.ts';
import { audit } from '../audit.ts';

const isAdmin = (a: TeacherAuth) => a.staffRole === 'school_admin';

/**
 * Tables holding research rows keyed by student_id (F4 assessments, F6 recall, F9 instruments ...). Deleting from a
 * table that does not exist yet is skipped, so withdrawal works before those features are merged. Later features
 * add their own tables with registerResearchTable() or by appending here.
 */
export const RESEARCH_STUDENT_TABLES: string[] = [
  'assessment_responses', 'assessment_attempts', 'assessment_sessions', 'assessment_events',
  'recall_attempts', 'research_observations', 'observations', 'instrument_responses', 'feedback_responses',
  'authenticity_flags', 'keystroke_stats',
];
export function registerResearchTable(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`bad table name ${name}`);
  if (!RESEARCH_STUDENT_TABLES.includes(name)) RESEARCH_STUDENT_TABLES.push(name);
}

// ---------- visibility ----------

/** A study is visible to its creator, to a staff member owning one of its classes, and to the school admin of its school. */
const VISIBLE_SQL = `s.school_id = ? AND (? OR s.created_by = ? OR EXISTS (
  SELECT 1 FROM study_classes sc JOIN classes c ON c.id = sc.class_id WHERE sc.study_id = s.id AND c.teacher_id = ?))`;
const visibleParams = (a: TeacherAuth) => [a.schoolId, isAdmin(a), a.teacherId, a.teacherId];

export async function assertStudyVisible(q: Queryable, a: TeacherAuth, studyId: number): Promise<Row> {
  const row = await q.get(`SELECT s.* FROM studies s WHERE s.id = ? AND ${VISIBLE_SQL}`, [studyId, ...visibleParams(a)]);
  if (!row) throw notFound('Study not found');
  return row;
}

/** Classes of the study the caller may see (admin: all; teacher: own). */
async function visibleClasses(q: Queryable, a: TeacherAuth, studyId: number): Promise<StudyClassInfo[]> {
  const rows = await q.all<{ class_id: number; name: string; grp: StudyGroup; n: number }>(
    `SELECT sc.class_id, c.name, sc.grp, (SELECT count(*) FROM students st WHERE st.class_id = c.id AND st.active = 1) AS n
       FROM study_classes sc JOIN classes c ON c.id = sc.class_id
      WHERE sc.study_id = ? AND (? OR c.teacher_id = ?) ORDER BY sc.class_id`,
    [studyId, isAdmin(a), a.teacherId],
  );
  return rows.map((r) => ({ classId: r.class_id, className: r.name, group: r.grp, studentCount: Number(r.n) }));
}

async function consentCounts(q: Queryable, a: TeacherAuth, studyId: number): Promise<ConsentCounts> {
  const r = (await q.get<Record<string, number>>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE p.consent = 'pending') AS pending,
            count(*) FILTER (WHERE p.consent = 'given') AS given,
            count(*) FILTER (WHERE p.consent = 'declined') AS declined,
            count(*) FILTER (WHERE p.consent = 'withdrawn') AS withdrawn,
            count(*) FILTER (WHERE p.excluded = 1) AS excluded,
            count(*) FILTER (WHERE p.consent = 'given' AND p.excluded = 0) AS analysable
       FROM study_participants p JOIN students st ON st.id = p.student_id JOIN classes c ON c.id = st.class_id
      WHERE p.study_id = ? AND (? OR c.teacher_id = ?)`,
    [studyId, isAdmin(a), a.teacherId],
  ))!;
  const n = (k: string) => Number(r[k] ?? 0);
  return { total: n('total'), pending: n('pending'), given: n('given'), declined: n('declined'), withdrawn: n('withdrawn'), excluded: n('excluded'), analysable: n('analysable') };
}

async function toStudy(q: Queryable, a: TeacherAuth, row: Row): Promise<Study> {
  const id = row.id as number;
  return {
    id,
    name: row.name as string,
    startDate: row.start_date as string,
    schoolDays: row.school_days as number,
    wordsPerDay: row.words_per_day as number,
    status: row.status as StudyStatus,
    createdAt: row.created_at as string,
    classes: await visibleClasses(q, a, id),
    consent: await consentCounts(q, a, id),
  };
}

export async function listStudies(a: TeacherAuth): Promise<Study[]> {
  const q = getDb();
  const rows = await q.all(`SELECT s.* FROM studies s WHERE ${VISIBLE_SQL} ORDER BY s.id DESC`, visibleParams(a));
  const out: Study[] = [];
  for (const r of rows) out.push(await toStudy(q, a, r));
  return out;
}

export async function getStudy(a: TeacherAuth, studyId: number): Promise<Study> {
  const q = getDb();
  return toStudy(q, a, await assertStudyVisible(q, a, studyId));
}

// ---------- codes ----------

/**
 * Gives every active student of every attached class a code, in roll order within each class. Append-only: a student
 * who already has a code keeps it; new students get the next number of their group. Counters live on the study row,
 * so a number is never reused, not even after a student is deleted. Returns the number of new codes.
 */
export async function assignCodes(db: Queryable, studyId: number): Promise<number> {
  return db.tx(async (q) => {
    const study = await q.get<{ next_s_seq: number; next_c_seq: number }>('SELECT next_s_seq, next_c_seq FROM studies WHERE id = ? FOR UPDATE', [studyId]);
    if (!study) return 0;
    let nextS = study.next_s_seq;
    let nextC = study.next_c_seq;
    const fresh = await q.all<{ id: number; grp: StudyGroup }>(
      `SELECT st.id, sc.grp FROM study_classes sc JOIN students st ON st.class_id = sc.class_id
        WHERE sc.study_id = ? AND st.active = 1
          AND NOT EXISTS (SELECT 1 FROM study_participants p WHERE p.study_id = sc.study_id AND p.student_id = st.id)
        ORDER BY sc.class_id, st.roll_no, st.id`,
      [studyId],
    );
    for (const s of fresh) {
      const code = s.grp === 'intervention' ? formatStudyCode('intervention', nextS++) : formatStudyCode('comparison', nextC++);
      await q.run('INSERT INTO study_participants (study_id, student_id, study_code) VALUES (?, ?, ?)', [studyId, s.id, code]);
    }
    if (fresh.length) await q.run('UPDATE studies SET next_s_seq = ?, next_c_seq = ? WHERE id = ?', [nextS, nextC, studyId]);
    return fresh.length;
  });
}

// ---------- studies and classes ----------

export interface NewStudy { name: string; startDate: string; schoolDays: number; wordsPerDay: number; classes: { classId: number; group: StudyGroup }[] }

async function assertClassFree(q: Queryable, classId: number, exceptStudyId: number | null): Promise<void> {
  const clash = await q.get(
    `SELECT s.id FROM study_classes sc JOIN studies s ON s.id = sc.study_id
      WHERE sc.class_id = ? AND s.status <> 'closed' AND s.id <> ?`,
    [classId, exceptStudyId ?? 0],
  );
  if (clash) throw new HttpError(409, 'conflict', 'This class is already in another study that has not closed');
}

export async function createStudy(a: TeacherAuth, input: NewStudy): Promise<Study> {
  const db = getDb();
  const seen = new Set<number>();
  for (const c of input.classes) {
    if (seen.has(c.classId)) throw new HttpError(400, 'bad_request', 'A class can only be listed once');
    seen.add(c.classId);
    const cls = await assertCanAccessClass(a, c.classId);
    if ((cls.school_id as number) !== a.schoolId) throw notFound('Class not found');
    await assertClassFree(db, c.classId, null);
  }
  const id = await db.tx(async (q) => {
    const ins = await q.run(
      'INSERT INTO studies (school_id, name, start_date, school_days, words_per_day, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [a.schoolId, input.name, input.startDate, input.schoolDays, input.wordsPerDay, a.teacherId],
    );
    const studyId = Number(ins.rows[0]!.id);
    for (const c of input.classes) await q.run('INSERT INTO study_classes (study_id, class_id, grp) VALUES (?, ?, ?)', [studyId, c.classId, c.group]);
    await assignCodes(q, studyId);
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'study.create', meta: { studyId, classes: input.classes.length } });
    return studyId;
  });
  return getStudy(a, id);
}

export interface StudyPatch { name?: string; startDate?: string; schoolDays?: number; wordsPerDay?: number; status?: StudyStatus }

export async function updateStudy(a: TeacherAuth, studyId: number, patch: StudyPatch): Promise<Study> {
  const db = getDb();
  const row = await assertStudyVisible(db, a, studyId);
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); params.push(v); };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.startDate !== undefined) set('start_date', patch.startDate);
  if (patch.schoolDays !== undefined) set('school_days', patch.schoolDays);
  if (patch.wordsPerDay !== undefined) set('words_per_day', patch.wordsPerDay);
  if (patch.status !== undefined) set('status', patch.status);
  if (sets.length) {
    await db.tx(async (q) => {
      // reopening a closed study must not put a class into two live studies
      if (patch.status && patch.status !== 'closed' && row.status === 'closed') {
        const cls = await q.all<{ class_id: number }>('SELECT class_id FROM study_classes WHERE study_id = ?', [studyId]);
        for (const c of cls) await assertClassFree(q, c.class_id, studyId);
      }
      await q.run(`UPDATE studies SET ${sets.join(', ')} WHERE id = ?`, [...params, studyId]);
      await audit(q, {
        schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'study.update',
        meta: { studyId, fields: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined).join(',') },
      });
    });
  }
  return getStudy(a, studyId);
}

export async function attachClass(a: TeacherAuth, studyId: number, classId: number, group: StudyGroup): Promise<Study> {
  const db = getDb();
  const study = await assertStudyVisible(db, a, studyId);
  await assertCanAccessClass(a, classId);
  if (study.status === 'closed') throw new HttpError(409, 'conflict', 'This study is closed');
  await assertClassFree(db, classId, studyId);
  const existing = await db.get<{ grp: StudyGroup }>('SELECT grp FROM study_classes WHERE study_id = ? AND class_id = ?', [studyId, classId]);
  if (existing && existing.grp !== group) {
    const coded = await db.get(
      'SELECT 1 FROM study_participants p JOIN students st ON st.id = p.student_id WHERE p.study_id = ? AND st.class_id = ?', [studyId, classId]);
    if (coded) throw new HttpError(409, 'conflict', 'Codes are already given out, so the group cannot change');
  }
  await db.tx(async (q) => {
    await q.run(
      'INSERT INTO study_classes (study_id, class_id, grp) VALUES (?, ?, ?) ON CONFLICT (study_id, class_id) DO UPDATE SET grp = excluded.grp',
      [studyId, classId, group],
    );
    await assignCodes(q, studyId);
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'study.update', targetType: 'class', targetId: classId, meta: { studyId, attach: group } });
  });
  return getStudy(a, studyId);
}

export async function detachClass(a: TeacherAuth, studyId: number, classId: number): Promise<Study> {
  const db = getDb();
  const study = await assertStudyVisible(db, a, studyId);
  await assertCanAccessClass(a, classId);
  const link = await db.get('SELECT 1 FROM study_classes WHERE study_id = ? AND class_id = ?', [studyId, classId]);
  if (!link) throw notFound('That class is not in this study');
  if (study.status !== 'setup') throw new HttpError(409, 'conflict', 'A class can only be removed while the study is in setup');
  await db.tx(async (q) => {
    await q.run('DELETE FROM study_participants WHERE study_id = ? AND student_id IN (SELECT id FROM students WHERE class_id = ?)', [studyId, classId]);
    await q.run('DELETE FROM study_classes WHERE study_id = ? AND class_id = ?', [studyId, classId]);
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'study.update', targetType: 'class', targetId: classId, meta: { studyId, detach: true } });
  });
  return getStudy(a, studyId);
}

// ---------- participants ----------

const PARTICIPANT_SQL = `SELECT p.student_id, p.study_code, p.consent, p.excluded, p.consent_updated_at, sc.grp,
       st.class_id, c.name AS class_name, st.roll_no, st.first_name
  FROM study_participants p
  JOIN students st ON st.id = p.student_id
  JOIN classes c ON c.id = st.class_id
  JOIN study_classes sc ON sc.study_id = p.study_id AND sc.class_id = st.class_id`;

function participantOf(r: Row): StudyParticipant {
  const consent = r.consent as ConsentStatus;
  const excluded = Number(r.excluded) === 1;
  return {
    studentId: r.student_id as number,
    studyCode: r.study_code as string,
    group: r.grp as StudyGroup,
    classId: r.class_id as number,
    className: r.class_name as string,
    rollNo: r.roll_no as number,
    firstName: r.first_name as string,
    consent,
    excluded,
    analysable: isAnalysable({ consent, excluded }),
    consentUpdatedAt: (r.consent_updated_at as string | null) ?? null,
  };
}

/** Participants the caller may see (admin: whole school study; teacher: own classes). Hands out codes to new students first. */
export async function listParticipants(a: TeacherAuth, studyId: number): Promise<StudyParticipant[]> {
  const db = getDb();
  const study = await assertStudyVisible(db, a, studyId);
  if (study.status !== 'closed') await assignCodes(db, studyId);
  const rows = await db.all(
    `${PARTICIPANT_SQL} WHERE p.study_id = ? AND (? OR c.teacher_id = ?) ORDER BY sc.grp DESC, st.class_id, st.roll_no`,
    [studyId, isAdmin(a), a.teacherId],
  );
  return rows.map(participantOf);
}

async function loadParticipant(q: Queryable, a: TeacherAuth, studyId: number, studentId: number): Promise<StudyParticipant> {
  await assertStudyVisible(q, a, studyId);
  const row = await q.get(
    `${PARTICIPANT_SQL} WHERE p.study_id = ? AND p.student_id = ? AND (? OR c.teacher_id = ?)`,
    [studyId, studentId, isAdmin(a), a.teacherId],
  );
  if (!row) throw notFound('Student not found in this study');
  return participantOf(row);
}

export async function updateParticipant(a: TeacherAuth, studyId: number, studentId: number, patch: { consent?: ConsentStatus; excluded?: boolean }): Promise<StudyParticipant> {
  const db = getDb();
  await loadParticipant(db, a, studyId, studentId);
  await db.tx(async (q) => {
    await q.run(
      `UPDATE study_participants SET consent = COALESCE(?, consent), excluded = COALESCE(?, excluded),
              consent_updated_at = iso_now(), consent_updated_by = ? WHERE study_id = ? AND student_id = ?`,
      [patch.consent ?? null, patch.excluded === undefined ? null : patch.excluded ? 1 : 0, a.teacherId, studyId, studentId],
    );
    await audit(q, {
      schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'study.consent', targetType: 'student', targetId: studentId,
      meta: { studyId, ...(patch.consent !== undefined ? { consent: patch.consent } : {}), ...(patch.excluded !== undefined ? { excluded: patch.excluded } : {}) },
    });
  });
  return loadParticipant(db, a, studyId, studentId);
}

/**
 * Deletes the child's research rows (every registered table that exists) and marks consent "withdrawn". App usage
 * rows (sessions, attempts, sentences) stay because the class needs them. The study code stays reserved.
 */
export async function deleteResearchData(db: Queryable, studentId: number): Promise<number> {
  let deleted = 0;
  for (const table of RESEARCH_STUDENT_TABLES) {
    const exists = await db.get<{ ok: boolean }>('SELECT to_regclass(?) IS NOT NULL AS ok', [`public.${table}`]);
    if (!exists?.ok) continue;
    const hasCol = await db.get(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = 'student_id'`, [table]);
    if (!hasCol) continue;
    deleted += (await db.run(`DELETE FROM "${table}" WHERE student_id = ?`, [studentId])).rowCount;
  }
  return deleted;
}

export async function withdrawParticipant(a: TeacherAuth, studyId: number, studentId: number): Promise<StudyParticipant> {
  const db = getDb();
  await loadParticipant(db, a, studyId, studentId);
  let deleted = 0;
  await db.tx(async (q) => {
    deleted = await deleteResearchData(q, studentId);
    await q.run(
      `UPDATE study_participants SET consent = 'withdrawn', consent_updated_at = iso_now(), consent_updated_by = ? WHERE study_id = ? AND student_id = ?`,
      [a.teacherId, studyId, studentId],
    );
    await audit(q, { schoolId: a.schoolId, actorType: 'teacher', actorId: a.teacherId, action: 'study.withdraw', targetType: 'student', targetId: studentId, meta: { studyId, rowsDeleted: deleted } });
  });
  return loadParticipant(db, a, studyId, studentId);
}

// ---------- for other features ----------

/** The study a class belongs to: the live (setup/running) one, else the most recent closed one, else null. */
export async function getStudyForClass(db: Queryable, classId: number): Promise<ClassStudy | null> {
  const r = await db.get<{ id: number; grp: StudyGroup; start_date: string; school_days: number; status: StudyStatus }>(
    `SELECT s.id, sc.grp, s.start_date, s.school_days, s.status
       FROM study_classes sc JOIN studies s ON s.id = sc.study_id
      WHERE sc.class_id = ? ORDER BY (s.status = 'closed'), s.id DESC LIMIT 1`,
    [classId],
  );
  return r ? { studyId: r.id, group: r.grp, startDate: r.start_date, schoolDays: r.school_days, status: r.status } : null;
}

/** Participant row of a student (study code, consent) in the student's class study, or null. Used by exports and F4/F9. */
export async function getParticipantForStudent(db: Queryable, studentId: number): Promise<{ studyId: number; studyCode: string; group: StudyGroup; analysable: boolean } | null> {
  const r = await db.get<Row>(
    `SELECT p.study_id, p.study_code, p.consent, p.excluded, sc.grp
       FROM study_participants p JOIN students st ON st.id = p.student_id
       JOIN study_classes sc ON sc.study_id = p.study_id AND sc.class_id = st.class_id
       JOIN studies s ON s.id = p.study_id
      WHERE p.student_id = ? ORDER BY (s.status = 'closed'), s.id DESC LIMIT 1`,
    [studentId],
  );
  if (!r) return null;
  return { studyId: r.study_id as number, studyCode: r.study_code as string, group: r.grp as StudyGroup, analysable: isAnalysable({ consent: r.consent as ConsentStatus, excluded: Number(r.excluded) === 1 }) };
}
