const CACHE_NAME = 'evb-v1';
const ASSETS_TO_CACHE = [
    './',           // On cache la racine (index)
    './index.html', // On garde le fichier physique en secours
    './css/global.css',
    './main.js',
    './images/logo.png'
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
            if (response) return response;

            return fetch(event.request).then((networkResponse) => {
                // Si le serveur essaie de rediriger (ex: / vers index.html), 
                // on renvoie la réponse sans la mettre en cache pour ne pas fâcher Safari.
                if (networkResponse.redirected) {
                    return networkResponse;
                }
                return networkResponse;
            }).catch(() => {
                // Fallback si on est hors ligne et que la ressource n'est pas en cache
                if (event.request.mode === 'navigate') {
                    return caches.match('./');
                }
            });
        })
    );
});