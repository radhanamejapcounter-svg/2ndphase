// ═══════════════════════════════════════════════
// Radha Naam Jap — Service Worker
// v11: fixed openWindow path, navigation fallback,
//      index.html cache-busting, scope-relative URLs
// ═══════════════════════════════════════════════
const CACHE = 'radha-jap-v11';

// Derive the app's base path from the SW location
// Works on any host: localhost, GitHub Pages subfolder, custom domain
const SW_SCOPE = self.registration.scope;

const PRECACHE_EXTERNALS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi&family=Hind+Siliguri:wght@400;600;700&family=Cinzel+Decorative:wght@400;700&family=EB+Garamond:wght@400;600&family=Inter:wght@300;400;500;600&display=swap',
  'https://accounts.google.com/gsi/client',
  'https://apis.google.com/js/api.js'
];

const BYPASS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
  'firebaseio.com',
  'oauth2.googleapis.com',
  'accounts.google.com'
];

// ── Install: pre-cache critical assets ──
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled([
        cache.add(SW_SCOPE + 'index.html').catch(() => {}),
        ...PRECACHE_EXTERNALS.map(url => cache.add(url).catch(() => {}))
      ])
    )
  );
});

// ── Activate: delete old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Bypass Firebase & Google auth
  if (BYPASS.some(h => url.href.includes(h))) return;

  const scopePath = new URL(SW_SCOPE).pathname;
  const isNavOrIndex =
    e.request.mode === 'navigate' ||
    url.pathname === scopePath ||
    url.pathname === scopePath + 'index.html' ||
    url.pathname.endsWith('/');

  // Navigation / index.html: network-first so app always opens fresh
  if (isNavOrIndex) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        })
        .catch(() =>
          caches.match(SW_SCOPE + 'index.html')
            .then(cached => cached || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // Everything else: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request)
        .then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'error') {
            caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => null);

      if (cached) return cached;
      return networkFetch.then(resp => resp || new Response('Offline', { status: 503 }));
    })
  );
});

// ── Show notification (from page) ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    e.waitUntil(
      self.registration.showNotification(e.data.title, {
        body: e.data.body,
        tag: e.data.tag,
        renotify: true,
        vibrate: [200, 100, 200]
      })
    );
  }
});

// ── Notification tap: open/focus app at correct URL ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(SW_SCOPE) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(SW_SCOPE + 'index.html');
    })
  );
});
