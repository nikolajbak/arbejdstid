import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-arbejdstid',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'godkendte/admin@x.dk'), { email: 'admin@x.dk', admin: true, inviteret: new Date(), uid: 'admin' });
    await setDoc(doc(db, 'godkendte/ven@x.dk'), { email: 'ven@x.dk', admin: false, inviteret: new Date(), uid: null });
    await setDoc(doc(db, 'brugere/ven/kunder/k1'), { navn: 'A', timepris: 500, arkiveret: false });
  });
});

const som = (uid, email, email_verified = true) => env.authenticatedContext(uid, { email, email_verified }).firestore();
const admin = () => som('admin', 'admin@x.dk');
const ven = () => som('ven', 'ven@x.dk');
const kunde = { navn: 'A', timepris: 500, arkiveret: false };
const reg = { kundeId: 'k1', opgavetypeId: 't1', start: '2026-10-07T08:00:00.000Z', slut: '2026-10-07T09:00:00.000Z', timepris: 500, note: '' };
const invitation = (email) => ({ email, admin: false, inviteret: serverTimestamp(), uid: null });

test('godkendt bruger kan læse og skrive egne data', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/kunder/k2'), kunde));
  await assertSucceeds(getDoc(doc(ven(), 'brugere/ven/kunder/k1')));
});

test('anden bruger kan ikke læse eller skrive en andens data', async () => {
  await assertFails(getDoc(doc(admin(), 'brugere/ven/kunder/k1')));
  await assertFails(setDoc(doc(admin(), 'brugere/ven/kunder/k9'), kunde));
});

test('bruger med ubekræftet e-mail kan ikke læse egne data', async () => {
  await assertFails(getDoc(doc(som('ven', 'ven@x.dk', false), 'brugere/ven/kunder/k1')));
});

test('ikke-inviteret bruger kan ikke skrive data', async () => {
  await assertFails(setDoc(doc(som('frem', 'frem@x.dk'), 'brugere/frem/kunder/k1'), kunde));
});

test('bruger kan læse eget godkendte-dokument, også før bekræftelse, men ikke andres', async () => {
  await assertSucceeds(getDoc(doc(som('frem', 'frem@x.dk'), 'godkendte/frem@x.dk')));
  await assertSucceeds(getDoc(doc(som('ven', 'ven@x.dk', false), 'godkendte/ven@x.dk')));
  await assertFails(getDoc(doc(som('frem', 'frem@x.dk'), 'godkendte/ven@x.dk')));
});

test('e-mail med store bogstaver matcher godkendte-dokumentet', async () => {
  await assertSucceeds(getDoc(doc(som('ven', 'Ven@X.dk'), 'brugere/ven/kunder/k1')));
});

test('kun admin kan invitere', async () => {
  await assertFails(setDoc(doc(ven(), 'godkendte/ny@x.dk'), invitation('ny@x.dk')));
  await assertSucceeds(setDoc(doc(admin(), 'godkendte/ny@x.dk'), invitation('ny@x.dk')));
});

test('invitation skal have e-mail lig id og præcis de rigtige felter', async () => {
  await assertFails(setDoc(doc(admin(), 'godkendte/ny@x.dk'), invitation('anden@x.dk')));
  await assertFails(setDoc(doc(admin(), 'godkendte/ny@x.dk'), { ...invitation('ny@x.dk'), ekstra: 1 }));
  await assertFails(setDoc(doc(admin(), 'godkendte/ny@x.dk'), { ...invitation('ny@x.dk'), uid: 'x' }));
});

test('kun admin kan liste brugerlisten', async () => {
  await assertSucceeds(getDocs(collection(admin(), 'godkendte')));
  await assertFails(getDocs(collection(ven(), 'godkendte')));
});

test('admin kan fjerne andre, men ikke sig selv', async () => {
  await assertFails(deleteDoc(doc(admin(), 'godkendte/admin@x.dk')));
  await assertSucceeds(deleteDoc(doc(admin(), 'godkendte/ven@x.dk')));
});

