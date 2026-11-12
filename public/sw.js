// Youniverse Sovereign Service Worker
const CACHE_NAME = 'youniverse-sovereign-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json',
  '/index.css'
];

// Install: Cache essential shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Core assets precache partial failure:', err);
      });
    })
  );
});

// Activate: Purge obsolete caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Offline resilience strategy
self.addEventListener('fetch', (event) => {
  // Only handle HTTP/HTTPS GET requests; let browser handle WebSockets and other protocols
  if (!event.request.url.startsWith('http') || event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Strictly decline cross-origin requests and local /api/ proxy routes
  // This allows Supabase, Stripe, audio streams, and third-party APIs to bypass SW caching completely
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML / Navigation requests: Network-first, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match('/index.html');
        return (
          cached ||
          new Response('Offline - Youniverse', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          })
        );
      })
    );
    return;
  }

  // Static Assets (images, fonts, scripts, css): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      // Return cached response immediately if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // If no cache hit, wait for network fetch; if network also fails, return fallback Response instead of undefined
      return fetchPromise.then((networkRes) => {
        if (networkRes) return networkRes;
        return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
      });
    })
  );
});
