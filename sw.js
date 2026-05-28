const CACHE = 'gastos-v5';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/classifier.js', '/api.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request)).catch(() => caches.match('/index.html'))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.notification.data?.action || 'pending';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      const client = list.find(c => c.url.includes(self.registration.scope));
      if (client) {
        client.focus();
        client.postMessage({ type: 'OPEN_TAB', tab: action });
      } else {
        clients.openWindow(`/?tab=${action}`);
      }
    })
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATION') {
    const { delay, title, body, data } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data,
        actions: [
          { action: 'classify', title: '✅ Clasificar ahora' },
          { action: 'dismiss', title: 'Más tarde' }
        ]
      });
    }, delay);
  }
});
