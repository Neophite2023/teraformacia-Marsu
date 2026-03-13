/**
 * Generovanie počiatočného herného sveta.
 * Extrahované z App.tsx generateInitialWorld().
 */

import { Creature, EnvFeature, GameState, ResourceType } from '../types';
import {
  MAP_SIZE,
  RESOURCE_SPAWN_COUNT,
  CREATURE_COUNT,
  FOG_GRID_SIZE,
} from '../constants';
import { randomId } from '../utils/math';

/**
 * Vygeneruje počiatočnú mapu so surovinami, kreatúrami, terénymi featúrami a fog of war.
 */
export const generateInitialWorld = (): Partial<GameState> => {
  let resources = [];
  const types = Object.values(ResourceType);
  for (let i = 0; i < RESOURCE_SPAWN_COUNT; i++) {
    resources.push({
      id: randomId(),
      x: Math.random() * MAP_SIZE,
      y: Math.random() * MAP_SIZE,
      type: types[Math.floor(Math.random() * types.length)],
    });
  }

  const creatures: Creature[] = [];
  for (let i = 0; i < CREATURE_COUNT; i++) {
    const isHeavy = Math.random() < 0.15;
    creatures.push({
      id: randomId(),
      type: isHeavy ? 'heavy' : 'standard',
      x: Math.random() * MAP_SIZE,
      y: Math.random() * MAP_SIZE,
      rotation: Math.random() * Math.PI * 2,
      state: 'wandering',
      health: isHeavy ? 6 : 3,
    });
  }

  const features: EnvFeature[] = [];
  const rocketX = MAP_SIZE / 2;
  const rocketY = MAP_SIZE / 2;

  features.push({
    x: rocketX,
    y: rocketY,
    size: 84,
    type: 'rocket',
    rotation: Math.PI / 4,
  });

  resources = resources.filter(r => {
    const dx = r.x - rocketX;
    const dy = r.y - rocketY;
    return Math.sqrt(dx * dx + dy * dy) > 220;
  });

  // Generovanie kráterov
  const placedCraters: { x: number; y: number; size: number }[] = [];
  const targetCraterCount = 300;

  for (let i = 0; i < targetCraterCount; i++) {
    let x: number, y: number, size: number, tooClose: boolean;
    let attempts = 0;
    do {
      x = 200 + Math.random() * (MAP_SIZE - 400);
      y = 200 + Math.random() * (MAP_SIZE - 400);
      
      // Viac rôznorodé veľkosti (častejšie malé a stredné, zriedkavo obrovské)
      const sizeRoll = Math.random();
      if (sizeRoll < 0.6) {
        size = 35 + Math.random() * 40; // 35 - 75
      } else if (sizeRoll < 0.9) {
        size = 75 + Math.random() * 60; // 75 - 135
      } else {
        size = 135 + Math.random() * 80; // 135 - 215 (Nové gigantické krátery)
      }

      const distToStart = Math.sqrt(
        Math.pow(x - MAP_SIZE / 2, 2) + Math.pow(y - MAP_SIZE / 2, 2),
      );
      
      tooClose =
        distToStart < 400 ||
        placedCraters.some(c => {
          const dist = Math.sqrt(Math.pow(c.x - x, 2) + Math.pow(c.y - y, 2));
          // Základná kolízia (nemali by sa veľmi prelínať)
          const isOverlapping = dist < (c.size + size) * 1.3;
          // Ak sú blízko seba (menej ako 3-násobok veľkostí), nesmú mať podobnú veľkosť (rozdiel v zóne +-25%)
          const isTooSimilarNearby = dist < (c.size + size) * 2.8 && Math.abs(c.size - size) < Math.max(c.size, size) * 0.25;
          return isOverlapping || isTooSimilarNearby;
        });
      attempts++;
    } while (tooClose && attempts < 150);

    if (!tooClose) {
      // Generate raw vertices
      const rawPoints: { x: number; y: number }[] = [];
      const vertices = 12 + Math.floor(Math.random() * 10);
      for (let v = 0; v < vertices; v++) {
        const angle = (v / vertices) * Math.PI * 2;
        // Zvýšená asymetria (predtým max 0.15 odchýlka, teraz až 0.25)
        const dist = size * (0.75 + Math.random() * 0.5);
        rawPoints.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
      }
      // Smooth pass – priemer každého bodu s jeho susedmi (2 iterácie)
      let smoothed = rawPoints;
      for (let pass = 0; pass < 2; pass++) {
        const next: { x: number; y: number }[] = [];
        const len = smoothed.length;
        for (let j = 0; j < len; j++) {
          const prev = smoothed[(j - 1 + len) % len];
          const curr = smoothed[j];
          const nxt = smoothed[(j + 1) % len];
          next.push({
            x: prev.x * 0.25 + curr.x * 0.5 + nxt.x * 0.25,
            y: prev.y * 0.25 + curr.y * 0.5 + nxt.y * 0.25,
          });
        }
        smoothed = next;
      }
      const points = smoothed;
      const isPolar = y < MAP_SIZE * 0.15 || y > MAP_SIZE * 0.85;
      features.push({
        x,
        y,
        size,
        type: 'crater',
        rotation: Math.random() * Math.PI * 2,
        points,
        hasIce: isPolar,
        meltProgress: 0,
      });
      placedCraters.push({ x, y, size });
    }
  }



  // Generovanie kameňov
  for (let i = 0; i < 1400; i++) {
    let rx: number, ry: number, distToRocket: number;
    do {
      rx = Math.random() * MAP_SIZE;
      ry = Math.random() * MAP_SIZE;
      distToRocket = Math.sqrt(
        Math.pow(rx - rocketX, 2) + Math.pow(ry - rocketY, 2),
      );
    } while (distToRocket < 300);

    const size = 5 + Math.random() * 25;
    const points = [];
    const vertices = 5 + Math.floor(Math.random() * 5);
    for (let v = 0; v < vertices; v++) {
      const angle = (v / vertices) * Math.PI * 2;
      const dist = size * (0.6 + Math.random() * 0.5);
      points.push({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
    }
    features.push({
      x: rx,
      y: ry,
      size,
      type: 'rock',
      rotation: Math.random() * Math.PI * 2,
      points,
      colorVariant: Math.random(),
    });
  }

  // Inicializácia fog of war
  const initExplored: Record<string, boolean> = {};
  const startGX = Math.floor(rocketX / FOG_GRID_SIZE);
  const startGY = Math.floor(rocketY / FOG_GRID_SIZE);
  const INITIAL_REVEAL = 48;
  for (let i = -INITIAL_REVEAL; i <= INITIAL_REVEAL; i++) {
    for (let j = -INITIAL_REVEAL; j <= INITIAL_REVEAL; j++) {
      if (i * i + j * j <= INITIAL_REVEAL * INITIAL_REVEAL) {
        initExplored[`${startGX + i}_${startGY + j}`] = true;
      }
    }
  }

  return {
    discoveredResources: resources,
    creatures,
    envFeatures: features,
    exploredChunks: initExplored,
  };
};
