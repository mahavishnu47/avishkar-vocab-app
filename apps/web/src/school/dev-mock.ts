/**
 * In-browser mock of the school admin + super admin API (?mock=1). Replaces methods on the shared `api` object.
 * Data lives in memory and resets on reload.
 */
import type { AdminSchoolRow, AuditEntry, ClassSummary, Invite, School, SchoolTeacherRow } from '@shabd/core';
import { ApiRequestError, api, getAdminSecret, getToken } from '../shared/api.ts';
import { todayIst } from './util.ts';

const delay = <T,>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 10));
const fail = (status: number, code: ApiRequestError['code'], msg: string) => new ApiRequestError(status, code, msg);

export function installMock(): void {
  const origin = 'https://shabd.example';
  let school: School = { id: 1, name: 'Zilla Parishad School, Kalwa', district: 'Thane', studentCode: 'DEMSCH', status: 'active' };
  let nextId = 10;
  const mkInvite = (kind: Invite['kind'], code: string): Invite => ({
    id: nextId++, kind, code: `${code.slice(0, 4)}-${code.slice(4)}`,
    url: `${origin}/${kind === 'school_admin' ? 'a' : kind === 'teacher' ? 't' : 'r'}/${code}`,
    expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(), maxUses: null, useCount: 0, revokedAt: null, createdAt: new Date().toISOString(),
  });
  let invite: Invite | null = mkInvite('teacher', 'ABCDEFGH');
  let linkShared = false;
  let teachers: SchoolTeacherRow[] = [
    { id: 1, name: 'Principal Joshi', email: 'demo@school.test', role: 'school_admin', active: true, classCount: 0, lastLoginAt: new Date().toISOString() },
    { id: 2, name: 'Mrs. Patil', email: 'patil@school.test', role: 'teacher', active: true, classCount: 1, lastLoginAt: new Date(Date.now() - 864e5).toISOString() },
    { id: 3, name: 'Mr. Kulkarni', email: 'kulkarni@school.test', role: 'teacher', active: true, classCount: 1, lastLoginAt: null },
  ];
  const cls = (id: number, name: string, teacherId: number, n: number, joined: number, today: number): ClassSummary => ({
    id, teacherId, name, classCode: `DEMO${name}`, startDate: todayIst(), leaderboardMode: 'individual', schoolId: 1, standard: 5, division: name.slice(1),
    academicYear: '2026-27', archived: false, joinEnabled: true, linkSharedAt: null, consentAttestedAt: null,
    studentCount: n, joinedCount: joined, completedToday: today, teacherName: teachers.find((t) => t.id === teacherId)?.name ?? '',
  });
  let classes: ClassSummary[] = [cls(1, '5A', 2, 32, 28, 20), cls(2, '5B', 3, 30, 12, 5)];
  const audit: AuditEntry[] = [
    { id: 2, at: new Date().toISOString(), actorType: 'teacher', actorName: 'Mrs. Patil', action: 'student.reset_pin', targetType: 'student', targetId: 4, targetLabel: 'Riya (5A #4)', meta: {} },
    { id: 1, at: new Date().toISOString(), actorType: 'teacher', actorName: 'Principal Joshi', action: 'teacher.role_change', targetType: 'teacher', targetId: 2, targetLabel: 'Mrs. Patil', meta: {} },
  ];
  const needAuth = (): Promise<never> | null => (getToken('staff') ? null : Promise.reject(fail(401, 'unauthorized', 'Log in')));
  const info = () => ({
    school, studentJoinUrl: `${origin}/s/${school.studentCode}`, teacherInvite: invite,
    checklist: {
      teacherLinkShared: linkShared, firstTeacherJoined: teachers.length > 1, firstClassCreated: classes.length > 0, firstStudentPlayed: classes.some((c) => c.completedToday > 0),
      done: linkShared && teachers.length > 1 && classes.length > 0 && classes.some((c) => c.completedToday > 0),
    },
  });
  const me = () => ({ role: 'teacher' as const, teacher: { id: 1, name: 'Principal Joshi', email: 'demo@school.test', schoolId: 1, role: 'school_admin' as const, active: true }, school: { id: 1, name: school.name } });

  // super admin
  let admin: AdminSchoolRow[] = [{ school: { ...school }, udiseCode: null, teachers: 3, classes: 2, students: 62, createdAt: new Date().toISOString() }];
  const adminGuard = (): Promise<never> | null => (getAdminSecret() === 'test-secret-1234567890' ? null : Promise.reject(fail(401, 'unauthorized', 'Wrong secret.')));

  Object.assign(api, {
    me: () => needAuth() ?? delay(me()),
    logout: () => delay(undefined),
    inviteInfo: (code: string) => (code === 'ABCDEFGH' ? delay({ kind: 'school_admin' as const, schoolName: school.name, expiresAt: new Date(Date.now() + 14 * 864e5).toISOString() }) : Promise.reject(fail(404, 'not_found', 'not found'))),
    schoolSetup: () => delay({ token: 'mock-token', teacher: me().teacher, school: { id: 1, name: school.name } }),
    school: () => needAuth() ?? delay(info()),
    updateSchool: (b: { name?: string; district?: string; teacherLinkShared?: true }) => {
      if (b.teacherLinkShared) linkShared = true;
      school = { ...school, ...(b.name ? { name: b.name } : {}), ...(b.district !== undefined ? { district: b.district } : {}) };
      return delay(info());
    },
    rotateStudentCode: () => { school = { ...school, studentCode: 'NEWCDE' }; return delay(info()); },
    schoolOverview: (date?: string) => delay({
      date: date ?? todayIst(),
      totals: { teachers: teachers.length, classes: classes.length, students: classes.reduce((a, c) => a + c.studentCount, 0), joined: classes.reduce((a, c) => a + c.joinedCount, 0), completedToday: classes.reduce((a, c) => a + c.completedToday, 0) },
      classes: classes.map((c) => ({
        classId: c.id, name: c.name, standard: 5, division: c.division, teacherId: c.teacherId, teacherName: c.teacherName,
        teacherActive: teachers.find((t) => t.id === c.teacherId)?.active ?? false, studentCount: c.studentCount, joinedCount: c.joinedCount,
        completedToday: c.completedToday, weekCompletionPct: c.studentCount ? Math.round((c.completedToday / c.studentCount) * 100) : 0, archived: false, joinEnabled: true,
      })),
    }),
    schoolTeachers: () => delay([...teachers]),
    updateSchoolTeacher: (id: number, b: { active?: boolean; role?: 'teacher' | 'school_admin' }) => {
      const admins = teachers.filter((t) => t.role === 'school_admin' && t.active);
      const t = teachers.find((x) => x.id === id)!;
      if (t.role === 'school_admin' && admins.length === 1 && (b.active === false || b.role === 'teacher')) return Promise.reject(fail(409, 'conflict', 'Your school needs at least one admin.'));
      Object.assign(t, b);
      return delay({ ...t });
    },
    teacherResetLink: (id: number) => {
      const inv = mkInvite('password_reset', 'RESETABC');
      return delay({ ...inv, whatsappText: `Namaste ${teachers.find((t) => t.id === id)?.name}! Open this link to choose a new Shabd Mitra password: ${inv.url}. It works once and ends in 24 hours.` });
    },
    schoolInvites: () => delay(invite ? [invite] : []),
    createInvite: () => { invite = mkInvite('teacher', 'WXYZ2345'); return delay(invite); },
    revokeInvite: () => { invite = null; return delay(undefined); },
    schoolClasses: () => delay(classes.map((c) => ({ ...c, teacherName: teachers.find((t) => t.id === c.teacherId)?.name ?? '' }))),
    updateSchoolClass: (id: number, b: { teacherId?: number; archived?: boolean }) => {
      const c = classes.find((x) => x.id === id)!;
      if (b.teacherId) c.teacherId = b.teacherId;
      if (b.archived) classes = classes.filter((x) => x.id !== id);
      return delay({ ...c });
    },
    schoolAudit: () => delay([...audit]),
    admin: {
      listSchools: () => adminGuard() ?? delay([...admin]),
      createSchool: (b: { name: string; district?: string; udiseCode?: string }) => {
        const s: School = { id: nextId++, name: b.name, district: b.district ?? '', studentCode: 'NEWSCH', status: 'active' };
        admin = [...admin, { school: s, udiseCode: b.udiseCode ?? null, teachers: 0, classes: 0, students: 0, createdAt: new Date().toISOString() }];
        const inv = mkInvite('school_admin', 'SETUPABC');
        return delay({ school: s, setupInvite: inv, whatsappText: `Namaste! Your school is ready on Shabd Mitra 🦜. Open this link to set up your school (takes 1 minute): ${inv.url}.` });
      },
      setupLink: () => { const inv = mkInvite('school_admin', 'SETUPXYZ'); return delay({ ...inv, whatsappText: `Namaste! Your school is ready on Shabd Mitra 🦜. Open this link: ${inv.url}.` }); },
      updateSchool: (id: number, b: { status?: 'active' | 'suspended' }) => {
        admin = admin.map((r) => (r.school.id === id ? { ...r, school: { ...r.school, ...b } } : r));
        return delay(admin.find((r) => r.school.id === id)!);
      },
    },
  });
}
