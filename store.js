import { validateBackup } from './core.js';

const NOEGLE = 'arbejdstid.v1';

export function newId() {
  return crypto.randomUUID();
}

export function defaultData() {
  return {
    version: 1,
    kunder: [],
    opgavetyper: ['Møde', 'Udvikling', 'Rådgivning', 'Transport'].map((navn) => ({ id: newId(), navn, arkiveret: false })),
    registreringer: [],
    ur: null,
  };
}

export function createStore(storage = globalThis.localStorage) {
  return {
    load() {
      try {
        const r = validateBackup(JSON.parse(storage.getItem(NOEGLE)));
        return r.ok ? r.data : defaultData();
      } catch {
        return defaultData();
      }
    },
    save(data) {
      storage.setItem(NOEGLE, JSON.stringify(data));
    },
  };
}
