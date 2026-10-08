import { validateBackup } from './core.js';

const NOEGLE = 'arbejdstid.v1';

export function newId() {
  return crypto.randomUUID();
}

export function defaultData() {
  return {
    version: 1,
    kunder: [],
    opgavetyper: [],
    registreringer: [],
    ur: null,
  };
}

export function createStore(storage = globalThis.localStorage) {
  return {
    // Navnet på sikkerhedskopien, hvis gemte data ikke kunne læses.
    beskadiget: null,
    load() {
      const raa = storage.getItem(NOEGLE);
      if (raa === null) return defaultData();
      let r;
      try {
        r = validateBackup(JSON.parse(raa));
      } catch {
        r = { ok: false };
      }
      if (r.ok) return r.data;
      // Gem de ulæselige data til side, så næste gemning ikke sletter dem.
      this.beskadiget = `${NOEGLE}.beskadiget-${Date.now()}`;
      storage.setItem(this.beskadiget, raa);
      return defaultData();
    },
    save(data) {
      storage.setItem(NOEGLE, JSON.stringify(data));
    },
  };
}
