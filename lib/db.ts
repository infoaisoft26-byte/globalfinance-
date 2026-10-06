import { firestore } from './firebase-admin';
export const db: any = firestore;
export async function withTransaction<T>(fn:(tx:FirebaseFirestore.Transaction)=>Promise<T>):Promise<T>{ return firestore.runTransaction(fn); }
export function assertMoneyMovementEnabled(kind:'payment'|'payout'){ const enabled=kind==='payment'?process.env.PAYMENTS_ENABLED==='true':process.env.PAYOUTS_ENABLED==='true'; if(!enabled) throw new Error(kind+' operations are disabled until an authorized provider and compliance controls are configured'); }
