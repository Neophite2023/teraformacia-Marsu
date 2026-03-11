/**
 * Matematické utility pre hernú logiku.
 * Nahrádzajú opakované Math.sqrt(Math.pow(...)) vzory v celom projekte.
 */

/** Štvorcová vzdialenosť medzi dvoma bodmi (bez sqrt – rýchlejšie na porovnania). */
export const distanceSq = (x1: number, y1: number, x2: number, y2: number): number => {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
};

/** Euklidovská vzdialenosť medzi dvoma bodmi. */
export const distance = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.sqrt(distanceSq(x1, y1, x2, y2));

/** Obmedzenie hodnoty do intervalu [min, max]. */
export const clamp = (val: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, val));

/**
 * Normalizácia rozdielu uhlov do intervalu [-π, π].
 * Používa sa na zistenie najkratšieho smeru otáčania.
 */
export const normalizeAngle = (angle: number): number => {
  let a = angle;
  while (a < -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

/** Generovanie náhodného alphanumerického ID. */
export const randomId = (): string =>
  Math.random().toString(36).substr(2, 9);

/** Generovanie veľkého (uppercase) ID pre budovy. */
export const randomBuildingId = (): string =>
  randomId().toUpperCase();
