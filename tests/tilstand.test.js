import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, commit, saetBasis, setVedBeskeder, setRender } from '../tilstand.js';

const MIG = 'u1';
const ANDEN = 'u2';
const reg = (id, ekstra = {}) => ({ id, kundeId: 'k', start: '2026-10-19T08:00:00.000Z', slut: '2026-10-19T09:00:00.000Z', ...ekstra });

function opsaet(arbejdssted) {
  const gemt = [];
  const meldt = [];
  setRender(() => {});
  setVedBeskeder((b) => meldt.push(b));
  t.sky = { gem: (s) => gemt.push(structuredClone(s)) };
  t.bruger = { uid: MIG };
  t.arbejdssted = arbejdssted;
  t.state = { kunder: [], opgavetyper: [], registreringer: [], poster: [] };
  saetBasis(t.state);
  return { gemt, meldt };
}

test('commit i et team melder nye ventende registreringer for andre', () => {
  const { gemt, meldt } = opsaet('team1');
  t.state.registreringer.push(reg('r1', { person: ANDEN, oprettetAf: MIG, afventer: true }));
  commit();
  assert.equal(gemt.length, 1);
  assert.deepEqual(meldt, [[{ til: ANDEN, slags: 'afventer', antal: 1 }]]);
  // Basislinjen er flyttet: samme tilstand igen giver ingen ny besked.
  commit();
  assert.equal(meldt.length, 1);
});

test('commit melder intet uden nye beskeder', () => {
  const { meldt } = opsaet('team1');
  t.state.registreringer.push(reg('r1', { person: MIG }));
  commit();
  assert.deepEqual(meldt, []);
});

test('commit i Mig melder intet', () => {
  const { gemt, meldt } = opsaet(null);
  t.state.registreringer.push(reg('r1', { person: ANDEN, oprettetAf: MIG, afventer: true }));
  commit();
  assert.equal(gemt.length, 1);
  assert.deepEqual(meldt, []);
});

test('data fra skyen flytter basislinjen, så en sletning derfra ikke meldes igen', () => {
  const { meldt } = opsaet('team1');
  const ventende = reg('r1', { person: MIG, oprettetAf: ANDEN, afventer: true });
  t.state.registreringer.push(ventende);
  saetBasis(t.state);
  // En anden enhed har afvist (slettet) registreringen; skyen sender den nye tilstand.
  t.state = { ...t.state, registreringer: [] };
  saetBasis(t.state);
  commit();
  assert.deepEqual(meldt, []);
});

test('afvisning her melder afvist til den, der oprettede', () => {
  const { meldt } = opsaet('team1');
  t.state.registreringer.push(reg('r1', { person: MIG, oprettetAf: ANDEN, afventer: true }));
  saetBasis(t.state);
  t.state.registreringer = [];
  commit();
  assert.deepEqual(meldt, [[{ til: ANDEN, slags: 'afvist', antal: 1 }]]);
});

test('uden basislinje (før data er hentet) meldes intet', () => {
  const { meldt } = opsaet('team1');
  saetBasis(null);
  t.state.registreringer.push(reg('r1', { person: ANDEN, oprettetAf: MIG, afventer: true }));
  commit();
  assert.deepEqual(meldt, []);
});
