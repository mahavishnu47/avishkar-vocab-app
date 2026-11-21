/**
 * Typed API client - mirrors docs/API.md and docs/ONBOARDING_SPEC.md section 4.
 * CONTRACT FILE (frozen by O1). Student and teacher lanes import from here; do not edit except in a
 * coordinated contract commit. Offline queueing for student writes lives in ./outbox.ts.
 *
 * Tokens: two slots, 'student' (the ACTIVE profile's token) and 'staff' (teacher / school admin).
 * Every api.* method has a fixed scope; api.withToken(token) binds a client to an explicit token (outbox).
 */
import type {
  AddStudentsReq, AdminSchoolRow, AdminUpdateSchoolReq, ApiErrorCode, AttemptsReq, AttemptsRes, AuditEntry,
  ClassAnalyticsRes, ClassDashboardRes, ClassRoom, ClassSummary, CompleteWordRes, CreateClassReq, CreateInviteReq,
  CreateSchoolReq, CreateSchoolRes, CreateWordReq, DailySet, HealthRes, Invite, InviteInfoRes, InviteWithText,
  JoinClassRes, JoinSchoolRes, LeaderboardRes, MeRes, PasswordResetReq, PublicRosterRes, ResetPinReq, RosterRes,
  RosterStudent, SchoolInfoRes, SchoolOverviewRes, SchoolSetupReq, SchoolTeacherRow, SentenceReq, SentenceRes,
  SessionSummaryRes, SetDailyWordsReq, ShareInfoRes, StudentAuthRes, StudentDetailRes, StudentHomeRes,
  StudentLoginReq, TeacherAuthRes, TeacherLoginReq, TeacherOverviewRes, TeacherRegisterReq, TodaySessionRes,
  UpdateClassReq, UpdateMySchoolReq, UpdateSchoolClassReq, UpdateSchoolTeacherReq, UpdateStudentReq, Word,
  WordSearchQuery, WordSearchRes,
} from '@shabd/core';

export type TokenScope = 'student' | 'staff';

const KEY: Record<TokenScope, string> = { student: 'shabd.token.student', staff: 'shabd.token.staff' };
const LEGACY_KEY = 'shabd.token';
const ADMIN_SECRET_KEY = 'shabd.adminSecret';

/** Scope guess for legacy single-argument callers: staff areas live under /teacher, /school and /admin. */
function inferScope(): TokenScope {
  try {
    return /^\/(teacher|school|admin)(\/|$)/.test(window.location.pathname) ? 'staff' : 'student';
  } catch {
    return 'student';
  }
}

export function getToken(scope: TokenScope = inferScope()): string | null {
  try { return localStorage.getItem(KEY[scope]); } catch { return null; }
}
/** setToken('student' | 'staff', token | null). The one-argument form setToken(token) is DEPRECATED (scope is guessed from the URL). */
export function setToken(scope: TokenScope, token: string | null): void;
export function setToken(token: string | null): void;
export function setToken(a: TokenScope | string | null, b?: string | null): void {
  const scope: TokenScope = a === 'student' || a === 'staff' ? a : inferScope();
  const token = a === 'student' || a === 'staff' ? (b ?? null) : a;
  try { token ? localStorage.setItem(KEY[scope], token) : localStorage.removeItem(KEY[scope]); } catch { /* ignore */ }
}

/** Super-admin secret: sessionStorage only, sent as X-Admin-Secret. */
export function getAdminSecret(): string | null {
  try { return sessionStorage.getItem(ADMIN_SECRET_KEY); } catch { return null; }
}
export function setAdminSecret(secret: string | null): void {
  try { secret ? sessionStorage.setItem(ADMIN_SECRET_KEY, secret) : sessionStorage.removeItem(ADMIN_SECRET_KEY); } catch { /* ignore */ }
}

