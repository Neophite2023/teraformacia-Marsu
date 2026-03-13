
import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import MainMenu from './components/MainMenu';
import IntroOverlay from './components/IntroOverlay';
import LoadingScreen from './components/LoadingScreen';
import { sounds } from './components/SoundManager';
import { speech } from './utils/speech';
import { addResources } from './utils/inventory';
import { buildGrid, someInRadius } from './utils/grid';
import { GameState, ResourceType, BuildingType, Creature, Building, EnvFeature, Harvester, SaveMetadata } from './types';
import {
  MAP_SIZE,
  PLAYER_SPEED,
  RESOURCE_SPAWN_COUNT,
  RESOURCE_RESPAWN_THRESHOLD,
  RESOURCE_RESPAWN_INTERVAL,
  RESOURCE_SAFE_ZONE,
  MISSIONS,
  BUILDING_ZONE_RADIUS,
  PLAYER_MAX_HEALTH,
  COLLISION_DAMAGE_PER_SEC,
  REPAIR_RATE_PER_SEC,
  FOG_GRID_SIZE,
  FOG_REVEAL_RADIUS,
  TERRAFORM_STAGES,
  getUnlockedBuildings,
} from './constants';

// Game systems
import { generateInitialWorld } from './systems/worldGenerator';
import {
  applyToggleBuildMode,
  applyCycleBuilding,
  applyCollectResource,
  applyPlaceBuilding,
  applyStartSynthesizerProcess,
  applyUpgradeBuilding,
  applyDemolishBuilding,
} from './systems/buildingActions';
import { calculatePowerBalance, updateBuildings } from './systems/buildingSystem';
import { updateProjectiles, processHits } from './systems/projectileSystem';
import { updateCreatures } from './systems/creatureSystem';
import { updateHarvesters } from './systems/harvesterSystem';
import { updateTerraformingStats, updateIceMelt } from './systems/terraformingSystem';
import { updateFogOfWar } from './systems/fogOfWarSystem';
import { randomId } from './utils/math';

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: GameState = {
  player: {
    x: MAP_SIZE / 2,
    y: MAP_SIZE / 2,
    rotation: Math.PI / 4,
    health: PLAYER_MAX_HEALTH,
    inventory: {
      [ResourceType.IRON]: 0,
      [ResourceType.SILICON]: 0,
      [ResourceType.MAGNESIUM]: 0,
      [ResourceType.TITANIUM]: 0,
    }
  },
  buildings: [],
  creatures: [],
  harvesters: [],
  projectiles: [],
  stats: { temperature: 0, pressure: 0, oxygen: 0, biomass: 0 },
  discoveredResources: [],
  envFeatures: [],
  exploredChunks: {},
  time: 0,
  isBuildMode: false,
  selectedBuilding: null,
  selectedBuildingId: null,
  currentMissionIndex: 0,
  intro: { active: true, phase: 'FALLING', progress: 0, startTime: 0 },
  enemiesKilled: 0,
  controlType: 'gamepad'
};

const UI_SYNC_MS = 1000 / 15;

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

