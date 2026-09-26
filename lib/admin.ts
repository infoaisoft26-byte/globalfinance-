import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { db } from './db';

export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  const { rows } = await db.query(
    'SELECT id, email, full_name, role, account_status FROM users WHERE id = $1 LIMIT 1',
    [session.userId]
  );
  const admin = rows[0];
  if (!admin || admin.role !== 'admin' || admin.account_status !== 'active') redirect('/login');
  return admin as { id: string; email: string; full_name: string; role: 'admin'; account_status: string };
}

export async function writeAuditLog(actorUserId: string, action: string, entityType: string, entityId?: string, payload: Record<string, unknown> = {}) {
  await db.query(
    'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, payload) VALUES ($1,$2,$3,$4,$5::jsonb)',
    [actorUserId, action, entityType, entityId ?? null, JSON.stringify(payload)]
  );
}
