/**
 * Harvester (ťažobný dron / cisterna) systém – state machine pohyb, ťažba, dokovanie.
 * Extrahované z App.tsx game loopu – najkomplexnejší systém.
 */

import { Harvester, Building, Resources, ResourceType, BuildingType, EnvFeature } from '../types';
import {
  HARVESTER_MINE_TIME,
  TANKER_CAPACITY,
  TANKER_PUMP_TIME,
  FOG_GRID_SIZE,
} from '../constants';
import { distance } from '../utils/math';
import { someInRadius } from '../utils/grid';

const HARVESTER_TURN_SPEED = 2.5;
const IMPROVED_HARVESTER_SPEED = 50;

// ---------------------------------------------------------------------------
// Collision / Blocking helper
// ---------------------------------------------------------------------------

const isBlockedFactory = (
  harvesterGrid: Map<string, Harvester[]>,
  updatedBuildings: Building[],
  rocket: EnvFeature | undefined,
  playerPos: { x: number; y: number },
  currentHarvesterId: string,
  currentState: Harvester['state'],
  assignedParentId: string,
  currentX: number,
  currentY: number,
) => (cx: number, cy: number, pId?: string) => {
  if (rocket && distance(rocket.x, rocket.y, cx, cy) < 100) return true;
  if (distance(playerPos.x, playerPos.y, cx, cy) < 60) return true;
  if (someInRadius<Harvester>(harvesterGrid, cx, cy, 60, qh => {
    if (qh.id === currentHarvesterId) return false;
    const dx = qh.x - cx;
    const dy = qh.y - cy;
    return dx * dx + dy * dy < 2500;
  })) return true;

  return updatedBuildings.some(b => {
    if (b.id === pId) {
      if (currentState === 'ESCAPING') return false;
      const isDocking = currentState === 'RETURNING' || currentState === 'ALIGNING_TO_DOCK' ||
        currentState === 'REVERSING_TO_DOCK' || currentState === 'DEPOSITING' ||
        currentState === 'PUMPING_IN' || currentState === 'PUMPING_OUT';
      if (!isDocking) {
        const currDist = distance(currentX, currentY, b.x, b.y);
        const nextDist = distance(cx, cy, b.x, b.y);
        const escapeRadius = (b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER) ? 100 : 80;
        if (currDist < escapeRadius && nextDist >= currDist - 0.5) return false;
        if (b.type === BuildingType.REFINERY) {
          const a = Math.atan2(cy - b.y, cx - b.x);
          let d = a - ((b.rotation || 0) + Math.PI / 2);
          while (d < -Math.PI) d += Math.PI * 2;
          while (d > Math.PI) d -= Math.PI * 2;
          if (Math.abs(d) < 0.6) return Math.sqrt(Math.pow(b.x - cx, 2) + Math.pow(b.y - cy, 2)) < 45;
        }
        return distance(b.x, b.y, cx, cy) < 65;
      }
      if (b.type === BuildingType.REFINERY) {
        const dx = cx - b.x;
        const dy = cy - b.y;
        const a = -(b.rotation || 0);
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        if (lx > -45 && lx < 45 && ly > -35 && ly < 35) {
          if (lx > -20 && lx < 20 && ly > 0) return false;
          return true;
        }
      }
      return false;
    }
    return distance(b.x, b.y, cx, cy) < (
      (b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER)
        ? 80 : 42
    );
  });
};

// ---------------------------------------------------------------------------
// isCraterAt helper (needs to be passed in)
// ---------------------------------------------------------------------------

type IsCraterAtFn = (cx: number, cy: number) => boolean;

// ---------------------------------------------------------------------------
// Harvester update result
// ---------------------------------------------------------------------------

export interface HarvesterUpdateResult {
  harvesters: Harvester[];
  remainingResources: { id: string; x: number; y: number; type: ResourceType }[];
  playerInventoryAdditions: Partial<Resources>;
}

