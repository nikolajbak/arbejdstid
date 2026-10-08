import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  durationMs, amountOf, formatDuration, formatKr, parseHours, validateEntry,
} from '../core.js';

test('durationMs er slut minus start', () => {
  assert.equal(durationMs({ start: '2026-10-07T09:00:00', slut: '2026-10-07T11:15:00' }), 8100000);
});

test('durationMs runder op til nærmeste kvarter', () => {
  assert.equal(durationMs({ start: '2026-10-07T09:00:00', slut: '2026-10-07T09:16:00' }), 30 * 60000);
  assert.equal(durationMs({ start: '2026-10-07T09:00:00', slut: '2026-10-07T10:00:01' }), 75 * 60000);
});

test('durationMs giver mindst 15 minutter', () => {
  assert.equal(durationMs({ start: '2026-10-07T09:00:00', slut: '2026-10-07T09:00:30' }), 15 * 60000);
});

test('amountOf regner med den afrundede tid', () => {
  assert.equal(amountOf({ start: '2026-10-07T09:00:00', slut: '2026-10-07T09:05:00', timepris: 800 }), 200);
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

// --- Redesign: farver, fortsæt, skift og valgfri opgave ----------------------

import {
  FARVER, farveFor, naesteFarve, senesteKombinationer, skiftUr, UDEN_OPGAVE,
} from '../core.js';

test('FARVER har de otte nøgler i fast rækkefølge', () => {
  assert.deepEqual(FARVER, ['skov', 'ler', 'indigo', 'blomme', 'rosa', 'okker', 'hav', 'skifer']);
});

test('farveFor bruger kundens farve eller en fast farve ud fra id', () => {
  assert.equal(farveFor({ id: 'x', farve: 'ler' }), 'ler');
  assert.equal(farveFor({ id: 'abc' }), farveFor({ id: 'abc' }));
  assert.ok(FARVER.includes(farveFor({ id: 'abc' })));
  assert.equal(farveFor({ id: 'abc', farve: 'lilla' }), farveFor({ id: 'abc' }));
  assert.ok(FARVER.includes(farveFor(undefined)));
});

test('naesteFarve vælger den mindst brugte, første ved lighed', () => {
  assert.equal(naesteFarve([]), 'skov');
  assert.equal(naesteFarve([{ farve: 'skov' }]), 'ler');
  assert.equal(naesteFarve([{ farve: 'skov', arkiveret: true }]), 'skov');
  assert.equal(naesteFarve(FARVER.map((farve) => ({ farve })).concat([{ farve: 'skov' }])), 'ler');
});

const r = (id, kundeId, opgavetypeId, slut) => ({ id, kundeId, opgavetypeId, start: '2026-10-01T08:00:00.000Z', slut, timepris: 1, note: '' });
const kunderK = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, navn: id, timepris: 1, arkiveret: false }));
const kort = (l) => l.map(({ kundeId, opgavetypeId }) => ({ kundeId, opgavetypeId }));
const typerK = [{ id: 't', navn: 't', arkiveret: false }, { id: 'gl', navn: 'gl', arkiveret: true }];

test('senesteKombinationer: unikke, nyeste først, højst 4', () => {
  const regs = [
    r('1', 'a', 't', '2026-10-01T09:00:00.000Z'),
    r('2', 'b', 't', '2026-10-02T09:00:00.000Z'),
    r('3', 'c', '', '2026-10-03T09:00:00.000Z'),
    r('4', 'a', 't', '2026-10-04T09:00:00.000Z'),
    r('5', 'd', 't', '2026-10-05T09:00:00.000Z'),
    r('6', 'e', 't', '2026-10-06T09:00:00.000Z'),
  ];
  assert.deepEqual(kort(senesteKombinationer(regs, kunderK, typerK, null)), [
    { kundeId: 'e', opgavetypeId: 't' },
    { kundeId: 'd', opgavetypeId: 't' },
    { kundeId: 'a', opgavetypeId: 't' },
    { kundeId: 'c', opgavetypeId: '' },
  ]);
});

test('senesteKombinationer udelader arkiverede kunder/typer og det kørende ur, men tillader tom opgave', () => {
  const kunder = [...kunderK, { id: 'x', navn: 'x', timepris: 1, arkiveret: true }];
  const regs = [
    r('1', 'a', '', '2026-10-01T09:00:00.000Z'),
    r('2', 'x', 't', '2026-10-02T09:00:00.000Z'),
    r('3', 'b', 'gl', '2026-10-03T09:00:00.000Z'),
    r('4', 'c', 't', '2026-10-04T09:00:00.000Z'),
    r('5', 'slettet', 't', '2026-10-05T09:00:00.000Z'),
    r('6', 'd', 'slettet', '2026-10-06T09:00:00.000Z'),
  ];
  const ur = { kundeId: 'c', opgavetypeId: 't', start: '2026-10-07T08:00:00.000Z', note: '' };
  assert.deepEqual(kort(senesteKombinationer(regs, kunder, typerK, ur)), [{ kundeId: 'a', opgavetypeId: '' }]);
  assert.deepEqual(kort(senesteKombinationer(regs, kunder, typerK, ur, 1)), [{ kundeId: 'a', opgavetypeId: '' }]);
});

