/**
 * Priestorový hash-grid systém pre efektívne proximity queries.
 * Pôvodne inline v App.tsx, teraz znovupoužiteľný modul.
 */

const GRID_SIZE = 200;

export const gridCoord = (v: number): number => Math.floor(v / GRID_SIZE);

export const gridKey = (gx: number, gy: number): string => `${gx}_${gy}`;

/**
 * Vytvorí priestorový hash-grid z poľa objektov.
 * Každý objekt je zaradený do bucketu podľa jeho pozície.
 */
export const buildGrid = <T,>(
  items: T[],
  getX: (item: T) => number,
  getY: (item: T) => number,
): Map<string, T[]> => {
  const grid = new Map<string, T[]>();
  for (const item of items) {
    const gx = gridCoord(getX(item));
    const gy = gridCoord(getY(item));
    const key = gridKey(gx, gy);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(item);
  }
  return grid;
};

/**
 * Iteruje cez všetky položky v okruhu (radius) okolo daného bodu.
 * Funguje na úrovni grid buniek, nie presných vzdialeností.
 */
export const forEachInRadius = <T,>(
  grid: Map<string, T[]>,
  x: number,
  y: number,
  radius: number,
  fn: (item: T) => void,
): void => {
  const minGX = gridCoord(x - radius);
  const maxGX = gridCoord(x + radius);
  const minGY = gridCoord(y - radius);
  const maxGY = gridCoord(y + radius);
  for (let gx = minGX; gx <= maxGX; gx++) {
    for (let gy = minGY; gy <= maxGY; gy++) {
      const bucket = grid.get(gridKey(gx, gy));
      if (!bucket) continue;
      for (const item of bucket) fn(item);
    }
  }
};

/**
 * Testuje, či existuje aspoň jedna položka v okruhu spĺňajúca predikát.
 * Vracia true pri prvom nájdenom zhode.
 */
export const someInRadius = <T,>(
  grid: Map<string, T[]>,
  x: number,
  y: number,
  radius: number,
  predicate: (item: T) => boolean,
): boolean => {
  const minGX = gridCoord(x - radius);
  const maxGX = gridCoord(x + radius);
  const minGY = gridCoord(y - radius);
  const maxGY = gridCoord(y + radius);
  for (let gx = minGX; gx <= maxGX; gx++) {
    for (let gy = minGY; gy <= maxGY; gy++) {
      const bucket = grid.get(gridKey(gx, gy));
      if (!bucket) continue;
      for (const item of bucket) {
        if (predicate(item)) return true;
      }
    }
  }
  return false;
};