/** Legacy migration (runs once at module init): shabd.token -> student slot if shabd.student exists, else staff slot. */
function migrateLegacyToken(): void {
  try {
    const old = localStorage.getItem(LEGACY_KEY);
    if (old === null) return;
    const scope: TokenScope = localStorage.getItem('shabd.student') !== null ? 'student' : 'staff';
    if (!localStorage.getItem(KEY[scope])) localStorage.setItem(KEY[scope], old);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
}
migrateLegacyToken();

export class ApiRequestError extends Error {
  constructor(public status: number, public code: ApiErrorCode | 'network', message: string) {
    super(message);
  }
  /** true when the request never reached the server (offline / DNS / timeout) -> safe to queue & retry */
  get isNetwork(): boolean { return this.code === 'network'; }
}

/** Fired on window when a student request is rejected with 401 (token cleared). O3 marks the profile "needs PIN". */
export const STUDENT_UNAUTHORIZED_EVENT = 'shabd:student-unauthorized';

/** Central 401 handling per scope (not used by withToken clients). */
function handleUnauthorized(scope: TokenScope): void {
  setToken(scope, null);
  try {
    if (scope === 'student') {
      window.dispatchEvent(new CustomEvent(STUDENT_UNAUTHORIZED_EVENT));
      return;
    }
    const here = window.location.pathname;
    if (here !== '/teacher/login') {
      window.location.replace(`/teacher/login?next=${encodeURIComponent(here + window.location.search)}`);
    }
  } catch { /* non-browser env */ }
}

interface RequestOpts {
  scope?: TokenScope;
  /** explicit token (withToken clients): no 401 side effects */
  token?: string | null;
  admin?: boolean;
}

export async function request<T>(method: string, path: string, body?: unknown, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const scope = opts.scope ?? inferScope();
  const explicit = opts.token !== undefined;
  const token = explicit ? opts.token : opts.admin ? null : getToken(scope);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.admin) {
    const secret = getAdminSecret();
    if (secret) headers['X-Admin-Secret'] = secret;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiRequestError(0, 'network', (e as Error).message);
  }
  if (!res.ok) {
    let code: ApiErrorCode = 'internal';
    let message = res.statusText;
    try { const j = await res.json(); code = j.error?.code ?? code; message = j.error?.message ?? message; } catch { /* non-json */ }
    if (res.status === 401 && token && !explicit && !opts.admin && !path.startsWith('/auth/')) handleUnauthorized(scope);
    throw new ApiRequestError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

function qs(q: object): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

const enc = encodeURIComponent;

/** token === undefined: live client (reads slots). token given: every call uses that token. */
function build(token?: string | null) {
  const staff = <T>(m: string, p: string, b?: unknown) => request<T>(m, p, b, token === undefined ? { scope: 'staff' } : { token });
  const student = <T>(m: string, p: string, b?: unknown) => request<T>(m, p, b, token === undefined ? { scope: 'student' } : { token });
  const open = <T>(m: string, p: string, b?: unknown) => request<T>(m, p, b, { token: null });
  const admin = <T>(m: string, p: string, b?: unknown) => request<T>(m, p, b, { admin: true });

  return {
    health: () => open<HealthRes>('GET', '/health'),
    /** explicit scope: the student app and the teacher app each ask for their own identity */
    me: (scope: TokenScope = inferScope()) => (scope === 'student' ? student<MeRes>('GET', '/auth/me') : staff<MeRes>('GET', '/auth/me')),
    /** logs out the given scope's token (default: guessed from the URL) */
    logout: (scope: TokenScope = inferScope()) => (scope === 'student' ? student<void>('POST', '/auth/logout') : staff<void>('POST', '/auth/logout')),

    // public: invites, join links
    inviteInfo: (code: string) => open<InviteInfoRes>('GET', `/invites/${enc(code)}`),
    joinClass: (classCode: string) => open<JoinClassRes>('GET', `/join/class/${enc(classCode)}`),
    joinSchool: (studentCode: string) => open<JoinSchoolRes>('GET', `/join/school/${enc(studentCode)}`),
    /** @deprecated use joinClass */
    publicRoster: (classCode: string) => open<PublicRosterRes>('GET', `/auth/classes/${enc(classCode)}/roster`),

    // staff auth
    teacherRegister: (b: TeacherRegisterReq) => open<TeacherAuthRes>('POST', '/auth/teacher/register', b),
    teacherLogin: (b: TeacherLoginReq) => open<TeacherAuthRes>('POST', '/auth/teacher/login', b),
    schoolSetup: (b: SchoolSetupReq) => open<TeacherAuthRes>('POST', '/auth/school/setup', b),
    passwordReset: (b: PasswordResetReq) => open<TeacherAuthRes>('POST', '/auth/password-reset', b),

    // student auth
    studentLogin: (b: StudentLoginReq) => open<StudentAuthRes>('POST', '/auth/student/login', b),

    // teacher: overview, classes, roster
    teacherOverview: () => staff<TeacherOverviewRes>('GET', '/teacher/overview'),
    listClasses: (includeArchived = false) => staff<ClassRoom[]>('GET', `/classes${qs({ archived: includeArchived ? 1 : undefined })}`),
    createClass: (b: CreateClassReq) => staff<ClassRoom>('POST', '/classes', b),
    updateClass: (classId: number, b: UpdateClassReq) => staff<ClassRoom>('PATCH', `/classes/${classId}`, b),
    rotateClassCode: (classId: number) => staff<ClassRoom>('POST', `/classes/${classId}/rotate-code`),
    classShare: (classId: number) => staff<ShareInfoRes>('GET', `/classes/${classId}/share`),
    roster: (classId: number) => staff<RosterRes>('GET', `/classes/${classId}/students`),
    addStudents: (classId: number, b: AddStudentsReq) => staff<RosterRes>('POST', `/classes/${classId}/students`, b),
    updateStudent: (studentId: number, b: UpdateStudentReq) => staff<RosterStudent>('PATCH', `/students/${studentId}`, b),
    resetPin: (studentId: number, b?: ResetPinReq) => staff<RosterStudent>('POST', `/students/${studentId}/reset-pin`, b),

    // words
    searchWords: (q: WordSearchQuery) => staff<WordSearchRes>('GET', `/words${qs(q)}`),
    createWord: (b: CreateWordReq) => staff<Word>('POST', '/words', b),
    dailyWords: (classId: number, date?: string) => staff<DailySet>('GET', `/classes/${classId}/daily-words${qs({ date })}`),
    setDailyWords: (classId: number, date: string, b: SetDailyWordsReq) => staff<DailySet>('PUT', `/classes/${classId}/daily-words/${date}`, b),
    resetDailyWords: (classId: number, date: string) => staff<DailySet>('DELETE', `/classes/${classId}/daily-words/${date}`),

    // teacher analytics
    dashboard: (classId: number, date?: string) => staff<ClassDashboardRes>('GET', `/classes/${classId}/dashboard${qs({ date })}`),
    classLeaderboard: (classId: number, period: 'week' | 'all' = 'week') =>
      staff<LeaderboardRes>('GET', `/classes/${classId}/leaderboard${qs({ period })}`),
    classAnalytics: (classId: number, from?: string, to?: string) =>
      staff<ClassAnalyticsRes>('GET', `/classes/${classId}/analytics${qs({ from, to })}`),
    studentDetail: (studentId: number) => staff<StudentDetailRes>('GET', `/students/${studentId}/analytics`),
    /** returns the URL; open it with the token via fetch+blob (see UI_SPEC 4.6) */
    exportCsvPath: (classId: number, type: 'attempts' | 'sentences' | 'daily' | 'students') =>
      `/api/classes/${classId}/export.csv${qs({ type })}`,

    // school admin
    school: () => staff<SchoolInfoRes>('GET', '/school'),
    updateSchool: (b: UpdateMySchoolReq) => staff<SchoolInfoRes>('PATCH', '/school', b),
    rotateStudentCode: () => staff<SchoolInfoRes>('POST', '/school/rotate-student-code'),
    schoolOverview: (date?: string) => staff<SchoolOverviewRes>('GET', `/school/overview${qs({ date })}`),
    schoolTeachers: () => staff<SchoolTeacherRow[]>('GET', '/school/teachers'),
    updateSchoolTeacher: (teacherId: number, b: UpdateSchoolTeacherReq) => staff<SchoolTeacherRow>('PATCH', `/school/teachers/${teacherId}`, b),
    teacherResetLink: (teacherId: number) => staff<InviteWithText>('POST', `/school/teachers/${teacherId}/reset-link`),
    schoolInvites: () => staff<Invite[]>('GET', '/school/invites'),
    createInvite: (b: CreateInviteReq = {}) => staff<Invite>('POST', '/school/invites', b),
    revokeInvite: (inviteId: number) => staff<void>('DELETE', `/school/invites/${inviteId}`),
    schoolClasses: (includeArchived = false) => staff<ClassSummary[]>('GET', `/school/classes${qs({ archived: includeArchived ? 1 : undefined })}`),
    updateSchoolClass: (classId: number, b: UpdateSchoolClassReq) => staff<ClassSummary>('PATCH', `/school/classes/${classId}`, b),
    schoolAudit: (q: { limit?: number; before?: number } = {}) => staff<AuditEntry[]>('GET', `/school/audit${qs(q)}`),

    // student flow
    studentHome: () => student<StudentHomeRes>('GET', '/student/home'),
    startToday: () => student<TodaySessionRes>('POST', '/student/sessions/today'),
    postAttempts: (sessionId: number, b: AttemptsReq) => student<AttemptsRes>('POST', `/student/sessions/${sessionId}/attempts`, b),
    postSentence: (sessionId: number, b: SentenceReq) => student<SentenceRes>('POST', `/student/sessions/${sessionId}/sentences`, b),
    completeWord: (sessionId: number, wordId: string) =>
      student<CompleteWordRes>('POST', `/student/sessions/${sessionId}/words/${enc(wordId)}/complete`, {}),
    completeSession: (sessionId: number) => student<SessionSummaryRes>('POST', `/student/sessions/${sessionId}/complete`, {}),
    studentLeaderboard: () => student<LeaderboardRes>('GET', '/student/leaderboard'),

    // super admin (X-Admin-Secret from sessionStorage)
    admin: {
      listSchools: () => admin<AdminSchoolRow[]>('GET', '/admin/schools'),
      createSchool: (b: CreateSchoolReq) => admin<CreateSchoolRes>('POST', '/admin/schools', b),
      setupLink: (schoolId: number) => admin<InviteWithText>('POST', `/admin/schools/${schoolId}/setup-link`),
      updateSchool: (schoolId: number, b: AdminUpdateSchoolReq) => admin<AdminSchoolRow>('PATCH', `/admin/schools/${schoolId}`, b),
    },
  };
}

export type ApiClient = ReturnType<typeof build>;

export const api = {
  ...build(),
  /** Same client bound to an explicit token (offline outbox flush per profile). No 401 side effects. */
  withToken: (token: string | null): ApiClient => build(token),
};