test('skiftUr gemmer det kørende ur og starter det nye', () => {
  const tilstand = { kunder: [], opgavetyper: [], registreringer: [], ur: { kundeId: 'a', opgavetypeId: '', start: '2026-10-08T08:00:00.000Z', note: 'n' } };
  const ny = skiftUr(tilstand, { kundeId: 'b', opgavetypeId: 't' }, '2026-10-08T09:30:00.000Z', 800, 'r9');
  assert.deepEqual(ny.registreringer, [{ id: 'r9', kundeId: 'a', opgavetypeId: '', start: '2026-10-08T08:00:00.000Z', slut: '2026-10-08T09:30:00.000Z', timepris: 800, note: 'n' }]);
  assert.deepEqual(ny.ur, { kundeId: 'b', opgavetypeId: 't', start: '2026-10-08T09:30:00.000Z', note: '' });
  assert.equal(tilstand.registreringer.length, 0, 'tilstanden ændres ikke');
});

test('skiftUr uden kørende ur starter kun det nye', () => {
  const ny = skiftUr({ kunder: [], opgavetyper: [], registreringer: [], ur: null }, { kundeId: 'b', opgavetypeId: '' }, '2026-10-08T09:30:00.000Z', 800, 'r9');
  assert.deepEqual(ny.registreringer, []);
  assert.deepEqual(ny.ur, { kundeId: 'b', opgavetypeId: '', start: '2026-10-08T09:30:00.000Z', note: '' });
});

test('summarize samler tom opgave som Uden opgave sidst', () => {
  const regs = [r('1', 'a', '', '2026-10-01T09:00:00.000Z'), r('2', 'a', 't', '2026-10-01T09:00:00.000Z')];
  const s = summarize(regs, kunderK, [{ id: 't', navn: 'Ågård', arkiveret: false }]);
  assert.deepEqual(s.kunder[0].typer.map((x) => x.navn), ['Ågård', UDEN_OPGAVE]);
  assert.equal(UDEN_OPGAVE, 'Uden opgave');
});

test('toCSV giver tomt felt for tom opgave', () => {
  const csv = toCSV([r('1', 'a', '', '2026-10-01T09:00:00.000Z')], kunderK, typerK);
  assert.equal(csv.split('\r\n')[1].split(';')[4], '');
});

test('validateBackup accepterer farve og tom opgave, men ikke en farve der ikke er tekst', () => {
  const b = { version: 1, kunder: [{ id: 'a', navn: 'A', timepris: 1, farve: 'ler' }, { id: 'b', navn: 'B', timepris: 1 }], opgavetyper: [],
    registreringer: [r('1', 'a', '', '2026-10-01T09:00:00.000Z')], ur: { kundeId: 'a', opgavetypeId: '', start: '2026-10-01T10:00:00.000Z' } };
  assert.equal(validateBackup(b).ok, true);
});

test('validateBackup fjerner en ukendt farve i stedet for at sende den til databasen', () => {
  const b = { version: 1, kunder: [{ id: 'a', navn: 'A', timepris: 1, farve: 'lilla' }, { id: 'b', navn: 'B', timepris: 1, farve: null }], opgavetyper: [], registreringer: [] };
  const r = validateBackup(b);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.kunder.map((k) => 'farve' in k), [false, false]);
});

test('skiftUr gemmer ikke en registrering, der slutter før den starter (urforskel mellem enheder)', () => {
  const tilstand = { kunder: [], opgavetyper: [], registreringer: [], ur: { kundeId: 'a', opgavetypeId: '', start: '2026-10-08T09:30:05.000Z', note: '' } };
  const ny = skiftUr(tilstand, { kundeId: 'b', opgavetypeId: '' }, '2026-10-08T09:30:00.000Z', 800, 'r9');
  assert.deepEqual(ny.registreringer, []);
  assert.equal(ny.ur.kundeId, 'b');
});

import { skjulKombination, sidenTekst } from '../core.js';

