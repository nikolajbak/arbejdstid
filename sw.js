// Hæv versionen ved hver ny udgivelse, så telefonerne henter de nye filer.
const CACHE = 'arbejdstid-v5';
const FIREBASE = 'https://www.gstatic.com/firebasejs/13.0.0/';
const FILER = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'core.js',
  'store.js',
  'firebase-config.js',
  'firebase.js',
  'konto.js',
  'sky.js',
  'tilstand.js',
  'ui.js',
  'vaelger.js',
  'registrering.js',
  'tid.js',
  'historik.js',
  'indstillinger.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  ...['app', 'auth', 'firestore'].map((f) => `${FIREBASE}firebase-${f}.js`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILER.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((navne) => Promise.all(navne.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Kun appens egne filer og Firebase-koden. Alt andet (fx databasen) går direkte til nettet.
  const url = e.request.url;
  if (!url.startsWith(self.location.origin + '/') && !url.startsWith(FIREBASE)) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((svar) => svar || fetch(e.request)));
});
