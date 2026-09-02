import {db, auth, storage} from './firebase';

console.log('Firebase initialized:', {
  db: db ? '✅ Firestore' : '❌ Firestore',
  auth: auth ? '✅ Auth' : '❌ Auth',
  storage: storage ? '✅ Storage' : '❌ Storage',
});