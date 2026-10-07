import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  durationMs, amountOf, formatDuration, formatKr, parseHours, validateEntry,
} from '../core.js';

test('durationMs er slut minus start', () => {
  assert.equal(durationMs({ start: '2026-10-07T09:00:00', slut: '2026-10-07T11:15:00' }), 8100000);
});

test('amountOf bruger registreringens egen timepris', () => {
  assert.equal(amountOf({ start: '2026-10-07T09:00:00', slut: '2026-10-07T10:30:00', timepris: 800 }), 1200);
});

test('formatDuration viser t:mm og runder minutter ned', () => {
  assert.equal(formatDuration(8100000), '2:15');
  assert.equal(formatDuration(59000), '0:00');
  assert.equal(formatDuration(36000000), '10:00');
});

test('formatKr bruger tusindtalspunktum og decimalkomma', () => {
  assert.equal(formatKr(1234.5), '1.234,50 kr');
  assert.equal(formatKr(0), '0,00 kr');
  assert.equal(formatKr(1234567.891), '1.234.567,89 kr');
});

test('parseHours accepterer komma og punktum', () => {
  assert.equal(parseHours('2,5'), 2.5);
  assert.equal(parseHours('2.5'), 2.5);
  assert.equal(parseHours(' 3 '), 3);
});

test('parseHours afviser tomt, tekst, nul og negativ', () => {
  for (const s of ['', 'abc', '0', '-1', '2,5t']) assert.equal(parseHours(s), null, s);
});

test('validateEntry kræver slut efter start', () => {
  const fejl = 'Slut skal være efter start';
  assert.equal(validateEntry({ start: '2026-10-07T10:00:00', slut: '2026-10-07T10:00:00' }), fejl);
  assert.equal(validateEntry({ start: '2026-10-07T10:00:00', slut: '2026-10-07T09:00:00' }), fejl);
  assert.equal(validateEntry({ start: '2026-10-07T09:00:00', slut: '2026-10-07T10:00:00' }), null);
});

test('parseNumber tillader nul (timepris) men ikke tekst', async () => {
  const { parseNumber } = await import('../core.js');
  assert.equal(parseNumber('0'), 0);
  assert.equal(parseNumber('850,50'), 850.5);
  assert.equal(parseNumber('x'), null);
});

import { monthRange, inPeriod, groupByDay, summarize } from '../core.js';

test('monthRange med offset -1 krydser årsskifte', () => {
  const { from, to } = monthRange(new Date(2026, 0, 15), -1);
  assert.deepEqual(from, new Date(2025, 11, 1));
  assert.deepEqual(to, new Date(2026, 0, 1));
});

test('inPeriod bruger start og eksklusiv slutgrænse', () => {
  const { from, to } = monthRange(new Date(2026, 9, 7));
  assert.equal(inPeriod({ start: new Date(2026, 9, 31, 23, 30).toISOString() }, from, to), true);
  assert.equal(inPeriod({ start: new Date(2026, 10, 1, 0, 0).toISOString() }, from, to), false);
});

test('groupByDay lægger en registrering over midnat på startdagen', () => {
  const e = { id: 'a', start: new Date(2026, 9, 7, 23).toISOString(), slut: new Date(2026, 9, 8, 1).toISOString() };
  const dage = groupByDay([e]);
  assert.equal(dage.length, 1);
  assert.equal(dage[0].dag, '2026-10-07');
  assert.equal(dage[0].ms, 7200000);
});

test('groupByDay sorterer nyeste dag og registrering først', () => {
  const r = (id, d, h) => ({ id, start: new Date(2026, 9, d, h).toISOString(), slut: new Date(2026, 9, d, h + 1).toISOString() });
  const dage = groupByDay([r('a', 6, 9), r('b', 7, 9), r('c', 7, 13)]);
  assert.deepEqual(dage.map((d) => d.dag), ['2026-10-07', '2026-10-06']);
  assert.deepEqual(dage[0].entries.map((e) => e.id), ['c', 'b']);
});

test('summarize totaler pr. kunde og opgavetype med kopieret timepris og arkiveret kunde', () => {
  const kunder = [
    { id: 'k1', navn: 'Beta ApS', timepris: 900, arkiveret: false },
    { id: 'k2', navn: 'Alfa A/S', timepris: 500, arkiveret: true },
  ];
  const typer = [{ id: 't1', navn: 'Møde' }, { id: 't2', navn: 'Udvikling' }];
  const r = (kundeId, opgavetypeId, timer, timepris) => ({
    kundeId, opgavetypeId, timepris,
    start: '2026-10-07T08:00:00', slut: new Date(new Date('2026-10-07T08:00:00').getTime() + timer * 3600000).toISOString(),
  });
  const s = summarize([r('k1', 't1', 1, 800), r('k1', 't2', 2, 900), r('k2', 't1', 1, 500)], kunder, typer);
  assert.deepEqual(s.kunder.map((k) => k.navn), ['Alfa A/S', 'Beta ApS']);
  const beta = s.kunder[1];
  assert.equal(beta.ms, 3 * 3600000);
  assert.equal(beta.kr, 2600);
  assert.deepEqual(beta.typer.map((t) => [t.navn, t.kr]), [['Møde', 800], ['Udvikling', 1800]]);
  assert.equal(s.kunder[0].kr, 500);
  assert.equal(s.ms, 4 * 3600000);
  assert.equal(s.kr, 3100);
});

test('summarize viser ukendt kunde som (slettet)', () => {
  const s = summarize([{ kundeId: 'x', opgavetypeId: 'y', timepris: 100, start: '2026-10-07T08:00:00', slut: '2026-10-07T09:00:00' }], [], []);
  assert.equal(s.kunder[0].navn, '(slettet)');
  assert.equal(s.kunder[0].typer[0].navn, '(slettet)');
});
