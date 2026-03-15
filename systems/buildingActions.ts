/**
 * Čisté akcie nad herným stavom.
 * Extrahované z App.tsx – všetky "apply" funkcie tvaru (GameState) => GameState.
 */

import { GameState, ResourceType, BuildingType, Building } from '../types';
import { sounds } from '../components/SoundManager';
import {
  BUILDING_COSTS,
  BUILDING_STATS,
  BUILDING_ZONE_RADIUS,
  WATER_PUMP_CAPACITY,
  SYNTHESIZER_TIME,
  UPGRADE_COSTS,
  getUnlockedBuildings,
} from '../constants';
import { canAfford, deductCost, addResource } from '../utils/inventory';
import { distance, randomBuildingId } from '../utils/math';

// ---------------------------------------------------------------------------
// Toggle / Cycle build mode
// ---------------------------------------------------------------------------

export const applyToggleBuildMode = (prev: GameState): GameState => {
  if (prev.isBuildMode) {
    return { ...prev, isBuildMode: false, selectedBuilding: null };
  }
  const unlocked = getUnlockedBuildings(prev.currentMissionIndex);
  return {
    ...prev,
    isBuildMode: true,
    selectedBuilding: unlocked[0] || BuildingType.SOLAR_PANEL,
  };
};

export const applyCycleBuilding = (prev: GameState): GameState => {
  if (!prev.isBuildMode) return prev;
  const types = getUnlockedBuildings(prev.currentMissionIndex);
  if (!types.length) return prev;
  const currentIndex = prev.selectedBuilding
    ? types.indexOf(prev.selectedBuilding)
    : -1;
  const nextIndex = (currentIndex + 1) % types.length;
  return { ...prev, selectedBuilding: types[nextIndex] };
};

// ---------------------------------------------------------------------------
// Collect resource
// ---------------------------------------------------------------------------

export const applyCollectResource = (prev: GameState): GameState => {
  const p = prev.player;
  const nearbyResIndex = prev.discoveredResources.findIndex(
    r => distance(r.x, r.y, p.x, p.y) < 60,
  );
  if (nearbyResIndex === -1) return prev;
  sounds.playCollect();
  const res = prev.discoveredResources[nearbyResIndex];
  const newInventory = addResource(p.inventory, res.type, 1);
  const newResources = [...prev.discoveredResources];
  newResources.splice(nearbyResIndex, 1);
  return {
    ...prev,
    player: { ...p, inventory: newInventory },
    discoveredResources: newResources,
  };
};

// ---------------------------------------------------------------------------
// Place building
// ---------------------------------------------------------------------------

const getHarvesterSpawn = (
  type: BuildingType,
  x: number,
  y: number,
): { x: number; y: number } | null => {
  if (type === BuildingType.REFINERY) return { x, y: y + 70 };
  if (type === BuildingType.WATER_PUMP) return { x: x - 55, y: y + 85 };
  return null;
};

const SPAWN_CLEAR_RADIUS = 90;

export const applyPlaceBuilding = (prev: GameState): GameState => {
  if (!prev.isBuildMode || !prev.selectedBuilding) return prev;
  const unlocked = getUnlockedBuildings(prev.currentMissionIndex);
  if (!unlocked.includes(prev.selectedBuilding)) return prev;

  const cost = BUILDING_COSTS[prev.selectedBuilding];
  if (!canAfford(prev.player.inventory, cost)) return prev;

  const targetX = prev.player.x + Math.cos(prev.player.rotation) * 75;
  const targetY = prev.player.y + Math.sin(prev.player.rotation) * 75;

  // Kontrola vzdialenosti od rakety
  const rocket = prev.envFeatures.find(f => f.type === 'rocket');
  if (rocket) {
    if (distance(rocket.x, rocket.y, targetX, targetY) > BUILDING_ZONE_RADIUS)
      return prev;
  }

  // Kontrola kolízie s existujúcimi budovami
  const isTooClose =
    prev.buildings.some(
      b => distance(b.x, b.y, targetX, targetY) < 80,
    ) ||
    prev.envFeatures.some(f => {
      if (f.type !== 'rocket') return false;
      return distance(f.x, f.y, targetX, targetY) < 200;
    });
  if (isTooClose) return prev;

  // Kontrola blokovania existujúcich spawn pozícií
  const blocksExistingSpawn = prev.buildings.some(b => {
    const spawn = getHarvesterSpawn(b.type, b.x, b.y);
    if (!spawn) return false;
    return distance(spawn.x, spawn.y, targetX, targetY) < SPAWN_CLEAR_RADIUS;
  });
  if (blocksExistingSpawn) return prev;

  // Kontrola blokovania novej spawn pozície
  const newSpawn = getHarvesterSpawn(prev.selectedBuilding, targetX, targetY);
  if (newSpawn) {
    const spawnBlockedByBuilding = prev.buildings.some(
      b => distance(b.x, b.y, newSpawn.x, newSpawn.y) < 80,
    );
    const spawnBlockedByRocket =
      rocket && distance(rocket.x, rocket.y, newSpawn.x, newSpawn.y) < 200;
    const spawnBlockedByOtherSpawn = prev.buildings.some(b => {
      const spawn = getHarvesterSpawn(b.type, b.x, b.y);
      if (!spawn) return false;
      return (
        distance(spawn.x, spawn.y, newSpawn.x, newSpawn.y) < SPAWN_CLEAR_RADIUS
      );
    });
    if (spawnBlockedByBuilding || spawnBlockedByRocket || spawnBlockedByOtherSpawn)
      return prev;
  }

  const newInventory = deductCost(prev.player.inventory, cost);
  const newBuilding: Building = {
    id: randomBuildingId(),
    type: prev.selectedBuilding,
    x: targetX,
    y: targetY,
    progress: 0,
    health: 1.0,
    rotation: 0,
    lastFireTime: 0,
    hasSpawnedHarvester: false,
    storedWater:
      prev.selectedBuilding === BuildingType.WATER_PUMP ? 0 : undefined,
    waterCapacity:
      prev.selectedBuilding === BuildingType.WATER_PUMP
        ? WATER_PUMP_CAPACITY
        : undefined,
    isProcessing: false,
    processingTimer: 0,
  };

  return {
    ...prev,
    player: { ...prev.player, inventory: newInventory },
    buildings: [...prev.buildings, newBuilding],
  };
};

