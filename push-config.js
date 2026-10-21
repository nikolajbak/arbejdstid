// Push-workerens adresse og den offentlige VAPID-nøgle. Begge er offentlige.
// Lokalt bruges `npx wrangler dev` i push/. PUSH_URL udfyldes efter `npx wrangler deploy`;
// er den tom, gemmes beskederne i køen, og der abonneres ikke.
import { LOKAL } from './firebase.js';

export const PUSH_URL = LOKAL ? 'http://127.0.0.1:8787' : 'https://arbejdstid-push.arbejdstid-push.workers.dev';

// Samme som VAPID_PUBLIC i push/wrangler.toml.
export const VAPID_PUBLIC = 'BMRlqlzIcPn-iN3l_uuXmRihmJWdgkISYz3Wvha9lzkMESvA9rnnz2dTMf622eYNbRcuBIGCamccJ7X5l_axh2E';
