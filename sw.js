const CACHE_NAME = 'prozorro-tracker-v1';
const ASSETS = [
    './',
    './index.html',
    './styles/style.css',
    './scripts/app.js',
    './manifest.json',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});

// Push notification event listener
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'Prozorro Tracker', body: 'Знайдено новий тендер!' };
    const options = {
        body: data.body,
        icon: 'assets/icon-192.png',
        badge: 'assets/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
