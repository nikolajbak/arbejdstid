import { doc, collection, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { db } from './firebase.js';
import { forskel } from './core.js';

const SAMLINGER = ['kunder', 'opgavetyper', 'registreringer'];
const kopi = (x) => structuredClone(x);
const efterNavn = (a, b) => a.navn.localeCompare(b.navn, 'da');

// Holder brugerens data i hukommelsen i samme form som appen altid har brugt,
// og skriver kun de dokumenter, der er ændret. Virker også uden net.
// fejl(err, 'lyt' | 'skriv')
export function startSky(uid, { data, status, fejl }) {
  const profil = doc(db, 'brugere', uid);
  // Seneste kendte udgave af hver del. undefined = ikke modtaget endnu.
  const del = { ur: undefined, kunder: undefined, opgavetyper: undefined, registreringer: undefined };
  const ventende = {};
  let sidst = null;
  let varVentende = false;

  function opdater() {
    if (Object.values(del).some((v) => v === undefined)) return;
    const ny = {
      kunder: [...del.kunder].sort(efterNavn),
      opgavetyper: [...del.opgavetyper].sort(efterNavn),
      registreringer: del.registreringer,
      ur: del.ur,
    };
    // Kun når data reelt er ændret, så et felt man skriver i, ikke tegnes om.
    if (sidst && forskel(sidst, ny).length === 0) return;
    sidst = kopi(ny);
    data(kopi(ny));
  }

  function meld(navn, metadata) {
    ventende[navn] = metadata.hasPendingWrites;
    const nu = Object.values(ventende).some(Boolean);
    if (nu !== varVentende) {
      varVentende = nu;
      status(nu);
    }
  }

  const medMetadata = { includeMetadataChanges: true };
  const lyttere = [
    onSnapshot(profil, medMetadata, (s) => {
      del.ur = s.data()?.ur ?? null;
      meld('profil', s.metadata);
      opdater();
    }, (e) => fejl(e, 'lyt')),
    ...SAMLINGER.map((navn) => onSnapshot(collection(profil, navn), medMetadata, (s) => {
      del[navn] = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      meld(navn, s.metadata);
      opdater();
    }, (e) => fejl(e, 'lyt'))),
  ];

  function gem(tilstand) {
    if (!sidst) return;
    const ops = forskel(sidst, tilstand);
    sidst = kopi(tilstand);
    // Ekkoet af egne skrivninger skal ikke ligne en ændring, selv hvis delene
    // ankommer hver for sig.
    for (const navn of SAMLINGER) del[navn] = kopi(tilstand[navn]);
    del.ur = kopi(tilstand.ur ?? null);
    for (let i = 0; i < ops.length; i += 500) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 500)) {
        if (op.type === 'set') batch.set(doc(profil, op.samling, op.id), op.data);
        else if (op.type === 'slet') batch.delete(doc(profil, op.samling, op.id));
        else batch.update(profil, { ur: op.ur });
      }
      // Afventes ikke: uden net bliver løftet først indfriet, når der er forbindelse.
      batch.commit().catch((e) => fejl(e, 'skriv'));
    }
  }

  return { gem, stop: () => lyttere.forEach((stop) => stop()) };
}
