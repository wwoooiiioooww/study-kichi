/* スタディきち Service Worker
   ・アプリ本体(index.html)はネット優先→オフライン時はキャッシュ(更新がすぐ届く)
   ・アイコンやフォントはキャッシュ優先(サクサク起動)
   ・Gemini APIへの通信には一切さわらない */
const CACHE = 'studykichi-v12';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // API通信(POST)はスルー
  const url = new URL(req.url);
  if (url.hostname === 'generativelanguage.googleapis.com') return;

  // ページ本体:ネット優先、だめならキャッシュ
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put('./index.html', cp));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // その他(アイコン・フォントなど):キャッシュ優先
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok && (url.origin === location.origin || url.hostname.indexOf('fonts.') === 0)) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
      }
      return r;
    }))
  );
});
