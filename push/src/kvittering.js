// Læser et billede af en kvittering med Gemini og giver butik, dato, beløb,
// moms og varer tilbage. Nøglen bliver her i workeren og når aldrig appen.

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

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

export function lavLaesKvittering({ noegle, model, hent = fetch }) {
  return async function laesKvittering(mime, base64) {
    if (!noegle) throw new KvitteringFejl(503, 'kvitteringslæsning er ikke sat op');
    let svar;
    try {
      svar = await hent(`${API}${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': noegle },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: PROMPT }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SKEMA, temperature: 0 },
        }),
      });
    } catch {
      throw new KvitteringFejl(502, 'Gemini svarede ikke');
    }
    // Gratisniveauet har et loft over kald pr. minut og pr. dag.
    if (svar.status === 429) throw new KvitteringFejl(429, 'for mange kvitteringer lige nu');
    if (!svar.ok) throw new KvitteringFejl(502, 'Gemini svarede ' + svar.status);
    try {
      const data = await svar.json();
      return rens(JSON.parse(data.candidates[0].content.parts[0].text));
    } catch {
      throw new KvitteringFejl(502, 'Gemini gav et svar, der ikke kunne læses');
    }
  };
}
