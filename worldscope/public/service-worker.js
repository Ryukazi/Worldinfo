const V = 'ws-shell-v1', D = 'ws-data-v1';
const SHELL = ['/', '/index.html', '/src/styles.css', '/src/app.js', '/src/services/country-service.js',
  '/offline.html', '/manifest.json', '/icons/icon-192.png', '/icons/favicon.svg'];
const LIVE = ['api.open-meteo.com', 'geocoding-api.open-meteo.com', 'api.frankfurter.dev']; // never cached
const DATA = ['api.siputzx.my.id', 'restcountries.com'];

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== D).map(k => caches.delete(k)))).then(() => self.clients.claim())));

async function netFirst(req) {
  try { const res = await fetch(req); if (res.ok) { const cp = res.clone(); caches.open(D).then(c => c.put(req, cp)); } return res; }
  catch (e) { const hit = await caches.match(req); if (hit) return hit; throw e; }
}
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (LIVE.includes(u.hostname)) return;
  if (DATA.includes(u.hostname) || u.pathname === '/api/country') return e.respondWith(netFirst(r));
  if (r.mode === 'navigate') return e.respondWith(fetch(r).catch(() => caches.match('/index.html').then(x => x || caches.match('/offline.html'))));
  if (u.origin === location.origin) e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }).catch(() => hit);
    return hit || net;
  }));
});
