import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lavLaesKvittering, modelListe, rang, rens, KvitteringFejl } from '../src/kvittering.js';

const kvittering = { erKvittering: true, butik: 'Q8', dato: '2026-10-20', total: 500, moms: 100, braendstof: true, varer: [] };
const MODELLER = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-pro', 'gemini-flash-latest', 'gemma-3-27b', 'text-embedding-004']
  .map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] }));

const json = (krop, status = 200) => new Response(JSON.stringify(krop), { status });
const gemini = (indhold) => json({ candidates: [{ content: { parts: [{ text: 'tanker', thought: true }, { text: JSON.stringify(indhold) }] } }] });

function lavKv() {
  const lager = new Map();
  return {
    lager,
    async get(k) { return lager.has(k) ? JSON.parse(lager.get(k)) : null; },
    async put(k, v) { lager.set(k, v); },
  };
}

// svar: model → funktion(krop) der giver et Response, eller et løfte, der aldrig afgøres.
function opsaet(svar, { tid = 1000 } = {}) {
  const kald = [];
  const kv = lavKv();
  const laes = lavLaesKvittering({
    noegle: 'n', kv, hedge: 20, vent: async () => {}, nu: () => tid,
    async hent(url, init) {
      const model = /models\/([^:?]+):generateContent/.exec(url)?.[1];
      kald.push({ model: model ?? 'liste', krop: init.body && JSON.parse(init.body), noegle: init.headers['x-goog-api-key'] });
      if (!model) return json({ models: MODELLER });
      const f = svar[decodeURIComponent(model)];
      if (!f) return json({ error: { message: 'not found' } }, 404);
      return f(JSON.parse(init.body), init.signal);
    },
  });
  return { laes, kald, kv };
}

const haenger = (_, signal) => new Promise((_, fejl) => signal.addEventListener('abort', () => fejl(new Error('afbrudt'))));

test('rens holder kun kendte felter og rimelige værdier', () => {
  assert.deepEqual(rens({ erKvittering: false, butik: 'x' }), { erKvittering: false });
  assert.deepEqual(rens({
    erKvittering: true, butik: ' Netto ', dato: '2026-13-40', total: 99.999, moms: 200, braendstof: 'ja',
    varer: [{ navn: 'Mælk', beloeb: 12.5 }, { navn: '', beloeb: 3 }, { navn: 'Brød', beloeb: -4 }], ekstra: 1,
  }), {
    erKvittering: true, butik: 'Netto', dato: '', total: 100, moms: 0, braendstof: false,
    varer: [{ navn: 'Mælk', beloeb: 12.5 }, { navn: 'Brød', beloeb: 0 }],
  });
});

test('rang og modelListe vælger nyeste Flash først og springer aliasser og andet over', () => {
  for (const n of ['gemini-flash-latest', 'gemma-3-27b', 'text-embedding-004', 'gemini-2.5-flash-image']) assert.equal(rang(n), -1, n);
  const alle = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-pro'];
  assert.deepEqual(modelListe(alle, {}, 0), ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-pro']);
  const helbred = { 'gemini-3.5-flash': { straf: 10 }, 'gemini-2.5-flash': { vaek: 10 } };
  assert.deepEqual(modelListe(alle, helbred, 5), ['gemini-3.5-flash-lite', 'gemini-3.5-pro', 'gemini-3.5-flash']);
});

test('læser med nyeste Flash, tænkeloft og skema, og cacher modellisten', async () => {
  const { laes, kald, kv } = opsaet({ 'gemini-3.5-flash': () => gemini(kvittering) });
  const r = await laes('image/jpeg', 'QUJD');
  assert.equal(r.butik, 'Q8');
  assert.deepEqual(kald.map((k) => k.model), ['liste', 'gemini-3.5-flash']);
  assert.equal(kald[1].noegle, 'n');
  const { contents, generationConfig } = kald[1].krop;
  assert.deepEqual(contents[0].parts[0], { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  assert.deepEqual(generationConfig.thinkingConfig, { thinkingBudget: 1024 });
  assert.equal(generationConfig.responseMimeType, 'application/json');
  assert.ok(generationConfig.responseSchema);
  assert.deepEqual(JSON.parse(kv.lager.get('gemini:modeller')).alle.slice(0, 2), ['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  await laes('image/jpeg', 'QUJD');
  assert.equal(kald.filter((k) => k.model === 'liste').length, 1);
});

test('en langsom model får følgeskab af den næste, og første svar vinder', async () => {
  const { laes, kald } = opsaet({ 'gemini-3.5-flash': haenger, 'gemini-2.5-flash': () => gemini(kvittering) });
  assert.equal((await laes('image/jpeg', 'x')).butik, 'Q8');
  assert.deepEqual(kald.map((k) => k.model), ['liste', 'gemini-3.5-flash', 'gemini-2.5-flash']);
});

test('fejl huskes: 404 udelukkes, 503 straffes, og afvist tænkning prøves uden', async () => {
  const { laes, kald, kv } = opsaet({
    'gemini-3.5-flash': () => json({ error: { message: 'overloaded' } }, 503),
    'gemini-3.5-flash-lite': () => json({ error: { message: 'x' } }, 503),
    'gemini-3.5-pro': (krop) => (krop.generationConfig.thinkingConfig
      ? json({ error: { message: 'thinking budget is not supported' } }, 400)
      : gemini(kvittering)),
  });
  assert.equal((await laes('image/jpeg', 'x')).butik, 'Q8');
  const helbred = JSON.parse(kv.lager.get('gemini:helbred'));
  assert.ok(helbred['gemini-3.5-flash'].straf > 1000);
  assert.ok(helbred['gemini-2.5-flash'].vaek > 1000);
  assert.ok(helbred['gemini-3.5-pro'].udenTaenk > 1000);
  assert.equal(kald.filter((k) => k.model === 'gemini-3.5-pro').length, 2);
});

test('fejl giver status til appen', async () => {
  await assert.rejects(lavLaesKvittering({ noegle: '' })('image/jpeg', 'x'), (e) => e instanceof KvitteringFejl && e.status === 503);
  const travl = () => json({ error: { message: 'quota' } }, 429);
  const { laes, kald } = opsaet(Object.fromEntries(MODELLER.map((m) => [m.name.slice(7), travl])));
  await assert.rejects(laes('image/jpeg', 'x'), (e) => e.status === 429);
  // To omgange med fire modeller hver.
  assert.equal(kald.filter((k) => k.model !== 'liste').length, 8);
  const afvist = opsaet(Object.fromEntries(MODELLER.map((m) => [m.name.slice(7), () => json({ error: { message: 'API key not valid' } }, 400)])));
  await assert.rejects(afvist.laes('image/jpeg', 'x'), (e) => e.status === 503 && /nøglen/.test(e.message));
});
