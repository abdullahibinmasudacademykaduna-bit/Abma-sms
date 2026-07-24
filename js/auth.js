/* =========================================================
   Greenwood SMS — Auth & Role/Permission layer
   Simulated client-side session. In a production deployment,
   `login()` would call Firebase Authentication and `ROLE_PERMS`
   would be mirrored by Firestore security rules server-side.

   Module-level permissions live here. Class-level restriction
   for Teachers (a teacher only sees their own assigned classes)
   is handled separately per-module via getScopedClasses() in
   js/modules/people.js — that's row-level filtering, not a
   module on/off switch, so it doesn't belong in this matrix.
   ========================================================= */

const AUTH = (function(){
  const SESSION_KEY = 'greenwood_sms_session';

  const ROLES = [
    'Super Admin','Principal','Head Teacher','Teacher','Accountant','Parent','Student'
  ];

  // Module keys → which roles may see/use them.
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

  function login(userId){
    const user = DB.get('users', userId);
    if(!user) return null;
    localStorage.setItem(SESSION_KEY, JSON.stringify({userId, ts: Date.now()}));
    return user;
  }

  function logout(){
    localStorage.removeItem(SESSION_KEY);
  }

  function currentUser(){
    try{
      const raw = localStorage.getItem(SESSION_KEY);
      if(!raw) return null;
      const {userId} = JSON.parse(raw);
      return DB.get('users', userId);
    }catch(e){ return null; }
  }

  return { ROLES, ROLE_PERMS, can, login, logout, currentUser, ready: Promise.resolve(), loginUIMode: 'demo' };
})();
