// Teams i databasen: find, opret, invitér, bliv medlem, meld ud og flyt data.

import {
  doc, collection, query, where, onSnapshot, setDoc, updateDoc, getDoc, getDocs, getDocsFromServer, getDocFromServer,
  writeBatch, arrayUnion, arrayRemove, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { db } from './firebase.js';
import { flytTilTeam, flytUdvalgtTilTeam, forskel, normaliserEmail } from './core.js';
import { t } from './tilstand.js';

const SAMLINGER = ['kunder', 'opgavetyper', 'registreringer', 'poster', 'opgaver'];
const team = (id) => doc(db, 'teams', id);
const efterNavn = (a, b) => a.navn.localeCompare(b.navn, 'da');

// Standardnavnet i et team: delen af e-mailen før @.
export const standardNavn = (email) => String(email ?? '').split('@')[0];

// cb({ teams, invitationer }), hver som { id, navn, medlemmer, navne, inviterede }.
export function lytMineTeams(uid, email, cb, fejl) {
  const del = { teams: null, invitationer: null };
  const meld = () => { if (del.teams && del.invitationer) cb({ ...del }); };
  const lyt = (felt, vaerdi, navn) => onSnapshot(query(collection(db, 'teams'), where(felt, 'array-contains', vaerdi)), (s) => {
    del[navn] = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(efterNavn);
    meld();
  }, fejl);
  const stop = [lyt('medlemmer', uid, 'teams'), lyt('inviterede', normaliserEmail(email), 'invitationer')];
  return () => stop.forEach((f) => f());
}

export async function opretTeam(navn, user) {
  const ref = doc(collection(db, 'teams'));
  await setDoc(ref, {
    navn,
    medlemmer: [user.uid],
    navne: { [user.uid]: standardNavn(user.email) },
    inviterede: [],
    oprettet: serverTimestamp(),
  });
  return ref.id;
}

export const inviter = (id, email) => updateDoc(team(id), { inviterede: arrayUnion(normaliserEmail(email)) });
export const traekTilbage = (id, email) => updateDoc(team(id), { inviterede: arrayRemove(email) });
// Navnet bliver stående, så den fjernedes registreringer stadig viser det.
export const fjernMedlem = (id, uid) => updateDoc(team(id), { medlemmer: arrayRemove(uid) });
export const omdoeb = (id, navn) => updateDoc(team(id), { navn });
export const saetMitNavn = async (id, uid, navn) => {
  await updateDoc(team(id), { [`navne.${uid}`]: navn });
  await saetKatalog(uid, t.bruger.email, navn).catch(console.error);
};

// Kataloget over brugere, så man kan finde og invitere hinanden på navn.
// Hver bruger skriver kun sit eget: { navn, email }.
export const saetKatalog = (uid, email, navn) =>
  setDoc(doc(db, 'katalog', uid), { navn: String(navn).slice(0, 60), email: normaliserEmail(email) });

// Første gang: navnet fra et team, man allerede har sat det i, ellers delen før @.
export async function sikrKatalog(user, teams) {
  const ref = doc(db, 'katalog', user.uid);
  if ((await getDoc(ref)).exists()) return;
  const navn = teams.map((x) => x.navne?.[user.uid]).find(Boolean) ?? standardNavn(user.email);
  await saetKatalog(user.uid, user.email, navn);
}

export async function hentKatalog() {
  return (await getDocs(collection(db, 'katalog'))).docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export const blivMedlem = (id, user) => updateDoc(team(id), {
  medlemmer: arrayUnion(user.uid),
  inviterede: arrayRemove(normaliserEmail(user.email)),
  [`navne.${user.uid}`]: standardNavn(user.email),
});

// Henter et arbejdssteds samlinger og ur direkte fra serveren. Kaster uden net.
export async function hentData(rod, person) {
  const data = {};
  for (const navn of SAMLINGER) {
    data[navn] = (await getDocsFromServer(collection(rod, navn))).docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const p = (await getDocFromServer(person)).data();
  return { ...data, ur: p?.ur ?? null, skjult: p?.skjult ?? {} };
}

async function skriv(rod, ops) {
  for (let i = 0; i < ops.length; i += 500) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 500)) {
      if (op.type === 'set') batch.set(doc(rod, op.samling, op.id), op.data);
      else if (op.type === 'slet') batch.delete(doc(rod, op.samling, op.id));
    }
    // Afventes, så Mig først tømmes, når teamet har fået det hele.
    await batch.commit();
  }
}

// Kopierer billederne på de flyttede poster til teamet. Giver deres id'er, så de
// kan slettes fra Mig, når posterne er fjernet derfra.
async function kopierBilag(fra, til, poster) {
  const ids = poster.filter((p) => p.bilag).map((p) => p.id);
  for (const id of ids) {
    const s = await getDocFromServer(doc(fra, 'bilag', id));
    if (s.exists()) await setDoc(doc(til, 'bilag', id), s.data());
  }
  return ids;
}

const sletBilag = (rod, ids) => skriv(rod, ids.map((id) => ({ type: 'slet', samling: 'bilag', id })));

// Flytter Mig's data ind i teamet. Teamet skrives først; Mig tømmes, når
// serveren har bekræftet. Afbrydes det, ligger data begge steder, og en ny
// kørsel giver ingen dubletter. Returnerer antallet af flyttede registreringer.
export async function flytData(mig, teamSted, uid) {
  const teamData = await hentData(teamSted.data, teamSted.person);
  const { tilstand, antal } = flytTilTeam(mig.data, teamData, uid);
  await skriv(teamSted.data, forskel(teamData, tilstand).filter((op) => op.samling));
  const bilag = await kopierBilag(mig.sted.data, teamSted.data, mig.data.poster ?? []);
  const tom = { ...mig.data, kunder: [], opgavetyper: [], registreringer: [], poster: [], opgaver: [] };
  await skriv(mig.sted.data, forskel(mig.data, tom).filter((op) => op.samling));
  await sletBilag(mig.sted.data, bilag);
  return antal;
}

// Flytter udvalgte kunder og kopierer udvalgte opgavetyper fra Mig ind i teamet.
// Samme rækkefølge som flytData: teamet først, så fjernes kunderne fra Mig.
export async function flytUdvalgt(mig, teamSted, uid, valg) {
  const teamData = await hentData(teamSted.data, teamSted.person);
  const r = flytUdvalgtTilTeam(mig.data, teamData, uid, valg);
  await skriv(teamSted.data, forskel(teamData, r.team).filter((op) => op.samling));
  const flyttet = (mig.data.poster ?? []).filter((p) => valg.kunder.includes(p.kundeId));
  const bilag = await kopierBilag(mig.sted.data, teamSted.data, flyttet);
  await skriv(mig.sted.data, forskel(mig.data, r.mig).filter((op) => op.samling));
  await sletBilag(mig.sted.data, bilag);
  return r.antal;
}