const App: React.FC = () => {
  const gameStateRef = useRef<GameState>(INITIAL_STATE);
  const [uiState, setUiState] = useState<GameState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [pendingLoadAction, setPendingLoadAction] = useState<'NEW_GAME' | 'LOAD_GAME' | null>(null);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const keysPressed = useRef<Set<string>>(new Set());
  const prevGamepadButtons = useRef<boolean[]>([]);
  const gamepadIndexRef = useRef<number | null>(null);
  const lastRespawnTimeRef = useRef(0);
  const uiSyncLastRef = useRef(0);
  const lastPlayerChunkRef = useRef<{ gx: number; gy: number } | null>(null);
  const lastHarvesterChunksRef = useRef<Map<string, string>>(new Map());

  // --- UI sync ---
  const syncUiState = useCallback((force: boolean = false) => {
    const now = performance.now();
    if (force || now - uiSyncLastRef.current >= UI_SYNC_MS) {
      uiSyncLastRef.current = now;
      setUiState(gameStateRef.current);
    }
  }, []);

  const updateGameState = useCallback((updater: (prev: GameState) => GameState, forceSync: boolean = false) => {
    const next = updater(gameStateRef.current);
    gameStateRef.current = next;
    syncUiState(forceSync);
    return next;
  }, [syncUiState]);

  // --- Initialization ---
  useEffect(() => {
    let found = false;
    for (let i = 1; i <= 5; i++) {
      if (localStorage.getItem(`mars_terraforming_save_slot_${i}`)) { found = true; break; }
    }
    setHasSave(found);
  }, []);

  const handleFinishLoading = () => {
    if (pendingLoadAction === 'NEW_GAME') {
      const initialWorld = generateInitialWorld();
      gameStateRef.current = { ...INITIAL_STATE, ...initialWorld };
      lastPlayerChunkRef.current = null;
      lastHarvesterChunksRef.current = new Map();
      syncUiState(true);
      setGameStarted(true);
    } else if (pendingLoadAction === 'LOAD_GAME' && pendingSlot !== null) {
      executeLoadGame(pendingSlot);
    }
    
    setIsLoading(false);
    setPendingLoadAction(null);
    setPendingSlot(null);
    sounds.resume();
  };

  // --- Audio ---
  const handleMuteToggle = (muted: boolean) => {
    setIsMuted(muted);
    sounds.setMute(muted);
    speech.toggle(!muted);
    sounds.resume();
  };

  // --- Mission speech ---
  const lastSpokenTextRef = useRef<string>("");
  useEffect(() => {
    if (gameStarted && MISSIONS[uiState.currentMissionIndex]) {
      if (uiState.currentMissionIndex === 0 && uiState.intro.phase !== 'FINISHED') return;
      const m = MISSIONS[uiState.currentMissionIndex];
      const text = `${m.description}`;
      if (lastSpokenTextRef.current === text) return;
      speech.speak(text, false);
      lastSpokenTextRef.current = text;
    }
  }, [uiState.currentMissionIndex, gameStarted, uiState.intro.phase, MISSIONS]);

  // --- Action callbacks ---
  const startSynthesizerProcess = useCallback(() => updateGameState(applyStartSynthesizerProcess, true), [updateGameState]);
  const demolishBuilding = useCallback(() => updateGameState(applyDemolishBuilding, true), [updateGameState]);
  const upgradeBuilding = useCallback(() => {
    updateGameState(prev => {
      const closest = prev.buildings.reduce((best, curr) => {
        const dx = curr.x - prev.player.x; const dy = curr.y - prev.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = (curr.type === BuildingType.REFINERY || curr.type === BuildingType.WATER_PUMP || curr.type === BuildingType.SYNTHESIZER) ? 120 : 100;
        if (dist < radius && dist < best.dist) return { id: curr.id, dist };
        return best;
      }, { id: null as string | null, dist: Infinity });
      return applyUpgradeBuilding(prev, closest.id);
    }, true);
  }, [updateGameState]);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(console.error);
    else document.exitFullscreen();
  }, []);
  const toggleBuildMode = useCallback(() => updateGameState(applyToggleBuildMode, true), [updateGameState]);
  const cycleBuilding = useCallback(() => updateGameState(applyCycleBuilding, true), [updateGameState]);
  const collectResource = useCallback(() => updateGameState(applyCollectResource, true), [updateGameState]);
  const placeBuilding = useCallback(() => updateGameState(applyPlaceBuilding, true), [updateGameState]);

  const handleSetMissionIndex = useCallback((index: number) => {
    updateGameState(prev => {
      const clamped = Math.max(0, Math.min(MISSIONS.length - 1, index));
      const unlocked = getUnlockedBuildings(clamped);
      let selectedBuilding = prev.selectedBuilding;
      if (prev.isBuildMode && (!selectedBuilding || !unlocked.includes(selectedBuilding))) {
        selectedBuilding = unlocked[0] || BuildingType.SOLAR_PANEL;
      }
      return { ...prev, currentMissionIndex: clamped, selectedBuilding };
    }, true);
  }, [updateGameState]);

  // --- Gamepad connect/disconnect ---
  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      gamepadIndexRef.current = e.gamepad.index;
      updateGameState(prev => ({ ...prev, controlType: 'gamepad' }), true);
    };
    const onDisconnect = (e: GamepadEvent) => {
      if (gamepadIndexRef.current === e.gamepad.index) gamepadIndexRef.current = null;
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, [updateGameState]);

  // --- Keyboard input ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = gameStateRef.current;
      if (state.intro.active || state.controlType !== 'keyboard') return;
      keysPressed.current.add(e.code);
      if (e.code === 'KeyB') toggleBuildMode();
      if (e.code === 'Space') collectResource();
      if (e.code === 'Enter') placeBuilding();
      if (e.code === 'KeyX') demolishBuilding();
      if (e.code === 'KeyU') upgradeBuilding();
      if (e.code === 'Tab') cycleBuilding();
      if (e.code === 'KeyL') startSynthesizerProcess();
      if (e.code === 'F11' && e.ctrlKey) { e.preventDefault(); toggleFullscreen(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [collectResource, cycleBuilding, demolishBuilding, placeBuilding, startSynthesizerProcess, toggleBuildMode, toggleFullscreen]);

  // --- Save / Load / Quit ---
  const handleSaveGame = (slotIndex: number) => {
    const state = gameStateRef.current;
    const ti = state.stats.temperature + state.stats.pressure + state.stats.oxygen + state.stats.biomass;
    const stage = [...TERRAFORM_STAGES].reverse().find(s => ti >= s.ti) || TERRAFORM_STAGES[0];
    const metadata: SaveMetadata = { slotIndex, timestamp: new Date().toLocaleString('sk-SK'), ti, stageName: stage.name };
    localStorage.setItem(`mars_terraforming_save_slot_${slotIndex}`, JSON.stringify(state));
    localStorage.setItem(`mars_terraforming_meta_slot_${slotIndex}`, JSON.stringify(metadata));
    setHasSave(true);
  };

  const handleLoadGame = (slotIndex: number) => {
    setPendingLoadAction('LOAD_GAME');
    setPendingSlot(slotIndex);
    setIsLoading(true);
  };

  const executeLoadGame = (slotIndex: number) => {
    const saved = localStorage.getItem(`mars_terraforming_save_slot_${slotIndex}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.intro = { active: false, phase: 'FINISHED', progress: 1, startTime: 0 };
        if (!parsed.exploredChunks) parsed.exploredChunks = {};
        if (!parsed.harvesters) parsed.harvesters = [];
        if (!parsed.controlType) parsed.controlType = 'gamepad';
        gameStateRef.current = parsed;
        lastPlayerChunkRef.current = null;
        lastHarvesterChunksRef.current = new Map();
        syncUiState(true);
        lastRespawnTimeRef.current = parsed.time || 0;
        setGameStarted(true);
        sounds.resume();
      } catch (e) { console.error("Failed to load save", e); }
    }
  };

  const handleQuitGame = () => setGameStarted(false);

  // =========================================================================
  // GAME LOOP – orchestruje extrahované systémy
  // =========================================================================
  useEffect(() => {
    if (!gameStarted) return;
    let lastTime: number | null = null;
    let requestId: number;

    const frame = (time: number) => {
      try {
        if (lastTime === null) { lastTime = time; requestId = requestAnimationFrame(frame); return; }
        const dt = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;
        let prev = gameStateRef.current;

        const next = (() => {
          // --------- INTRO SEQUENCE ---------
          if (prev.intro.active) {
            let newPhase = prev.intro.phase;
            let newProgress = prev.intro.progress;
            let playerX = prev.player.x;
            let playerY = prev.player.y;

            if (newPhase === 'FALLING') {
              newProgress += dt * 0.2;
              if (newProgress >= 1) { newPhase = 'LANDED'; newProgress = 0; }
            } else if (newPhase === 'LANDED') {
              newProgress += dt * 1.5;
              if (newProgress >= 1) { newPhase = 'RAMP_EXTENDING'; newProgress = 0; }
            } else if (newPhase === 'RAMP_EXTENDING') {
              newProgress += dt * 0.8;
              if (newProgress >= 1) { newPhase = 'ROVER_EXITING'; newProgress = 0; }
            } else if (newPhase === 'ROVER_EXITING') {
              newProgress += dt * 0.5;
              const rocket = prev.envFeatures.find(f => f.type === 'rocket');
              if (rocket) {
                const rampLength = 112;
                const t = Math.min(1, newProgress);
                playerX = rocket.x + (Math.cos(rocket.rotation) * rampLength) * t + rocket.x * (1 - t) - rocket.x * (1 - t);
                playerX = rocket.x + Math.cos(rocket.rotation) * rampLength * t;
                playerY = rocket.y + Math.sin(rocket.rotation) * rampLength * t;
              }
              if (newProgress >= 1) {
                newPhase = 'FINISHED'; newProgress = 1;
                return { ...prev, player: { ...prev.player, x: playerX, y: playerY }, intro: { ...prev.intro, active: false, phase: 'FINISHED' } };
              }
            }
            return { ...prev, time: prev.time + dt, player: { ...prev.player, x: playerX, y: playerY }, intro: { ...prev.intro, phase: newPhase, progress: newProgress } };
          }

          // --------- MAIN GAME LOOP ---------
          const featureGrid = buildGrid<EnvFeature>(prev.envFeatures, f => f.x, f => f.y);
          const harvesterGrid = buildGrid<Harvester>(prev.harvesters, h => h.x, h => h.y);
          const rocket = prev.envFeatures.find(f => f.type === 'rocket');

          // isCraterAt helper
          const isCraterAt = (cx: number, cy: number) => someInRadius<EnvFeature>(featureGrid, cx, cy, 220, (f) => {
            if (f.type !== 'crater') return false;
            const dx = f.x - cx; const dy = f.y - cy;
            const r = f.size || 0;
            return (dx * dx + dy * dy) < (r * r);
          });

          // Closest building (for gamepad auto-select)
          const closestBuilding = prev.buildings.reduce((best, curr) => {
            const dx = curr.x - prev.player.x; const dy = curr.y - prev.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = (curr.type === BuildingType.REFINERY || curr.type === BuildingType.WATER_PUMP || curr.type === BuildingType.SYNTHESIZER) ? 120 : 100;
            if (dist < radius && dist < best.dist) return { id: curr.id, dist };
            return best;
          }, { id: null as string | null, dist: Infinity });

          // --------- PLAYER INPUT ---------
          let { x, y, rotation, health } = prev.player;
          let dx: number, dy: number;

          if (prev.controlType === 'keyboard') {
            dx = 0; dy = 0;
            if (keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp')) dy -= 1;
            if (keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown')) dy += 1;
            if (keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft')) dx -= 1;
            if (keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight')) dx += 1;
          } else if (prev.controlType === 'gamepad') {
            dx = 0; dy = 0;
            const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
            let gp: Gamepad | null = null;
            if (gamepadIndexRef.current !== null && pads[gamepadIndexRef.current]) {
              gp = pads[gamepadIndexRef.current] || null;
            } else {
              gp = (pads as (Gamepad | null)[]).find(p => p) || null;
              if (gp) gamepadIndexRef.current = gp.index;
            }
            if (gp) {
              const deadzone = 0.2;
              const axisX = Math.abs(gp.axes[0]) > deadzone ? gp.axes[0] : 0;
              const axisY = Math.abs(gp.axes[1]) > deadzone ? gp.axes[1] : 0;
              dx += axisX; dy += axisY;
              const buttons = gp.buttons ? gp.buttons.map(b => b.pressed) : [];
              const prevButtons = prevGamepadButtons.current || [];
              if (buttons.length > 0) {
                if (buttons[0] && !prevButtons[0]) prev = applyCollectResource(prev);
                if (buttons[1] && !prevButtons[1]) prev = applyToggleBuildMode(prev);
                if (buttons[2] && !prevButtons[2]) prev = applyCycleBuilding(prev);
                if (buttons[3] && !prevButtons[3]) prev = applyPlaceBuilding(prev);
                if (buttons.length > 4 && buttons[4] && !prevButtons[4]) prev = applyStartSynthesizerProcess(prev);
                if (buttons.length > 5 && buttons[5] && !prevButtons[5]) prev = applyDemolishBuilding(prev);
                if (buttons.length > 6 && buttons[6] && !prevButtons[6]) prev = applyUpgradeBuilding(prev, closestBuilding.id);
              }
              prevGamepadButtons.current = buttons;
            }
          } else { dx = 0; dy = 0; }

          const isMoving = dx !== 0 || dy !== 0;
          sounds.updateEngine(isMoving);

          // --------- PLAYER MOVEMENT & COLLISION ---------
          const isInsideRocket = rocket && Math.sqrt(Math.pow(rocket.x - x, 2) + Math.pow(rocket.y - y, 2)) < 40;
          if (isInsideRocket && health < PLAYER_MAX_HEALTH) { health = Math.min(PLAYER_MAX_HEALTH, health + REPAIR_RATE_PER_SEC * dt); }
          if (isMoving) {
            const angle = Math.atan2(dy, dx);
            const magnitude = Math.min(1, Math.sqrt(dx * dx + dy * dy));
            let speedMultiplier = 1.0;
            if (isCraterAt(x, y)) speedMultiplier = 0.3;
            const nextX = Math.max(0, Math.min(MAP_SIZE, x + Math.cos(angle) * PLAYER_SPEED * magnitude * speedMultiplier * dt));
            const nextY = Math.max(0, Math.min(MAP_SIZE, y + Math.sin(angle) * PLAYER_SPEED * magnitude * speedMultiplier * dt));
            const collidingHeavy = prev.creatures.find(c => c.type === 'heavy' && Math.sqrt(Math.pow(c.x - nextX, 2) + Math.pow(c.y - nextY, 2)) < 56);
            const collidingBuilding = prev.buildings.find(b => {
              const radius = (b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER) ? 75 : 50;
              return Math.sqrt(Math.pow(b.x - nextX, 2) + Math.pow(b.y - nextY, 2)) < radius;
            });
            const collidingHarvester = someInRadius<Harvester>(harvesterGrid, nextX, nextY, 70, (h) => {
              const hdx = h.x - nextX; const hdy = h.y - nextY;
              return (hdx * hdx + hdy * hdy) < 3600;
            });
            const collidingRocket = rocket && (() => {
              const dist = Math.sqrt(Math.pow(rocket.x - nextX, 2) + Math.pow(rocket.y - nextY, 2));
              const angleToRocket = Math.atan2(nextY - rocket.y, nextX - rocket.x);
              let diff = angleToRocket - rocket.rotation;
              while (diff < -Math.PI) diff += Math.PI * 2;
              while (diff > Math.PI) diff -= Math.PI * 2;
              const isOnRamp = Math.abs(diff) < 0.6 && dist < 110;
              const isInside = dist < 32;
              if (isOnRamp || isInside) return false;
              return dist < 70;
            })();
            if (!collidingHeavy && !collidingBuilding && !collidingRocket && !collidingHarvester) { x = nextX; y = nextY; }
            rotation = angle;
          }

          // --------- SYSTEMS ORCHESTRATION ---------
          const { hasPower } = calculatePowerBalance(prev.buildings);
          const updatedFeatures = updateIceMelt(prev.envFeatures, prev.stats.temperature, dt);
          const updatedProjectiles = updateProjectiles(prev.projectiles, dt);
          const creatureGrid = buildGrid<Creature>(prev.creatures, c => c.x, c => c.y);

          // Building system
          const rocketPos = rocket ? { x: rocket.x, y: rocket.y } : null;
          const buildResult = updateBuildings(prev.buildings, creatureGrid, dt, prev.time, hasPower, { x, y }, prev.harvesters, rocketPos);

          // Harvester system
          const reservedResourceIds = new Set<string>();
          prev.harvesters.forEach(h => { if (h.targetResourceId) reservedResourceIds.add(h.targetResourceId); });
          const availableCraters = prev.envFeatures.filter(f => {
            if (f.type !== 'crater' || !f.hasIce || (f.meltProgress || 0) < 0.5) return false;
            const gx = Math.floor(f.x / FOG_GRID_SIZE);
            const gy = Math.floor(f.y / FOG_GRID_SIZE);
            return !!prev.exploredChunks[`${gx}_${gy}`];
          });
          const allCraters = prev.envFeatures.filter(f => f.type === 'crater');
          const harvesterResult = updateHarvesters(
            prev.harvesters, buildResult.newHarvesters, buildResult.buildings,
            prev.discoveredResources, reservedResourceIds, availableCraters, allCraters,
            harvesterGrid, rocket, { x, y }, prev.exploredChunks, hasPower, dt, isCraterAt,
          );

          // Merge inventory additions
          const mergedAdditions: Record<string, number> = {};
          [buildResult.playerInventoryAdditions, harvesterResult.playerInventoryAdditions].forEach(adds => {
            Object.entries(adds).forEach(([type, amount]) => {
              if (amount) mergedAdditions[type] = (mergedAdditions[type] || 0) + (amount as number);
            });
          });
          const finalInventory = addResources(prev.player.inventory, mergedAdditions);

          // Fog of war
          const explored = prev.exploredChunks;
          const newPlayerChunk = updateFogOfWar(
            explored, x, y, FOG_REVEAL_RADIUS,
            lastPlayerChunkRef.current,
            harvesterResult.harvesters,
            lastHarvesterChunksRef.current,
          );
          lastPlayerChunkRef.current = newPlayerChunk;

          // Projectile hits
          const { hitProjectileIds, creatureHealthUpdates } = processHits(updatedProjectiles, creatureGrid);

          // Creature system
          const creatureResult = updateCreatures(
            prev.creatures, creatureHealthUpdates,
            { x, y }, rotation, isMoving,
            buildResult.buildings, dt,
            prev.currentMissionIndex, rocket,
          );
          let fH = health + creatureResult.playerHealthDelta;
          if (fH < 0) fH = 0;
          sounds.updateEngine(isMoving); // damage sound handled inside creature system
          if (creatureResult.playerHealthDelta < 0) sounds.playDamage();

          if (fH <= 0) { x = INITIAL_STATE.player.x; y = INITIAL_STATE.player.y; fH = PLAYER_MAX_HEALTH / 2; }

          // Resource respawn
          let nResources = harvesterResult.remainingResources;
          if (prev.time - lastRespawnTimeRef.current > RESOURCE_RESPAWN_INTERVAL) {
            lastRespawnTimeRef.current = prev.time;
            if (nResources.length < RESOURCE_SPAWN_COUNT * RESOURCE_RESPAWN_THRESHOLD) {
              nResources = [...nResources];
              const types = Object.values(ResourceType);
              for (let i = 0; i < 30 + Math.floor(Math.random() * 20); i++) {
                let rx: number, ry: number, dist: number, distR: number;
                do {
                  rx = Math.random() * MAP_SIZE; ry = Math.random() * MAP_SIZE;
                  dist = Math.sqrt(Math.pow(rx - x, 2) + Math.pow(ry - y, 2));
                  distR = Math.sqrt(Math.pow(rx - MAP_SIZE / 2, 2) + Math.pow(ry - MAP_SIZE / 2, 2));
                } while (dist < RESOURCE_SAFE_ZONE || distR < 300);
                nResources.push({ id: randomId(), x: rx, y: ry, type: types[Math.floor(Math.random() * types.length)] });
              }
            }
          }

          // Terraforming stats
          const newStats = updateTerraformingStats(buildResult.buildings, prev.stats, dt, hasPower);

          // Mission check
          let mIdx = prev.currentMissionIndex;
          const newKills = creatureResult.newKills;
          if (mIdx < MISSIONS.length && MISSIONS[mIdx].check({
            ...prev, buildings: buildResult.buildings,
            enemiesKilled: prev.enemiesKilled + newKills,
            stats: newStats,
          })) {
            if (MISSIONS[mIdx].successMessage) speech.speak(MISSIONS[mIdx].successMessage!, true);
            mIdx++;
          }

          const finalSelectedId = prev.controlType === 'gamepad' ? closestBuilding.id : prev.selectedBuildingId;

          return {
            ...prev,
            time: prev.time + dt,
            exploredChunks: explored,
            player: { ...prev.player, inventory: finalInventory, x, y, rotation, health: fH },
            creatures: creatureResult.creatures,
            buildings: buildResult.buildings,
            harvesters: harvesterResult.harvesters,
            envFeatures: updatedFeatures,
            projectiles: [...updatedProjectiles.filter(p => !hitProjectileIds.has(p.id)), ...buildResult.newProjectiles],
            discoveredResources: nResources,
            stats: newStats,
            currentMissionIndex: mIdx,
            selectedBuildingId: finalSelectedId,
            enemiesKilled: prev.enemiesKilled + newKills,
          };
        })();

        gameStateRef.current = next;
        syncUiState();
        requestId = requestAnimationFrame(frame);
      } catch (err) {
        console.error("CRITICAL FRAME ERROR: ", err);
        requestId = requestAnimationFrame(frame);
      }
    };

    requestId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(requestId); sounds.updateEngine(false); };
  }, [gameStarted, syncUiState]);

  // =========================================================================
  // RENDER
  // =========================================================================

  if (isLoading) {
    return <LoadingScreen onLoadComplete={handleFinishLoading} />;
  }

  if (!gameStarted) {
    return (
      <MainMenu
        hasSave={hasSave}
        onNewGame={() => {
          setPendingLoadAction('NEW_GAME');
          setIsLoading(true);
          sounds.playCollect();
        }}
        onContinue={() => {
          let newestSlot = 1;
          let newestTime = 0;
          for (let i = 1; i <= 5; i++) {
            const metaStr = localStorage.getItem(`mars_terraforming_meta_slot_${i}`);
            if (metaStr) {
              const meta = JSON.parse(metaStr);
              const time = new Date(meta.timestamp).getTime();
              if (time > newestTime) { newestTime = time; newestSlot = i; }
            }
          }
          handleLoadGame(newestSlot);
          sounds.playCollect();
        }}
      />
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <GameCanvas
        stateRef={gameStateRef}
        onSelectBuildingId={(id) => updateGameState(p => ({ ...p, selectedBuildingId: id, selectedBuilding: null }), true)}
      />
      <UIOverlay
        state={uiState}
        onSelectBuilding={(type) => updateGameState(p => {
          const unlocked = getUnlockedBuildings(p.currentMissionIndex);
          if (!unlocked.includes(type)) return p;
          return { ...p, selectedBuilding: type };
        }, true)}
        onSave={handleSaveGame}
        onLoad={handleLoadGame}
        onQuit={handleQuitGame}
        onDemolish={demolishBuilding}
        onUpgrade={upgradeBuilding}
        onToggleControls={() => updateGameState(p => ({ ...p, controlType: p.controlType === 'keyboard' ? 'gamepad' : 'keyboard' }), true)}
        onSetMissionIndex={handleSetMissionIndex}
      />
      <button
        onClick={() => handleMuteToggle(!isMuted)}
        className={`absolute top-8 right-72 pointer-events-auto bg-slate-900/90 border border-slate-700/50 hover:bg-slate-800 text-slate-400 p-4 rounded-xl shadow-xl active:scale-95 flex items-center gap-2 z-[60] ${uiState.intro.active ? 'opacity-0 pointer-events-none invisible' : 'opacity-100 transition-opacity duration-[3000ms]'}`}
      >
        {isMuted ? <span className="text-red-500 font-bold text-xs uppercase font-orbitron">Muted</span> : <span className="text-blue-400 font-bold text-xs uppercase font-orbitron">Audio On</span>}
      </button>
      <IntroOverlay intro={uiState.intro} />
    </div>
  );
};

export default App;
