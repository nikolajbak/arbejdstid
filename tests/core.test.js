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
