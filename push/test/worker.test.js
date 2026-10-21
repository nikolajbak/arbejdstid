import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lavHandler } from '../src/index.js';

const team = { navn: 'Holdet', medlemmer: ['mig', 'ven'], navne: { mig: 'Mig', ven: 'Ven' } };
// En inviteret kan læse teamet i Firestore uden at stå i medlemmer.
const inviteretTeam = { navn: 'Andet', medlemmer: ['ven'], navne: { ven: 'Ven' } };

function abo(endpoint) {
  return { endpoint, expirationTime: null, keys: { p256dh: 'p-' + endpoint, auth: 'a-' + endpoint } };
}

function opsaet({ status = {} } = {}) {
  const lager = new Map();
  const kv = {
    async get(key, type) {
      assert.equal(type, 'json');
      return lager.has(key) ? JSON.parse(lager.get(key)) : null;
    },
    async put(key, vaerdi) {
      assert.equal(typeof vaerdi, 'string');
      lager.set(key, vaerdi);
    },
  };
  const kald = [];
  const hentTeamKald = [];
  const handler = lavHandler({
    async verificer(token) {
      if (token === 'god') return { uid: 'mig', email: 'mig@x.dk' };
      throw new Error('ugyldigt token');
    },
    async hentTeam(teamId, token) {
      hentTeamKald.push({ teamId, token });
      if (teamId === 't1') return team;
      if (teamId === 't3') return inviteretTeam;
      return null;
    },
    kv,
    async sendPush(abonnement, payload) {
      kald.push({ abonnement, payload });
      return { status: status[abonnement.endpoint] ?? 201 };
    },
    async laesKvittering(mime, base64) {
      return { erKvittering: true, mime, base64 };
    },
  });
  return { handler, lager, kald, hentTeamKald };
}

function forespoergsel(sti, krop, { metode = 'POST', token = 'god' } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = 'Bearer ' + token;
  return new Request('https://w' + sti, { method: metode, headers, body: JSON.stringify(krop) });
}

const gyldigSend = { teamId: 't1', til: 'ven', slags: 'afventer', antal: 2 };

test('401 uden eller med ugyldigt token', async () => {
  const { handler, hentTeamKald } = opsaet();
  for (const token of [null, 'falsk']) {
    for (const [sti, krop, metode] of [
      ['/abonner', { abonnement: abo('https://p/1') }, 'POST'],
      ['/abonner', { endpoint: 'https://p/1' }, 'DELETE'],
      ['/send', gyldigSend, 'POST'],
    ]) {
      const res = await handler(forespoergsel(sti, krop, { metode, token }));
      assert.equal(res.status, 401, `${metode} ${sti} med token ${token}`);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
    }
  }
  assert.equal(hentTeamKald.length, 0);
});

