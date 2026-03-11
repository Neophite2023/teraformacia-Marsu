
export enum ResourceType {
  IRON = 'Železo',
  SILICON = 'Kremík',
  MAGNESIUM = 'Horčík',
  TITANIUM = 'Titán',
}

export enum BuildingType {
  HEATER = 'Ohrievač',
  DRILL = 'Vrták',
  VEGETUBE = 'Skleník',
  SOLAR_PANEL = 'Solárny panel',
  LASER_TOWER = 'Laserová veža',
  REFINERY = 'Rafinéria',
  WATER_PUMP = 'Vodné Čerpadlo',
  SYNTHESIZER = 'Molekulárny Syntetizátor',
}

export interface Resources {
  [ResourceType.IRON]: number;
  [ResourceType.SILICON]: number;
  [ResourceType.MAGNESIUM]: number;
  [ResourceType.TITANIUM]: number;
}

export interface TerraformingStats {
  temperature: number; // in Kelvin
  pressure: number;    // in Pa
  oxygen: number;      // in ppm
  biomass: number;     // in grams
}

export interface Building {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  progress: number;
  health: number;
  rotation?: number;
  lastFireTime?: number;
  hasSpawnedHarvester?: boolean;
  storedWater?: number;
  waterCapacity?: number;
  processingTimer?: number;
  isProcessing?: boolean;
  level?: number;
}

export interface Creature {
  id: string;
  type: 'standard' | 'heavy';
  x: number;
  y: number;
  rotation: number;
  state: 'wandering' | 'attacking';
  health: number;
  targetBuildingId?: string;
}

export interface Harvester {
  id: string;
  type: 'MINER' | 'TANKER';
  parentId: string;
  x: number;
  y: number;
  rotation: number;
  state: 'IDLE' | 'ESCAPING' | 'MOVING_TO_RESOURCE' | 'MOVING_TO_CRATER' | 'ALIGNING_TO_DOCK' | 'REVERSING_TO_DOCK' | 'MINING' | 'PUMPING_IN' | 'RETURNING' | 'DEPOSITING' | 'PUMPING_OUT';
  targetResourceId?: string;
  targetCraterId?: string;
  targetPos?: { x: number, y: number };
  inventory: { type: ResourceType | 'WATER', amount: number } | null;
  miningTimer: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  distanceTraveled: number;
  isLaser?: boolean;
}

export interface EnvFeature {
  x: number;
  y: number;
  size: number;
  type: 'crater' | 'rock' | 'ravine' | 'rocket';
  rotation: number;
  points?: { x: number, y: number }[];
  colorVariant?: number;
  hasIce?: boolean;
  meltProgress?: number;
}

export interface Player {
  x: number;
  y: number;
  rotation: number;
  inventory: Resources;
  health: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  goal: string;
  isCompleted: boolean;
  successMessage?: string;
  overrideGoalText?: string;
}

export type IntroPhase = 'FALLING' | 'LANDED' | 'RAMP_EXTENDING' | 'ROVER_EXITING' | 'FINISHED';

export interface IntroSequence {
  active: boolean;
  phase: IntroPhase;
  progress: number;
  startTime: number;
}

export interface GameState {
  player: Player;
  buildings: Building[];
  creatures: Creature[];
  harvesters: Harvester[];
  projectiles: Projectile[];
  stats: TerraformingStats;
  discoveredResources: { x: number, y: number, type: ResourceType, id: string }[];
  envFeatures: EnvFeature[];
  time: number;
  isBuildMode: boolean;
  selectedBuilding: BuildingType | null;
  selectedBuildingId: string | null;
  currentMissionIndex: number;
  intro: IntroSequence;
  exploredChunks: Record<string, boolean>;
  enemiesKilled: number;
  controlType: 'keyboard' | 'gamepad';
}

export interface SaveMetadata {
  slotIndex: number;
  timestamp: string;
  ti: number;
  stageName: string;
}
