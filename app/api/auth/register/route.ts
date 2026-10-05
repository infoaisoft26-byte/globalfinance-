import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { z } from 'zod';
import { db, withTransaction } from '@/lib/db';
import { createSession } from '@/lib/auth';

const schema = z.object({
  fullName: z.string().min(2).max(120),
  mobileNumber: z.string().regex(/^\+91[6-9][0-9]{9}$/, 'Enter a valid Indian mobile number with +91 and 10 digits'),
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  referral: z.string().regex(/^GF[0-9]{6}$/).optional(),
});

async function nextReferralCode() {
  for (let i = 0; i < 10; i++) {
    const code = `GF${Math.floor(100000 + Math.random() * 900000)}`;
    const exists = await db.query('SELECT 1 FROM users WHERE referral_code=$1', [code]);
    if (exists.rowCount === 0) return code;
  }
  throw new Error('Unable to allocate referral code');
}

function configurationError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  return (
    message.includes('DATABASE_URL is not configured') ||
    message.includes('AUTH_SECRET must be at least 32 characters') ||
    code === '42P01' || code === '3D000' || code === '28P01' ||
    code === 'ECONNREFUSED' || code === 'ENOTFOUND'
  );
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid registration data' }, { status: 400 });

  try {
    const { fullName, mobileNumber, email, password, referral } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedMobile = mobileNumber.trim();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const referralCode = await nextReferralCode();

    const user = await withTransaction(async (client) => {
      let referredBy: string | null = null;
      if (referral) {
        const sponsor = await client.query('SELECT id FROM users WHERE referral_code=$1', [referral]);
        if (sponsor.rowCount !== 1) throw new Error('INVALID_REFERRAL');
        referredBy = sponsor.rows[0].id;
      }

      const existingMobile = await client.query('SELECT 1 FROM users WHERE mobile_number=$1 LIMIT 1', [normalizedMobile]);
      if (existingMobile.rowCount) throw new Error('MOBILE_ALREADY_REGISTERED');

      const created = await client.query(
        `INSERT INTO users (email,password_hash,full_name,mobile_number,referral_code,referred_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,role,referral_code`,
        [normalizedEmail, passwordHash, fullName.trim(), normalizedMobile, referralCode, referredBy]
      );
      const id = created.rows[0].id;
      await client.query(`INSERT INTO wallets (user_id,wallet_type) VALUES ($1,'fund'),($1,'income')`, [id]);
      await client.query(`INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,'USER_REGISTERED','user',$1::text)`, [id]);
      return created.rows[0];
    });

    await createSession({ id: user.id, role: user.role });
    return NextResponse.json({ ok: true, referralCode: user.referral_code }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_REFERRAL') {
      return NextResponse.json({ error: 'Referral code not found' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'MOBILE_ALREADY_REGISTERED') {
      return NextResponse.json({ error: 'This mobile number is already registered' }, { status: 409 });
    }
    if (configurationError(error)) {
      console.error('Registration service configuration error:', error);
      return NextResponse.json({ error: 'Registration service is not configured yet. Please contact the administrator.' }, { status: 503 });
    }
    console.error('Registration failed:', error);
    return NextResponse.json({ error: 'Registration could not be completed' }, { status: 409 });
  }
}