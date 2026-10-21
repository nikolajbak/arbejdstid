// Læser et billede af en kvittering med Gemini og giver butik, dato, beløb,
// moms og varer tilbage. Nøglen bliver her i workeren og når aldrig appen.
//
// Modelvalget er det samme som i Kalorietælleren, hvor det er testet mod det
// rigtige API: aliasser som -latest ruter til de mest belastede puljer og giver
// 503, så modellerne hentes fra listen, og nyeste Flash prøves først. Modellerne
// køres som kapløb, og deres helbred huskes i KV: 404 udelukker i 7 dage,
// 429/5xx/timeout stiller bagerst i 10 minutter, og en model, der afviser
// thinkingConfig, kaldes uden i 7 dage.

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const UGE = 6048e5;
const STRAF = 6e5;
const HEDGE = 5000;
const KALD_MS = 70000;
const K_MODELLER = 'gemini:modeller';
const K_HELBRED = 'gemini:helbred';

const PROMPT = `Billedet er taget til et bogholderi. Er det en kvittering eller faktura, så læs den:
- butik: forretningens navn.
- dato: købsdatoen som ÅÅÅÅ-MM-DD, eller tom, hvis den ikke kan læses.
- total: det samlede beløb, der er betalt, i kroner inkl. moms.
- moms: momsbeløbet i kroner, som det står på kvitteringen; 0, hvis der ikke står noget.
- braendstof: true, hvis købet hovedsageligt er benzin, diesel eller anden brændstof.
- varer: hver vare med navn og pris i kroner inkl. moms, som den står. Højst 30.
Er billedet ikke en kvittering, så sæt erKvittering til false og resten tomt eller 0.`;

const SKEMA = {
  type: 'OBJECT',
  properties: {
    erKvittering: { type: 'BOOLEAN' },
    butik: { type: 'STRING' },
    dato: { type: 'STRING' },
    total: { type: 'NUMBER' },
    moms: { type: 'NUMBER' },
    braendstof: { type: 'BOOLEAN' },
    varer: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { navn: { type: 'STRING' }, beloeb: { type: 'NUMBER' } }, required: ['navn', 'beloeb'] },
    },
  },
  required: ['erKvittering', 'butik', 'dato', 'total', 'moms', 'braendstof', 'varer'],
};

export class KvitteringFejl extends Error {
  constructor(status, besked) {
    super(besked);
    this.status = status;
  }
}

const tekst = (v, maks) => (typeof v === 'string' ? v.trim().slice(0, maks) : '');
const kroner = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 10_000_000 ? Math.round(v * 100) / 100 : 0);

// Modellens svar gøres til noget, appen kan stole på: kendte felter, rimelige tal og en rigtig dato.
export function rens(r) {
  if (!r || r.erKvittering !== true) return { erKvittering: false };
  const dato = /^\d{4}-\d{2}-\d{2}$/.test(r.dato) && !Number.isNaN(new Date(r.dato).getTime()) ? r.dato : '';
  const total = kroner(r.total);
  const moms = kroner(r.moms);
  return {
    erKvittering: true,
    butik: tekst(r.butik, 80),
    dato,
    total,
    moms: moms <= total ? moms : 0,
    braendstof: r.braendstof === true,
    varer: (Array.isArray(r.varer) ? r.varer : []).slice(0, 30)
      .map((v) => ({ navn: tekst(v?.navn, 80), beloeb: kroner(v?.beloeb) }))
      .filter((v) => v.navn),
  };
}

const version = (navn) => parseFloat(/^gemini-(\d+(?:\.\d+)?)-/.exec(navn)?.[1] ?? '0');

// Som gRang i Kalorietælleren: kun gemini-tekstmodeller, Flash før Flash-Lite før Pro, nyeste først.
export function rang(navn) {
  const n = String(navn).toLowerCase();
  if (/embedding|aqa|gemma|learnlm|tts|audio|live|image|imagen|veo|vision/.test(n)) return -1;
  if (/latest|exp|thinking|omni|banana|transcribe|customtools|robotics|computer/.test(n)) return -1;
  if (!/^gemini-\d/.test(n)) return -1;
  let v = version(n) * 10;
  if (/preview/.test(n)) v -= 3;
  if (/flash-lite/.test(n)) return v + 4;
  if (/flash/.test(n)) return v + 6;
  if (/pro/.test(n)) return v + 2;
  return -1;
}

