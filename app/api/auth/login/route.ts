import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });

  const result = await db.query('SELECT id, role, password_hash, account_status FROM users WHERE email=$1 LIMIT 1', [parsed.data.email.trim().toLowerCase()]);
  if (result.rowCount !== 1) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  const user = result.rows[0];
  const valid = await argon2.verify(user.password_hash, parsed.data.password);
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  if (user.account_status !== 'active') return NextResponse.json({ error: 'Account is not active. Please contact support.' }, { status: 403 });

  await createSession({ id: user.id, role: user.role });
  return NextResponse.json({ ok: true, role: user.role });
}
