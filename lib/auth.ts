import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretValue = process.env.AUTH_SECRET;
if (!secretValue || secretValue.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
const secret = new TextEncoder().encode(secretValue);

export async function createSession(user: { id: string; role: string }) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret);
  const store = await cookies();
  store.set('gf_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12 });
}

export async function getSession() {
  const token = (await cookies()).get('gf_session')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { userId: String(payload.sub), role: String(payload.role ?? 'user') };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete('gf_session');
}
