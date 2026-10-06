import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore } from './firebase-admin';
export { FieldValue, Timestamp };
export const collections = { users:'users', wallets:'wallets', ledgerTransactions:'ledgerTransactions', ledgerEntries:'ledgerEntries', usdtDeposits:'usdtDeposits', packages:'packages', packageActivations:'packageActivations', kycSubmissions:'kycSubmissions', supportTickets:'supportTickets', supportTicketMessages:'supportTicketMessages', auditLogs:'auditLogs' } as const;
export function now(){ return Timestamp.now(); }
export function id(){ return firestore.collection('_ids').doc().id; }
export async function findOne(collection:string, field:string, value:unknown){ const snap=await firestore.collection(collection).where(field,'==',value).limit(1).get(); return snap.empty?null:{id:snap.docs[0].id,...snap.docs[0].data()}; }
export async function list(collection:string, opts?:{field?:string;value?:unknown;orderBy?:string;desc?:boolean;limit?:number}){ let q:FirebaseFirestore.Query=firestore.collection(collection); if(opts?.field)q=q.where(opts.field,'==',opts.value); if(opts?.orderBy)q=q.orderBy(opts.orderBy,opts.desc?'desc':'asc'); if(opts?.limit)q=q.limit(opts.limit); const snap=await q.get(); return snap.docs.map(d=>({id:d.id,...d.data()})); }
