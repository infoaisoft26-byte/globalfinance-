import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { firestore } from './firebase-admin';
export async function requireAdmin(){const session=await getSession();if(!session||session.role!=='admin')redirect('/login');const snap=await firestore.collection('users').doc(session.userId).get();const d=snap.data() as any;if(!snap.exists||d?.role!=='admin'||(d.accountStatus??d.account_status)!=='active')redirect('/login');return {id:snap.id,email:d.email,full_name:d.fullName??d.full_name,role:'admin' as const,account_status:'active'};}
export async function writeAuditLog(actorUserId:string,action:string,entityType:string,entityId?:string,payload:Record<string,unknown>={}){await firestore.collection('auditLogs').add({actorUserId,action,entityType,entityId:entityId??null,payload,createdAt:new Date()});}
