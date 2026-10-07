import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, reload, signOut,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp,
  terminate, clearIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { normaliserEmail } from './core.js';
import { defaultData } from './store.js';

const godkendelse = (email) => doc(db, 'godkendte', normaliserEmail(email));
const appAdresse = () => location.origin + location.pathname;

// --- Login ------------------------------------------------------------------

export const lytKonto = (cb) => onAuthStateChanged(auth, cb);

export const logInd = (email, kode) => signInWithEmailAndPassword(auth, email.trim(), kode);

export async function opretKonto(email, kode) {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), kode);
  await sendBekraeftelse();
  return user;
}

export const sendBekraeftelse = () => sendEmailVerification(auth.currentUser, { url: appAdresse() });

export const nulstilKode = (email) => sendPasswordResetEmail(auth, email.trim(), { url: appAdresse() });

// Henter brugeren igen og fornyer adgangsbeviset, så en netop bekræftet e-mail tæller.
export async function opdaterBruger() {
  await reload(auth.currentUser);
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

// Logger ud og sletter kopien af data på enheden.
export async function logUd() {
  await signOut(auth);
  await terminate(db);
  await clearIndexedDbPersistence(db);
  location.reload();
}

// --- Brugerdatabasen --------------------------------------------------------

export async function hentGodkendelse(email) {
  const s = await getDoc(godkendelse(email));
  return s.exists() ? s.data() : null;
}

// Følger brugerens egen godkendelse, så en fjernet adgang opdages med det samme.
export const lytGodkendelse = (email, cb) =>
  onSnapshot(godkendelse(email), (s) => cb(s.exists() ? s.data() : null), () => {});

// Markerer kontoen som oprettet og opretter profilen ved første login.
export async function sikrProfil(user, godk) {
  if (!godk.uid) await updateDoc(godkendelse(user.email), { uid: user.uid });
  const profil = doc(db, 'brugere', user.uid);
  if ((await getDoc(profil)).exists()) return;
  const batch = writeBatch(db);
  batch.set(profil, { email: normaliserEmail(user.email), oprettet: serverTimestamp(), ur: null });
  for (const { id, navn } of defaultData().opgavetyper) {
    batch.set(doc(profil, 'opgavetyper', id), { navn, arkiveret: false });
  }
  await batch.commit();
}

export function lytBrugere(cb, fejl) {
  return onSnapshot(collection(db, 'godkendte'), (s) => {
    cb(s.docs.map((d) => d.data()).sort((a, b) => a.email.localeCompare(b.email)));
  }, fejl);
}

export const inviter = (email) =>
  setDoc(godkendelse(email), { email: normaliserEmail(email), admin: false, inviteret: serverTimestamp(), uid: null });

export const fjernAdgang = (email) => deleteDoc(godkendelse(email));

export const saetAdmin = (email, admin) => updateDoc(godkendelse(email), { admin });
