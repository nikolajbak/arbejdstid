import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, defaultData, newId } from '../store.js';

const fakeStorage = (start = {}) => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

test('tom storage giver standarddata uden opgavetyper', () => {
  const d = createStore(fakeStorage()).load();
  assert.equal(d.version, 1);
  assert.deepEqual(d.opgavetyper, []);
  assert.equal(d.kunder.length, 0);
  assert.equal(d.ur, null);
});

test('save og load giver de samme data tilbage under nøglen arbejdstid.v1', () => {
  const s = fakeStorage();
  const store = createStore(s);
  const d = defaultData();
  d.kunder.push({ id: newId(), navn: 'X', timepris: 700, arkiveret: false });
  store.save(d);
  assert.ok(s.m.has('arbejdstid.v1'));
  assert.deepEqual(store.load(), d);
});

test('ugyldig JSON giver standarddata uden at kaste', () => {
  assert.deepEqual(createStore(fakeStorage({ 'arbejdstid.v1': '{ikke json' })).load().kunder, []);
});

test('ukendt version giver standarddata', () => {
  assert.equal(createStore(fakeStorage({ 'arbejdstid.v1': '{"version":99}' })).load().version, 1);
});

test('newId giver unikke id-strenge', () => {
  assert.notEqual(newId(), newId());
});

test('beskadigede data gemmes til side før standarddata bruges', () => {
  const s = fakeStorage({ 'arbejdstid.v1': '{"version":2,"kunder":[]}' });
  const store = createStore(s);
  store.load();
  const kopi = [...s.m.keys()].find((k) => k.startsWith('arbejdstid.v1.beskadiget-'));
  assert.ok(kopi, 'ingen sikkerhedskopi');
  assert.equal(s.m.get(kopi), '{"version":2,"kunder":[]}');
  assert.equal(store.beskadiget, kopi);
});

test('tom storage giver ingen sikkerhedskopi', () => {
  const store = createStore(fakeStorage());
  store.load();
  assert.equal(store.beskadiget, null);
});