test('admin kan gøre andre til admin, men ikke fjerne sin egen admin', async () => {
  await assertSucceeds(updateDoc(doc(admin(), 'godkendte/ven@x.dk'), { admin: true }));
  await assertFails(updateDoc(doc(admin(), 'godkendte/admin@x.dk'), { admin: false }));
});

test('bruger kan kun sætte sin egen uid på sit eget dokument', async () => {
  await assertFails(updateDoc(doc(ven(), 'godkendte/ven@x.dk'), { uid: 'andet' }));
  await assertFails(updateDoc(doc(ven(), 'godkendte/ven@x.dk'), { admin: true }));
  await assertSucceeds(updateDoc(doc(ven(), 'godkendte/ven@x.dk'), { uid: 'ven' }));
});

test('ugyldige kunder afvises', async () => {
  await assertFails(setDoc(doc(ven(), 'brugere/ven/kunder/k2'), { ...kunde, timepris: -1 }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/kunder/k2'), { ...kunde, navn: '' }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/kunder/k2'), { ...kunde, ekstra: 1 }));
});

test('kunde kan være med eller uden moms', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/kunder/k3'), { ...kunde, moms: true }));
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/kunder/k4'), { ...kunde, moms: false }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/kunder/k5'), { ...kunde, moms: 'ja' }));
});

test('registrering skal have slut efter start og rigtige felter', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/registreringer/r1'), reg));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/registreringer/r2'), { ...reg, slut: reg.start }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/registreringer/r3'), { ...reg, timepris: '500' }));
});

test('opgavetyper valideres', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/opgavetyper/t1'), { navn: 'Møde', arkiveret: false }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/opgavetyper/t2'), { navn: 'Møde' }));
});

test('profil med gyldigt eller tomt ur accepteres, ugyldigt ur afvises', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven'), { email: 'ven@x.dk', oprettet: serverTimestamp(), ur: null }));
  await assertSucceeds(updateDoc(doc(ven(), 'brugere/ven'), { ur: { kundeId: 'k1', opgavetypeId: 't1', start: '2026-10-07T08:00:00.000Z', note: '' } }));
  await assertFails(updateDoc(doc(ven(), 'brugere/ven'), { ur: { kundeId: 'k1', opgavetypeId: 't1', start: 5, note: '' } }));
});

test('bruger kan slette egne registreringer', async () => {
  await assertSucceeds(deleteDoc(doc(ven(), 'brugere/ven/kunder/k1')));
});

test('bruger kan sætte uid, selv hvis feltet mangler i et dokument oprettet i konsollen', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'godkendte/ny@x.dk'), { email: 'ny@x.dk', admin: true, inviteret: new Date() });
  });
  await assertSucceeds(updateDoc(doc(som('ny', 'ny@x.dk'), 'godkendte/ny@x.dk'), { uid: 'ny' }));
});

test('kunde med gyldig farve accepteres, ukendt farve afvises', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/kunder/k2'), { ...kunde, farve: 'ler' }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/kunder/k3'), { ...kunde, farve: 'lilla' }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/kunder/k4'), { ...kunde, farve: 5 }));
});

test('registrering og ur uden opgave accepteres', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/registreringer/r1'), { ...reg, opgavetypeId: '' }));
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven'), { email: 'ven@x.dk', oprettet: serverTimestamp(), ur: { kundeId: 'k1', opgavetypeId: '', start: '2026-10-07T08:00:00.000Z', note: '' } }));
});

test('profil med skjulte genveje som map accepteres, andre typer afvises', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven'), { email: 'ven@x.dk', oprettet: serverTimestamp(), ur: null }));
  await assertSucceeds(updateDoc(doc(ven(), 'brugere/ven'), { skjult: { 'k1\u0000t1': '2026-10-08T08:00:00.000Z' } }));
  await assertFails(updateDoc(doc(ven(), 'brugere/ven'), { skjult: 'k1' }));
  await assertFails(updateDoc(doc(ven(), 'brugere/ven'), { andet: 1 }));
});

