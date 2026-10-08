// Ren logik uden DOM. Bruges af både app.js og tests.

const TIME_MS = 3600000;
const KVARTER_MS = 15 * 60000;

// Tiden der faktureres: rundet op til nærmeste kvarter, mindst ét kvarter.
// Start og slut gemmes uændret.
export function durationMs(entry) {
  const ms = new Date(entry.slut) - new Date(entry.start);
  return Math.max(1, Math.ceil(ms / KVARTER_MS)) * KVARTER_MS;
}

export function amountOf(entry) {
  return (durationMs(entry) / TIME_MS) * entry.timepris;
}

// --- Poster: penge på en kunde ud over tiden ---------------------------------------

export const POST_TYPER = { udgift: 'Udgift', braendstof: 'Brændstof', kontant: 'Kontantudlæg', betaling: 'Betaling' };

// Udgifter lægges til det, kunden skylder; kontanter og betalinger trækkes fra.
export function postBeloeb(p) {
  return p.type === 'kontant' || p.type === 'betaling' ? -p.beloeb : p.beloeb;
}

// Hvad hver kunde skylder over al tid. Kunder i nul udelades.
export function saldoer(registreringer, poster, kunder) {
  const pr = new Map();
  const laeg = (id, kr) => pr.set(id, (pr.get(id) ?? 0) + kr);
  for (const r of registreringer) laeg(r.kundeId, amountOf(r));
  for (const p of poster) laeg(p.kundeId, postBeloeb(p));
  return [...pr]
    .filter(([, saldo]) => Math.abs(saldo) >= 0.005)
    .map(([kundeId, saldo]) => ({ kundeId, navn: kunder.find((k) => k.id === kundeId)?.navn ?? '(slettet)', saldo }))
    .sort((a, b) => a.navn.localeCompare(b.navn, 'da'));
}

// Hvad der er afregnet: hver kundes betalinger og kontantudlæg dækker det ældste
// arbejde og de ældste udgifter først. Giver pr. registrering/post (kun dem, der
// lægges til saldoen) 'afregnet' eller 'delvis'; åbne er udeladt. rest er, hvad der
// mangler på de delvise. afregnetTil er pr. kunde den sidste dag, hvor alt til og med
// er afregnet.
export function afregning(registreringer, poster) {
  const pr = new Map();
  const kunde = (id) => {
    if (!pr.has(id)) pr.set(id, { kredit: 0, linjer: [] });
    return pr.get(id);
  };
  for (const r of registreringer) kunde(r.kundeId).linjer.push({ id: r.id, tid: new Date(r.start).getTime(), dag: dayKey(new Date(r.start)), kr: amountOf(r) });
  for (const p of poster) {
    const kr = postBeloeb(p);
    if (kr < 0) kunde(p.kundeId).kredit -= kr;
    else kunde(p.kundeId).linjer.push({ id: p.id, tid: new Date(`${p.dato}T00:00`).getTime(), dag: p.dato, kr });
  }
  const status = new Map();
  const rest = new Map();
  const afregnetTil = new Map();
  for (const [kundeId, { kredit, linjer }] of pr) {
    linjer.sort((a, b) => a.tid - b.tid);
    let sum = 0;
    let i = 0;
    for (; i < linjer.length; i++) {
      const l = linjer[i];
      if (sum + l.kr > kredit + 0.005) {
        if (sum < kredit - 0.005) {
          status.set(l.id, 'delvis');
          rest.set(l.id, sum + l.kr - kredit);
        }
        break;
      }
      sum += l.kr;
      status.set(l.id, 'afregnet');
    }
    // Sidste afregnede dag, der ikke også har noget åbent.
    const aaben = linjer[i]?.dag;
    const sidste = linjer.slice(0, i).reverse().find((l) => l.dag !== aaben);
    if (sidste) afregnetTil.set(kundeId, sidste.dag);
  }
  return { status, rest, afregnetTil };
}

