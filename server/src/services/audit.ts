/**
 * Audit log writer. Rows hold IDs and counts only (never names or PINs). Actions: docs/ONBOARDING_SPEC.md 4.9.
 */
import type { Queryable } from '../db/db.ts';

export interface AuditInput {
  schoolId: number | null;
  actorType: 'super' | 'teacher' | 'student' | 'system';
  actorId?: number | null;
  action: string;
  targetType?: 'school' | 'teacher' | 'class' | 'student' | 'invite' | null;
  targetId?: number | null;
  meta?: Record<string, number | boolean | string | null>;
}

export async function audit(q: Queryable, a: AuditInput): Promise<void> {
  await q.run(
    'INSERT INTO audit_log (school_id, actor_type, actor_id, action, target_type, target_id, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [a.schoolId, a.actorType, a.actorId ?? null, a.action, a.targetType ?? null, a.targetId ?? null, JSON.stringify(a.meta ?? {})],
  );
}
