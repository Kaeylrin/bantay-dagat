import { initializeApp, deleteApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  query,
  orderByChild,
  limitToLast,
  off,
  push,
  set,
  get,
  update,
  remove,
} from "firebase/database";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

setPersistence(auth, browserSessionPersistence).catch(() => {});

export function mapArduinoReading(raw) {
  if (!raw) return null;
  return {
    air_temperature: raw.airTemp ?? null,
    temperature: raw.waterTemp ?? null,
    humidity: raw.humidity ?? null,
    ph: raw.pH ?? null,
    turbidity: raw.turbidity ?? null,
    status: raw.status ?? null,
    timestamp: raw.timestamp ?? null,
  };
}

export const DB_PATHS = {
  LATEST: "bantaydagat/latest",
  READINGS: "bantaydagat/readings",
  ALERTS: "bantaydagat/alerts",
  USERS: "users",
  LOGIN_ATTEMPTS: "loginAttempts",
};

export async function createRangerInFirebase(email, password) {
  const appName = `secondary_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    );
    const uid = credential.user.uid;
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
    return uid;
  } catch (error) {
    try {
      await deleteApp(secondaryApp);
    } catch (_) {}
    throw error;
  }
}

export {
  db,
  auth,
  ref,
  onValue,
  query,
  orderByChild,
  limitToLast,
  off,
  push,
  set,
  get,
  update,
  remove,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
};
