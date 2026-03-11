/**
 * AI systém kreatúr – pohyb, agresivita, respawn.
 * Extrahované z App.tsx game loopu.
 */

import { Creature, Building, BuildingType, EnvFeature } from '../types';
import {
  MAP_SIZE,
  CREATURE_COUNT,
  CREATURE_SPEED,
  CREATURE_DETECTION_RANGE,
  CREATURE_PLAYER_AGGRO_RANGE,
  COLLISION_DAMAGE_PER_SEC,
  RAM_DAMAGE_TO_PLAYER,
} from '../constants';
import { distance } from '../utils/math';
import { buildGrid, forEachInRadius, someInRadius } from '../utils/grid';
import { randomId } from '../utils/math';

// ---------------------------------------------------------------------------
// Creature update result
// ---------------------------------------------------------------------------

export interface CreatureUpdateResult {
  creatures: Creature[];
  playerHealthDelta: number;
  newKills: number;
  /** True ak bol hráč zabitý a má sa respawnovať */
  playerKilled: boolean;
}

/**
 * Aktualizuje všetky kreatúry – AI rozhodovanie, pohyb, respawn, kolízie s hráčom.
 */
export const updateCreatures = (
  creatures: Creature[],
  healthUpdates: Map<string, number>,
  playerPos: { x: number; y: number },
  playerRotation: number,
  isPlayerMoving: boolean,
  buildings: Building[],
  dt: number,
  currentMissionIndex: number,
  rocket: EnvFeature | undefined,
): CreatureUpdateResult => {
  let playerHealthDelta = 0;
  let newKills = 0;

  const buildingGrid = buildGrid<Building>(buildings, b => b.x, b => b.y);

  // Aplikuj zásahy a odfiltruj mŕtve kreatúry
  const survivingCreatures = creatures
    .map(c => (healthUpdates.has(c.id) ? { ...c, health: healthUpdates.get(c.id)! } : c))
    .filter(c => {
      if (c.health <= 0) {
        newKills++;
        return false;
      }

      // Kolízia s hráčom – poškodenie
      const dP = distance(playerPos.x, playerPos.y, c.x, c.y);
      if (dP < (c.type === 'heavy' ? 56 : 38)) {
        playerHealthDelta -= COLLISION_DAMAGE_PER_SEC * dt;

        if (isPlayerMoving) {
          const a = Math.atan2(c.y - playerPos.y, c.x - playerPos.x);
          let df = a - playerRotation;
          while (df < -Math.PI) df += Math.PI * 2;
          while (df > Math.PI) df -= Math.PI * 2;
          if (Math.abs(df) < 0.8 && c.type !== 'heavy') {
            playerHealthDelta -= RAM_DAMAGE_TO_PLAYER;
            return false; // Kreatúra zabitá ramovaním
          }
        }
      }
      return true;
    });

  // Len útočiť na budovy po Ére prežitia (MissionIndex >= 5)
  const canAttackBuildings = currentMissionIndex >= 5;

  // AI update pre každú kreatúru
  const updatedCreatures = survivingCreatures.map(c => {
    let cx = c.x;
    let cy = c.y;
    let crot = c.rotation;
    let cs = c.state;
    let tBId = c.targetBuildingId;

    const dP = distance(playerPos.x, playerPos.y, cx, cy);

    // Nájdi najbližšiu budovu
    let nB: Building | null = null;
    let nBDist = Infinity;
    forEachInRadius<Building>(buildingGrid, cx, cy, CREATURE_DETECTION_RANGE, b => {
      const d = distance(b.x, b.y, cx, cy);
      if (d < CREATURE_DETECTION_RANGE && d < nBDist) {
        nBDist = d;
        nB = b as Building;
      }
    });

    let tX: number;
    let tY: number;
    let bS = 0;

    // Rozhodovanie o cieli
    if (dP < CREATURE_PLAYER_AGGRO_RANGE) {
      cs = 'attacking';
      tBId = undefined;
      tX = playerPos.x;
      tY = playerPos.y;
      bS = c.type === 'heavy' ? CREATURE_SPEED * 0.8 : CREATURE_SPEED * 1.2;
    } else if (nB && canAttackBuildings) {
      cs = 'attacking';
      tBId = nB.id;
      const d = distance(nB.x, nB.y, cx, cy);
      if (d > (c.type === 'heavy' ? 80 : 60)) {
        tX = nB.x;
        tY = nB.y;
        bS = c.type === 'heavy' ? CREATURE_SPEED * 0.7 : CREATURE_SPEED * 1.15;
      } else {
        tX = cx + (Math.random() - 0.5) * 5;
        tY = cy + (Math.random() - 0.5) * 5;
        bS = 0.5;
      }
    } else {
      cs = 'wandering';
      tBId = undefined;
      if (Math.random() < 0.02) crot += Math.random() - 0.5;
      tX = cx + Math.cos(crot) * 100;
      tY = cy + Math.sin(crot) * 100;
      bS = c.type === 'heavy' ? CREATURE_SPEED * 0.4 : CREATURE_SPEED * 0.6;
      if (cx < 0 || cx > MAP_SIZE) crot = Math.PI - crot;
      if (cy < 0 || cy > MAP_SIZE) crot = -crot;
    }

    // Pathfinding s obstacle avoidance
    const dA = Math.atan2(tY - cy, tX - cx);
    const cA = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.8, -1.8];
    let bA = dA;
    let mF = false;
    for (const o of cA) {
      const testA = dA + o;
      const tXp = cx + Math.cos(testA) * bS;
      const tYp = cy + Math.sin(testA) * bS;
      const blockRadius = (c.type === 'heavy' ? 35 : 20) + 30;
      const blockedByRocket =
        rocket && distance(rocket.x, rocket.y, tXp, tYp) < 100;
      if (
        !blockedByRocket &&
        !someInRadius<Building>(buildingGrid, tXp, tYp, blockRadius, b => {
          if (cs === 'attacking' && tBId === b.id) return false;
          return distance(b.x, b.y, tXp, tYp) < blockRadius;
        })
      ) {
        bA = testA;
        mF = true;
        break;
      }
    }

    if (mF) {
      cx += Math.cos(bA) * bS;
      cy += Math.sin(bA) * bS;
      crot = bA;
    } else {
      crot += c.type === 'heavy' ? Math.PI / 4 : Math.PI / 2;
    }

    return { ...c, x: cx, y: cy, rotation: crot, state: cs, targetBuildingId: tBId };
  });

  // Respawn kreatúr
  if (updatedCreatures.length < CREATURE_COUNT) {
    const isH = Math.random() < 0.2;
    updatedCreatures.push({
      id: randomId(),
      type: isH ? 'heavy' : 'standard',
      x: Math.random() < 0.5 ? 0 : MAP_SIZE,
      y: Math.random() * MAP_SIZE,
      rotation: Math.random() * Math.PI * 2,
      state: 'wandering',
      health: isH ? 6 : 3,
      targetBuildingId: undefined,
    });
  }

  return {
    creatures: updatedCreatures,
    playerHealthDelta,
    newKills,
    playerKilled: false,
  };
};