test('poster valideres', async () => {
  const p = { kundeId: 'k1', type: 'udgift', dato: '2026-10-08', beloeb: 120.5, note: '' };
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/poster/p1'), p));
  await assertSucceeds(deleteDoc(doc(ven(), 'brugere/ven/poster/p1')));
  for (const [navn, daarlig] of [
    ['ukendt type', { ...p, type: 'gave' }],
    ['beløb 0', { ...p, beloeb: 0 }],
    ['dato', { ...p, dato: '8/10' }],
    ['ekstra felt', { ...p, timepris: 1 }],
    ['manglende note', { kundeId: 'k1', type: 'udgift', dato: '2026-10-08', beloeb: 1 }],
  ]) await assertFails(setDoc(doc(ven(), 'brugere/ven/poster/p2'), daarlig), navn);
  await assertFails(setDoc(doc(admin(), 'brugere/ven/poster/p3'), p));
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/poster/p4'), { ...p, bilag: true }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/poster/p5'), { ...p, bilag: 'ja' }));
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/poster/p6'), { ...p, moms: p.beloeb / 5 }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/poster/p7'), { ...p, moms: p.beloeb + 1 }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/poster/p8'), { ...p, moms: '20' }));
});

test('billeder på poster valideres', async () => {
  const b = { billede: 'data:image/jpeg;base64,AAAA' };
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven/bilag/p1'), b));
  await assertSucceeds(getDoc(doc(ven(), 'brugere/ven/bilag/p1')));
  await assertFails(getDoc(doc(admin(), 'brugere/ven/bilag/p1')));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/bilag/p2'), { billede: 'x'.repeat(1000000) }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/bilag/p3'), { ...b, andet: 1 }));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/bilag/p4'), { billede: 1 }));
  await assertSucceeds(deleteDoc(doc(ven(), 'brugere/ven/bilag/p1')));
});

// --- Teams -----------------------------------------------------------------------

import { query, where, arrayUnion, arrayRemove } from 'firebase/firestore';

const tre = () => som('tre', 'tre@x.dk');
const nyTeam = (uid = 'ven') => ({ navn: 'Holdet', medlemmer: [uid], navne: { [uid]: 'Ven' }, inviterede: [], oprettet: serverTimestamp() });
const tReg = (person = 'ven') => ({ ...reg, person });

async function medTeam(data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'godkendte/tre@x.dk'), { email: 'tre@x.dk', admin: false, inviteret: new Date(), uid: 'tre' });
    await setDoc(doc(db, 'teams/t1'), { navn: 'Holdet', medlemmer: ['ven'], navne: { ven: 'Ven' }, inviterede: [], oprettet: new Date(), ...data });
  });
}

test('godkendt bruger kan oprette et team med kun sig selv', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'teams/n1'), nyTeam()));
  await assertFails(setDoc(doc(ven(), 'teams/n2'), { ...nyTeam(), medlemmer: ['ven', 'admin'] }));
  await assertFails(setDoc(doc(ven(), 'teams/n3'), nyTeam('admin')));
  await assertFails(setDoc(doc(som('frem', 'frem@x.dk'), 'teams/n4'), nyTeam('frem')));
});

test('kun medlemmer kan læse og skrive teamets data', async () => {
  await medTeam();
  await assertSucceeds(getDoc(doc(ven(), 'teams/t1')));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/kunder/k1'), kunde));
  await assertFails(getDoc(doc(tre(), 'teams/t1')));
  await assertFails(getDoc(doc(tre(), 'teams/t1/kunder/k1')));
  await assertFails(setDoc(doc(tre(), 'teams/t1/kunder/k2'), kunde));
});

