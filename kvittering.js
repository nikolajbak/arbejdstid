// Sender et billede til workeren, der læser kvitteringen med Gemini.
import { auth } from './firebase.js';
import { PUSH_URL } from './push-config.js';

// Workeren kan prøve flere modeller i to omgange, før den giver op.
const VENT_MS = 150000;

export const kanLaese = () => Boolean(PUSH_URL);

// Giver { erKvittering, butik, dato, total, moms, braendstof, varer }. Kaster med en tekst til brugeren.
export async function laesKvittering(billede) {
  let svar;
  try {
    const token = await auth.currentUser.getIdToken();
    svar = await fetch(PUSH_URL + '/kvittering', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ billede }),
      signal: AbortSignal.timeout?.(VENT_MS),
    });
  } catch {
    throw new Error('Kvitteringen kunne ikke læses uden net.');
  }
  if (svar.status === 429) throw new Error('Gemini er ramt af sin gratisgrænse. Vent et minut, og tryk Læs kvittering, eller udfyld selv.');
  if (!svar.ok) throw new Error('Kvitteringen kunne ikke læses. Udfyld selv.');
  return svar.json();
}
