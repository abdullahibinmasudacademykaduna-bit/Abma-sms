/* =========================================================
   Greenwood SMS — Firestore data layer (production)
   Drop-in replacement for js/db.js. Exposes the exact same
   DB API (all/get/add/update/remove/count/uid/collection/
   settings/updateSettings/exportJSON/importJSON) so every
   module in js/modules/*.js keeps working unmodified — they
   only ever call DB.*, never localStorage or Firestore
   directly.

   HOW IT STAYS SYNCHRONOUS:
   Firestore's real API is async, but this app's ~20 modules
   were all written against a synchronous DB.all()/DB.get().
   Rewriting every module to handle promises is a much bigger
   job than swapping the backend, so instead this file keeps
   an in-memory cache (`state`) that mirrors Firestore:
     - On boot, it opens a live onSnapshot listener on every
       known collection. Whenever Firestore changes — from
       this tab, another tab, another device, or another
       user — the cache updates and ROUTER.refresh() re-draws
       the current screen.
     - DB.add/update/remove write to the cache immediately
       (optimistic UI — the button click feels instant) and
       fire the real Firestore write in the background. If
       that write fails, the next snapshot event corrects the
       cache back to what the server actually has.

   This is a normal, well-understood pattern for small-to-
   medium Firestore apps. The trade-off: a write that fails
   (e.g. a permissions error, or the device goes offline
   without persistence enabled) will look like it worked for
   a moment before snapping back. For a school SMS with a
   handful of concurrent staff users, that's an acceptable
   trade for not rewriting 20 files.

   REQUIRES: js/firebase-config.js loaded BEFORE this file
   (it calls firebase.initializeApp(...) and sets
   window.FIREBASE_ENABLED = true). See FIREBASE_MIGRATION.md.
   ========================================================= */

