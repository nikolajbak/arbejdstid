// Billeder af kvitteringer og lignende på en post.

// Et billede gemmes som ét dokument i databasen, der højst må fylde 1 MB.
export const MAKS_BILLEDE = 900_000;

function indlaes(url) {
  return new Promise((ok, fejl) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fejl(new Error('Billedet kunne ikke læses'));
    img.src = url;
  });
}

// Gør et billede fra kameraet eller Fotos til en JPEG-data-URL under MAKS_BILLEDE.
// Starter med 1600 punkter på den længste led og skalerer ned, til det passer.
export async function komprimer(fil) {
  const url = URL.createObjectURL(fil);
  try {
    const img = await indlaes(url);
    const laengst = Math.max(img.naturalWidth, img.naturalHeight);
    for (let side = 1600, kvalitet = 0.7; ; side = Math.round(side * 0.75), kvalitet = Math.max(0.5, kvalitet - 0.1)) {
      const skala = Math.min(1, side / laengst);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * skala);
      c.height = Math.round(img.naturalHeight * skala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', kvalitet);
      if (data.length <= MAKS_BILLEDE || side < 400) return data;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Et profilbillede: beskåret til et kvadrat på 256 punkter, som JPEG.
export async function profilbillede(fil) {
  const url = URL.createObjectURL(fil);
  try {
    const img = await indlaes(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
