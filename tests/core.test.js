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

import { toCSV, validateBackup } from '../core.js';

const HEADER = 'Dato;Start;Slut;Kunde;Opgavetype;Timer;Timepris;Beløb;Note';
const csvKunder = [{ id: 'k1', navn: 'Gammel Kunde', timepris: 800, arkiveret: true }];
const csvTyper = [{ id: 't1', navn: 'Møde' }];
const csvEntry = (note = '', start = [2026, 9, 7, 9, 0], timer = 1.5) => {
  const s = new Date(...start);
  return { kundeId: 'k1', opgavetypeId: 't1', timepris: 800, note, start: s.toISOString(), slut: new Date(s.getTime() + timer * 3600000).toISOString() };
};

test('toCSV starter med BOM og header', () => {
  const csv = toCSV([], csvKunder, csvTyper);
  assert.ok(csv.startsWith('﻿' + HEADER));
});

test('toCSV række har dansk dato, tid, decimalkomma og arkiveret kundenavn', () => {
  const linjer = toCSV([csvEntry()], csvKunder, csvTyper).split('\r\n');
  assert.equal(linjer[1], '07-10-2026;09:00;10:30;Gammel Kunde;Møde;1,50;800,00;1200,00;');
});

test('toCSV sorterer ældste først', () => {
  const linjer = toCSV([csvEntry('b', [2026, 9, 8, 9, 0]), csvEntry('a', [2026, 9, 7, 9, 0])], csvKunder, csvTyper).split('\r\n');
  assert.ok(linjer[1].endsWith(';a'));
  assert.ok(linjer[2].endsWith(';b'));
});

test('toCSV escaper semikolon, anførselstegn og linjeskift', () => {
  const linje = toCSV([csvEntry('møde; "vigtigt"\nopfølgning')], csvKunder, csvTyper).split('\r\n').slice(1).join('\r\n');
  assert.ok(linje.endsWith(';"møde; ""vigtigt""\nopfølgning"'), linje);
});

test('toCSV bruger ingen tusindtalsseparator', () => {
  const linje = toCSV([csvEntry('', [2026, 9, 7, 0, 0], 2)], [{ id: 'k1', navn: 'K', timepris: 1000 }], csvTyper).split('\r\n')[1];
  assert.ok(linje.includes(';2,00;800,00;1600,00;'), linje);
  const dyr = { ...csvEntry('', [2026, 9, 7, 0, 0], 2), timepris: 1000 };
  assert.ok(toCSV([dyr], csvKunder, csvTyper).includes(';1000,00;2000,00;'));
});

test('validateBackup afviser ugyldige værdier', () => {
  for (const v of [null, {}, 'x', { version: 2, kunder: [], opgavetyper: [], registreringer: [] }, { version: 1, kunder: {}, opgavetyper: [], registreringer: [] }]) {
    const r = validateBackup(v);
    assert.equal(r.ok, false);
    assert.equal(typeof r.fejl, 'string');
  }
});

test('validateBackup accepterer gyldig backup og sætter ur til null', () => {
  const r = validateBackup({ version: 1, kunder: [], opgavetyper: [], registreringer: [] });
  assert.equal(r.ok, true);
  assert.equal(r.data.ur, null);
});

test('toCSV beskytter tekstfelter mod Excel-formler', () => {
  const linje = toCSV([csvEntry('- møde flyttet')], [{ id: 'k1', navn: '=SUM(1;2)' }], csvTyper).split('\r\n')[1];
  assert.ok(linje.includes(`;"'=SUM(1;2)";`), linje);
  assert.ok(linje.endsWith(";'- møde flyttet"), linje);
});

test('validateBackup afviser fejlformede elementer', () => {
  const gyldigKunde = { id: 'k', navn: 'K', timepris: 500, arkiveret: false };
  const gyldigType = { id: 't', navn: 'T', arkiveret: false };
  const gyldigReg = { id: 'r', kundeId: 'k', opgavetypeId: 't', start: '2026-10-07T08:00:00.000Z', slut: '2026-10-07T09:00:00.000Z', timepris: 500, note: '' };
  const med = (over) => ({ version: 1, kunder: [gyldigKunde], opgavetyper: [gyldigType], registreringer: [gyldigReg], ur: null, ...over });
  assert.equal(validateBackup(med({})).ok, true);
  const daarlige = [
    { registreringer: [null] },
    { registreringer: [{ ...gyldigReg, start: 'ikke en dato' }] },
    { registreringer: [{ ...gyldigReg, slut: gyldigReg.start }] },
    { registreringer: [{ ...gyldigReg, timepris: '500' }] },
    { registreringer: [{ ...gyldigReg, note: 5 }] },
    { kunder: [{ ...gyldigKunde, timepris: -1 }] },
    { kunder: [{ ...gyldigKunde, navn: null }] },
    { opgavetyper: [{ id: 't' }] },
    { ur: { kundeId: 'k', opgavetypeId: 't', start: 'x' } },
  ];
  for (const d of daarlige) assert.equal(validateBackup(med(d)).ok, false, JSON.stringify(d));
});

import { forskel, flet, normaliserEmail, fejlTekst } from '../core.js';

const tom = () => ({ kunder: [], opgavetyper: [], registreringer: [], ur: null });
const k = (id, navn, timepris = 1) => ({ id, navn, timepris, arkiveret: false });