test('senesteKombinationer giver tidspunktet for seneste registrering med', () => {
  const regs = [r('1', 'a', 't', '2026-10-01T09:00:00.000Z'), r('2', 'a', 't', '2026-10-03T09:00:00.000Z')];
  assert.deepEqual(senesteKombinationer(regs, kunderK, typerK, null), [{ kundeId: 'a', opgavetypeId: 't', sidst: '2026-10-03T09:00:00.000Z' }]);
});

test('en skjult kombination vises ikke, før der er arbejdet på den igen', () => {
  const regs = [r('1', 'a', 't', '2026-10-01T09:00:00.000Z'), r('2', 'b', '', '2026-10-02T09:00:00.000Z')];
  const skjult = skjulKombination({}, regs, { kundeId: 'a', opgavetypeId: 't' }, '2026-10-05T08:00:00.000Z');
  assert.deepEqual(kort(senesteKombinationer(regs, kunderK, typerK, null, 4, skjult)), [{ kundeId: 'b', opgavetypeId: '' }]);
  const igen = [...regs, r('3', 'a', 't', '2026-10-06T09:00:00.000Z')];
  assert.deepEqual(kort(senesteKombinationer(igen, kunderK, typerK, null, 4, skjult)), [
    { kundeId: 'a', opgavetypeId: 't' }, { kundeId: 'b', opgavetypeId: '' },
  ]);
});

test('skjulKombination rydder skjulte kombinationer, der er i brug igen', () => {
  const regs = [r('1', 'a', 't', '2026-10-06T09:00:00.000Z')];
  const gammel = skjulKombination({}, [], { kundeId: 'a', opgavetypeId: 't' }, '2026-10-05T08:00:00.000Z');
  const ny = skjulKombination(gammel, regs, { kundeId: 'b', opgavetypeId: '' }, '2026-10-07T08:00:00.000Z');
  assert.deepEqual(Object.values(ny), ['2026-10-07T08:00:00.000Z']);
  assert.equal(Object.keys(gammel).length, 1, 'den gamle ændres ikke');
});

test('sidenTekst siger i dag, i går, dage siden eller datoen', () => {
  const nu = new Date(2026, 9, 8, 12, 0);
  assert.equal(sidenTekst(new Date(2026, 9, 8, 7, 0).toISOString(), nu), 'i dag');
  assert.equal(sidenTekst(new Date(2026, 9, 7, 23, 0).toISOString(), nu), 'i går');
  assert.equal(sidenTekst(new Date(2026, 9, 4, 9, 0).toISOString(), nu), 'for 4 dage siden');
  assert.equal(sidenTekst(new Date(2026, 8, 20, 9, 0).toISOString(), nu), '20. sep.');
});

test('forskel melder ændrede skjulte kombinationer som én op', () => {
  const skjult = { 'a\u0000t': '2026-10-05T08:00:00.000Z' };
  assert.deepEqual(forskel(tom(), { ...tom(), skjult }), [{ type: 'skjult', skjult }]);
  assert.deepEqual(forskel({ ...tom(), skjult: {} }, tom()), []);
});

test('validateBackup beholder gyldige skjulte kombinationer og dropper ugyldige', () => {
  const b = (skjult) => ({ version: 1, kunder: [], opgavetyper: [], registreringer: [], skjult });
  assert.deepEqual(validateBackup(b({ x: '2026-10-05T08:00:00.000Z' })).data.skjult, { x: '2026-10-05T08:00:00.000Z' });
  assert.deepEqual(validateBackup(b({ x: 5 })).data.skjult, {});
  assert.deepEqual(validateBackup(b(undefined)).data.skjult, {});
});

test('flet beholder kontoens skjulte kombinationer', () => {
  const skjult = { x: '2026-10-05T08:00:00.000Z' };
  assert.deepEqual(flet(tom(), { ...tom(), skjult }).skjult, skjult);
});

// --- Poster ----------------------------------------------------------------------

import { POST_TYPER, postBeloeb, saldoer } from '../core.js';

const post = (type, beloeb, kundeId = 'k1', dato = '2026-10-08', note = '') => ({ id: `${type}${beloeb}`, kundeId, type, dato, beloeb, note });
const time = (kundeId, timepris) => ({ id: 'r', kundeId, opgavetypeId: '', start: '2026-10-08T08:00:00', slut: '2026-10-08T09:00:00', timepris, note: '' });

test('POST_TYPER har de fire visningsnavne', () => {
  assert.deepEqual(POST_TYPER, { udgift: 'Udgift', braendstof: 'Brændstof', kontant: 'Kontantudlæg', betaling: 'Betaling' });
});

test('postBeloeb giver plus for udgift og brændstof, minus for kontant og betaling', () => {
  assert.deepEqual(['udgift', 'braendstof', 'kontant', 'betaling'].map((x) => postBeloeb(post(x, 100))), [100, 100, -100, -100]);
});

