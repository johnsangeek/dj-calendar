import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  return initializeApp({ credential: cert(serviceAccount) });
}

let firestore: Firestore | undefined;

function getAdminFirestore(): Firestore {
  if (!firestore) firestore = getFirestore(getAdminApp());
  return firestore;
}

// Next évalue les modules de route au build, avant que le secret Firebase
// ne soit forcément présent. L'initialisation se fait au premier appel.
export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, property) {
    const db = getAdminFirestore();
    const value = Reflect.get(db, property, db);
    return typeof value === 'function' ? value.bind(db) : value;
  },
});
