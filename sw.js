// Caches the app shell so it opens instantly. Translation still needs internet.
const CACHE = 'interp-v5';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'translate.js', 'audio.js', 'stt.js', 'schedule.js', 'camera.js', 'currency.js', 'manifest.json', 'icon.svg', 'icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
