/**
 * Systém správy budov – energia, update progress, laser targeting, poškodenie.
 * Extrahované z App.tsx game loopu.
 */

import { Building, Creature, Projectile, Harvester, Resources, ResourceType, BuildingType } from '../types';
import { sounds } from '../components/SoundManager';
import {
  BUILDING_STATS,
  LASER_RANGE,
  LASER_COOLDOWN,
  LASER_ROTATION_SPEED,
  PROJECTILE_SPEED,
  CREATURE_DAMAGE_RATE,
  UPGRADE_STATS,
} from '../constants';
import { distance, normalizeAngle, randomId } from '../utils/math';
import { forEachInRadius } from '../utils/grid';

// ---------------------------------------------------------------------------
// Power balance calculation (eliminuje duplicitu v App/UIOverlay/GameCanvas)
// ---------------------------------------------------------------------------

export interface PowerBalance {
  totalGen: number;
  totalReq: number;
  hasPower: boolean;
}

export const calculatePowerBalance = (buildings: Building[]): PowerBalance => {
  let totalGen = 0;
  let totalReq = 0;
  buildings.forEach(b => {
    if (b.progress >= 1 && b.health > 0.1) {
      const baseStats = BUILDING_STATS[b.type];
      const levelStats =
        b.level && UPGRADE_STATS[b.type]?.[b.level]
          ? UPGRADE_STATS[b.type]![b.level]
          : {};
      const stats = { ...baseStats, ...levelStats };
      if (stats.power) totalGen += stats.power;
      if (stats.powerReq) totalReq += stats.powerReq;
    }
  });
  return { totalGen, totalReq, hasPower: totalGen >= totalReq };
};

// ---------------------------------------------------------------------------
// Building update result
// ---------------------------------------------------------------------------

export interface BuildingUpdateResult {
  buildings: Building[];
  newProjectiles: Projectile[];
  newHarvesters: Harvester[];
  playerInventoryAdditions: Partial<Resources>;
}

// ---------------------------------------------------------------------------
// Find harvester spawn position
// ---------------------------------------------------------------------------

