// Teams i databasen: find, opret, invitér, bliv medlem, meld ud og flyt data.

import {
  doc, collection, query, where, onSnapshot, setDoc, updateDoc, getDocsFromServer, getDocFromServer,
  writeBatch, arrayUnion, arrayRemove, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { db } from './firebase.js';
import { flytTilTeam, flytUdvalgtTilTeam, forskel, normaliserEmail } from './core.js';

const SAMLINGER = ['kunder', 'opgavetyper', 'registreringer', 'poster'];
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
export const saetMitNavn = (id, uid, navn) => updateDoc(team(id), { [`navne.${uid}`]: navn });

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

// Flytter Mig's data ind i teamet. Teamet skrives først; Mig tømmes, når
// serveren har bekræftet. Afbrydes det, ligger data begge steder, og en ny
// kørsel giver ingen dubletter. Returnerer antallet af flyttede registreringer.
export async function flytData(mig, teamSted, uid) {
  const teamData = await hentData(teamSted.data, teamSted.person);
  const { tilstand, antal } = flytTilTeam(mig.data, teamData, uid);
  await skriv(teamSted.data, forskel(teamData, tilstand).filter((op) => op.samling));
  const tom = { ...mig.data, kunder: [], opgavetyper: [], registreringer: [], poster: [] };
  await skriv(mig.sted.data, forskel(mig.data, tom).filter((op) => op.samling));
  return antal;
}

// Flytter udvalgte kunder og kopierer udvalgte opgavetyper fra Mig ind i teamet.
// Samme rækkefølge som flytData: teamet først, så fjernes kunderne fra Mig.
export async function flytUdvalgt(mig, teamSted, uid, valg) {
  const teamData = await hentData(teamSted.data, teamSted.person);
  const r = flytUdvalgtTilTeam(mig.data, teamData, uid, valg);
  await skriv(teamSted.data, forskel(teamData, r.team).filter((op) => op.samling));
  await skriv(mig.sted.data, forskel(mig.data, r.mig).filter((op) => op.samling));
  return r.antal;
}