test('forskel finder nye, ændrede og slettede elementer', () => {
  const foer = { ...tom(), kunder: [k('a', 'A'), k('b', 'B')] };
  const efter = { ...tom(), kunder: [k('a', 'A', 2), k('c', 'C')] };
  assert.deepEqual(forskel(foer, efter), [
    { type: 'set', samling: 'kunder', id: 'a', data: { navn: 'A', timepris: 2, arkiveret: false } },
    { type: 'set', samling: 'kunder', id: 'c', data: { navn: 'C', timepris: 1, arkiveret: false } },
    { type: 'slet', samling: 'kunder', id: 'b' },
  ]);
});

test('forskel ignorerer nøglerækkefølge og listerækkefølge', () => {
  const foer = { ...tom(), kunder: [k('a', 'A'), k('b', 'B')] };
  const efter = { ...tom(), kunder: [{ arkiveret: false, timepris: 1, navn: 'B', id: 'b' }, k('a', 'A')] };
  assert.deepEqual(forskel(foer, efter), []);
});

test('forskel melder ændret ur som én ur-op', () => {
  const ur = { kundeId: 'a', opgavetypeId: 't', start: '2026-10-07T08:00:00.000Z', note: '' };
  assert.deepEqual(forskel(tom(), { ...tom(), ur }), [{ type: 'ur', ur }]);
  assert.deepEqual(forskel({ ...tom(), ur }, { ...tom(), ur: { ...ur } }), []);
  assert.deepEqual(forskel({ ...tom(), ur }, tom()), [{ type: 'ur', ur: null }]);
});

test('forskel udfylder manglende arkiveret og note, så reglerne accepterer data', () => {
  const efter = {
    ...tom(),
    opgavetyper: [{ id: 't', navn: 'Møde' }],
    registreringer: [{ id: 'r', kundeId: 'a', opgavetypeId: 't', start: 's', slut: 'u', timepris: 1 }],
  };
  const ops = forskel(tom(), efter);
  assert.deepEqual(ops[0].data, { navn: 'Møde', arkiveret: false });
  assert.equal(ops[1].data.note, '');
  assert.deepEqual(forskel(efter, efter), []);
});

test('flet genbruger kunde og opgavetype med samme navn uanset store bogstaver', () => {
  const lokal = {
    ...tom(),
    kunder: [k('l1', 'acme')],
    opgavetyper: [{ id: 'lt', navn: 'møde', arkiveret: false }],
    registreringer: [{ id: 'r1', kundeId: 'l1', opgavetypeId: 'lt', start: 's', slut: 'u', timepris: 1, note: '' }],
  };
  const konto = { ...tom(), kunder: [k('k1', 'ACME')], opgavetyper: [{ id: 'kt', navn: 'Møde', arkiveret: false }] };
  const r = flet(lokal, konto);
  assert.deepEqual(r.kunder.map((x) => x.id), ['k1']);
  assert.deepEqual(r.opgavetyper.map((x) => x.id), ['kt']);
  assert.equal(r.registreringer[0].kundeId, 'k1');
  assert.equal(r.registreringer[0].opgavetypeId, 'kt');
});

test('flet tilføjer nye kunder og registreringer og springer kendte registrerings-id over', () => {
  const reg = (id, kundeId) => ({ id, kundeId, opgavetypeId: 't', start: 's', slut: 'u', timepris: 1, note: '' });
  const lokal = { ...tom(), kunder: [k('l2', 'Ny')], registreringer: [reg('r1', 'l2'), reg('r2', 'l2')] };
  const konto = { ...tom(), registreringer: [reg('r1', 'x')] };
  const r = flet(lokal, konto);
  assert.deepEqual(r.kunder.map((x) => x.id), ['l2']);
  assert.deepEqual(r.registreringer.map((x) => [x.id, x.kundeId]), [['r1', 'x'], ['r2', 'l2']]);
});

test('flet overfører kun lokalt ur, hvis kontoen intet har', () => {
  const urL = { kundeId: 'l', opgavetypeId: 't', start: 'a', note: '' };
  const urK = { kundeId: 'k', opgavetypeId: 't', start: 'b', note: '' };
  assert.deepEqual(flet({ ...tom(), ur: urL }, tom()).ur, urL);
  assert.deepEqual(flet({ ...tom(), ur: urL }, { ...tom(), ur: urK }).ur, urK);
});

test('normaliserEmail retter til små bogstaver og afviser ugyldige', () => {
  assert.equal(normaliserEmail(' Ven@Mail.DK '), 'ven@mail.dk');
  for (const s of ['ven', '', 'a@b', null]) assert.equal(normaliserEmail(s), null, String(s));
});

test('fejlTekst oversætter Firebase-fejl til dansk', () => {
  for (const kode of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email']) {
    assert.equal(fejlTekst(kode), 'Forkert e-mail eller adgangskode.');
  }
  assert.equal(fejlTekst('auth/email-already-in-use'), 'Der findes allerede en konto med den e-mail. Log ind i stedet.');
  assert.equal(fejlTekst('auth/weak-password'), 'Adgangskoden skal være mindst 6 tegn.');
  assert.equal(fejlTekst('auth/network-request-failed'), 'Første login kræver internet.');
  assert.equal(fejlTekst('auth/too-many-requests'), 'For mange forsøg. Prøv igen om lidt.');
  assert.equal(fejlTekst('permission-denied'), 'Din adgang er fjernet.');
  assert.equal(fejlTekst('noget-andet'), 'Noget gik galt. Prøv igen.');
});

test('forskel ser et udefineret felt som fraværende', () => {
  const ur = { kundeId: 'a', opgavetypeId: 't', start: 's' };
  assert.deepEqual(forskel({ ...tom(), ur: { ...ur, note: undefined } }, { ...tom(), ur }), []);
});