const DB = (function(){
  const COLLECTIONS = [
    'students','teachers','staff','classes','subjects',
    'attendance','attendanceRecords','exams','results','fees','feeItems',
    'library','libraryLoans','timetable','notices','activities','events',
    'inventory','health','assignments','communications','users','expenditures',
  ];

  let state = { settings: {} };
  let db = null;
  let settingsUnsub = null;
  const collectionUnsubs = {};
  let ready = Promise.resolve(); // pre-auth placeholder; replaced by init()

  function uid(prefix){
    // Used when we need a client-side id before the Firestore write
    // resolves (optimistic add). Firestore's own auto-id is used
    // instead whenever we're not pre-supplying one.
    return (prefix ? prefix + '_' : '') + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
  }

  function detachAllListeners(){
    Object.values(collectionUnsubs).forEach(unsub => { if(unsub) unsub(); });
    if(settingsUnsub) settingsUnsub();
  }

  // Called once after a successful sign-in (from auth.firebase.js), and
  // again on every subsequent login. Firestore's security rules gate
  // almost every collection behind "signed in" or a specific role, so
  // attempting to listen BEFORE auth is known would just get a
  // permission-denied error — and Firestore listeners don't silently
  // retry after that, so it has to be attached fresh, after auth,
  // every time. Returns a promise that resolves once every collection
  // has received its first snapshot (or been denied — a denied
  // collection just resolves as an empty cache, consistent with that
  // role not being able to see it in the UI either).
  function init(){
    detachAllListeners();
    if(!db){
      db = firebase.firestore();
      db.enablePersistence({synchronizeTabs:true}).catch(err=>{
        console.warn('Firestore offline persistence unavailable:', err.code);
      });
    }

    let resolveReady;
    ready = new Promise(res=> resolveReady = res);
    let pending = COLLECTIONS.length + 1; // +1 for settings
    let settled = false;
    function markOne(){
      pending -= 1;
      if(pending <= 0 && !settled){ settled = true; resolveReady(); }
    }

    COLLECTIONS.forEach(name=>{
      state[name] = state[name] || [];
      collectionUnsubs[name] = db.collection(name).onSnapshot(snap=>{
        state[name] = snap.docs.map(d=>({id:d.id, ...d.data()}));
        if(!settled) markOne();
        else ROUTER.refresh();
      }, err=>{
        console.error(`Firestore listener failed for "${name}":`, err);
        state[name] = []; // no access -> reads as empty, matches what the UI should show
        if(!settled) markOne();
      });
    });

    settingsUnsub = db.collection('meta').doc('settings').onSnapshot(doc=>{
      state.settings = doc.exists ? doc.data() : {};
      if(!settled) markOne();
      else ROUTER.refresh();
    }, err=>{
      console.error('Firestore listener failed for settings:', err);
      if(!settled) markOne();
    });

    return ready;
  }

  function collection(name){
    if(!state[name]) state[name] = [];
    return state[name];
  }

  function all(name){ return collection(name).slice(); }

  function get(name, id){ return collection(name).find(r => r.id === id) || null; }

  function add(name, record){
    const id = record.id || uid(name.slice(0,3));
    const toWrite = {...record};
    delete toWrite.id; // Firestore stores the id as the doc key, not a field
    const optimistic = {id, ...record};
    collection(name).push(optimistic);
    db.collection(name).doc(id).set(toWrite).catch(err=>{
      console.error(`Failed to save to "${name}":`, err);
      UI?.toast?.(`Couldn't save — ${err.message}`, 'error');
    });
    return optimistic;
  }

  function update(name, id, patch){
    const idx = collection(name).findIndex(r=>r.id===id);
    if(idx===-1) return null;
    const updated = {...state[name][idx], ...patch};
    state[name][idx] = updated;
    db.collection(name).doc(id).set(patch, {merge:true}).catch(err=>{
      console.error(`Failed to update "${name}/${id}":`, err);
      UI?.toast?.(`Couldn't save changes — ${err.message}`, 'error');
    });
    return updated;
  }

  function remove(name, id){
    state[name] = collection(name).filter(r=>r.id!==id);
    db.collection(name).doc(id).delete().catch(err=>{
      console.error(`Failed to delete "${name}/${id}":`, err);
      UI?.toast?.(`Couldn't delete — ${err.message}`, 'error');
    });
  }

  function count(name){ return collection(name).length; }

  function settings(){ return state.settings || {}; }

  function updateSettings(patch){
    state.settings = {...state.settings, ...patch};
    db.collection('meta').doc('settings').set(patch, {merge:true}).catch(err=>{
      console.error('Failed to save settings:', err);
      UI?.toast?.(`Couldn't save settings — ${err.message}`, 'error');
    });
  }

  // save()/reset() existed in the localStorage version for the JSON
  // backup/restore feature in Settings. There's nothing to "save"
  // here (every write already went to Firestore), and "reset" is
  // deliberately NOT wired to wipe production data — that's a
  // one-time job done via scripts/migrate-seed-data.js, not a button
  // a logged-in user can press by accident.
  function save(){ /* no-op: writes already went to Firestore */ }
  function reset(){ console.warn('DB.reset() is disabled in Firebase mode. Use scripts/migrate-seed-data.js instead.'); }

  function exportJSON(){ return JSON.stringify(state, null, 2); }

  function importJSON(json){
    // Bulk-import writes every record to Firestore, chunked into
    // sequential batches of 400 (Firestore's hard cap is 500 writes
    // per batch). This is what Settings -> Restore backup calls, and
    // it's also a full alternative to scripts/migrate_seed_data.py if
    // you don't have a computer handy: sign in as Super Admin in the
    // browser and restore a full backup straight from here — no
    // terminal, no Python, no CLI. It returns a promise that resolves
    // once every batch has committed.
    let parsed;
    try{ parsed = JSON.parse(json); } catch(e){ throw new Error('Invalid JSON'); }

    const jobs = [];
    Object.keys(parsed).forEach(name=>{
      if(name==='settings'){
        jobs.push(()=> db.collection('meta').doc('settings').set(parsed.settings || {}, {merge:true}));
        return;
      }
      if(!COLLECTIONS.includes(name)) return;
      const records = parsed[name] || [];
      for(let i=0; i<records.length; i+=400){
        const chunk = records.slice(i, i+400);
        jobs.push(()=>{
          const batch = db.batch();
          chunk.forEach(record=>{
            const id = record.id || uid(name.slice(0,3));
            const toWrite = {...record}; delete toWrite.id;
            batch.set(db.collection(name).doc(id), toWrite);
          });
          return batch.commit();
        });
      }
    });

    // Run sequentially (not all at once) so a slow/flaky connection
    // doesn't fire 20 batches in parallel and fail them all together —
    // this matters more here than on a PC since phone data connections
    // are more likely to hiccup mid-import.
    return jobs.reduce((chain, job) => chain.then(job), Promise.resolve());
  }

  return { ready, init, all, get, add, update, remove, count, save, reset, exportJSON, importJSON, uid, collection, settings, updateSettings };
})();
