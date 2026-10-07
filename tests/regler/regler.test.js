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
