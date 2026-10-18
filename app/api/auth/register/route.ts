import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { z } from 'zod';
import { firestore } from '@/lib/firebase-admin';
import { createSession } from '@/lib/auth';

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  mobileNumber: z.string().regex(/^\+91[6-9][0-9]{9}$/, 'Enter a valid Indian mobile number with +91 and 10 digits'),
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  referral: z.string().regex(/^GF[0-9]{6}$/).optional(),
});
const START_AFTER = 200;
const counterRef = firestore.collection('_system').doc('referralSequence');
function numericReferral(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const match = /^GF([0-9]{6})$/.exec(value);
  return match ? Number(match[1]) : 0;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid registration data' }, { status: 400 });
  try {
    const { fullName, mobileNumber, email, password, referral } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedMobile = mobileNumber.trim();
    const emailSnap = await firestore.collection('users').where('email', '==', normalizedEmail).limit(1).get();
    if (!emailSnap.empty) return NextResponse.json({ error: 'This email is already registered' }, { status: 409 });
    const mobileSnap = await firestore.collection('users').where('mobileNumber', '==', normalizedMobile).limit(1).get();
    if (!mobileSnap.empty) return NextResponse.json({ error: 'This mobile number is already registered' }, { status: 409 });

    let sponsorId: string | null = null;
    let sponsorName: string | null = null;
    let sponsorCode: string | null = null;
    if (referral) {
      const sponsorSnap = await firestore.collection('users').where('referralCode', '==', referral).limit(1).get();
      if (sponsorSnap.empty) return NextResponse.json({ error: 'Sponsor referral ID not found' }, { status: 400 });
      const sponsor = sponsorSnap.docs[0];
      sponsorId = sponsor.id;
      sponsorName = String(sponsor.get('fullName') ?? sponsor.get('full_name') ?? '').trim() || 'Member';
      sponsorCode = String(sponsor.get('referralCode') ?? referral);
    }

    const counterSnapshot = await counterRef.get();
    let existingMaximum = START_AFTER;
    if (!counterSnapshot.exists) {
      const existingUsers = await firestore.collection('users').select('referralCode').get();
      for (const doc of existingUsers.docs) existingMaximum = Math.max(existingMaximum, numericReferral(doc.get('referralCode')));
    }

    const id = firestore.collection('users').doc().id;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();
    let referralCode = '';
    await firestore.runTransaction(async (tx) => {
      const counter = await tx.get(counterRef);
      const lastIssued = counter.exists ? Number(counter.get('lastIssued') ?? START_AFTER) : existingMaximum;
      const next = Math.max(START_AFTER, lastIssued) + 1;
      if (next > 999999) throw new Error('Referral ID sequence exhausted');
      referralCode = 'GF' + String(next).padStart(6, '0');
      tx.create(firestore.collection('users').doc(id), {
        email: normalizedEmail, passwordHash, fullName: fullName.trim(), mobileNumber: normalizedMobile,
        referralCode, referredBy: sponsorId, sponsorName, sponsorReferralCode: sponsorCode,
        role: 'user', accountStatus: 'active', kycStatus: 'pending', createdAt: now, updatedAt: now,
      });
      if (counter.exists) tx.update(counterRef, { lastIssued: next, updatedAt: now });
      else tx.create(counterRef, { lastIssued: next, startsAt: 'GF000201', updatedAt: now });
      const fund = firestore.collection('wallets').doc();
      const income = firestore.collection('wallets').doc();
      tx.create(fund, { userId: id, walletType: 'fund', currency: 'USDT', createdAt: now });
      tx.create(income, { userId: id, walletType: 'income', currency: 'INR', createdAt: now });
      tx.create(firestore.collection('auditLogs').doc(), {
        actorUserId: id, action: 'USER_REGISTERED', entityType: 'user', entityId: id,
        payload: { email: normalizedEmail, referralCode, sponsorId, sponsorName }, createdAt: now,
      });
    });
    await createSession({ id, role: 'user' });
    return NextResponse.json({ ok: true, referralCode, sponsorName, sponsorReferralCode: sponsorCode }, { status: 201 });
  } catch (error) {
    console.error('Registration failed:', error);
    return NextResponse.json({ error: 'Registration could not be completed' }, { status: 503 });
  }
}