/**
 * Aktualizuje všetky harvestery – state machine pre MINER a TANKER.
 */
export const updateHarvesters = (
  prevHarvesters: Harvester[],
  newHarvesters: Harvester[],
  updatedBuildings: Building[],
  prevResources: { id: string; x: number; y: number; type: ResourceType }[],
  reservedResourceIds: Set<string>,
  availableCraters: EnvFeature[],
  harvesterGrid: Map<string, Harvester[]>,
  rocket: EnvFeature | undefined,
  playerPos: { x: number; y: number },
  exploredChunks: Record<string, boolean>,
  hasPower: boolean,
  dt: number,
  isCraterAt: IsCraterAtFn,
): HarvesterUpdateResult => {
  let remainingResources = prevResources;
  let resourcesMutated = false;
  const playerInventoryAdditions: Partial<Resources> = {};

  const ensureResourceCopy = () => {
    if (!resourcesMutated) {
      remainingResources = [...remainingResources];
      resourcesMutated = true;
    }
  };

  const allHarvesters = [...prevHarvesters, ...newHarvesters];

  const updatedHarvesters = allHarvesters.map(h => {
    let parent = updatedBuildings.find(b => b.id === h.parentId);
    let assignedParentId = h.parentId;
    let newState = h.state;
    let newX = h.x;
    let newY = h.y;
    let newRot = h.rotation;
    let newInv = h.inventory;
    let newTimer = h.miningTimer;
    let targetId = h.type === 'MINER' ? h.targetResourceId : h.targetCraterId;
    let targetPos = h.targetPos;

    // Reassign parent if destroyed
    if (!parent || parent.health <= 0) {
      const potentialParents = updatedBuildings.filter(b =>
        b.health > 0 && b.progress >= 1 &&
        ((h.type === 'MINER' && b.type === BuildingType.REFINERY) ||
          (h.type === 'TANKER' && b.type === BuildingType.WATER_PUMP)),
      );

      if (potentialParents.length > 0) {
        const closest = potentialParents.reduce((best, curr) => {
          const d = distance(curr.x, curr.y, h.x, h.y);
          return d < best.dist ? { b: curr, dist: d } : best;
        }, { b: potentialParents[0], dist: Infinity }).b;
        parent = closest;
        assignedParentId = closest.id;
        newState = (h.inventory && (h.inventory.amount || 0) > 0) ? 'RETURNING' : 'IDLE';
        targetPos = undefined;
        newTimer = 0;
      } else {
        return { ...h, state: 'IDLE' as const };
      }
    }

    // Collision helper
    const isBlocked = isBlockedFactory(
      harvesterGrid, updatedBuildings, rocket, playerPos,
      h.id, newState, assignedParentId, newX, newY,
    );

    // Movement helper
    const move = (dx: number, dy: number, stop: number = 20) => {
      const dX = dx - newX;
      const dY = dy - newY;
      const dist = Math.sqrt(dX * dX + dY * dY);
      if (dist < stop) return { reached: true, dist };

      let tA = Math.atan2(dY, dX);

      // --- SEPARATION FORCE (Avoid other harvesters) ---
      let sepX = 0;
      let sepY = 0;
      let neighbors = 0;
      
      const isPrecisionState = h.state === 'ALIGNING_TO_DOCK' || h.state === 'REVERSING_TO_DOCK' || h.state === 'DEPOSITING' || h.state === 'PUMPING_IN' || h.state === 'PUMPING_OUT';

      if (!isPrecisionState) {
        allHarvesters.forEach(other => {
          if (other.id === h.id) return;
          const d = distance(newX, newY, other.x, other.y);
          if (d < 75) {
            const weight = (1 - d / 75);
            sepX += (newX - other.x) * weight;
            sepY += (newY - other.y) * weight;
            neighbors++;
          }
        });

        if (neighbors > 0) {
          const sepAngle = Math.atan2(sepY, sepX);
          // Blend target angle with separation (40% separation influence)
          const separationStrength = 0.4;
          let diff = sepAngle - tA;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          tA += diff * separationStrength;
        }
      }

      const cA = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.0, -2.0, 2.5, -2.5];
      let bA = tA;
      let found = false;
      const dockPid = (newState === 'ESCAPING' || newState === 'IDLE' || newState === 'MOVING_TO_RESOURCE' || newState === 'MOVING_TO_CRATER' || newState === 'RETURNING' || newState === 'ALIGNING_TO_DOCK' || newState === 'REVERSING_TO_DOCK' || newState === 'DEPOSITING' || newState === 'PUMPING_IN' || newState === 'PUMPING_OUT') ? assignedParentId : undefined;
      for (const o of cA) {
        const testA = tA + o;
        const fX = newX + Math.cos(testA) * 85;
        const fY = newY + Math.sin(testA) * 85;
        const sX = newX + Math.cos(testA) * 35;
        const sY = newY + Math.sin(testA) * 35;
        if (!isBlocked(fX, fY, dockPid) && !isBlocked(sX, sY, dockPid)) {
          bA = testA;
          found = true;
          break;
        }
      }
      let df = bA - newRot;
      while (df < -Math.PI) df += Math.PI * 2;
      while (df > Math.PI) df -= Math.PI * 2;
      const ts = HARVESTER_TURN_SPEED * dt;
      if (Math.abs(df) < ts) newRot = bA;
      else newRot += Math.sign(df) * ts;
      newRot = (newRot + Math.PI * 2) % (Math.PI * 2);
      let sm = 1.0;
      if (isCraterAt(newX, newY)) sm = 0.3;
      if (found || dist < stop + 10) {
        const step = IMPROVED_HARVESTER_SPEED * dt * sm;
        const nX = newX + Math.cos(newRot) * step;
        const nY = newY + Math.sin(newRot) * step;
        if (!isBlocked(nX, nY, dockPid)) {
          newX = nX;
          newY = nY;
        } else {
          newRot += HARVESTER_TURN_SPEED * dt * 2.0;
        }
      } else {
        if (!isBlocked(newX - Math.cos(newRot) * 20, newY - Math.sin(newRot) * 20, dockPid)) {
          newX -= Math.cos(newRot) * IMPROVED_HARVESTER_SPEED * dt * 0.8;
          newY -= Math.sin(newRot) * IMPROVED_HARVESTER_SPEED * dt * 0.8;
          newRot += HARVESTER_TURN_SPEED * dt * 2.5;
        }
      }
      return { reached: false, dist };
    };

    // Reverse helper
    const reverse = (tx: number, ty: number) => {
      const rdx = tx - newX;
      const rdy = ty - newY;
      const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
      if (rdist < 5) return true;
      const da = Math.atan2(rdy, rdx) + Math.PI;
      let rdf = da - newRot;
      while (rdf < -Math.PI) rdf += Math.PI * 2;
      while (rdf > Math.PI) rdf -= Math.PI * 2;
      const ts = HARVESTER_TURN_SPEED * dt;
      if (Math.abs(rdf) < ts) newRot = da;
      else newRot += Math.sign(rdf) * ts;
      newRot = (newRot + Math.PI * 2) % (Math.PI * 2);
      if (Math.abs(rdf) < Math.PI / 1.8) {
        newX -= Math.cos(newRot) * IMPROVED_HARVESTER_SPEED * 0.6 * dt;
        newY -= Math.sin(newRot) * IMPROVED_HARVESTER_SPEED * 0.6 * dt;
      }
      return false;
    };

    // --- MINER state machine ---
    if (h.type === 'MINER') {
      if (newState === 'ESCAPING') {
        newTimer += dt;
        const escapeAngle = (parent.rotation || 0) + Math.PI / 2;
        const escapePos = { x: parent.x + Math.cos(escapeAngle) * 160, y: parent.y + Math.sin(escapeAngle) * 160 };
        const moved = move(escapePos.x, escapePos.y, 10).reached;
        if (moved || newTimer > 2.5) { newState = 'IDLE'; newTimer = 0; }
      } else if (newState === 'IDLE') {
        let minD = Infinity;
        let c: typeof remainingResources[0] | null = null;
        remainingResources.forEach(r => {
          if (reservedResourceIds.has(r.id) && r.id !== h.targetResourceId) return;
          const d = distance(r.x, r.y, h.x, h.y);
          if (d < minD) { minD = d; c = r; }
        });
        if (c) {
          targetId = c.id;
          // Add unique jitter based on ID to prevent stacking
          const hashId = h.id.split('-').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const offsetX = (hashId % 40) - 20;
          const offsetY = ((hashId * 7) % 40) - 20;
          targetPos = { x: c.x + offsetX, y: c.y + offsetY };
          newState = 'MOVING_TO_RESOURCE';
        }
      } else if (newState === 'MOVING_TO_RESOURCE') {
        if (targetPos) {
          const distToParent = distance(newX, newY, parent.x, parent.y);
          const exitAngle = (parent.rotation || 0) + Math.PI / 2;
          const exitPos = { x: parent.x + Math.cos(exitAngle) * 140, y: parent.y + Math.sin(exitAngle) * 140 };
          const goal = distToParent < 70 ? exitPos : targetPos;
          if (move(goal.x, goal.y, 10).reached) {
            if (goal === targetPos) { newState = 'MINING'; newTimer = 0; }
          }
        } else { newState = 'IDLE'; }
      } else if (newState === 'MINING') {
        newTimer += dt;
        if (newTimer > HARVESTER_MINE_TIME) {
          const ri = remainingResources.findIndex(r => r.id === targetId);
          if (ri !== -1) {
            newInv = { type: remainingResources[ri].type, amount: 1 };
            ensureResourceCopy();
            remainingResources.splice(ri, 1);
            newState = 'RETURNING';
          } else { newState = 'IDLE'; }
        }
      } else if (newState === 'RETURNING') {
        const pr = parent.rotation || 0;
        const aX = parent.x + Math.cos(pr + Math.PI / 2) * 90;
        const aY = parent.y + Math.sin(pr + Math.PI / 2) * 90;
        targetPos = { x: parent.x + Math.cos(pr + Math.PI / 2) * 30, y: parent.y + Math.sin(pr + Math.PI / 2) * 30 };
        if (move(aX, aY, 15).reached) newState = 'ALIGNING_TO_DOCK';
      } else if (newState === 'ALIGNING_TO_DOCK') {
        const fa = (parent.rotation || 0) + Math.PI / 2;
        let df = fa - newRot;
        while (df < -Math.PI) df += Math.PI * 2;
        while (df > Math.PI) df -= Math.PI * 2;
        if (Math.abs(df) < 0.15) { newRot = fa; newState = 'REVERSING_TO_DOCK'; }
        else newRot += Math.sign(df) * HARVESTER_TURN_SPEED * dt;
        newRot = (newRot + Math.PI * 2) % (Math.PI * 2);
      } else if (newState === 'REVERSING_TO_DOCK') {
        if (targetPos && reverse(targetPos.x, targetPos.y)) {
          newState = 'DEPOSITING';
          newX = targetPos.x;
          newY = targetPos.y;
          newTimer = 0;
        }
      } else if (newState === 'DEPOSITING') {
        if (hasPower) {
          newTimer += dt;
          if (newTimer > 4.0) {
            if (newInv && newInv.type !== 'WATER') {
              const invAdditionsRef = playerInventoryAdditions as unknown as Record<string, number>;
              invAdditionsRef[newInv.type] = (invAdditionsRef[newInv.type] || 0) + newInv.amount;
              newInv = null;
            }
            newState = 'IDLE';
          }
        }
      }
    }

    // --- TANKER state machine ---
    else if (h.type === 'TANKER') {
      if (newState === 'ESCAPING') {
        newTimer += dt;
        const escapeAngle = (parent.rotation || 0) + Math.PI / 2;
        const escapePos = { x: parent.x + Math.cos(escapeAngle) * 170, y: parent.y + Math.sin(escapeAngle) * 170 };
        const moved = move(escapePos.x, escapePos.y, 10).reached;
        if (moved || newTimer > 2.5) { newState = 'IDLE'; newTimer = 0; }
      } else if (newState === 'IDLE') {
        let minD = Infinity;
        let c: EnvFeature | null = null;
        availableCraters.forEach(f => {
          const d = distance(f.x, f.y, h.x, h.y);
          if (d < minD) { minD = d; c = f; }
        });
        if (c) {
          const a = Math.atan2(parent.y - c.y, parent.x - c.x);
          // Add angular jitter for tankers around the crater
          const hashId = h.id.split('-').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const angularOffset = ((hashId % 10) - 5) * 0.15; // ±~45 degrees spread
          const finalAngle = a + angularOffset;
          
          targetPos = { 
            x: c.x + Math.cos(finalAngle) * (c.size - 25), 
            y: c.y + Math.sin(finalAngle) * (c.size - 25) 
          };
          newState = 'MOVING_TO_CRATER';
        }
      } else if (newState === 'MOVING_TO_CRATER') {
        if (targetPos) {
          const a = Math.atan2(targetPos.y - newY, targetPos.x - newX);
          if (move(targetPos.x - Math.cos(a) * 40, targetPos.y - Math.sin(a) * 40, 15).reached)
            newState = 'REVERSING_TO_DOCK';
        } else { newState = 'IDLE'; }
      } else if (newState === 'REVERSING_TO_DOCK') {
        if (targetPos && reverse(targetPos.x, targetPos.y)) {
          newState = 'PUMPING_IN';
          newTimer = 0;
        }
      } else if (newState === 'PUMPING_IN') {
        newTimer += dt;
        if (newTimer > TANKER_PUMP_TIME) {
          newInv = { type: 'WATER', amount: TANKER_CAPACITY };
          newState = 'RETURNING';
        }
      } else if (newState === 'RETURNING') {
        const pr = parent.rotation || 0;
        const dX = parent.x + Math.cos(pr + Math.PI / 2) * 40;
        const dY = parent.y + Math.sin(pr + Math.PI / 2) * 40;
        targetPos = { x: dX, y: dY };
        if (move(dX + Math.cos(pr + Math.PI / 2) * 70, dY + Math.sin(pr + Math.PI / 2) * 70, 10).reached)
          newState = 'ALIGNING_TO_DOCK';
      } else if (newState === 'ALIGNING_TO_DOCK') {
        if (targetPos && reverse(targetPos.x, targetPos.y)) {
          newState = 'PUMPING_OUT';
          newTimer = 0;
        }
      } else if (newState === 'PUMPING_OUT') {
        if (hasPower) {
          newTimer += dt;
          if (newTimer > TANKER_PUMP_TIME) {
            if (parent.waterCapacity) {
              const pIA = updatedBuildings.find(b => b.id === parent.id);
              if (pIA) {
                pIA.storedWater = (pIA.storedWater || 0) + Math.min(newInv?.amount || 0, (parent.waterCapacity || 0) - (parent.storedWater || 0));
              }
            }
            newInv = null;
            newState = 'IDLE';
          }
        }
      }
    }

    return {
      ...h,
      parentId: assignedParentId,
      x: newX,
      y: newY,
      rotation: newRot,
      state: newState,
      inventory: newInv,
      targetResourceId: targetId,
      targetCraterId: targetId,
      targetPos: targetPos,
      miningTimer: newTimer,
    };
  });

  return {
    harvesters: updatedHarvesters,
    remainingResources,
    playerInventoryAdditions,
  };
};
