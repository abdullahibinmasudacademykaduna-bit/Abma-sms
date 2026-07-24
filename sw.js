/* Greenwood SMS — service worker
   Caches the app shell so the app keeps working offline.
   All data lives in localStorage on the client, so once the
   shell is cached the whole app is usable without a network. */

const CACHE_NAME = 'greenwood-sms-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/icons.js',
  './js/db.js',
  './js/auth.js',
  './js/ui.js',
  './js/charts.js',
  './js/modules/dashboard.js',
  './js/modules/people.js',
  './js/modules/academics.js',
  './js/modules/attendance.js',
  './js/modules/exams.js',
  './js/modules/fees.js',
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
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(()=>{})
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

  // Network-first for CDN (Chart.js, fonts) so updates aren't stuck stale;
  // cache-first for same-origin app shell so it works offline instantly.
  const url = new URL(req.url);
  if(url.origin === self.location.origin){
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res=>{
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      }).catch(()=> cached))
    );
  } else {
    event.respondWith(
      fetch(req).catch(()=> caches.match(req))
    );
  }
});
