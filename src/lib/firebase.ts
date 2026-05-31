import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => value.trim().length > 0,
)

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  if (!auth) {
    throw new Error('Firebase auth is not configured.')
  }

  await setPersistence(auth, browserLocalPersistence)
  const result = await createUserWithEmailAndPassword(auth, email, password)
  await sendEmailVerification(result.user)
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!auth) {
    throw new Error('Firebase auth is not configured.')
  }

  await setPersistence(auth, browserLocalPersistence)
  await signInWithEmailAndPassword(auth, email, password)
}

export async function signOutCurrentUser(): Promise<void> {
  if (!auth) {
    return
  }

  await signOut(auth)
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  if (!auth) {
    throw new Error('Firebase auth is not configured.')
  }

  await sendPasswordResetEmail(auth, email)
}

export async function sendCurrentUserVerificationEmail(): Promise<void> {
  if (!auth?.currentUser) {
    throw new Error('No active user found.')
  }

  await sendEmailVerification(auth.currentUser)
}

export async function refreshCurrentUser(): Promise<void> {
  if (!auth?.currentUser) {
    return
  }

  await auth.currentUser.reload()
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null)
    return () => undefined
  }

  return onAuthStateChanged(auth, callback)
}