test('abonner gemmer pr. uid unikt på endpoint, og DELETE fjerner', async () => {
  const { handler, lager } = opsaet();
  let res = await handler(forespoergsel('/abonner', { abonnement: abo('https://p/1') }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  await handler(forespoergsel('/abonner', { abonnement: abo('https://p/2') }));
  // Samme endpoint igen erstatter i stedet for at dublere.
  const nyt = { ...abo('https://p/1'), keys: { p256dh: 'ny', auth: 'ny' } };
  await handler(forespoergsel('/abonner', { abonnement: nyt }));
  let gemt = JSON.parse(lager.get('uid:mig'));
  assert.equal(gemt.length, 2);
  assert.deepEqual(gemt.find((a) => a.endpoint === 'https://p/1').keys, { p256dh: 'ny', auth: 'ny' });

  res = await handler(forespoergsel('/abonner', { endpoint: 'https://p/1' }, { metode: 'DELETE' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  gemt = JSON.parse(lager.get('uid:mig'));
  assert.deepEqual(gemt.map((a) => a.endpoint), ['https://p/2']);
});

test('abonner: 400 ved et abonnement uden endpoint eller nøgler', async () => {
  const { handler, lager } = opsaet();
  for (const abonnement of [
    undefined,
    { endpoint: 'https://p/1' },
    { endpoint: 'http://p/1', keys: { p256dh: 'p', auth: 'a' } },
    { endpoint: 42, keys: { p256dh: 'p', auth: 'a' } },
  ]) {
    const res = await handler(forespoergsel('/abonner', { abonnement }));
    assert.equal(res.status, 400, JSON.stringify(abonnement));
  }
  const res = await handler(forespoergsel('/abonner', {}, { metode: 'DELETE' }));
  assert.equal(res.status, 400);
  assert.equal(lager.size, 0);
});

test('send: 403 når teamet ikke kan hentes', async () => {
  const { handler, hentTeamKald, kald } = opsaet();
  const res = await handler(forespoergsel('/send', { ...gyldigSend, teamId: 't2' }));
  assert.equal(res.status, 403);
  // Teamet hentes med afsenderens eget token.
  assert.deepEqual(hentTeamKald, [{ teamId: 't2', token: 'god' }]);
  assert.equal(kald.length, 0);
});

test('send: 403 når afsenderen kan læse teamet uden at være medlem', async () => {
  const { handler, kald } = opsaet();
  const res = await handler(forespoergsel('/send', { ...gyldigSend, teamId: 't3' }));
  assert.equal(res.status, 403);
  assert.equal(kald.length, 0);
});

test('send: 502 med CORS når Firestore ikke kan nås', async () => {
  const handler = lavHandler({
    async verificer() { return { uid: 'mig', email: 'mig@x.dk' }; },
    async hentTeam() { throw new Error('netværk'); },
    kv: { async get() { return null; }, async put() {} },
    async sendPush() { throw new Error('må ikke kaldes'); },
  });
  const res = await handler(forespoergsel('/send', gyldigSend));
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('send: 400 når til ikke er medlem, er afsender, eller antal ikke er 1–100 heltal, eller slags er ukendt', async () => {
  const { handler, lager, kald } = opsaet();
  lager.set('uid:ven', JSON.stringify([abo('https://p/ven')]));
  lager.set('uid:fremmed', JSON.stringify([abo('https://p/fremmed')]));
  lager.set('uid:mig', JSON.stringify([abo('https://p/mig')]));
  for (const aendring of [
    { til: 'fremmed' },
    { til: 'mig' },
    { til: undefined },
    { antal: 0 },
    { antal: 101 },
    { antal: 1.5 },
    { antal: '2' },
    { slags: 'hej' },
    { slags: undefined },
    { teamId: '' },
    { teamId: 7 },
  ]) {
    const res = await handler(forespoergsel('/send', { ...gyldigSend, ...aendring }));
    assert.equal(res.status, 400, JSON.stringify(aendring));
  }
  const res = await handler(new Request('https://w/send', {
    method: 'POST', headers: { authorization: 'Bearer god' }, body: '{ikke json',
  }));
  assert.equal(res.status, 400);
  assert.equal(kald.length, 0);
});

test('send: teksten bygges af navne', async () => {
  const { handler, lager, kald } = opsaet();
  lager.set('uid:ven', JSON.stringify([abo('https://p/ven')]));
  // Afsenderen kan ikke sende fri tekst: ekstra felter ignoreres.
  const res = await handler(forespoergsel('/send', { ...gyldigSend, title: 'Hack', body: 'Hack' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sendt: 1, fjernet: 0 });
  assert.equal(kald.length, 1);
  assert.equal(kald[0].abonnement.endpoint, 'https://p/ven');
  assert.deepEqual(JSON.parse(kald[0].payload), {
    title: 'Holdet',
    body: 'Mig har registreret 2 til dig. Tryk for at godkende.',
    url: './?team=t1&vis=godkend',
  });
});

test('send: afvist-tekst og url uden vis', async () => {
  const { handler, lager, kald } = opsaet();
  lager.set('uid:ven', JSON.stringify([abo('https://p/ven')]));
  const res = await handler(forespoergsel('/send', { ...gyldigSend, slags: 'afvist', antal: 1 }));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(kald[0].payload), {
    title: 'Holdet',
    body: 'Mig afviste 1 af dine registreringer.',
    url: './?team=t1',
  });
});

test('send: 404/410 fjerner abonnementet, andre fejl beholder det', async () => {
  const { handler, lager } = opsaet({
    status: { 'https://p/a': 201, 'https://p/b': 410, 'https://p/c': 500 },
  });
  lager.set('uid:ven', JSON.stringify([abo('https://p/a'), abo('https://p/b'), abo('https://p/c')]));
  let res = await handler(forespoergsel('/send', gyldigSend));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sendt: 1, fjernet: 1 });
  assert.deepEqual(JSON.parse(lager.get('uid:ven')).map((a) => a.endpoint), ['https://p/a', 'https://p/c']);

  const anden = opsaet({ status: { 'https://p/d': 404 } });
  anden.lager.set('uid:ven', JSON.stringify([abo('https://p/d')]));
  res = await anden.handler(forespoergsel('/send', gyldigSend));
  assert.deepEqual(await res.json(), { sendt: 0, fjernet: 1 });
  assert.deepEqual(JSON.parse(anden.lager.get('uid:ven')), []);
});

test('send: et abonnement, der kaster, tæller ikke og stopper ikke de andre', async () => {
  const lager = new Map([['uid:ven', JSON.stringify([abo('https://p/x'), abo('https://p/y')])]]);
  const handler = lavHandler({
    async verificer() { return { uid: 'mig', email: 'mig@x.dk' }; },
    async hentTeam() { return team; },
    kv: {
      async get(k) { return lager.has(k) ? JSON.parse(lager.get(k)) : null; },
      async put(k, v) { lager.set(k, v); },
    },
    async sendPush(abonnement) {
      if (abonnement.endpoint === 'https://p/x') throw new Error('netværk');
      return { status: 201 };
    },
  });
  const res = await handler(forespoergsel('/send', gyldigSend));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sendt: 1, fjernet: 0 });
  assert.equal(JSON.parse(lager.get('uid:ven')).length, 2);
});

test('send: ingen abonnementer giver 200 { sendt: 0, fjernet: 0 }', async () => {
  const { handler, kald } = opsaet();
  const res = await handler(forespoergsel('/send', gyldigSend));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sendt: 0, fjernet: 0 });
  assert.equal(kald.length, 0);
});

test('OPTIONS giver 204 med CORS', async () => {
  const { handler } = opsaet();
  const res = await handler(new Request('https://w/send', { method: 'OPTIONS' }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('access-control-allow-methods'), 'POST, DELETE, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'authorization, content-type');
});

test('ukendt rute giver 404', async () => {
  const { handler } = opsaet();
  const res = await handler(forespoergsel('/andet', {}));
  assert.equal(res.status, 404);
});

test('kvittering sender billedet videre og afviser andet end billeder', async () => {
  const { handler } = opsaet();
  const ok = await handler(forespoergsel('/kvittering', { billede: 'data:image/jpeg;base64,QUJD' }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { erKvittering: true, mime: 'image/jpeg', base64: 'QUJD' });
  for (const billede of [undefined, 'QUJD', 'data:text/html;base64,QUJD', 'data:image/jpeg;base64,' + 'A'.repeat(1_300_000)]) {
    const r = await handler(forespoergsel('/kvittering', { billede }));
    assert.equal(r.status, 400, String(billede).slice(0, 30));
  }
  const uden = await handler(forespoergsel('/kvittering', { billede: 'data:image/jpeg;base64,QUJD' }, { token: null }));
  assert.equal(uden.status, 401);
});
