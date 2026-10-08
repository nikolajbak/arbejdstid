// Fælles tilstand for alle skærme.

export const t = {
  // Brugerens data. null indtil de er hentet efter login.
  state: null,
  sky: null,
  bruger: null,
  godk: null,
  // Ændringer, der endnu ikke er synkroniseret.
  ventende: false,
  // Brugerlisten, kun for administratorer.
  brugerliste: [],
};

let tegn = () => {};

export function setRender(fn) {
  tegn = fn;
}

export function render() {
  tegn();
}

// Gemmer ændringerne i skyen og tegner skærmen igen.
export function commit() {
  t.sky.gem(t.state);
  render();
}

// Ændrer elementet i den aktuelle tilstand. Et åbent ark kan holde en ældre
// kopi, hvis der er kommet data fra en anden enhed, mens det var åbent.
export function aendr(samling, x, aendring) {
  const aktuel = t.state[samling].find((y) => y.id === x.id);
  if (aktuel) Object.assign(aktuel, aendring);
  else t.state[samling].push({ ...x, ...aendring });
}

export const aktive = (liste) => liste.filter((x) => !x.arkiveret);
export const arkiverede = (liste) => liste.filter((x) => x.arkiveret);
export const kundePaa = (id) => t.state.kunder.find((k) => k.id === id);