// Alt om én kunde over al tid: saldo, tid og udestående pr. opgave, det udestående
// (ældste først), det afregnede (nyeste først) og betalingerne (nyeste først).
// Linjer er { slags: 'registrering' | 'post', x, dag, kr, aabent }.
export function kundeOversigt(kundeId, registreringer, poster, opgavetyper) {
  const regs = registreringer.filter((r) => r.kundeId === kundeId);
  const psts = poster.filter((p) => p.kundeId === kundeId);
  const { status, rest, afregnetTil } = afregning(regs, psts);
  const aabent = (id, kr) => (status.get(id) === 'afregnet' ? 0 : status.get(id) === 'delvis' ? rest.get(id) : kr);
  const typer = new Map();
  const linjer = [];
  for (const r of regs) {
    const kr = amountOf(r);
    const l = { slags: 'registrering', x: r, tid: new Date(r.start).getTime(), dag: dayKey(new Date(r.start)), kr, aabent: aabent(r.id, kr) };
    linjer.push(l);
    if (!typer.has(r.opgavetypeId)) typer.set(r.opgavetypeId, { opgavetypeId: r.opgavetypeId, navn: typeNavn(opgavetyper, r.opgavetypeId), ms: 0, kr: 0, aabent: 0 });
    const ty = typer.get(r.opgavetypeId);
    ty.ms += durationMs(r);
    ty.kr += kr;
    ty.aabent += l.aabent;
  }
  const afregninger = [];
  for (const p of psts) {
    const kr = postBeloeb(p);
    if (kr < 0) afregninger.push(p);
    else linjer.push({ slags: 'post', x: p, tid: new Date(`${p.dato}T00:00`).getTime(), dag: p.dato, kr, aabent: aabent(p.id, kr) });
  }
  linjer.sort((a, b) => a.tid - b.tid);
  const sum = (liste, f) => liste.reduce((n, x) => n + f(x), 0);
  const udestaaende = linjer.filter((l) => l.aabent >= 0.005);
  return {
    saldo: sum(linjer, (l) => l.kr) - sum(afregninger, (p) => p.beloeb),
    afregnetTil: afregnetTil.get(kundeId) ?? null,
    status,
    opgaver: [...typer.values()].sort(typeOrden),
    udestaaende,
    udestaaendeKr: sum(udestaaende, (l) => l.aabent),
    afregnet: linjer.filter((l) => l.aabent < 0.005).reverse(),
    afregninger: afregninger.sort((a, b) => (a.dato < b.dato ? 1 : -1)),
    betalt: sum(afregninger, (p) => p.beloeb),
  };
}

export function formatDuration(ms) {
  const minutter = Math.floor(Math.max(0, ms) / 60000);
  const t = Math.floor(minutter / 60);
  const m = minutter % 60;
  return `${t}:${String(m).padStart(2, '0')}`;
}

