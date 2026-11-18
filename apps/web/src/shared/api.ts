/**
 * Typed API client - mirrors docs/API.md. CONTRACT FILE (owned by the architect / integration lane).
 * Student and teacher lanes import from here; do not edit in Wave 1 except to fix a bug in a
 * coordinated contract commit. Offline queueing for student writes lives in ./outbox.ts.
 */
import type {
  AddStudentsReq, AttemptsReq, AttemptsRes, ClassAnalyticsRes, ClassDashboardRes, ClassRoom, CompleteWordRes,
  CreateClassReq, CreateWordReq, DailySet, HealthRes, LeaderboardRes, MeRes, PublicRosterRes, RosterRes,
  SentenceReq, SentenceRes, SessionSummaryRes, SetDailyWordsReq, StudentAuthRes, StudentDetailRes,
  StudentHomeRes, StudentLoginReq, StudentWithPin, TeacherAuthRes, TeacherLoginReq, TeacherRegisterReq,
  TodaySessionRes, UpdateClassReq, UpdateStudentReq, Word, WordSearchQuery, WordSearchRes, ApiErrorCode,
} from '@shabd/core';

const TOKEN_KEY = 'shabd.token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null): void {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export class ApiRequestError extends Error {
  constructor(public status: number, public code: ApiErrorCode | 'network', message: string) {
    super(message);
  }
  /** true when the request never reached the server (offline / DNS / timeout) -> safe to queue & retry */
  get isNetwork(): boolean { return this.code === 'network'; }
}

/** Central 401 handling: an expired/invalid token is cleared and the user is sent to the matching login. */
function handleUnauthorized(): void {
  setToken(null);
  try {
    const here = window.location.pathname;
    const login = here.startsWith('/teacher') ? '/teacher/login' : '/login';
    if (here !== login) window.location.replace(login);
  } catch { /* non-browser env */ }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
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
    if (res.status === 401 && token && !path.startsWith('/auth/')) handleUnauthorized();
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

export const api = {
  health: () => request<HealthRes>('GET', '/health'),
  me: () => request<MeRes>('GET', '/auth/me'),
  logout: () => request<void>('POST', '/auth/logout'),

  // teacher auth
  teacherRegister: (b: TeacherRegisterReq) => request<TeacherAuthRes>('POST', '/auth/teacher/register', b),
  teacherLogin: (b: TeacherLoginReq) => request<TeacherAuthRes>('POST', '/auth/teacher/login', b),

  // student auth
  publicRoster: (classCode: string) => request<PublicRosterRes>('GET', `/auth/classes/${encodeURIComponent(classCode)}/roster`),
  studentLogin: (b: StudentLoginReq) => request<StudentAuthRes>('POST', '/auth/student/login', b),

  // classes & roster
  listClasses: () => request<ClassRoom[]>('GET', '/classes'),
  createClass: (b: CreateClassReq) => request<ClassRoom>('POST', '/classes', b),
  updateClass: (classId: number, b: UpdateClassReq) => request<ClassRoom>('PATCH', `/classes/${classId}`, b),
  roster: (classId: number) => request<RosterRes>('GET', `/classes/${classId}/students`),
  addStudents: (classId: number, b: AddStudentsReq) => request<RosterRes>('POST', `/classes/${classId}/students`, b),
  updateStudent: (studentId: number, b: UpdateStudentReq) => request<StudentWithPin>('PATCH', `/students/${studentId}`, b),
  resetPin: (studentId: number) => request<StudentWithPin>('POST', `/students/${studentId}/reset-pin`),

  // words
  searchWords: (q: WordSearchQuery) => request<WordSearchRes>('GET', `/words${qs(q)}`),
  createWord: (b: CreateWordReq) => request<Word>('POST', '/words', b),
  dailyWords: (classId: number, date?: string) => request<DailySet>('GET', `/classes/${classId}/daily-words${qs({ date })}`),
  setDailyWords: (classId: number, date: string, b: SetDailyWordsReq) =>
    request<DailySet>('PUT', `/classes/${classId}/daily-words/${date}`, b),
  resetDailyWords: (classId: number, date: string) => request<DailySet>('DELETE', `/classes/${classId}/daily-words/${date}`),

  // teacher analytics
  dashboard: (classId: number, date?: string) => request<ClassDashboardRes>('GET', `/classes/${classId}/dashboard${qs({ date })}`),
  classLeaderboard: (classId: number, period: 'week' | 'all' = 'week') =>
    request<LeaderboardRes>('GET', `/classes/${classId}/leaderboard${qs({ period })}`),
  classAnalytics: (classId: number, from?: string, to?: string) =>
    request<ClassAnalyticsRes>('GET', `/classes/${classId}/analytics${qs({ from, to })}`),
  studentDetail: (studentId: number) => request<StudentDetailRes>('GET', `/students/${studentId}/analytics`),
  /** returns the URL; open it with the token via fetch+blob (see UI_SPEC 4.6) */
  exportCsvPath: (classId: number, type: 'attempts' | 'sentences' | 'daily' | 'students') =>
    `/api/classes/${classId}/export.csv${qs({ type })}`,

  // student flow
  studentHome: () => request<StudentHomeRes>('GET', '/student/home'),
  startToday: () => request<TodaySessionRes>('POST', '/student/sessions/today'),
  postAttempts: (sessionId: number, b: AttemptsReq) => request<AttemptsRes>('POST', `/student/sessions/${sessionId}/attempts`, b),
  postSentence: (sessionId: number, b: SentenceReq) => request<SentenceRes>('POST', `/student/sessions/${sessionId}/sentences`, b),
  completeWord: (sessionId: number, wordId: string) =>
    request<CompleteWordRes>('POST', `/student/sessions/${sessionId}/words/${encodeURIComponent(wordId)}/complete`, {}),
  completeSession: (sessionId: number) => request<SessionSummaryRes>('POST', `/student/sessions/${sessionId}/complete`, {}),
  studentLeaderboard: () => request<LeaderboardRes>('GET', '/student/leaderboard'),
};