test('saldoer lægger arbejde og udgifter sammen og trækker kontant og betaling fra', () => {
  const kunder = [k('k1', 'Michael'), k('k2', 'Anna')];
  const regs = [time('k1', 800)];
  const poster = [post('udgift', 200), post('kontant', 100)];
  assert.deepEqual(saldoer(regs, poster, kunder), [{ kundeId: 'k1', navn: 'Michael', saldo: 900 }]);
  assert.deepEqual(saldoer(regs, [...poster, post('betaling', 900)], kunder), []);
});

test('saldoer viser til gode som negativ og ukendt kunde som (slettet)', () => {
  assert.deepEqual(saldoer([], [post('kontant', 500, 'x')], []), [{ kundeId: 'x', navn: '(slettet)', saldo: -500 }]);
});

test('summarize tager kunder med, der kun har poster, og summerer poster pr. type', () => {
  const s = summarize([time('k1', 800)], [k('k1', 'B'), k('k2', 'A')], [], [post('udgift', 50, 'k2'), post('udgift', 25, 'k2'), post('betaling', 900, 'k1')]);
  assert.deepEqual(s.kunder.map((x) => [x.navn, x.kr, x.poster]), [
    ['A', 0, [{ type: 'udgift', navn: 'Udgift', kr: 75 }]],
    ['B', 800, [{ type: 'betaling', navn: 'Betaling', kr: 900 }]],
  ]);
  assert.equal(s.kr, 800);
});

test('toCSV skriver poster som linjer med fortegn sorteret efter dato', () => {
  const linjer = toCSV([time('k1', 800)], [k('k1', 'A')], [], [post('betaling', 900, 'k1', '2026-10-09', 'MobilePay'), post('udgift', 120.5, 'k1', '2026-10-07')]).split('\r\n');
  assert.equal(linjer[1], '07-10-2026;;;A;Udgift;;;120,50;');
  assert.equal(linjer[3], '09-10-2026;;;A;Betaling;;;-900,00;MobilePay');
});

test('validateBackup giver tomme poster for gammel backup og afviser ugyldige poster', () => {
  const base = { version: 1, kunder: [], opgavetyper: [], registreringer: [] };
  assert.deepEqual(validateBackup(base).data.poster, []);
  assert.equal(validateBackup({ ...base, poster: [post('udgift', 10)] }).ok, true);
  for (const p of [post('udgift', 0), post('gave', 10), { ...post('udgift', 10), dato: '8/10' }]) {
    assert.equal(validateBackup({ ...base, poster: [p] }).ok, false, JSON.stringify(p));
  }
});

test('forskel skriver og sletter poster og udfylder note', () => {
  const p = { ...post('udgift', 10), note: undefined };
  assert.deepEqual(forskel(tom(), { ...tom(), poster: [p] }), [
    { type: 'set', samling: 'poster', id: p.id, data: { kundeId: 'k1', type: 'udgift', dato: '2026-10-08', beloeb: 10, note: '' } },
  ]);
  assert.deepEqual(forskel({ ...tom(), poster: [p] }, { ...tom(), poster: [] }), [{ type: 'slet', samling: 'poster', id: p.id }]);
});

test('flet tager telefonens poster med og omskriver kundeId', () => {
  const lokal = { ...tom(), kunder: [k('l1', 'acme')], poster: [post('udgift', 10, 'l1')] };
  const konto = { ...tom(), kunder: [k('k1', 'ACME')], poster: [post('betaling', 5, 'k1')] };
  const r = flet(lokal, konto);
  assert.deepEqual(r.poster.map((p) => [p.type, p.kundeId]), [['betaling', 'k1'], ['udgift', 'k1']]);
});

test('flet giver ikke poster et opgavetypeId-felt', () => {
  const r = flet({ ...tom(), poster: [post('udgift', 10, 'l1')] }, tom());
  assert.equal('opgavetypeId' in r.poster[0], false);
});

test('parseNumber forstår tusindtalspunktum, når der også er decimalkomma', async () => {
  const { parseNumber } = await import('../core.js');
  assert.equal(parseNumber('1.250,50'), 1250.5);
  assert.equal(parseNumber('12.500.000,00'), 12500000);
  // Kun tusindtalspunktum er tvetydigt (1,25 eller 1250) og afvises.
  assert.equal(parseNumber('1.250'), null);
  assert.equal(parseNumber('12.500.000'), null);
  assert.equal(parseNumber('8.5'), 8.5);
  assert.equal(parseNumber('1,250.5'), null);
});