export function formatNumber(n) {
  const [heltal, decimaler] = Math.abs(n).toFixed(2).split('.');
  const medPunktum = heltal.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${medPunktum},${decimaler}`;
}

export function formatKr(n) {
  return `${formatNumber(n)} kr`;
}

// Tal skrevet med komma eller punktum. Returnerer null hvis ugyldigt.
// "1.250,50" læses med punktum som tusindtalsskilletegn. "1.250" alene er
// tvetydigt og afvises, så et beløb ikke stille bliver 1000 gange for lille.
export function parseNumber(str) {
  let s = String(str ?? '').trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function parseHours(str) {
  const n = parseNumber(str);
  return n !== null && n > 0 ? n : null;
}

export function validateEntry({ start, slut }) {
  return new Date(slut) > new Date(start) ? null : 'Slut skal være efter start';
}

export function monthRange(date, offset = 0) {
  return {
    from: new Date(date.getFullYear(), date.getMonth() + offset, 1),
    to: new Date(date.getFullYear(), date.getMonth() + offset + 1, 1),
  };
}

export function inPeriod(entry, from, to) {
  const s = new Date(entry.start);
  return s >= from && s < to;
}

export function dayKey(date) {
  const d = new Date(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const nyesteFoerst = (a, b) => new Date(b.start) - new Date(a.start);

export function groupByDay(entries) {
  const dage = new Map();
  for (const e of [...entries].sort(nyesteFoerst)) {
    const dag = dayKey(e.start);
    if (!dage.has(dag)) dage.set(dag, { dag, ms: 0, entries: [] });
    const g = dage.get(dag);
    g.entries.push(e);
    g.ms += durationMs(e);
  }
  return [...dage.values()];
}

const navnPaa = (liste, id) => liste.find((x) => x.id === id)?.navn ?? '(slettet)';
const efterNavn = (a, b) => a.navn.localeCompare(b.navn, 'da');

export const UDEN_OPGAVE = 'Uden opgave';
const typeNavn = (opgavetyper, id) => (id ? navnPaa(opgavetyper, id) : UDEN_OPGAVE);
// "Uden opgave" står altid sidst.
const typeOrden = (a, b) => (a.opgavetypeId === '') - (b.opgavetypeId === '') || efterNavn(a, b);

// --- Kundefarver ---------------------------------------------------------------

export const FARVER = ['skov', 'ler', 'indigo', 'blomme', 'rosa', 'okker', 'hav', 'skifer'];

// Kundens egen farve, ellers en fast farve ud fra id, så den ikke skifter.
export function farveFor(kunde) {
  if (FARVER.includes(kunde?.farve)) return kunde.farve;
  const id = String(kunde?.id ?? '');
  let sum = 0;
  for (const tegn of id) sum += tegn.codePointAt(0);
  return FARVER[sum % FARVER.length];
}

// Den farve, færrest aktive kunder har. Ved lighed den første.
export function naesteFarve(kunder) {
  const antal = new Map(FARVER.map((f) => [f, 0]));
  for (const k of kunder) if (!k.arkiveret && antal.has(k.farve)) antal.set(k.farve, antal.get(k.farve) + 1);
  return FARVER.reduce((bedst, f) => (antal.get(f) < antal.get(bedst) ? f : bedst));
}

// --- Fortsæt og skift ------------------------------------------------------------

// De seneste kombinationer af kunde og opgave, der kan fortsættes med ét tryk.
export const kombiNoegle = (x) => `${x.kundeId}\u0000${x.opgavetypeId ?? ''}`;

// De seneste unikke kombinationer af kunde og opgave, nyeste først. En skjult
// kombination vises igen, når der er arbejdet på den efter den blev skjult.
export function senesteKombinationer(registreringer, kunder, opgavetyper, ur, antal = 4, skjult = {}) {
  const aktivKunde = new Set(kunder.filter((k) => !k.arkiveret).map((k) => k.id));
  const aktivType = new Set(opgavetyper.filter((t) => !t.arkiveret).map((t) => t.id));
  const set = new Set(ur ? [kombiNoegle(ur)] : []);
  const ud = [];
  for (const r of [...registreringer].sort((a, b) => new Date(b.slut) - new Date(a.slut))) {
    if (ud.length >= antal) break;
    const noegle = kombiNoegle(r);
    const opgavetypeId = r.opgavetypeId ?? '';
    if (set.has(noegle) || !aktivKunde.has(r.kundeId) || (opgavetypeId && !aktivType.has(opgavetypeId))) continue;
    set.add(noegle);
    if (skjult[noegle] && new Date(r.slut) <= new Date(skjult[noegle])) continue;
    ud.push({ kundeId: r.kundeId, opgavetypeId, sidst: r.slut });
  }
  return ud;
}

// Skjuler en kombination fra nu af. Skjulte kombinationer, der er arbejdet på
// siden, fjernes samtidig, så listen ikke vokser.
export function skjulKombination(skjult, registreringer, kombination, nu) {
  const seneste = new Map();
  for (const r of registreringer) {
    const n = kombiNoegle(r);
    if (!seneste.has(n) || new Date(r.slut) > new Date(seneste.get(n))) seneste.set(n, r.slut);
  }
  const ud = {};
  for (const [n, tid] of Object.entries(skjult ?? {})) {
    if (!seneste.has(n) || new Date(seneste.get(n)) <= new Date(tid)) ud[n] = tid;
  }
  ud[kombiNoegle(kombination)] = nu;
  return ud;
}

// "i dag", "i går", "for 3 dage siden" eller datoen.
export function sidenTekst(iso, nu = new Date()) {
  const d = new Date(iso);
  const dage = Math.round((new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (dage <= 0) return 'i dag';
  if (dage === 1) return 'i går';
  if (dage < 7) return `for ${dage} dage siden`;
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

// Gemmer det kørende ur som registrering (slut = nu) og starter et nyt.
// --- Teams -------------------------------------------------------------------------

// Én registrering pr. person. Uden personer (Mig) én uden person-felt.
export function forPersoner(base, personer, nyId) {
  if (!personer?.length) return [{ id: nyId(), ...base }];
  return personer.map((person) => ({ id: nyId(), ...base, person }));
}

// Deltagerne, der stadig er medlemmer. medlemmer er null i Mig.
const aktiveDeltagere = (ur, medlemmer) => (ur?.deltagere ?? []).filter((p) => !medlemmer || medlemmer.includes(p));

// Registreringerne for et stoppet ur: én pr. deltager, ellers én for personen.
// person er null i Mig. Fjernede medlemmer springes over; databasen afviser dem.
export function registreringerFraUr(ur, { slut, timepris, opgavetypeId, note, person = null, nyId, medlemmer = null }) {
  const base = { kundeId: ur.kundeId, opgavetypeId: opgavetypeId ?? '', start: ur.start, slut, timepris, note: note ?? '' };
  const deltagere = aktiveDeltagere(ur, medlemmer);
  const personer = deltagere.length ? deltagere : person ? [person] : [];
  return forPersoner(base, personer, nyId);
}

export const medPerson = (entries, uid) => (uid ? entries.filter((e) => e.person === uid) : entries);

export const personNavn = (team, uid) => team?.navne?.[uid] ?? '(tidligere medlem)';

export function skiftUr(tilstand, ny, nu, timepris, id, { person = null, nyId, medlemmer = null } = {}) {
  const { ur } = tilstand;
  // Med forskellige ure på to enheder kan "nu" ligge før starten; den slags
  // registrering afvises af databasen, så den gemmes ikke.
  let foerste = true;
  const ider = () => (foerste ? ((foerste = false), id) : nyId());
  const registreringer = ur && new Date(nu) > new Date(ur.start)
    ? [...tilstand.registreringer, ...registreringerFraUr(ur, { slut: nu, timepris, opgavetypeId: ur.opgavetypeId, note: ur.note, person, nyId: ider, medlemmer })]
    : tilstand.registreringer;
  const nytUr = { kundeId: ny.kundeId, opgavetypeId: ny.opgavetypeId ?? '', start: nu, note: '' };
  const deltagere = aktiveDeltagere(ur, medlemmer);
  // Kun en selv tilbage: ingen deltagere.
  if (deltagere.length && !(deltagere.length === 1 && deltagere[0] === person)) nytUr.deltagere = deltagere;
  return { ...tilstand, registreringer, ur: nytUr };
}

export function summarize(entries, kunder, opgavetyper, poster = []) {
  const pr = new Map();
  const kundeI = (id) => {
    if (!pr.has(id)) pr.set(id, { kundeId: id, navn: navnPaa(kunder, id), ms: 0, kr: 0, typer: new Map(), poster: new Map() });
    return pr.get(id);
  };
  let ms = 0;
  let kr = 0;
  for (const e of entries) {
    const d = durationMs(e);
    const a = amountOf(e);
    ms += d;
    kr += a;
    const k = kundeI(e.kundeId);
    k.ms += d;
    k.kr += a;
    if (!k.typer.has(e.opgavetypeId)) k.typer.set(e.opgavetypeId, { opgavetypeId: e.opgavetypeId, navn: typeNavn(opgavetyper, e.opgavetypeId), ms: 0, kr: 0 });
    const t = k.typer.get(e.opgavetypeId);
    t.ms += d;
    t.kr += a;
  }
  for (const p of poster) {
    const k = kundeI(p.kundeId);
    k.poster.set(p.type, (k.poster.get(p.type) ?? 0) + p.beloeb);
  }
  const postLinjer = (m) => Object.keys(POST_TYPER).filter((x) => m.has(x)).map((x) => ({ type: x, navn: POST_TYPER[x], kr: m.get(x) }));
  return {
    kunder: [...pr.values()].map((k) => ({ ...k, typer: [...k.typer.values()].sort(typeOrden), poster: postLinjer(k.poster) })).sort(efterNavn),
    ms,
    kr,
  };
}

const p2 = (n) => String(n).padStart(2, '0');
const klokken = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const csvTal = (n) => n.toFixed(2).replace('.', ',');
const csvFelt = (v) => {
  let s = String(v ?? '');
  // Excel tolker felter, der starter med = + - @, som formler.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// personNavn(uid) giver i et team en sidste kolonne, Person.
export function toCSV(entries, kunder, opgavetyper, poster = [], personNavn = null) {
  const linjer = [`Dato;Start;Slut;Kunde;Opgavetype;Timer;Timepris;Beløb;Note${personNavn ? ';Person' : ''}`];
  const person = (x) => (personNavn ? `;${csvFelt(x.person ? personNavn(x.person) : '')}` : '');
  const dansk = (d) => `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
  // Poster har kun en dato; de sorteres ved dagens start.
  const alle = [
    ...entries.map((e) => ({ e, t: new Date(e.start) })),
    ...poster.map((p) => ({ p, t: new Date(`${p.dato}T00:00`) })),
  ].sort((a, b) => a.t - b.t);
  for (const { e, p, t } of alle) {
    if (p) {
      // Beløbet er et tal og må gerne starte med minus, så det går uden om csvFelt.
      const felter = [dansk(t), '', '', navnPaa(kunder, p.kundeId), POST_TYPER[p.type], '', ''].map(csvFelt);
      linjer.push([...felter, csvTal(postBeloeb(p)), csvFelt(p.note)].join(';') + person(p));
      continue;
    }
    const s = t;
    linjer.push([
      dansk(s),
      klokken(s),
      klokken(new Date(e.slut)),
      navnPaa(kunder, e.kundeId),
      e.opgavetypeId ? navnPaa(opgavetyper, e.opgavetypeId) : '',
      csvTal(durationMs(e) / TIME_MS),
      csvTal(e.timepris),
      csvTal(amountOf(e)),
      e.note,
    ].map(csvFelt).join(';') + person(e));
  }
  return '﻿' + linjer.join('\r\n');
}

