// Sender én Web Push-besked til ét abonnement. Biblioteket krypterer og
// signerer med WebCrypto, så det kører i Workers uden Node's crypto.
import { buildPushPayload } from '@block65/webcrypto-web-push';

const TTL = 86400;

export function lavSendPush({ publicKey, privateKey, subject }) {
  const vapid = { publicKey, privateKey, subject };
  return async function sendPush(abonnement, payload) {
    const forespoergsel = await buildPushPayload(
      { data: payload, options: { ttl: TTL } },
      abonnement,
      vapid,
    );
    const svar = await fetch(abonnement.endpoint, forespoergsel);
    return { status: svar.status };
  };
}
