/* =========================================================
   Greenwood SMS — Firebase Auth layer (production)
   Drop-in replacement for js/auth.js. Same public shape
   (ROLES, ROLE_PERMS, can, login, logout, currentUser, ready,
   loginUIMode) so app.js and every module work unmodified.

   ROLE_PERMS is copy-pasted from auth.js on purpose — it's the
   client-side UI gate (which nav items render). The real
   security boundary is firestore.rules, which re-derives the
   same role from the signed-in user's own Firestore doc
   server-side. If the two drift apart, worst case is a nav
   item that renders but 403s on read — annoying, not unsafe.
   Keep them in sync when you add a module.

   Firebase Auth's own user record only holds email/uid — your
   role, name, and links to a teacher/staff/student record live
   in Firestore /users/{uid}, keyed by the SAME id as the Auth
   user (not a random doc id). Create accounts via Firebase
   Console → Authentication → Add user, copy the generated UID,
   then create /users/{that-uid} in Firestore (or use User
   Management in-app once signed in as Super Admin — see
   FIREBASE_MIGRATION.md for the bootstrap chicken-and-egg).

   REQUIRES: js/firebase-config.js and js/db.firebase.js loaded
   BEFORE this file.
   ========================================================= */

const AUTH = (function(){
  const ROLES = [
    'Super Admin','Principal','Head Teacher','Teacher','Accountant','Parent','Student'
  ];

  const ROLE_PERMS = {
    'Super Admin': '*',
    'Principal': ['dashboard','students','teachers','staff','classes','attendance','exams','fees','expenditure','timetable','library','notice','homework','inventory','health','events','comms','userManagement','roles','reports','settings'],
    'Head Teacher': ['dashboard','students','teachers','classes','attendance','exams','timetable','library','notice','homework','events','reports'],
    'Teacher': ['students','attendance','exams','timetable','homework','notice','library','teacherPortal'],
    'Accountant': ['dashboard','fees','expenditure','reports','notice','inventory','comms'],
    'Parent': ['notice','events','parentPortal'],
    'Student': ['notice','events','studentPortal'],
  };

  function can(role, moduleKey){
    const perms = ROLE_PERMS[role];
    if(!perms) return false;
    if(perms === '*') return true;
    return perms.includes(moduleKey);
  }

  let cachedUser = null;
  let readyResolve;
  const authStateReady = new Promise(res=> readyResolve = res);
  // Only waits on Firebase Auth's own state check — NOT on Firestore
  // data. Firestore listeners can't be attached until we know whether
  // there's a signed-in user (almost every collection's security rule
  // requires it), so DB.init() happens inside this callback, after
  // auth is known, rather than before.
  const ready = authStateReady;

  firebase.auth().onAuthStateChanged(fbUser=>{
    if(!fbUser){ cachedUser = null; readyResolve(); return; }
    // Session restore on page reload while already signed in: Firestore
    // listeners were never attached this page-load (they're only ever
    // attached inside login()/here, post-auth), so attach them now.
    DB.init().then(()=>{
      // /users/{uid} doc id matches the Firebase Auth uid exactly —
      // that's how a signed-in session maps to a role/name/links.
      const record = DB.get('users', fbUser.uid);
      cachedUser = record ? {...record, id: fbUser.uid} : null;
      if(!cachedUser){
        console.error(`No /users/${fbUser.uid} Firestore doc found for signed-in account ${fbUser.email}. They're authenticated but have no role — see FIREBASE_MIGRATION.md.`);
      }
      readyResolve();
    });
  }, err=>{
    console.error('Firebase Auth state listener error:', err);
    readyResolve();
  });

  function login(email, password){
    return firebase.auth().signInWithEmailAndPassword(email, password).then(cred=>{
      // Attach Firestore listeners now — this is the FIRST point in the
      // whole page's lifetime where request.auth is populated, so it's
      // also the first point where firestore.rules will allow reading
      // anything beyond the public login-screen stats.
      return DB.init().then(()=>{
        const record = DB.get('users', cred.user.uid);
        if(!record){
          return firebase.auth().signOut().then(()=>{
            throw new Error('Your account has no role assigned yet. Contact your Super Admin.');
          });
        }
        if((record.status||'Active')==='Inactive'){
          return firebase.auth().signOut().then(()=>{
            throw new Error('This account has been deactivated.');
          });
        }
        cachedUser = {...record, id: cred.user.uid};
        return cachedUser;
      });
    }).catch(err=>{
      // Firebase's raw error codes aren't user-friendly — translate the common ones.
      const messages = {
        'auth/wrong-password':'Incorrect password.',
        'auth/user-not-found':'No account found with that email.',
        'auth/too-many-requests':'Too many attempts — try again in a few minutes.',
        'auth/invalid-email':'That email address looks invalid.',
        'auth/user-disabled':'This account has been disabled.',
      };
      throw new Error(messages[err.code] || err.message);
    });
  }

  function logout(){
    cachedUser = null;
    return firebase.auth().signOut();
  }

  function currentUser(){ return cachedUser; }

  function resetPassword(email){
    return firebase.auth().sendPasswordResetEmail(email);
  }

  return { ROLES, ROLE_PERMS, can, login, logout, currentUser, resetPassword, ready, loginUIMode: 'password' };
})();
