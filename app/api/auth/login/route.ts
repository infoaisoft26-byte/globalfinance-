import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { z } from 'zod';
import { firestore } from '@/lib/firebase-admin';
import { createSession } from '@/lib/auth';
const schema=z.object({email:z.string().email(),password:z.string().min(1).max(200)});
export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:'Invalid credentials'},{status:400});
 try{const email=parsed.data.email.trim().toLowerCase(); const snap=await firestore.collection('users').where('email','==',email).limit(1).get(); if(snap.empty)return NextResponse.json({error:'Invalid credentials'},{status:401}); const user={id:snap.docs[0].id,...snap.docs[0].data()} as any; const hash=user.passwordHash||user.password_hash; if(!hash)return NextResponse.json({error:'Invalid credentials'},{status:401}); const valid=await argon2.verify(hash,parsed.data.password); if(!valid)return NextResponse.json({error:'Invalid credentials'},{status:401}); if(user.accountStatus!=='active' && user.account_status!=='active')return NextResponse.json({error:'Account is not active. Please contact support.'},{status:403}); await createSession({id:user.id,role:user.role||'user'}); return NextResponse.json({ok:true,role:user.role||'user'});
 }catch(error){console.error('Login failed:',error);return NextResponse.json({error:'Login service could not connect to Firestore. Please contact the administrator.'},{status:503});}}
