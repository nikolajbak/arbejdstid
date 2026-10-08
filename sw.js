// Appens egne filer hentes fra nettet først og falder tilbage på cachen uden net.
// Derfor skal intet tal hæves ved en ny udgivelse: telefonerne får de nye filer af sig selv.
const CACHE = 'arbejdstid';
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
  'post.js',
  'team.js',
  'teamark.js',
  'tid.js',
  'historik.js',
  'indstillinger.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  ...['app', 'auth', 'firestore'].map((f) => `${FIREBASE}firebase-${f}.js`),
];

const VENT_PAA_NET = 3000;

const egen = (url) => url.startsWith(self.location.origin + '/');

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

// Henter fra nettet forbi browserens HTTP-cache og gemmer svaret, hvis det lykkes.
async function hentFrisk(request) {
  const svar = await fetch(request, { cache: 'no-cache' });
  if (svar.ok) {
    const c = await caches.open(CACHE);
    await c.put(request, svar.clone());
  }
  return svar;
}

async function netFoerst(request) {
  const net = hentFrisk(request);
  const ur = new Promise((ok) => setTimeout(ok, VENT_PAA_NET));
  try {
    const svar = await Promise.race([net, ur]);
    if (svar) return svar;
  } catch { /* uden net: brug cachen */ }
  const gemt = await caches.match(request, { ignoreSearch: true });
  return gemt || net;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Kun appens egne filer og Firebase-koden. Alt andet (fx databasen) går direkte til nettet.
  const url = e.request.url;
  if (egen(url)) e.respondWith(netFoerst(e.request));
  // Firebase-filerne har versionen i adressen og ændrer sig aldrig.
  else if (url.startsWith(FIREBASE)) e.respondWith(caches.match(e.request).then((svar) => svar || fetch(e.request)));
});

// Siden spørger, når appen kommer frem igen: er nogen af appens filer ændret siden sidst?
// Svaret er sandt, hvis mindst én fil er ny. Cachen opdateres samtidig.
async function erDerNyt() {
  const c = await caches.open(CACHE);
  const egne = FILER.filter((f) => !f.startsWith(FIREBASE));
  const aendret = await Promise.all(egne.map(async (f) => {
    try {
      const gammel = await c.match(f);
      const svar = await fetch(f, { cache: 'no-cache' });
      if (!svar.ok) return false;
      const ny = await svar.clone().text();
      await c.put(f, svar);
      return !gammel || (await gammel.text()) !== ny;
    } catch {
      return false;
    }
  }));
  return aendret.some(Boolean);
}

self.addEventListener('message', (e) => {
  if (e.data !== 'tjek') return;
  e.waitUntil(erDerNyt().then((nyt) => e.source.postMessage({ nyt })));
});
