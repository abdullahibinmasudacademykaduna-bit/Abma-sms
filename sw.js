/* Greenwood SMS — service worker
   Caches the app shell so the app keeps working offline.
   All data lives in localStorage (demo) or Firestore (production) —
   either way, once the shell is cached the whole app is usable
   without a network.

   IMPORTANT: bump CACHE_NAME whenever app-shell files change. The
   fetch handler below is cache-first for same-origin files, so once
   something is cached it's served from cache FOREVER — pushing new
   code to GitHub has zero effect on returning visitors until the
   browser detects the service worker script itself changed (which
   only happens when this file's bytes differ), which is what
   triggers the cache purge in 'activate' below. A stale CACHE_NAME
   here is why a real fix can be live on GitHub yet look like it never
   deployed for anyone who's already visited the site before. */

const CACHE_NAME = 'greenwood-sms-v5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/icons.js',
  './js/db.js',
  './js/auth.js',
  './js/db.firebase.js',
  './js/auth.firebase.js',
  './js/firebase-config.js',
  './js/ui.js',
  './js/charts.js',
  './js/modules/dashboard.js',
  './js/modules/people.js',
  './js/modules/academics.js',
  './js/modules/attendance.js',
  './js/modules/exams.js',
  './js/modules/fees.js',
  './js/modules/expenditure.js',
  './js/modules/timetable.js',
  './js/modules/library.js',
  './js/modules/generic.js',
  './js/modules/portals.js',
  './js/modules/users.js',
  './js/modules/settings.js',
  './js/router.js',
  './js/app.js',
  './icons/icon.svg',
];

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll() fails the whole install if ANY url 404s. firebase-config.js
      // only exists once a production deploy creates it (not in the demo
      // kit before setup), so cache what we can rather than let one
      // missing file block caching everything else.
      Promise.all(APP_SHELL.map(url => cache.add(url).catch(()=>{})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event=>{
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin === self.location.origin){
    // Network-first for the app's own files: always fetch the latest
    // version when online, and only serve the cached copy if the
    // network request fails (offline support). This is the opposite
    // of the old cache-first approach, which — combined with a static
    // CACHE_NAME — meant a real push to GitHub could sit there fixed
    // and correct while every returning visitor kept silently loading
    // the first-ever cached version, looking exactly like the fix
    // "didn't work." Costs a little raw load speed; worth it for an
    // app that's still being actively fixed.
    event.respondWith(
      fetch(req).then(res=>{
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      }).catch(()=> caches.match(req))
    );
  } else {
    event.respondWith(
      fetch(req).catch(()=> caches.match(req))
    );
  }
});
