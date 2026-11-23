// Appens egne filer kommer fra cachen, så opstarten aldrig venter på nettet.
// Siden spørger ved opstart (og når den kommer frem igen), om der er nyt; erDerNyt
// henter så alle filer på én gang og siden genindlæser med den nye udgave samlet.
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
  'profil.js',
  'vaelger.js',
  'registrering.js',
  'post.js',
  'opgave.js',
  'billede.js',
  'kvittering.js',
  'team.js',
  'teamark.js',
  'tid.js',
  'historik.js',
  'godkend.js',
  'kunder.js',
  'indstillinger.js',
  'push.js',
  'pushkoe.js',
  'markering.js',
  'push-config.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  ...['app', 'auth', 'firestore'].map((f) => `${FIREBASE}firebase-${f}.js`),
];

const egen = (url) => url.startsWith(self.location.origin + '/');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILER.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((navne) => Promise.all(navne.filter((n) => n !== CACHE && n !== MAERKE).map((n) => caches.delete(n))))
      .then(ryd)
      .then(() => self.clients.claim()),
  );
});

// Fjerner alt i cachen, der ikke er i FILER, fx adresser med ?team=… fra før.
async function ryd() {
  const c = await caches.open(CACHE);
  const kendte = new Set(FILER.map((f) => new URL(f, self.location).href));
  await Promise.all((await c.keys()).filter((r) => !kendte.has(r.url)).map((r) => c.delete(r)));
}

// Cachen først. Det, der mangler i cachen, hentes fra nettet uden at blive gemt:
// kun FILER ligger i cachen, ellers kunne en gammel kopi med en adresse som
// ./?team=… blive fundet før ./ (match ignorerer søgedelen).
async function cacheFoerst(request) {
  const gemt = await caches.match(request, { ignoreSearch: true });
  return gemt || fetch(request);
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Kun appens egne filer og Firebase-koden. Alt andet (fx databasen) går direkte til nettet.
  const url = e.request.url;
  if (egen(url)) e.respondWith(cacheFoerst(e.request));
  // Firebase-filerne har versionen i adressen og ændrer sig aldrig.
  else if (url.startsWith(FIREBASE)) e.respondWith(caches.match(e.request).then((svar) => svar || fetch(e.request)));
});

// Siden spørger ved opstart og når appen kommer frem igen: er nogen af appens filer ændret siden sidst?
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
  if (typeof e.data?.maerke === 'number') return e.waitUntil(gemMaerke(e.data.maerke));
  if (e.data !== 'tjek') return;
  e.waitUntil(erDerNyt().then((nyt) => e.source.postMessage({ nyt })));
});

// --- Push -----------------------------------------------------------------

// Tallet på appens ikon. Appen sender det rigtige tal, når den er åben; imens den ikke er
// fremme, lægger hver notifikation om noget, der venter på en selv, sit antal til.
const MAERKE = 'arbejdstid-maerke';
const MAERKE_URL = 'maerke';

async function hentMaerke() {
  const svar = await (await caches.open(MAERKE)).match(MAERKE_URL);
  return svar ? Number(await svar.text()) || 0 : 0;
}

async function gemMaerke(n) {
  await (await caches.open(MAERKE)).put(MAERKE_URL, new Response(String(n)));
}

async function taelOp(d) {
  if (d.slags !== 'afventer' && d.slags !== 'invitation') return;
  // Er appen fremme, sætter den selv tallet ud fra databasen; ellers tælles det dobbelt.
  const vinduer = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (vinduer.some((v) => v.url.startsWith(self.registration.scope) && v.visibilityState === 'visible')) return;
  const n = (await hentMaerke()) + (Number.isInteger(d.antal) && d.antal > 0 ? d.antal : 1);
  await gemMaerke(n);
  await self.navigator.setAppBadge?.(n);
}

// Workeren sender { title, body, url }; url er relativ til appen.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() ?? {}; } catch { /* ikke JSON: vis en tom besked */ }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Arbejdstid', {
      body: d.body,
      data: { url: d.url || './' },
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
    }),
    taelOp(d).catch(() => {}),
  ]));
});

// Et åbent vindue skifter til adressen og kommer frem; ellers åbnes et nyt.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    // Andre apps på samme domæne (fx på github.io) er også med i listen; kun appens egne vinduer.
    const vinduer = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const vindue = vinduer.find((v) => v.url.startsWith(self.registration.scope));
    if (vindue) {
      try {
        await vindue.focus();
        await vindue.navigate(url);
        return;
      } catch { /* fx et vindue, workeren ikke styrer: åbn et nyt */ }
    }
    await self.clients.openWindow(url);
  })());
});
