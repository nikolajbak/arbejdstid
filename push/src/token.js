// Tjek af Firebase ID-tokens. I produktion RS256 mod Googles nøgler; jose
// cacher nøglesættet. Mod emulatoren er tokens usignerede, så kun indholdet
// tjekkes.
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

const NOEGLER = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export function lavVerificer({ projekt, emulator }) {
  const noegler = emulator ? null : createRemoteJWKSet(new URL(NOEGLER));

  return async function verificer(token) {
    let indhold;
    if (emulator) {
      indhold = decodeJwt(token);
      if (indhold.aud !== projekt) throw new Error('forkert aud');
      if (typeof indhold.exp === 'number' && indhold.exp * 1000 < Date.now()) throw new Error('udløbet');
    } else {
      ({ payload: indhold } = await jwtVerify(token, noegler, {
        algorithms: ['RS256'],
        issuer: 'https://securetoken.google.com/' + projekt,
        audience: projekt,
      }));
    }
    if (indhold.email_verified !== true) throw new Error('e-mail ikke bekræftet');
    if (typeof indhold.sub !== 'string' || indhold.sub === '') throw new Error('mangler sub');
    return { uid: indhold.sub, email: indhold.email };
  };
}