const erTekst = (v) => typeof v === 'string';
const erTal = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const erDato = (v) => erTekst(v) && !Number.isNaN(new Date(v).getTime());
const erValgfriTekst = (v) => v == null || erTekst(v);

const gyldigKunde = (k) => k && erTekst(k.id) && erTekst(k.navn) && erTal(k.timepris);
const gyldigType = (t) => t && erTekst(t.id) && erTekst(t.navn);
const gyldigReg = (r) => r && erTekst(r.id) && erTekst(r.kundeId) && erTekst(r.opgavetypeId)
  && erDato(r.start) && erDato(r.slut) && new Date(r.slut) > new Date(r.start)
  && erTal(r.timepris) && erValgfriTekst(r.note);
const gyldigPost = (p) => p && erTekst(p.id) && erTekst(p.kundeId) && p.type in POST_TYPER
  && erTekst(p.dato) && /^\d{4}-\d{2}-\d{2}$/.test(p.dato) && erTal(p.beloeb) && p.beloeb > 0 && erValgfriTekst(p.note);
const gyldigtUr = (u) => u == null
  || (erTekst(u.kundeId) && erTekst(u.opgavetypeId) && erDato(u.start) && erValgfriTekst(u.note));

export function validateBackup(obj) {
  const fejl = { ok: false, fejl: 'Filen kunne ikke læses som backup' };
  if (!obj || typeof obj !== 'object' || obj.version !== 1) return fejl;
  if (!['kunder', 'opgavetyper', 'registreringer'].every((k) => Array.isArray(obj[k]))) return fejl;
  if (!obj.kunder.every(gyldigKunde) || !obj.opgavetyper.every(gyldigType)
    || !obj.registreringer.every(gyldigReg) || !gyldigtUr(obj.ur)) return fejl;
  // Ældre backups har ingen poster.
  const poster = obj.poster ?? [];
  if (!Array.isArray(poster) || !poster.every(gyldigPost)) return fejl;
  // En ukendt farve fjernes; databasen tager kun imod de otte nøgler.
  const kunder = obj.kunder.map(({ farve, ...k }) => (FARVER.includes(farve) ? { ...k, farve } : k));
  const skjult = obj.skjult && typeof obj.skjult === 'object' && !Array.isArray(obj.skjult)
    && Object.values(obj.skjult).every((v) => typeof v === 'string') ? obj.skjult : {};
  return { ok: true, data: { ...obj, kunder, poster, ur: obj.ur ?? null, skjult } };
}