export const findHarvesterSpawn = (
  parent: Building,
  kind: 'MINER' | 'TANKER',
  buildings: Building[],
  harvesters: Harvester[],
  rocketPos: { x: number; y: number } | null,
): { x: number; y: number; rotation: number } | null => {
  const isSpawnFree = (sx: number, sy: number, parentId: string) => {
    if (rocketPos && distance(rocketPos.x, rocketPos.y, sx, sy) < 140) return false;
    if (
      buildings.some(b => {
        if (b.id === parentId) return false;
        const d = distance(b.x, b.y, sx, sy);
        const radius =
          b.type === BuildingType.REFINERY ||
          b.type === BuildingType.WATER_PUMP ||
          b.type === BuildingType.SYNTHESIZER
            ? 95
            : 65;
        return d < radius;
      })
    )
      return false;
    if (harvesters.some(h => distance(h.x, h.y, sx, sy) < 70)) return false;
    return true;
  };

  const baseAngle = (parent.rotation || 0) + Math.PI / 2;
  const angleOffsets = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, Math.PI];
  const distances =
    kind === 'MINER' ? [30, 60, 90, 120, 150] : [80, 110, 140, 170];

  for (const dist of distances) {
    for (const off of angleOffsets) {
      const a = baseAngle + off;
      const sx = parent.x + Math.cos(a) * dist;
      const sy = parent.y + Math.sin(a) * dist;
      if (isSpawnFree(sx, sy, parent.id))
        return { x: sx, y: sy, rotation: a };
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Main building update
// ---------------------------------------------------------------------------

export const updateBuildings = (
  buildings: Building[],
  creatureGrid: Map<string, Creature[]>,
  dt: number,
  time: number,
  hasPower: boolean,
  playerPos: { x: number; y: number },
  prevHarvesters: Harvester[],
  rocketPos: { x: number; y: number } | null,
): BuildingUpdateResult => {
  const newProjectiles: Projectile[] = [];
  const newHarvesters: Harvester[] = [];
  const playerInventoryAdditions: Partial<Resources> = {};

  const updatedBuildings = buildings
    .map(b => {
      let progress = b.progress;
      let healthVal = b.health;
      let bRotation = b.rotation || 0;
      let lastFire = b.lastFireTime || 0;
      let spawned = b.hasSpawnedHarvester || false;
      const storedH2O = b.storedWater;
      let isProc = b.isProcessing;
      let procTimer = b.processingTimer || 0;

      // Build progress
      if (progress < 1) {
        progress = Math.min(1, progress + BUILDING_STATS[b.type].buildSpeed * dt);
      }

      // Synthesizer processing
      if (isProc) {
        procTimer -= dt;
        if (procTimer <= 0) {
          isProc = false;
          procTimer = 0;
          if (hasPower) {
            playerInventoryAdditions[ResourceType.IRON] =
              (playerInventoryAdditions[ResourceType.IRON] || 0) + 1;
            sounds.playCollect();
          }
        }
      }

      // Harvester spawning
      if (progress >= 1 && b.progress >= 1 && !spawned && hasPower) {
        if (b.type === BuildingType.REFINERY) {
          spawned = true;
          const spawn = findHarvesterSpawn(b, 'MINER', buildings, prevHarvesters, rocketPos);
          const baseAngle = (b.rotation || 0) + Math.PI / 2;
          const sx = spawn ? spawn.x : b.x + Math.cos(baseAngle) * 30;
          const sy = spawn ? spawn.y : b.y + Math.sin(baseAngle) * 30;
          const srot = spawn ? spawn.rotation : baseAngle;
          const sState = spawn ? ('IDLE' as const) : ('ESCAPING' as const);
          newHarvesters.push({
            id: randomId(),
            type: 'MINER',
            parentId: b.id,
            x: sx,
            y: sy,
            rotation: srot,
            state: sState,
            miningTimer: 0,
            inventory: null,
          });
        } else if (b.type === BuildingType.WATER_PUMP) {
          spawned = true;
          const spawn = findHarvesterSpawn(b, 'TANKER', buildings, prevHarvesters, rocketPos);
          const baseAngle = (b.rotation || 0) + Math.PI / 2;
          const sx = spawn ? spawn.x : b.x + Math.cos(baseAngle) * 80;
          const sy = spawn ? spawn.y : b.y + Math.sin(baseAngle) * 80;
          const srot = spawn ? spawn.rotation : baseAngle;
          const sState = spawn ? ('IDLE' as const) : ('ESCAPING' as const);
          newHarvesters.push({
            id: randomId(),
            type: 'TANKER',
            parentId: b.id,
            x: sx,
            y: sy,
            rotation: srot,
            state: sState,
            miningTimer: 0,
            inventory: null,
          });
        }
      }

      // Laser tower targeting
      if (
        b.type === BuildingType.LASER_TOWER &&
        progress >= 1 &&
        b.progress >= 1 &&
        healthVal > 0.1 &&
        hasPower
      ) {
        let nearest: Creature | null = null;
        let nearestDist = Infinity;
        forEachInRadius<Creature>(creatureGrid, b.x, b.y, LASER_RANGE, c => {
          const d = distance(c.x, c.y, b.x, b.y);
          if (d < LASER_RANGE && d < nearestDist) {
            nearestDist = d;
            nearest = c;
          }
        });
        if (nearest) {
          const n = nearest as Creature;
          const targetAngle = Math.atan2(n.y - b.y, n.x - b.x);
          const diff = normalizeAngle(targetAngle - bRotation);
          const step = LASER_ROTATION_SPEED * dt;
          if (Math.abs(diff) <= step) {
            bRotation = targetAngle;
            if (time - lastFire > LASER_COOLDOWN) {
              sounds.playLaser();
              newProjectiles.push({
                id: randomId(),
                x: b.x + Math.cos(bRotation) * 40,
                y: b.y + Math.sin(bRotation) * 40,
                vx: Math.cos(bRotation) * PROJECTILE_SPEED,
                vy: Math.sin(bRotation) * PROJECTILE_SPEED,
                distanceTraveled: 0,
                isLaser: true,
              });
              lastFire = time;
            }
          } else {
            bRotation += Math.sign(diff) * step;
          }
        }
      }

      // Creature damage to buildings
      let attackerPower = 0;
      forEachInRadius<Creature>(creatureGrid, b.x, b.y, 90, c => {
        if (c.state !== 'attacking' || c.targetBuildingId !== b.id) return;
        const d = distance(c.x, c.y, b.x, b.y);
        if (d < (c.type === 'heavy' ? 80 : 55))
          attackerPower += c.type === 'heavy' ? 2 : 1;
      });
      if (attackerPower > 0) {
        healthVal = Math.max(
          0,
          healthVal - CREATURE_DAMAGE_RATE * attackerPower * dt,
        );
      }

      // Player repair (within 95 px)
      if (distance(b.x, b.y, playerPos.x, playerPos.y) < 95 && healthVal < 1) {
        healthVal = Math.min(1, healthVal + 0.15 * dt);
      }

      return {
        ...b,
        progress,
        health: healthVal,
        rotation: bRotation,
        lastFireTime: lastFire,
        hasSpawnedHarvester: spawned,
        storedWater: storedH2O,
        isProcessing: isProc,
        processingTimer: procTimer,
      };
    })
    .filter(b => b.health > 0);

  return {
    buildings: updatedBuildings,
    newProjectiles,
    newHarvesters,
    playerInventoryAdditions,
  };
};