// Rækkefølgen til en detaljeanalyse: fire Flash, så én Lite og til sidst én Pro.
// Udelukkede modeller springes over, og straffede stilles bagerst.
export function modelListe(alle, helbred, nu) {
  const nyeste = (a, b) => version(b) - version(a);
  const flash = alle.filter((n) => /flash/.test(n) && !/lite/.test(n)).sort(nyeste);
  const lite = alle.filter((n) => /flash-lite/.test(n)).sort(nyeste);
  const pro = alle.filter((n) => /pro/.test(n)).sort(nyeste);
  const liste = flash.slice(0, 4).concat(lite.slice(0, 1), pro.slice(0, 1));
  const ok = [];
  const straf = [];
  for (const m of liste.length ? liste : alle.slice(0, 4)) {
    const h = helbred[m] ?? {};
    if (h.vaek > nu) continue;
    (h.straf > nu ? straf : ok).push(m);
  }
  const res = ok.concat(straf);
  return res.length ? res : liste;
}

const midlertidig = (e) => [0, 429, 500, 503].includes(e.status ?? 0) || e.timeout;
const taenkFejl = (e) => e.status === 400 && /think|budget/i.test(e.rod ?? '');

export function lavLaesKvittering({ noegle, kv, hent = fetch, vent = (ms) => new Promise((r) => setTimeout(r, ms)), nu = Date.now, hedge = HEDGE }) {
  async function laesKv(navn) {
    try { return (await kv?.get(navn, 'json')) ?? null; } catch { return null; }
  }
  async function skrivKv(navn, vaerdi) {
    try { await kv?.put(navn, JSON.stringify(vaerdi)); } catch {}
  }

  async function kaldApi(sti, init, signal) {
    const ac = new AbortController();
    const afbryd = () => ac.abort();
    signal?.addEventListener('abort', afbryd);
    const ur = setTimeout(afbryd, KALD_MS);
    try {
      const r = await hent(`${API}${sti}`, { ...init, signal: ac.signal, headers: { ...init?.headers, 'x-goog-api-key': noegle } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error('Gemini svarede ' + r.status), { status: r.status, rod: d.error?.message ?? '' });
      return d;
    } catch (e) {
      if (e.status) throw e;
      throw Object.assign(new Error('Gemini svarede ikke'), { status: 0, timeout: ac.signal.aborted && !signal?.aborted });
    } finally {
      clearTimeout(ur);
      signal?.removeEventListener('abort', afbryd);
    }
  }

  // Modellisten caches en uge, så den ikke hentes ved hver kvittering.
  async function modeller() {
    const c = await laesKv(K_MODELLER);
    if (c?.alle?.length && nu() - c.tid < UGE) return c.alle;
    const d = await kaldApi('?pageSize=200');
    const alle = (d.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter((n) => rang(n) > 0)
      .sort((a, b) => rang(b) - rang(a));
    if (!alle.length) throw Object.assign(new Error('nøglen har ingen brugbar model'), { status: 403 });
    await skrivKv(K_MODELLER, { alle, tid: nu() });
    return alle;
  }

  async function maerk(model, felt) {
    const h = (await laesKv(K_HELBRED)) ?? {};
    h[model] = { ...h[model], ...felt };
    // Modeller uden en gældende frist ryddes væk, så listen ikke vokser.
    for (const [m, x] of Object.entries(h)) {
      if (m !== model && !(x.vaek > nu()) && !(x.straf > nu()) && !(x.udenTaenk > nu())) delete h[m];
    }
    await skrivKv(K_HELBRED, h);
  }

  function krop(mime, base64, model, udenTaenk) {
    const conf = { maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: SKEMA };
    // Lite-modellerne afviser thinkingConfig; de andre fra 2.5 får et loft, så svaret ikke trækker ud.
    if (version(model) >= 2.5 && !/lite/.test(model) && !udenTaenk) conf.thinkingConfig = { thinkingBudget: 1024 };
    return JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: PROMPT }] }],
      generationConfig: conf,
    });
  }

  async function enModel(mime, base64, model, helbred, signal) {
    const kald = (uden) => kaldApi(`/${encodeURIComponent(model)}:generateContent`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: krop(mime, base64, model, uden) }, signal);
    const uden = helbred[model]?.udenTaenk > nu();
    let d;
    try {
      d = await kald(uden);
    } catch (e) {
      if (!taenkFejl(e) || uden || signal.aborted) throw e;
      d = await kald(true);
      await maerk(model, { udenTaenk: nu() + UGE });
    }
    const parts = d.candidates?.[0]?.content?.parts ?? [];
    let svar;
    try {
      svar = JSON.parse(parts.map((p) => (p.thought ? '' : p.text ?? '')).join(''));
    } catch {
      throw Object.assign(new Error('svaret kunne ikke læses'), { status: 502 });
    }
    return svar;
  }

  async function markerFejl(model, e) {
    if (taenkFejl(e)) return;
    if (e.status === 404 || (e.status === 400 && /image input|modality/i.test(e.rod ?? ''))) await maerk(model, { vaek: nu() + UGE });
    else if (midlertidig(e)) await maerk(model, { straf: nu() + STRAF });
  }

  // Den første model starter med det samme; svarer den ikke inden for hedge ms,
  // eller fejler den, starter den næste ved siden af. Første svar vinder, og
  // taberne afbrydes, så de ikke bruger af kvoten.
  function kaploeb(mime, base64, liste, helbred) {
    return new Promise((ok, fejl) => {
      let i = 0;
      let igang = 0;
      let faerdig = false;
      let sidste = null;
      let ur = null;
      const styr = [];
      const afgoer = () => {
        faerdig = true;
        clearTimeout(ur);
        styr.forEach((c) => c.abort());
      };
      function start() {
        clearTimeout(ur);
        if (faerdig) return;
        if (i >= liste.length) {
          if (!igang) { afgoer(); fejl(sidste ?? new Error('Gemini svarede ikke')); }
          return;
        }
        const model = liste[i++];
        igang++;
        const ac = new AbortController();
        styr.push(ac);
        enModel(mime, base64, model, helbred, ac.signal).then((r) => {
          igang--;
          if (faerdig) return;
          afgoer();
          ok(r);
          maerk(model, { straf: 0 });
        }, async (e) => {
          igang--;
          if (faerdig) return;
          // En midlertidig fejl er den mest sigende og overskrives ikke af en 400/404.
          if (!sidste || !midlertidig(sidste) || midlertidig(e)) sidste = e;
          await markerFejl(model, e);
          start();
        });
        if (i < liste.length) ur = setTimeout(start, hedge);
      }
      start();
    });
  }

  return async function laesKvittering(mime, base64) {
    if (!noegle) throw new KvitteringFejl(503, 'kvitteringslæsning er ikke sat op');
    // Højst to omgange: var alle modeller optaget, ventes kort, og listen sorteres igen.
    for (let omgang = 0; ; omgang++) {
      try {
        const helbred = (await laesKv(K_HELBRED)) ?? {};
        return rens(await kaploeb(mime, base64, modelListe(await modeller(), helbred, nu()), helbred));
      } catch (e) {
        if (omgang < 1 && midlertidig(e)) { await vent(4000); continue; }
        if (e.status === 429) throw new KvitteringFejl(429, 'Gemini er ramt af sin gratisgrænse');
        if (e.status === 403 || (e.status === 400 && /API key/i.test(e.rod ?? ''))) throw new KvitteringFejl(503, 'Gemini afviser nøglen');
        throw new KvitteringFejl(502, e.message);
      }
    }
  };
}
