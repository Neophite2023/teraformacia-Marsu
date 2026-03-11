/**
 * Fog of War systém – odhaľovanie mapy.
 * Extrahované z App.tsx game loopu.
 */

import { FOG_GRID_SIZE } from '../constants';

/**
 * Odhalí kruhový región okolo danej pozície vo fog of war mape.
 * Priamo mutuje objekt explored pre výkon.
 */
export const revealChunks = (
  explored: Record<string, boolean>,
  centerX: number,
  centerY: number,
  radius: number,
): void => {
  const gx = Math.floor(centerX / FOG_GRID_SIZE);
  const gy = Math.floor(centerY / FOG_GRID_SIZE);
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      if (i * i + j * j <= radius * radius) {
        explored[`${gx + i}_${gy + j}`] = true;
      }
    }
  }
};

/**
 * Aktualizuje fog of war na základe pozícií hráča a harvesterov.
 * Optimalizované – odhaľuje iba keď sa entita presunie do novej grid bunky.
 */
export const updateFogOfWar = (
  explored: Record<string, boolean>,
  playerX: number,
  playerY: number,
  playerRevealRadius: number,
  lastPlayerChunk: { gx: number; gy: number } | null,
  harvesters: { id: string; x: number; y: number }[],
  lastHarvesterChunks: Map<string, string>,
): { gx: number; gy: number } => {
  const pGX = Math.floor(playerX / FOG_GRID_SIZE);
  const pGY = Math.floor(playerY / FOG_GRID_SIZE);

  // Odhalenie pre hráča
  if (!lastPlayerChunk || lastPlayerChunk.gx !== pGX || lastPlayerChunk.gy !== pGY) {
    revealChunks(explored, playerX, playerY, playerRevealRadius);
  }

  // Odhalenie pre harvesterov
  const activeHarvesterIds = new Set<string>();
  harvesters.forEach(h => {
    activeHarvesterIds.add(h.id);
    const hGX = Math.floor(h.x / FOG_GRID_SIZE);
    const hGY = Math.floor(h.y / FOG_GRID_SIZE);
    const key = `${hGX}_${hGY}`;
    const lastKey = lastHarvesterChunks.get(h.id);
    if (key !== lastKey) {
      revealChunks(explored, h.x, h.y, 8);
      lastHarvesterChunks.set(h.id, key);
    }
  });

  // Vyčistenie starých harvesterov
  lastHarvesterChunks.forEach((_, id) => {
    if (!activeHarvesterIds.has(id)) lastHarvesterChunks.delete(id);
  });

  return { gx: pGX, gy: pGY };
};
