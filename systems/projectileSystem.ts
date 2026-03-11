/**
 * Systém striel – pohyb a detekcia zásahov.
 * Extrahované z App.tsx game loopu.
 */

import { Projectile, Creature } from '../types';
import { LASER_RANGE } from '../constants';
import { distance } from '../utils/math';
import { someInRadius } from '../utils/grid';

/**
 * Aktualizuje pozície striel a odfiltruje tie, ktoré preleteli dosah.
 */
export const updateProjectiles = (
  projectiles: Projectile[],
  dt: number,
): Projectile[] =>
  projectiles
    .map(p => ({
      ...p,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      distanceTraveled:
        p.distanceTraveled + Math.sqrt(p.vx * p.vx + p.vy * p.vy) * dt,
    }))
    .filter(p => p.distanceTraveled < LASER_RANGE + 100);

/**
 * Výsledok spracovania zásahov.
 */
export interface HitResult {
  /** ID zasiahnutých striel na odstránenie */
  hitProjectileIds: Set<string>;
  /** Mapa kreatúr a ich nového zdravia po zásahoch */
  creatureHealthUpdates: Map<string, number>;
}

/**
 * Spracuje kolízie striel s kreatúrami.
 */
export const processHits = (
  projectiles: Projectile[],
  creatureGrid: Map<string, Creature[]>,
): HitResult => {
  const hitProjectileIds = new Set<string>();
  const creatureHealthUpdates = new Map<string, number>();

  projectiles.forEach(p => {
    if (hitProjectileIds.has(p.id)) return;
    someInRadius<Creature>(creatureGrid, p.x, p.y, 40, c => {
      const d = distance(p.x, p.y, c.x, c.y);
      if (d < (c.type === 'heavy' ? 36 : 20)) {
        hitProjectileIds.add(p.id);
        creatureHealthUpdates.set(
          c.id,
          (creatureHealthUpdates.has(c.id)
            ? creatureHealthUpdates.get(c.id)!
            : c.health) - 1,
        );
        return true;
      }
      return false;
    });
  });

  return { hitProjectileIds, creatureHealthUpdates };
};
