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
const FIRST_ID = 201;
const counterRef = firestore.collection('_system').doc('referralSequence');

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

async function sendRegistrationEmail(email: string, fullName: string, referralCode: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error('[REGISTRATION_EMAIL] Not sent: RESEND_API_KEY or RESEND_FROM_EMAIL is missing');
    return false;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Welcome to Global Finance',
      text: `Hello ${fullName},\n\nYour Global Finance account has been created successfully.\nYour Member ID: ${referralCode}\n\nFor your security, your password is not included in this email. Keep your login details private.\n\nGlobal Finance\nhttps://globalfinance1.online`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033"><h2 style="color:#2563eb">Welcome to Global Finance</h2><p>Hello ${escapeHtml(fullName)},</p><p>Your Global Finance account has been created successfully.</p><p><strong>Member ID:</strong> ${escapeHtml(referralCode)}</p><p>For your security, your password is not included in this email. Keep your login details private.</p><p><a href="https://globalfinance1.online" style="display:inline-block;background:#2563eb;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Open Global Finance</a></p><p>Regards,<br/>Global Finance Team</p></div>`,
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    console.error('[REGISTRATION_EMAIL] Resend rejected email:', response.status, await response.text().catch(() => 'Unable to read provider response'));
    return false;
  }
  return true;
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

    const id = firestore.collection('users').doc().id;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();
    let referralCode = '';
    await firestore.runTransaction(async (tx) => {
      const counter = await tx.get(counterRef);
      let candidateNumber = counter.exists ? Number(counter.get('lastIssued') ?? FIRST_ID - 1) + 1 : FIRST_ID;
      while (candidateNumber <= 999999) {
        const candidate = 'GF' + String(candidateNumber).padStart(6, '0');
        const collision = await tx.get(firestore.collection('users').where('referralCode', '==', candidate).limit(1));
        if (collision.empty) { referralCode = candidate; break; }
        candidateNumber += 1;
      }
      if (!referralCode) throw new Error('Referral ID sequence exhausted');
      tx.create(firestore.collection('users').doc(id), {
        email: normalizedEmail, passwordHash, fullName: fullName.trim(), mobileNumber: normalizedMobile,
        referralCode, referredBy: sponsorId, sponsorName, sponsorReferralCode: sponsorCode,
        role: 'user', accountStatus: 'active', kycStatus: 'pending', createdAt: now, updatedAt: now,
      });
      const issuedNumber = Number(referralCode.slice(2));
      if (counter.exists) tx.update(counterRef, { lastIssued: issuedNumber, updatedAt: now });
      else tx.create(counterRef, { lastIssued: issuedNumber, startsAt: 'GF000201', updatedAt: now });
      const fund = firestore.collection('wallets').doc();
      const income = firestore.collection('wallets').doc();
      tx.create(fund, { userId: id, walletType: 'fund', currency: 'USDT', createdAt: now });
      tx.create(income, { userId: id, walletType: 'income', currency: 'INR', createdAt: now });
      tx.create(firestore.collection('auditLogs').doc(), {
        actorUserId: id, action: 'USER_REGISTERED', entityType: 'user', entityId: id,
        payload: { email: normalizedEmail, referralCode, sponsorId, sponsorName }, createdAt: now,
      });
    });

    // Email delivery is best-effort; a provider outage must not undo a successful registration.
    let emailSent = false;
    try {
      emailSent = await sendRegistrationEmail(normalizedEmail, fullName.trim(), referralCode);
    } catch (emailError) {
      console.error('[REGISTRATION_EMAIL] Sending failed:', emailError);
    }
    await createSession({ id, role: 'user' });
    return NextResponse.json({ ok: true, emailSent, referralCode, sponsorName, sponsorReferralCode: sponsorCode }, { status: 201 });
  } catch (error) {
    console.error('Registration failed:', error);
    return NextResponse.json({ error: 'Registration could not be completed' }, { status: 503 });
  }
}
