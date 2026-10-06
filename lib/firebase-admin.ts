import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const projectId = process.env.FIREBASE_PROJECT_ID || 'global-finance-72e35';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const app = getApps()[0] ?? initializeApp(clientEmail && privateKey ? { credential: cert({ projectId, clientEmail, privateKey }) } : { projectId });
export const firestore = getFirestore(app);