test('inviteret kan se teamet, finde det med en forespørgsel og blive medlem', async () => {
  await medTeam({ inviterede: ['tre@x.dk'] });
  await assertSucceeds(getDoc(doc(tre(), 'teams/t1')));
  await assertSucceeds(getDocs(query(collection(tre(), 'teams'), where('inviterede', 'array-contains', 'tre@x.dk'))));
  await assertSucceeds(getDocs(query(collection(ven(), 'teams'), where('medlemmer', 'array-contains', 'ven'))));
  await assertFails(updateDoc(doc(tre(), 'teams/t1'), { medlemmer: arrayUnion('tre', 'admin'), inviterede: arrayRemove('tre@x.dk'), 'navne.tre': 'Tre' }));
  await assertFails(updateDoc(doc(tre(), 'teams/t1'), { medlemmer: arrayUnion('tre'), inviterede: arrayRemove('tre@x.dk'), 'navne.tre': 'Tre', navn: 'Mit' }));
  await assertSucceeds(updateDoc(doc(tre(), 'teams/t1'), { medlemmer: arrayUnion('tre'), inviterede: arrayRemove('tre@x.dk'), 'navne.tre': 'Tre' }));
  await assertSucceeds(getDoc(doc(tre(), 'teams/t1/kunder/x')));
});

test('ikke-inviteret kan ikke melde sig ind', async () => {
  await medTeam();
  await assertFails(updateDoc(doc(tre(), 'teams/t1'), { medlemmer: arrayUnion('tre'), 'navne.tre': 'Tre' }));
});

test('medlem kan invitere, omdøbe og fjerne, men ikke tilføje medlemmer direkte', async () => {
  await medTeam({ medlemmer: ['ven', 'tre'], navne: { ven: 'Ven', tre: 'Tre' } });
  await assertSucceeds(updateDoc(doc(ven(), 'teams/t1'), { inviterede: arrayUnion('ny@x.dk'), navn: 'Nyt navn' }));
  await assertFails(updateDoc(doc(ven(), 'teams/t1'), { medlemmer: arrayUnion('admin') }));
  await assertFails(deleteDoc(doc(ven(), 'teams/t1')));
  await assertSucceeds(updateDoc(doc(ven(), 'teams/t1'), { medlemmer: arrayRemove('tre') }));
  await assertFails(getDoc(doc(tre(), 'teams/t1/kunder/k1')));
  await assertFails(getDoc(doc(tre(), 'teams/t1')));
});

test('registrering i et team kræver person, der er medlem', async () => {
  await medTeam({ medlemmer: ['ven', 'tre'], navne: { ven: 'Ven', tre: 'Tre' } });
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tReg('tre'), afventer: true, oprettetAf: 'ven' }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r2'), reg));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r3'), tReg('admin')));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/p1'), { kundeId: 'k1', type: 'udgift', dato: '2026-10-08', beloeb: 10, note: '' }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/bilag/p1'), { billede: 'data:image/jpeg;base64,AAAA' }));
  await assertSucceeds(getDoc(doc(tre(), 'teams/t1/bilag/p1')));
  await assertFails(getDoc(doc(admin(), 'teams/t1/bilag/p1')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/kunder/k3'), { ...kunde, timepris: -1 }));
});

const tVent = (person, af) => ({ ...tReg(person), afventer: true, oprettetAf: af });
const tPost = (data = {}) => ({ kundeId: 'k1', type: 'udgift', dato: '2026-10-19', beloeb: 10, note: '', ...data });
const toMedlemmer = { medlemmer: ['ven', 'tre'], navne: { ven: 'Ven', tre: 'Tre' } };

test('for en anden kræver afventer og oprettetAf = en selv', async () => {
  await medTeam(toMedlemmer);
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tReg('tre')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tReg('tre'), afventer: true }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tVent('tre', 'tre')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tVent('tre', 'ven'), afventer: false }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tReg('tre'), afventer: true, oprettetAf: null }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tVent('tre', 'ven')));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r2'), tReg('ven')));
});

test('kun personen kan godkende, og en andens rettelse venter igen', async () => {
  await medTeam(toMedlemmer);
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tVent('tre', 'ven')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), tReg('tre')));
  await assertSucceeds(setDoc(doc(tre(), 'teams/t1/registreringer/r1'), tReg('tre')));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tReg('tre'), note: 'rettet' }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/r1'), { ...tVent('tre', 'ven'), note: 'rettet' }));
});