// ---------------------------------------------------------------------------
// Synthesizer
// ---------------------------------------------------------------------------

export const applyStartSynthesizerProcess = (prev: GameState): GameState => {
  if (!prev.selectedBuildingId) return prev;
  const b = prev.buildings.find(
    building => building.id === prev.selectedBuildingId,
  );
  if (
    !b ||
    b.type !== BuildingType.SYNTHESIZER ||
    b.isProcessing ||
    b.progress < 1
  )
    return prev;

  const inv = prev.player.inventory;

  // Dynamický výber dvoch surovín s najvyšším počtom (Si, Mg, Ti)
  const candidates = [
    { type: ResourceType.SILICON, amount: inv[ResourceType.SILICON] || 0 },
    { type: ResourceType.MAGNESIUM, amount: inv[ResourceType.MAGNESIUM] || 0 },
    { type: ResourceType.TITANIUM, amount: inv[ResourceType.TITANIUM] || 0 },
  ].sort((a, b) => b.amount - a.amount);

  const canAffordSynthesis = candidates[0].amount >= 1 && candidates[1].amount >= 1;

  if (!canAffordSynthesis) return prev;

  const newInventory = { ...inv };
  newInventory[candidates[0].type] -= 1;
  newInventory[candidates[1].type] -= 1;

  sounds.playPlace(); // Or a specific synthesizer sound if available

  return {
    ...prev,
    player: { ...prev.player, inventory: newInventory },
    buildings: prev.buildings.map(building =>
      building.id === b.id
        ? { ...building, isProcessing: true, processingTimer: SYNTHESIZER_TIME }
        : building,
    ),
  };
};

// ---------------------------------------------------------------------------
// Upgrade building
// ---------------------------------------------------------------------------

export const applyUpgradeBuilding = (
  prev: GameState,
  closestId?: string | null,
): GameState => {
  const selectedId = prev.selectedBuildingId || closestId;
  if (!selectedId) return prev;

  const b = prev.buildings.find(building => building.id === selectedId);
  if (!b || b.progress < 1) return prev;

  const currentLevel = b.level || 1;
  const nextLevel = currentLevel + 1;

  const upgradeCost = UPGRADE_COSTS[b.type]?.[nextLevel];
  if (!upgradeCost) return prev;

  if (!canAfford(prev.player.inventory, upgradeCost as Record<string, number>)) {
    sounds.playDamage();
    return prev;
  }

  const newInventory = deductCost(
    prev.player.inventory,
    upgradeCost as Record<string, number>,
  );

  sounds.playPlace();

  return {
    ...prev,
    player: { ...prev.player, inventory: newInventory },
    buildings: prev.buildings.map(building =>
      building.id === b.id ? { ...building, level: nextLevel } : building,
    ),
  };
};

// ---------------------------------------------------------------------------
// Demolish building
// ---------------------------------------------------------------------------

export const applyDemolishBuilding = (prev: GameState): GameState => {
  if (!prev.selectedBuildingId) return prev;
  const b = prev.buildings.find(
    building => building.id === prev.selectedBuildingId,
  );
  if (!b) return prev;

  const costs = BUILDING_COSTS[b.type];
  const newInventory = { ...prev.player.inventory };
  const invRef = newInventory as unknown as Record<string, number>;

  Object.entries(costs).forEach(([res, amt]) => {
    const recoveryAmount = Math.floor(amt * 0.5 * b.health);
    invRef[res] = (invRef[res] || 0) + recoveryAmount;
  });

  sounds.playCollect();

  return {
    ...prev,
    player: { ...prev.player, inventory: newInventory },
    buildings: prev.buildings.filter(building => building.id !== b.id),
    selectedBuildingId: null,
  };
};
