import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lavLaesKvittering, rens, KvitteringFejl } from '../src/kvittering.js';

const geminiSvar = (indhold) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(indhold) }] } }] });

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

test('laesKvittering kalder Gemini med billede og skema og renser svaret', async () => {
  const kald = [];
  const laes = lavLaesKvittering({
    noegle: 'n', model: 'm',
    async hent(url, init) {
      kald.push({ url, init });
      return new Response(JSON.stringify(geminiSvar({ erKvittering: true, butik: 'Q8', dato: '2026-10-20', total: 500, moms: 100, braendstof: true, varer: [] })));
    },
  });
  const r = await laes('image/jpeg', 'QUJD');
  assert.equal(r.butik, 'Q8');
  assert.equal(r.braendstof, true);
  assert.match(kald[0].url, /models\/m:generateContent$/);
  assert.equal(kald[0].init.headers['x-goog-api-key'], 'n');
  const krop = JSON.parse(kald[0].init.body);
  assert.deepEqual(krop.contents[0].parts[0], { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
  assert.equal(krop.generationConfig.responseMimeType, 'application/json');
});

test('laesKvittering giver fejl med status', async () => {
  const med = (status, krop = '{}') => lavLaesKvittering({ noegle: 'n', model: 'm', hent: async () => new Response(krop, { status }) });
  await assert.rejects(lavLaesKvittering({ noegle: '', model: 'm' })('image/jpeg', 'x'), (e) => e instanceof KvitteringFejl && e.status === 503);
  await assert.rejects(med(429)('image/jpeg', 'x'), (e) => e.status === 429);
  await assert.rejects(med(500)('image/jpeg', 'x'), (e) => e.status === 502);
  await assert.rejects(med(200, '{"candidates":[]}')('image/jpeg', 'x'), (e) => e.status === 502);
});