// --- Synkronisering med skyen ------------------------------------------------

const SAMLINGER = ['kunder', 'opgavetyper', 'registreringer', 'poster'];

// Udfylder felter, som ældre data kan mangle, så de består databasens regler.
function rens(samling, { id, ...data }) {
  if (samling === 'registreringer' || samling === 'poster') return { ...data, note: data.note ?? '' };
  return { ...data, arkiveret: !!data.arkiveret };
}

// JSON med sorterede nøgler, så rækkefølgen af felter ikke tæller som en ændring.
function fast(v) {
  if (Array.isArray(v)) return `[${v.map(fast).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((n) => v[n] !== undefined).sort().map((n) => `${JSON.stringify(n)}:${fast(v[n])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

// Hvilke dokumenter skal skrives eller slettes for at gå fra foer til efter.
export function forskel(foer, efter) {
  const ops = [];
  for (const samling of SAMLINGER) {
    const gamle = new Map((foer[samling] ?? []).map((x) => [x.id, fast(rens(samling, x))]));
    const nye = new Set();
    for (const x of efter[samling] ?? []) {
      nye.add(x.id);
      const data = rens(samling, x);
      if (gamle.get(x.id) !== fast(data)) ops.push({ type: 'set', samling, id: x.id, data });
    }
    for (const id of gamle.keys()) if (!nye.has(id)) ops.push({ type: 'slet', samling, id });
  }
  if (fast(foer.ur) !== fast(efter.ur)) ops.push({ type: 'ur', ur: efter.ur ?? null });
  if (fast(foer.skjult ?? {}) !== fast(efter.skjult ?? {})) ops.push({ type: 'skjult', skjult: efter.skjult ?? {} });
  return ops;
}

// Flytter Mig's data ind i et team: samme fletning som flet, og registreringerne
// får personen. Teamets ur og skjulte genveje bevares. Kan køres igen uden dubletter.
export function flytTilTeam(mig, team, uid) {
  const f = flet(mig, team);
  const kendte = new Set(team.registreringer.map((r) => r.id));
  const registreringer = f.registreringer.map((r) => (kendte.has(r.id) ? r : { ...r, person: uid }));
  return {
    tilstand: { ...team, ...f, registreringer, ur: team.ur ?? null, skjult: team.skjult ?? {} },
    antal: registreringer.length - kendte.size,
  };
}

// Flytter udvalgte kunder fra Mig til et team med deres registreringer og poster,
// og kopierer udvalgte opgavetyper. Opgavetyper, som den flyttede tid bruger,
// kopieres med. Mig beholder alle opgavetyper. Kan køres igen uden dubletter.
export function flytUdvalgtTilTeam(mig, team, uid, valg) {
  const kunder = new Set(valg.kunder);
  const registreringer = mig.registreringer.filter((r) => kunder.has(r.kundeId));
  const poster = (mig.poster ?? []).filter((p) => kunder.has(p.kundeId));
  const typer = new Set([...valg.opgavetyper, ...registreringer.map((r) => r.opgavetypeId)]);
  const del = {
    kunder: mig.kunder.filter((x) => kunder.has(x.id)),
    opgavetyper: mig.opgavetyper.filter((x) => typer.has(x.id)),
    registreringer,
    poster,
    ur: null,
  };
  const { tilstand, antal } = flytTilTeam(del, team, uid);
  return {
    team: tilstand,
    mig: kunder.size ? {
      ...mig,
      kunder: mig.kunder.filter((x) => !kunder.has(x.id)),
      registreringer: mig.registreringer.filter((r) => !kunder.has(r.kundeId)),
      poster: (mig.poster ?? []).filter((p) => !kunder.has(p.kundeId)),
    } : mig,
    antal,
  };
}

// Fletter data fra telefonen ind i kontoen. Navne, der findes i forvejen, genbruges.
export function flet(lokal, konto) {
  const noegle = (navn) => navn.trim().toLocaleLowerCase('da');
  const flettet = (samling) => {
    const liste = [...konto[samling]];
    const ny = new Map();
    for (const x of lokal[samling]) {
      const fundet = liste.find((y) => noegle(y.navn) === noegle(x.navn));
      if (fundet) ny.set(x.id, fundet.id);
      else liste.push(x);
    }
    return [liste, ny];
  };
  const [kunder, kundeId] = flettet('kunder');
  const [opgavetyper, typeId] = flettet('opgavetyper');
  const kendte = new Set(konto.registreringer.map((r) => r.id));
  const omskriv = (x) => ({
    ...x,
    kundeId: kundeId.get(x.kundeId) ?? x.kundeId,
    opgavetypeId: typeId.get(x.opgavetypeId) ?? x.opgavetypeId,
  });
  return {
    kunder,
    opgavetyper,
    registreringer: [...konto.registreringer, ...lokal.registreringer.filter((r) => !kendte.has(r.id)).map(omskriv)],
    poster: [
      ...(konto.poster ?? []),
      ...(lokal.poster ?? [])
        .filter((p) => !(konto.poster ?? []).some((x) => x.id === p.id))
        .map((p) => ({ ...p, kundeId: kundeId.get(p.kundeId) ?? p.kundeId })),
    ],
    ur: konto.ur ?? (lokal.ur ? omskriv(lokal.ur) : null),
    skjult: konto.skjult ?? {},
  };
}

export function normaliserEmail(s) {
  const e = String(s ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// Et mailto-link med en færdig invitation, som åbnes i brugerens egen mailapp.
// Appen sender ikke selv mails. encodeURIComponent giver %20 for mellemrum;
// et + ville stå som + i flere mailapps.
export function invitationsMail(til, adresse, team = null) {
  const emne = team ? `Invitation til teamet ${team} i Arbejdstid` : 'Invitation til Arbejdstid';
  const tekst = [
    'Hej',
    '',
    team ? `Du er inviteret til teamet ${team} i Arbejdstid.` : 'Du er inviteret til Arbejdstid.',
    '',
    `Åbn appen her: ${adresse}`,
    `Log ind eller opret en konto med denne e-mail: ${til}`,
    ...(team ? ['Når du er logget ind, står invitationen under Mig ▾ øverst i appen.'] : []),
  ].join('\n');
  return `mailto:${til}?subject=${encodeURIComponent(emne)}&body=${encodeURIComponent(tekst)}`;
}

const FEJL = {
  'auth/invalid-credential': 'Forkert e-mail eller adgangskode.',
  'auth/wrong-password': 'Forkert e-mail eller adgangskode.',
  'auth/user-not-found': 'Forkert e-mail eller adgangskode.',
  'auth/invalid-email': 'Det ligner ikke en e-mailadresse. Tjek den.',
  'auth/missing-email': 'Skriv din e-mail.',
  'auth/missing-password': 'Skriv en adgangskode.',
  'auth/email-already-in-use': 'Der findes allerede en konto med den e-mail. Log ind i stedet.',
  'auth/weak-password': 'Adgangskoden skal være mindst 6 tegn.',
  'auth/network-request-failed': 'Første login kræver internet.',
  'auth/too-many-requests': 'For mange forsøg. Prøv igen om lidt.',
  'permission-denied': 'Din adgang er fjernet.',
};

export function fejlTekst(kode) {
  return FEJL[kode] ?? 'Noget gik galt. Prøv igen.';
}
