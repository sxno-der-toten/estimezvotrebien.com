const CACHE_NAME = 'evb-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/global.css',
    '/main.js',
    '/images/logo.png'
];

// Installation : Mise en cache des fichiers critiques
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

// Stratégie : Cache First (Réponse instantanée)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});