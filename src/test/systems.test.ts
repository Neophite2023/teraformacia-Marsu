import { describe, it, expect, vi } from 'vitest';
import { BuildingType, ResourceType, GameState } from '../../types';
import {
  applyToggleBuildMode,
  applyCycleBuilding,
  applyDemolishBuilding,
} from '../../systems/buildingActions';
import { calculatePowerBalance } from '../../systems/buildingSystem';
import { updateTerraformingStats } from '../../systems/terraformingSystem';

// Mock SoundManager – nie je k dispozícii v test prostredí
vi.mock('../../components/SoundManager', () => ({
  sounds: {
    playCollect: vi.fn(),
    playLaser: vi.fn(),
    playPlace: vi.fn(),
    playDamage: vi.fn(),
    updateEngine: vi.fn(),
    resume: vi.fn(),
    setMute: vi.fn(),
  },
}));

const createMinimalState = (overrides: Partial<GameState> = {}): GameState => ({
  player: {
    x: 5000, y: 5000, rotation: 0, health: 100,
    inventory: {
      [ResourceType.IRON]: 10, [ResourceType.SILICON]: 10,
      [ResourceType.MAGNESIUM]: 10, [ResourceType.TITANIUM]: 10,
    },
  },
  buildings: [],
  creatures: [],
  harvesters: [],
  projectiles: [],
  stats: { temperature: 0, pressure: 0, oxygen: 0, biomass: 0 },
  discoveredResources: [],
  envFeatures: [{ x: 5200, y: 5200, size: 84, type: 'rocket', rotation: Math.PI / 4 }],
  exploredChunks: {},
  time: 0,
  isBuildMode: false,
  selectedBuilding: null,
  selectedBuildingId: null,
  currentMissionIndex: 0,
  intro: { active: false, phase: 'FINISHED', progress: 1, startTime: 0 },
  enemiesKilled: 0,
  controlType: 'keyboard',
  ...overrides,
});

describe('BuildingActions - toggleBuildMode', () => {
  it('zapne build mode a nastaví prvú odomknutú budovu', () => {
    const state = createMinimalState();
    const next = applyToggleBuildMode(state);
    expect(next.isBuildMode).toBe(true);
    expect(next.selectedBuilding).toBe(BuildingType.SOLAR_PANEL);
  });

  it('vypne build mode a vymaže výber', () => {
    const state = createMinimalState({
      isBuildMode: true,
      selectedBuilding: BuildingType.HEATER,
    });
    const next = applyToggleBuildMode(state);
    expect(next.isBuildMode).toBe(false);
    expect(next.selectedBuilding).toBeNull();
  });
});

describe('BuildingActions - cycleBuilding', () => {
  it('nezmení stav mimo build mode', () => {
    const state = createMinimalState();
    const next = applyCycleBuilding(state);
    expect(next).toBe(state);
  });

  it('prepne na ďalšiu budovu v build mode', () => {
    const state = createMinimalState({
      isBuildMode: true,
      selectedBuilding: BuildingType.SOLAR_PANEL,
    });
    const next = applyCycleBuilding(state);
    expect(next.selectedBuilding).toBe(BuildingType.HEATER);
  });
});

describe('BuildingSystem - calculatePowerBalance', () => {
  it('vracia nulový výkon pre prázdne budovy', () => {
    const result = calculatePowerBalance([]);
    expect(result.totalGen).toBe(0);
    expect(result.totalReq).toBe(0);
    expect(result.hasPower).toBe(true);
  });

  it('počíta energiu zo solárnych panelov', () => {
    const buildings = [{
      id: '1', type: BuildingType.SOLAR_PANEL,
      x: 100, y: 100, progress: 1, health: 1, rotation: 0,
    }];
    const result = calculatePowerBalance(buildings);
    expect(result.totalGen).toBe(10);
    expect(result.totalReq).toBe(0);
    expect(result.hasPower).toBe(true);
  });

  it('deteguje nedostatok energie', () => {
    const buildings = [
      { id: '1', type: BuildingType.HEATER, x: 100, y: 100, progress: 1, health: 1, rotation: 0 },
    ];
    const result = calculatePowerBalance(buildings);
    expect(result.totalReq).toBeGreaterThan(0);
    expect(result.hasPower).toBe(false);
  });

  it('ignoruje nedostavané budovy', () => {
    const buildings = [
      { id: '1', type: BuildingType.SOLAR_PANEL, x: 100, y: 100, progress: 0.5, health: 1, rotation: 0 },
    ];
    const result = calculatePowerBalance(buildings);
    expect(result.totalGen).toBe(0);
  });
});

describe('TerraformingSystem - updateTerraformingStats', () => {
  it('nezvýši štatistiky bez budov', () => {
    const prevStats = { temperature: 0, pressure: 0, oxygen: 0, biomass: 0 };
    const result = updateTerraformingStats([], prevStats, 1, true);
    expect(result.temperature).toBe(0);
    expect(result.pressure).toBe(0);
  });

  it('zvýši teplotu s aktívnym ohrievačom', () => {
    const buildings = [{
      id: '1', type: BuildingType.HEATER,
      x: 100, y: 100, progress: 1, health: 1, rotation: 0,
    }];
    const prevStats = { temperature: 0, pressure: 0, oxygen: 0, biomass: 0 };
    const result = updateTerraformingStats(buildings, prevStats, 1, true);
    expect(result.temperature).toBeGreaterThan(0);
  });

  it('rešpektuje cap pre teplotu', () => {
    const buildings = [{
      id: '1', type: BuildingType.HEATER,
      x: 100, y: 100, progress: 1, health: 1, rotation: 0,
    }];
    // Teplota je už na cap (10 K pre jeden ohrievač)
    const prevStats = { temperature: 10, pressure: 0, oxygen: 0, biomass: 0 };
    const result = updateTerraformingStats(buildings, prevStats, 1000, true);
    expect(result.temperature).toBe(10);
  });
});
