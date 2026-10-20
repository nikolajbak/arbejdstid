import { test } from 'node:test';
import assert from 'node:assert/strict';
import { koeTilfoej, koeSend, pushStatus } from '../pushkoe.js';

const NOEGLE = 'arbejdstid.pushkoe';

function lager() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const laes = (s) => JSON.parse(s.getItem(NOEGLE) || '[]');
const b = (til) => ({ teamId: 't1', til, slags: 'registreret', antal: 1 });

test('køen sender og fjerner ved 200, 401 og 403, beholder ved 500 og netværksfejl', async () => {
  const s = lager();
  for (const til of ['a', 'b', 'c', 'd', 'e', 'f']) koeTilfoej(s, b(til), 1000);
  const status = { a: 200, b: 401, c: 403, d: 500, e: 'kast', f: 400 };
  const sendt = [];
  await koeSend(s, async (m) => {
    sendt.push(m.til);
    if (status[m.til] === 'kast') throw new Error('offline');
    return status[m.til];
  }, 2000);
  assert.deepEqual(sendt, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(laes(s).map((m) => m.til), ['d', 'e']);
  assert.equal(laes(s)[0].tid, 1000);
});

test('køen dropper beskeder ældre end 7 dage uden at sende', async () => {
  const s = lager();
  koeTilfoej(s, b('gammel'), 0);
  koeTilfoej(s, b('ny'), 7 * 864e5);
  const sendt = [];
  await koeSend(s, async (m) => { sendt.push(m.til); return 500; }, 7 * 864e5 + 1);
  assert.deepEqual(sendt, ['ny']);
  assert.deepEqual(laes(s).map((m) => m.til), ['ny']);
});

test('en besked tilføjet mens køen sendes tabes ikke', async () => {
  const s = lager();
  koeTilfoej(s, b('a'), 1000);
  await koeSend(s, async () => {
    koeTilfoej(s, b('under-afsendelse'), 1500);
    return 200;
  }, 2000);
  assert.deepEqual(laes(s).map((m) => m.til), ['under-afsendelse']);
});

test('ugyldigt indhold i lageret behandles som tom kø', async () => {
  const s = lager();
  s.setItem(NOEGLE, '{ikke json');
  await koeSend(s, async () => 200, 1);
  koeTilfoej(s, b('a'), 1);
  assert.deepEqual(laes(s).map((m) => m.til), ['a']);
  s.setItem(NOEGLE, '{"a":1}');
  koeTilfoej(s, b('b'), 2);
  assert.deepEqual(laes(s).map((m) => m.til), ['b']);
});

test('pushStatus giver den rigtige tekst for hver situation', () => {
  const ok = { understoettet: true, ios: false, standalone: false, tilladelse: 'default', abonneret: false };
  assert.deepEqual(pushStatus({ ...ok, ios: true }),
    { tekst: 'Læg appen på hjemmeskærmen for at få notifikationer', kanSlaaTil: false });
  assert.deepEqual(pushStatus({ ...ok, understoettet: false }),
    { tekst: 'Ikke muligt i denne browser', kanSlaaTil: false });
  assert.deepEqual(pushStatus({ ...ok, tilladelse: 'denied' }),
    { tekst: 'Notifikationer er blokeret i browserens indstillinger', kanSlaaTil: false });
  assert.deepEqual(pushStatus({ ...ok, abonneret: true }), { tekst: 'Slået til', kanSlaaTil: false });
  assert.deepEqual(pushStatus(ok), { tekst: 'Slået fra', kanSlaaTil: true });
});
