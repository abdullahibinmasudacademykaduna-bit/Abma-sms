/* =========================================================
   Greenwood SMS — Firebase project config
   1. Rename this file to js/firebase-config.js (drop ".example")
   2. Fill in the values below from:
      Firebase Console → Project Settings → General →
      "Your apps" → Web app → SDK setup and configuration
   3. See FIREBASE_MIGRATION.md for the full setup path.

   This file must load AFTER the Firebase CDN <script> tags and
   BEFORE js/db.firebase.js / js/auth.firebase.js in index.html.
   ========================================================= */

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

firebase.initializeApp(firebaseConfig);

// Flips the login screen (and DB.ready/AUTH.ready wiring in app.js)
// from demo mode to real Firebase Auth + Firestore.
window.FIREBASE_ENABLED = true;