test('ældre teamdata uden de nye felter kan rettes', async () => {
  await medTeam(toMedlemmer);
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'teams/t1/registreringer/gl'), tReg('tre')));
  await assertSucceeds(setDoc(doc(tre(), 'teams/t1/registreringer/gl'), { ...tReg('tre'), note: 'egen' }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/gl'), { ...tReg('tre'), note: 'anden' }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/gl'), { ...tVent('tre', 'ven'), note: 'anden' }));
});

test('poster: person skal være medlem og findes ikke på betalinger', async () => {
  await medTeam(toMedlemmer);
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/p1'), tPost({ person: 'ven' })));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/p2'), tPost({ person: 'tre', afventer: true, oprettetAf: 'ven' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p3'), tPost({ person: 'tre' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p4'), tPost({ person: 'admin', afventer: true, oprettetAf: 'ven' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p8'), tPost({ person: null, afventer: true, oprettetAf: 'ven' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p5'), tPost({ type: 'betaling', person: 'ven' })));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/p6'), tPost({ type: 'betaling' })));
  await assertFails(setDoc(doc(ven(), 'brugere/ven/poster/p7'), tPost({ person: 'ven' })));
});

test('personer/{uid} skrives kun af personen selv og læses af medlemmer', async () => {
  await medTeam({ medlemmer: ['ven', 'tre'], navne: { ven: 'Ven', tre: 'Tre' } });
  const ur = { kundeId: 'k1', opgavetypeId: '', start: '2026-10-08T08:00:00.000Z', deltagere: ['ven', 'tre'] };
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/personer/ven'), { ur }, { merge: true }));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/personer/ven'), { skjult: { a: 'b' } }, { merge: true }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/personer/tre'), { ur: null }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/personer/ven'), { ur: { ...ur, deltagere: 'tre' } }));
  await assertSucceeds(getDoc(doc(tre(), 'teams/t1/personer/ven')));
});

test('ur med deltagere accepteres også i egen profil', async () => {
  await assertSucceeds(setDoc(doc(ven(), 'brugere/ven'), { email: 'ven@x.dk', oprettet: serverTimestamp(),
    ur: { kundeId: 'k1', opgavetypeId: '', start: '2026-10-08T08:00:00.000Z', deltagere: [] } }));
});

test('registrering for et fjernet medlem kan stadig rettes, men ikke flyttes til en ikke-medlem', async () => {
  await medTeam({ medlemmer: ['ven'], navne: { ven: 'Ven', tre: 'Tre' } });
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'teams/t1/registreringer/gl'), tReg('tre')));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/registreringer/gl'), { ...tReg('tre'), afventer: true, oprettetAf: 'ven', note: 'rettet' }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/gl'), { ...tReg('admin'), afventer: true, oprettetAf: 'ven' }));
  await assertFails(setDoc(doc(ven(), 'teams/t1/registreringer/ny'), { ...tReg('tre'), afventer: true, oprettetAf: 'ven' }));
});

test('poster: personen godkender, andre kan ikke rette en ventende, og en fjernet persons post kan rettes', async () => {
  await medTeam(toMedlemmer);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teams/t1/poster/p1'), tPost({ person: 'tre', afventer: true, oprettetAf: 'ven' }));
    await setDoc(doc(db, 'teams/t1/poster/p2'), tPost({ person: 'tre', afventer: true, oprettetAf: 'ven' }));
    await setDoc(doc(db, 'teams/t1/poster/g1'), tPost({ person: 'gammel' }));
  });
  await assertSucceeds(setDoc(doc(tre(), 'teams/t1/poster/p1'), tPost({ person: 'tre' })));
  await assertFails(setDoc(doc(ven(), 'teams/t1/poster/p2'), tPost({ person: 'tre', note: 'x' })));
  await assertSucceeds(setDoc(doc(ven(), 'teams/t1/poster/g1'), tPost({ person: 'gammel', afventer: true, oprettetAf: 'ven', note: 'rettet' })));
});
