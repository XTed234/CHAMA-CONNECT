import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  hasSeenIntro: boolean;
  setHasSeenIntro: (seen: boolean) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: UserRole,
    phoneNumber?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY_INTRO = '@connectchama_has_seen_intro';

// Firebase error codes are not friendly, so translate the common ones.
function friendlyAuthError(err: unknown): Error {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new Error('Incorrect email or password.');
    case 'auth/email-already-in-use':
      return new Error('An account with this email already exists.');
    case 'auth/weak-password':
      return new Error('Password must be at least 6 characters.');
    case 'auth/invalid-email':
      return new Error('Enter a valid email address.');
    case 'auth/network-request-failed':
      return new Error('No connection. Check your internet and try again.');
    default:
      return err instanceof Error ? err : new Error('Something went wrong. Try again.');
  }
}

// Reads the profile document that signUp() wrote to users/{uid}.
async function loadProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<User, 'uid'>), uid };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasSeenIntro, setHasSeenIntroState] = useState<boolean>(false);
  const [introReady, setIntroReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  // The app should only decide where to go once BOTH of these have finished.
  const loading = !(introReady && authReady);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_INTRO)
      .then((value) => {
        if (value === 'true') setHasSeenIntroState(true);
      })
      .catch((err) => console.error('[Auth] Could not read intro flag:', err))
      .finally(() => setIntroReady(true));
  }, []);

  // Firebase tells us when someone is signed in or out, including after an app restart.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const profile = await loadProfile(firebaseUser.uid);
        // If the profile is not there yet, signUp() is still writing it and will set the user itself.
        if (profile) setUser(profile);
      } catch (err) {
        console.error('[Auth] Could not load profile:', err);
      } finally {
        setAuthReady(true);
      }
    });
    return unsubscribe;
  }, []);

  const setHasSeenIntro = async (seen: boolean) => {
    setHasSeenIntroState(seen);
    await AsyncStorage.setItem(STORAGE_KEY_INTRO, seen ? 'true' : 'false');
  };

  const signIn = async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await loadProfile(cred.user.uid);
      if (!profile) throw new Error('Your profile was not found. Please register again.');
      setUser(profile);
    } catch (err) {
      throw friendlyAuthError(err);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole = 'member',
    phoneNumber?: string
  ) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const profile: Omit<User, 'uid'> = {
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber ?? '', // Firestore rejects undefined values
        role,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'users', cred.user.uid), profile);
      setUser({ ...profile, uid: cred.user.uid });
    } catch (err) {
      throw friendlyAuthError(err);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!user) return;
    const { uid: _ignored, ...changes } = data;
    await updateDoc(doc(db, 'users', user.uid), changes);
    setUser({ ...user, ...changes });
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, hasSeenIntro, setHasSeenIntro, signIn, signUp, signOut, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
