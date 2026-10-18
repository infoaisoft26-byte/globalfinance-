import { NextResponse } from 'next/server';
import { firestore } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
  if (!/^GF[0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid sponsor referral ID' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const snapshot = await firestore.collection('users').where('referralCode', '==', code).limit(1).get();
    if (snapshot.empty) {
      return NextResponse.json({ error: 'Sponsor not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const sponsor = snapshot.docs[0];
    const fullName = String(sponsor.get('fullName') ?? sponsor.get('full_name') ?? '').trim();
    return NextResponse.json(
      { referralCode: String(sponsor.get('referralCode') ?? code), fullName: fullName || 'Member' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Sponsor lookup failed:', error);
    return NextResponse.json({ error: 'Unable to verify sponsor right now' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
