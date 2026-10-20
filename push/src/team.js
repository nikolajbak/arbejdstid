// Henter et team gennem Firestores REST-API med brugerens eget token, så
// Firestores regler afgør, om brugeren må se det.
export function lavHentTeam({ projekt, emulator }) {
  const vaert = emulator ?? 'https://firestore.googleapis.com';

  return async function hentTeam(teamId, token) {
    const url = `${vaert}/v1/projects/${projekt}/databases/(default)/documents/teams/${encodeURIComponent(teamId)}`;
    const svar = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (svar.status !== 200) return null;
    const { fields = {} } = await svar.json();
    const navne = {};
    for (const [uid, v] of Object.entries(fields.navne?.mapValue?.fields ?? {})) {
      if (typeof v.stringValue === 'string') navne[uid] = v.stringValue;
    }
    return {
      navn: fields.navn?.stringValue ?? '',
      medlemmer: (fields.medlemmer?.arrayValue?.values ?? [])
        .map((v) => v.stringValue)
        .filter((v) => typeof v === 'string'),
      navne,
    };
  };
}
