import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAuIaTj_Sqy6CBu63fqioiWsm0CfTAphUY",
  authDomain: "chama-connect-f513f.firebaseapp.com",
  projectId: "chama-connect-f513f",
  storageBucket: "chama-connect-f513f.firebasestorage.app",
  messagingSenderId: "724204755746",
  appId: "1:724204755746:web:4de16fbc47ef3768abe37b"
};

let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export default app;
