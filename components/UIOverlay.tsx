
// Fix: Fixed invalid arithmetic/comparison operations on resource indexing by using Record<string, number> casting for dynamic keys.
import React, { useState, useEffect, useMemo } from 'react';
import { GameState, ResourceType, BuildingType, SaveMetadata } from '../types';
import { BUILDING_COSTS, TERRAFORM_STAGES, BUILDING_STATS, MISSIONS, PLAYER_MAX_HEALTH, SYNTHESIZER_TIME, getUnlockedBuildings, UPGRADE_COSTS, UPGRADE_STATS } from '../constants';
import { Activity, Wind, Thermometer, Database, Box, Zap, Hammer, Cpu, Rocket, Menu as MenuIcon, Save, Play, LogOut, ShieldAlert, HeartPulse, Droplets, ChevronRight, FolderOpen, Clock, X, Trash2, Atom, Keyboard, Gamepad2, ArrowUpCircle } from 'lucide-react';

interface UIOverlayProps {
  state: GameState;
  onSelectBuilding: (type: BuildingType) => void;
  onSave: (slot: number) => void;
  onLoad: (slot: number) => void;
  onQuit: () => void;
  onDemolish: () => void;
  onUpgrade: () => void;
  onToggleControls: () => void;
  onSetMissionIndex: (index: number) => void;
}

type MenuMode = 'MAIN' | 'SAVE' | 'LOAD' | 'DEBUG';

const DEBUG_ERAS = [
  { label: 'Prežitie (M1)', index: 0 },
  { label: 'Industrializácia (M6)', index: 5 },
  { label: 'Voda (M11)', index: 10 },
  { label: 'Atmosféra (M16)', index: 15 },
  { label: 'Biosféra (M21)', index: 20 },
  { label: 'Kolonizácia (M26)', index: 25 },
];

const UIOverlay: React.FC<UIOverlayProps> = ({ state, onSelectBuilding, onSave, onLoad, onQuit, onDemolish, onUpgrade, onToggleControls, onSetMissionIndex }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>('MAIN');
  const [saveNotification, setSaveNotification] = useState(false);

  // Refresh save metadata when menu opens or mode changes
  const saveMetadata = useMemo(() => {
    if (!showMenu && !saveNotification) return {};
    const meta: Record<number, SaveMetadata | null> = {};
    for (let i = 1; i <= 5; i++) {
      const stored = localStorage.getItem(`mars_terraforming_meta_slot_${i}`);
      meta[i] = stored ? JSON.parse(stored) : null;
    }
    return meta;
  }, [showMenu, menuMode, saveNotification]);

  const ti = state.stats.temperature + state.stats.pressure + state.stats.oxygen + state.stats.biomass;
  const currentStage = [...TERRAFORM_STAGES].reverse().find(s => ti >= s.ti) || TERRAFORM_STAGES[0];
  const nextStage = TERRAFORM_STAGES[TERRAFORM_STAGES.indexOf(currentStage) + 1];

  const currentMission = MISSIONS[state.currentMissionIndex] || null;

  const selectedBuildingData = useMemo(() => {
    if (!state.selectedBuildingId) return null;
    return state.buildings.find(b => b.id === state.selectedBuildingId) || null;
  }, [state.selectedBuildingId, state.buildings]);

  // Fallback data pre panely ktoré sú v DOMe ale skryté (aby nepadli na null access)
  const renderBuildingData = selectedBuildingData || {
    type: BuildingType.SOLAR_PANEL,
    level: 1,
    health: 1,
    isProcessing: false,
    processingTimer: 0
  };

  const powerBalance = useMemo(() => {
    let totalGen = 0;
    let totalReq = 0;
    state.buildings.forEach(b => {
      if (b.progress >= 1 && b.health > 0.1) {
        const baseStats = BUILDING_STATS[b.type];
        const levelStats = b.level && UPGRADE_STATS[b.type]?.[b.level] ? UPGRADE_STATS[b.type][b.level] : {};
        const stats = { ...baseStats, ...levelStats };
        if (stats.power) totalGen += stats.power;
        if (stats.powerReq) totalReq += stats.powerReq;
      }
    });
    const usagePercent = totalGen > 0 ? (totalReq / totalGen) * 100 : (totalReq > 0 ? 100 : 0);
    return { gen: totalGen, req: totalReq, isShortage: totalReq > totalGen, usagePercent };
  }, [state.buildings]);

  const handleSlotAction = (slot: number) => {
    if (menuMode === 'SAVE') {
      onSave(slot);
      setSaveNotification(true);
      setTimeout(() => setSaveNotification(false), 3000);
      setMenuMode('MAIN');
    } else if (menuMode === 'LOAD') {
      onLoad(slot);
      setShowMenu(false);
      setMenuMode('MAIN');
    }
  };

  const healthPercentage = (state.player.health / PLAYER_MAX_HEALTH) * 100;

  const canAffordSynthesis = useMemo(() => {
    const inv = state.player.inventory;
    const cands = [
      inv[ResourceType.SILICON] || 0,
      inv[ResourceType.MAGNESIUM] || 0,
      inv[ResourceType.TITANIUM] || 0,
    ].sort((a, b) => b - a);
    return cands[0] >= 1 && cands[1] >= 1;
  }, [state.player.inventory]);

  // Pre-computed data pre build menu – zabráni opakovanému volaniu getUnlockedBuildings
  const buildMenuData = useMemo(() => {
    const unlocked = getUnlockedBuildings(state.currentMissionIndex);
    return unlocked.map((type) => ({
      type,
      costs: BUILDING_COSTS[type],
    }));
  }, [state.currentMissionIndex]);

  // Memoizovaný inventory record – zabráni opakovanému castovaniu v každom renderovaní tlačidla
  const inventoryRecord = useMemo(
    () => state.player.inventory as unknown as Record<string, number>,
    [state.player.inventory]
  );

  // Rocket Beacon Logic
  const rocketBeaconPos = useMemo(() => {
    if (!state.isBuildMode) return null;
    const rocket = state.envFeatures.find(f => f.type === 'rocket');
    if (!rocket) return null;

    const dx = rocket.x - state.player.x;
    const dy = rocket.y - state.player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Only show if rocket is significantly away (off-screen roughly)
    if (dist < 400) return null;

    const angle = Math.atan2(dy, dx);
    // Adjusted margin to 15px for "absolute edge" placement
    const margin = 15;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width / 2;
    const centerY = height / 2;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let x, y;
    // Boundary check for screen edges
    const screenAspect = (width / 2 - margin) / (height / 2 - margin);
    const targetAspect = Math.abs(cosA / sinA);

    if (targetAspect > screenAspect) {
      // Hits left/right
      x = cosA > 0 ? width - margin : margin;
      y = centerY + (x - centerX) * (sinA / cosA);
    } else {
      // Hits top/bottom
      y = sinA > 0 ? height - margin : margin;
      x = centerX + (y - centerY) * (cosA / sinA);
    }

    return { x, y, angle };
  }, [state.player.x, state.player.y, state.isBuildMode, state.envFeatures]);

  return (
    <div className={`absolute inset-0 pointer-events-none flex flex-col justify-between p-8 text-slate-100 font-rajdhani ${state.intro.active ? 'opacity-0 invisible' : 'opacity-100 transition-opacity duration-[3000ms]'}`}>
      {/* ROCKET BEACON INDICATOR - 60% TRANSPARENT TRIANGLE ON THE EDGE */}
      {rocketBeaconPos && (
        <div
          className="absolute z-[100] transition-opacity duration-300"
          style={{
            left: rocketBeaconPos.x,
            top: rocketBeaconPos.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div
            className="w-8 h-8 bg-red-600 opacity-40 animate-pulse"
            style={{
              clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
              transform: `rotate(${rocketBeaconPos.angle + Math.PI / 2}rad)`,
              filter: 'drop-shadow(0 0 5px rgba(220, 38, 38, 0.8))'
            }}
          />
        </div>
      )}

      <div className="flex justify-between items-start">
        {/* COMPACT STATS PANEL - SCALED UP BY 25% */}
        <div className="flex flex-col gap-5">
          <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-700/50 p-5 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] space-y-5 pointer-events-auto min-w-[350px] max-w-[375px] border-l-[5px] border-l-blue-500/50">
            
            {/* VITALITY ROW: INTEGRITY & POWER */}
            <div className="flex gap-4">
              <div className="flex-1 space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-2"><HeartPulse className={`w-4 h-4 ${healthPercentage < 30 ? 'text-red-500 animate-pulse' : 'text-red-400'}`} /> Integrita</span>
                  <span className={healthPercentage < 30 ? 'text-red-400' : 'text-slate-200'}>{Math.round(state.player.health)}%</span>
                </div>
                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                  <div className={`h-full transition-all duration-500 ${healthPercentage < 30 ? 'bg-red-500' : (healthPercentage < 60 ? 'bg-amber-500' : 'bg-red-400')}`} style={{ width: `${healthPercentage}%` }} />
                </div>
              </div>

              <div className="flex-1 space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-2"><Zap className={`w-4 h-4 ${powerBalance.isShortage ? 'text-amber-500 animate-pulse' : 'text-amber-400'}`} /> Sieť</span>
                  <span className={powerBalance.isShortage ? 'text-red-400' : 'text-blue-400'}>{powerBalance.req}/{powerBalance.gen}W</span>
                </div>
                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
                  <div className={`h-full transition-all duration-700 ${powerBalance.isShortage ? 'bg-red-600 animate-pulse' : (powerBalance.usagePercent > 85 ? 'bg-amber-500' : 'bg-blue-400')}`} style={{ width: `${Math.min(100, powerBalance.usagePercent)}%` }} />
                </div>
              </div>
            </div>

            {/* MONITORING GRID: TEXT-BASED */}
            <div className="grid grid-cols-2 gap-y-4 gap-x-5 pt-3 border-t border-slate-800/60">
              <div className="flex flex-col">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-red-400/70 mb-1">Teplota</span>
                <span className="text-lg font-orbitron font-bold text-slate-100">{state.stats.temperature.toFixed(2)}<span className="text-[11px] ml-1 text-slate-500 font-mono">K</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-yellow-400/70 mb-1">Tlak</span>
                <span className="text-lg font-orbitron font-bold text-slate-100">{state.stats.pressure.toFixed(2)}<span className="text-[11px] ml-1 text-slate-500 font-mono">Pa</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-cyan-400/70 mb-1">Kyslík</span>
                <span className="text-lg font-orbitron font-bold text-slate-100">{state.stats.oxygen.toFixed(2)}<span className="text-[11px] ml-1 text-slate-500 font-mono">ppm</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-green-400/70 mb-1">Biomasa</span>
                <span className="text-lg font-orbitron font-bold text-slate-100">{state.stats.biomass.toFixed(2)}<span className="text-[11px] ml-1 text-slate-500 font-mono">g</span></span>
              </div>
            </div>

            {/* MINIMALIST ERA TRACKER */}
            <div className="pt-3 border-t border-slate-800/40">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[11px] font-orbitron font-bold text-blue-400 uppercase tracking-widest">{currentStage.name}</span>
                <span className="text-[10px] font-mono font-bold text-slate-500">TI: {ti.toFixed(0)} <span className="opacity-40">/ {nextStage?.ti || 'MAX'}</span></span>
              </div>
              <div className="h-1 bg-slate-950 w-full rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 shadow-[0_0_10px_rgba(37,99,235,0.5)]" style={{ width: nextStage ? `${Math.min(100, (ti / nextStage.ti) * 100)}%` : '100%' }} />
              </div>
            </div>
          </div>

          {currentMission && (
            <div className="bg-blue-600/5 backdrop-blur-lg border border-blue-500/20 p-5 rounded-xl shadow-xl pointer-events-auto max-w-[350px]">
              <div className="flex items-center gap-2.5 mb-2 opacity-70">
                <Rocket className="w-4 h-4 text-blue-400 animate-pulse" />
                <h3 className="font-orbitron text-[10px] text-blue-300 uppercase tracking-widest">Misia v Priebehu</h3>
              </div>
              <p className="text-sm font-bold text-white mb-1 leading-tight">{currentMission.title}</p>
              <p className="text-[11px] text-slate-400 italic mb-3 leading-tight line-clamp-2">"{currentMission.description}"</p>
              <div className="bg-blue-500/10 px-3 py-2 rounded border border-blue-500/10">
                <p className="text-xs text-slate-200 font-medium">{currentMission.goal}</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT ACTIONS */}
        <div className="flex flex-col items-end gap-6 relative">
          <div className="flex gap-4 z-20 relative">
            {saveNotification && (
              <div className="bg-blue-500 border border-blue-400 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg uppercase tracking-widest flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                <Save className="w-4 h-4" /> Hra bola uložená
              </div>
            )}
            <button
              onClick={() => { setShowMenu(!showMenu); setMenuMode('MAIN'); }}
              className="pointer-events-auto bg-slate-900/90 border border-blue-500/50 hover:bg-blue-600/20 text-blue-400 p-4 rounded-xl shadow-xl transition-all active:scale-95 flex items-center gap-3 font-orbitron text-xs uppercase tracking-widest"
            >
              <MenuIcon className="w-5 h-5" /> Systémové menu
            </button>
          </div>

          <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/50 p-6 rounded-2xl shadow-2xl pointer-events-auto min-w-[220px]">
            <h2 className="font-orbitron text-amber-500 text-[10px] tracking-widest mb-4 flex items-center gap-3 border-b border-slate-800 pb-3 uppercase">
              <Box className="w-4 h-4" /> Zásoby surovín
            </h2>
            <div className="space-y-3">
              {Object.entries(state.player.inventory).map(([res, count]) => (
                <div key={res} className="flex justify-between items-center text-base">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">{res}</span>
                  <span className={`font-mono font-bold text-lg ${(count as number) > 0 ? 'text-slate-100' : 'text-slate-600'}`}>{count as number}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SYNTHESIZER PANEL */}
          <div className={`bg-blue-950/40 backdrop-blur-lg border border-blue-500/30 p-5 rounded-2xl shadow-xl pointer-events-auto w-[320px] transition-all duration-300 ${selectedBuildingData?.type === BuildingType.SYNTHESIZER ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-10 scale-95 pointer-events-none invisible absolute right-0'}`}>
            <div className="flex items-center gap-3 mb-2">
              <Atom className="w-5 h-5 text-blue-400 animate-pulse" />
              <h3 className="font-orbitron text-[10px] text-blue-300 uppercase tracking-widest">Molekulárna Syntéza</h3>
            </div>
            <p className="text-lg font-bold text-white mb-2 leading-tight">A-4 "Alchymista"</p>

            <div className="space-y-3 mb-4">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 space-y-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Aktuálny recept (Dve najväčšie zásoby):</p>
                <div className="flex gap-2 justify-between">
                  {(() => {
                    const inv = state.player.inventory;
                    const cands = [
                      { type: ResourceType.SILICON, label: 'Si', color: 'blue', count: inv[ResourceType.SILICON] || 0 },
                      { type: ResourceType.MAGNESIUM, label: 'Mg', color: 'amber', count: inv[ResourceType.MAGNESIUM] || 0 },
                      { type: ResourceType.TITANIUM, label: 'Ti', color: 'slate', count: inv[ResourceType.TITANIUM] || 0 },
                    ].sort((a, b) => b.count - a.count);

                    const selectedTypes = [cands[0].type, cands[1].type];

                    return [
                      { type: ResourceType.SILICON, label: 'Si', color: 'blue', text: 'text-blue-300' },
                      { type: ResourceType.MAGNESIUM, label: 'Mg', color: 'amber', text: 'text-amber-300' },
                      { type: ResourceType.TITANIUM, label: 'Ti', color: 'slate', text: 'text-slate-200' },
                    ].map(res => {
                      const isSelected = selectedTypes.includes(res.type) && inv[res.type] >= 1;
                      const hasSome = inv[res.type] >= 1;
                      
                      return (
                        <div key={res.type} className={`flex flex-col items-center gap-1 transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-30'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${isSelected ? `border-${res.color}-500/40 bg-${res.color}-500/20` : 'border-white/5 bg-white/5'}`}>
                            <span className={`text-[10px] ${isSelected ? res.text : 'text-slate-500'}`}>{res.label}</span>
                          </div>
                          <span className="text-[9px] text-slate-500">{isSelected ? '1x' : '0x'}</span>
                        </div>
                      );
                    });
                  })()}
                  <div className="flex items-center text-slate-600 font-bold mx-1">→</div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-green-500/40 bg-green-500/10">
                      <span className="text-[10px] text-green-400 font-bold">Fe</span>
                    </div>
                    <span className="text-[9px] text-slate-500">1x</span>
                  </div>
                </div>
              </div>
            </div>

            {renderBuildingData.isProcessing ? (
              <div className="w-full py-3 bg-blue-900/40 rounded-xl text-xs font-orbitron font-bold uppercase text-blue-400 flex flex-col items-center gap-2">
                <span>Spracúvam...</span>
                <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-100"
                    style={{ width: `${(1 - ((renderBuildingData.processingTimer || 0) / SYNTHESIZER_TIME)) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                disabled={!canAffordSynthesis}
                onClick={() => onSelectBuilding(renderBuildingData.type)}
                className={`w-full py-4 transition-all rounded-xl text-xs font-orbitron font-bold uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg ${canAffordSynthesis ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50 active:scale-95' : 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed grayscale'}`}
              >
                <Cpu className="w-4 h-4" /> Spustiť Syntézu (L / LB)
              </button>
            )}

            <p className="text-[9px] text-slate-500 mt-3 text-center uppercase font-bold tracking-widest opacity-60">Sektor Spracovania Materiálov</p>
          </div>

          {/* UPGRADE PANEL */}
          <div className={`bg-emerald-950/40 backdrop-blur-lg border border-emerald-500/30 p-5 rounded-2xl shadow-xl pointer-events-auto w-[320px] transition-all duration-300 ${selectedBuildingData && UPGRADE_COSTS[renderBuildingData.type]?.[(renderBuildingData.level || 1) + 1] ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-10 scale-95 pointer-events-none invisible absolute right-0'}`}>
            <div className="flex items-center gap-3 mb-2">
              <ArrowUpCircle className="w-5 h-5 text-emerald-500 animate-pulse" />
              <h3 className="font-orbitron text-[10px] text-emerald-400 uppercase tracking-widest">Upgrade Systémov</h3>
            </div>
            <p className="text-lg font-bold text-white mb-2 leading-tight">Úroveň {(renderBuildingData.level || 1) + 1}</p>
            
            <div className="space-y-3 mb-4">
              <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/10">
                <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-tighter mb-1">Náklady na upgrade:</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(UPGRADE_COSTS[renderBuildingData.type]?.[(renderBuildingData.level || 1) + 1] || {}).map(([res, amt]) => {
                    const inv = state.player.inventory as unknown as Record<string, number>;
                    const hasEnough = (inv[res] || 0) >= (amt as number);
                    return (
                      <div key={res} className={`px-2 py-0.5 rounded text-[10px] font-mono border ${hasEnough ? 'bg-slate-900/50 border-white/5 text-slate-100' : 'bg-red-900/20 border-red-500/20 text-red-400'}`}>
                        {res}: <span className={hasEnough ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{amt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/10">
                <p className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter mb-1">Zlepšenie:</p>
                <div className="text-xs text-blue-200">
                  {Object.entries(UPGRADE_STATS[renderBuildingData.type]?.[(renderBuildingData.level || 1) + 1] || {}).map(([stat, val]) => (
                    <div key={stat} className="flex justify-between">
                      <span className="capitalize">{stat}:</span>
                      <span className="font-bold text-white">+{val as number - (BUILDING_STATS[renderBuildingData.type]?.[stat] || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(() => {
              const costs = UPGRADE_COSTS[renderBuildingData.type]?.[(renderBuildingData.level || 1) + 1] || {};
              const inv = state.player.inventory as unknown as Record<string, number>;
              const canAfford = Object.entries(costs).every(([res, amt]) => (inv[res] || 0) >= (amt as number));
              
              return (
                <button
                  onClick={onUpgrade}
                  disabled={!canAfford}
                  className={`w-full py-3 transition-all rounded-xl text-xs font-orbitron font-bold uppercase tracking-widest flex items-center justify-center gap-3 border shadow-lg ${canAfford ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50 active:scale-95' : 'bg-slate-800 text-slate-500 border-white/5 cursor-not-allowed grayscale'}`}
                >
                  <ArrowUpCircle className="w-4 h-4" /> Vylepšiť (U / LT)
                </button>
              );
            })()}
          </div>

          {/* DEMOLITION PANEL */}
          <div className={`bg-red-950/40 backdrop-blur-lg border border-red-500/30 p-5 rounded-2xl shadow-xl pointer-events-auto w-[320px] transition-all duration-300 ${selectedBuildingData ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-10 scale-95 pointer-events-none invisible absolute right-0'}`}>
            <div className="flex items-center gap-3 mb-2">
              <Trash2 className="w-5 h-4 text-red-500 animate-pulse" />
              <h3 className="font-orbitron text-[10px] text-red-400 uppercase tracking-widest">Recyklácia Budovy</h3>
            </div>
            <p className="text-lg font-bold text-white mb-2 leading-tight">{renderBuildingData.type}</p>

            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 uppercase font-bold tracking-tighter">Stav integrity:</span>
                <span className={`font-mono font-bold ${renderBuildingData.health < 0.4 ? 'text-red-400' : 'text-green-400'}`}>
                  {Math.round(renderBuildingData.health * 100)}%
                </span>
              </div>
              <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/10">
                <p className="text-[9px] font-bold text-red-400 uppercase tracking-tighter mb-1">Návratnosť surovín (50%):</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(BUILDING_COSTS[renderBuildingData.type] || {}).map(([res, amt]) => {
                    const recover = Math.floor(Number(amt) * 0.5 * (renderBuildingData.health || 0));
                    return (
                      <div key={res} className="bg-slate-900/50 px-2 py-0.5 rounded text-[10px] font-mono border border-white/5">
                        {res}: <span className="text-green-400 font-bold">+{recover}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={onDemolish}
              className="w-full py-3 bg-red-600 hover:bg-red-500 transition-colors rounded-xl text-xs font-orbitron font-bold uppercase tracking-widest flex items-center justify-center gap-3 border border-red-400/50 shadow-lg active:scale-95"
            >
              <Trash2 className="w-4 h-4" /> Recyklovať (X / RB)
            </button>
          </div>
        </div>
      </div>

      {/* SYSTEM MENU DIALOG */}
      {showMenu && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-50 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-[500px] bg-slate-900 border border-white/10 rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col p-10 space-y-8 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center border-b border-slate-800 pb-6">
              <div className="space-y-1">
                <h3 className="font-orbitron text-blue-400 text-2xl uppercase tracking-widest font-bold">
                  {menuMode === 'MAIN' ? 'SYSTÉMOVÉ MENU' : menuMode === 'SAVE' ? 'ULOŽIŤ POZÍCIU' : menuMode === 'LOAD' ? 'NAHRAŤ POZÍCIU' : 'DEBUG: ERA'}
                </h3>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.3em]">AIVA-OS v4.3 // SEKTOR-9</p>
              </div>
              {menuMode !== 'MAIN' && (
                <button
                  onClick={() => setMenuMode('MAIN')}
                  className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {menuMode === 'MAIN' ? (
                <>
                  <button onClick={onToggleControls} key="debug-ctrl" className="group py-5 bg-slate-800 hover:bg-emerald-600 transition-all rounded-2xl flex items-center justify-center gap-4 text-base font-orbitron font-bold uppercase tracking-widest border border-white/5 relative">
                    {state.controlType === 'keyboard' ? (
                      <>
                        <Keyboard className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="flex flex-col items-center">
                          <span>Klávesnica</span>
                          <span className="text-[8px] opacity-40">Kliknutím prepni na Gamepad</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <Gamepad2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="flex flex-col items-center">
                          <span>Gamepad</span>
                          <span className="text-[8px] opacity-40">Kliknutím prepni na Klávesnicu</span>
                        </span>
                      </>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${state.controlType === 'keyboard' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
                      <div className={`w-1.5 h-1.5 rounded-full ${state.controlType === 'gamepad' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
                    </div>
                  </button>
                  <button onClick={() => setShowMenu(false)} className="group py-5 bg-slate-800 hover:bg-blue-600 transition-all rounded-2xl flex items-center justify-center gap-4 text-base font-orbitron font-bold uppercase tracking-widest border border-white/5">
                    <Play className="w-5 h-5 group-hover:scale-110 transition-transform" /> Pokračovať
                  </button>
                  <button onClick={() => setMenuMode('SAVE')} className="group py-5 bg-slate-800 hover:bg-amber-600 transition-all rounded-2xl flex items-center justify-center gap-4 text-base font-orbitron font-bold uppercase tracking-widest border border-white/5">
                    <Save className="w-5 h-5 group-hover:scale-110 transition-transform" /> Uložiť hru
                  </button>
                  <button onClick={() => setMenuMode('LOAD')} className="group py-5 bg-slate-800 hover:bg-cyan-600 transition-all rounded-2xl flex items-center justify-center gap-4 text-base font-orbitron font-bold uppercase tracking-widest border border-white/5">
                    <FolderOpen className="w-5 h-5 group-hover:scale-110 transition-transform" /> Nahrať hru
                  </button>

                  <button onClick={() => setMenuMode('DEBUG')} className="group py-5 bg-slate-800 hover:bg-indigo-600 transition-all rounded-2xl flex items-center justify-center gap-4 text-base font-orbitron font-bold uppercase tracking-widest border border-white/5">
                    <Atom className="w-5 h-5 group-hover:scale-110 transition-transform" /> Debug: Era
                  </button>

                  <button onClick={onQuit} className="group py-5 bg-red-950/40 hover:bg-red-600 transition-all rounded-2xl flex items-center justify-center gap-4 text-base font-orbitron font-bold uppercase tracking-widest border border-red-500/20 text-red-400 hover:text-white">
                    <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" /> Ukončiť hru
                  </button>

                  {/* CONTROLS INFO SECTION */}
                  <div className="mt-4 p-5 bg-slate-950/50 border border-white/5 rounded-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                      <p className="font-orbitron text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ovládanie ({state.controlType === 'keyboard' ? 'Klávesnica' : 'Gamepad'})</p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {state.controlType === 'keyboard' ? (
                        <>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Pohyb</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">WASD / Šípky</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Stavba</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">B</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Zber</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">Space</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Postaviť</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">Enter</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Prepínanie</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">Tab</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Recyklácia</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">X</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Syntéza</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">L</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Fullscr.</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">C+F11</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Pohyb</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">L-Stick</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Zber</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">A</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Stavba</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">B</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Prepínanie</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">X</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Postaviť</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">Y</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Syntéza</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">LB</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Vylepšiť</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">LT</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-800/20 p-2 rounded-lg border border-white/5">
                            <span className="text-[9px] text-slate-500 font-bold uppercase">Recyklácia</span>
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 bg-slate-800 rounded">RB</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : menuMode === 'DEBUG' ? (
                <div className="space-y-4">
                  <div className="text-[11px] text-slate-400 uppercase font-bold tracking-widest">Dočasné Dev Ovládanie</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Nastaví aktuálnu éru (odomykanie budov) bez dlhého hrania
                  </div>
                  <div className="flex flex-col gap-3">
                    {DEBUG_ERAS.map(era => {
                      const title = MISSIONS[era.index]?.title || `Misia ${era.index + 1}`;
                      return (
                        <button
                          key={era.index}
                          onClick={() => {
                            onSetMissionIndex(era.index);
                            setShowMenu(false);
                            setMenuMode('MAIN');
                          }}
                          className="group py-4 bg-slate-800 hover:bg-indigo-600 transition-all rounded-2xl flex flex-col items-center justify-center gap-1 text-sm font-orbitron font-bold uppercase tracking-widest border border-white/5"
                        >
                          <span className="text-slate-100">{era.label}</span>
                          <span className="text-[10px] text-slate-400 font-mono normal-case">{title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {[1, 2, 3, 4, 5].map((slot) => {
                    const meta = saveMetadata[slot];
                    const isEmpty = !meta;
                    const canClick = menuMode === 'SAVE' || (menuMode === 'LOAD' && !isEmpty);
                    return (
                      <button key={slot} disabled={!canClick} onClick={() => handleSlotAction(slot)} className={`w-full p-5 rounded-2xl border transition-all flex items-center justify-between text-left group ${canClick ? 'hover:translate-x-2 cursor-pointer' : 'opacity-40 cursor-not-allowed'} ${isEmpty ? 'bg-slate-900 border-slate-800' : 'bg-slate-800 border-white/5 hover:border-blue-500/50 hover:bg-slate-700'}`}>
                        <div className="flex items-center gap-5">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-orbitron font-bold text-xl ${isEmpty ? 'bg-slate-800 text-slate-600' : 'bg-blue-500/20 text-blue-400'}`}>{slot}</div>
                          <div>
                            {isEmpty ? <p className="font-orbitron text-slate-600 text-sm tracking-widest uppercase">Prázdny Slot</p> : (
                              <>
                                <p className="font-orbitron text-white text-sm tracking-widest uppercase mb-1">Pozícia {slot}</p>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase">
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {meta.timestamp}</span>
                                  <span className="flex items-center gap-1 text-blue-400"><Activity className="w-3 h-3" /> Úroveň: {meta.ti.toFixed(0)}</span>
                                </div>
                                <p className="text-[10px] text-amber-500 uppercase font-black tracking-tighter mt-1">{meta.stageName}</p>
                              </>
                            )}
                          </div>
                        </div>
                        {canClick && <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-blue-400 transition-colors" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-600 uppercase tracking-widest pt-4 border-t border-slate-800 text-center">AIVA-OS v4.2 // DEEP SPACE EXPLORATION // PROTOCOL MARS</p>
          </div>
        </div>
      )}

      {/* FOOTER - COMPACT BUILD MENU */}
      <div className="flex justify-between items-end">
        <div className="flex-1 flex justify-center px-6">
          <div className={`flex gap-2 p-3 bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-3xl pointer-events-auto transition-all ${state.isBuildMode ? 'opacity-100 translate-y-0 scale-100 shadow-[0_0_40px_rgba(59,130,246,0.15)]' : 'opacity-40 translate-y-4 scale-50 shadow-none'}`}>
            {buildMenuData.map(({ type, costs }) => {
              const canAfford = Object.entries(costs).every(([res, amt]) => (Number(inventoryRecord[res] || 0)) >= Number(amt));
              const isSelected = state.selectedBuilding === type;
              return (
                <button key={type} onClick={() => onSelectBuilding(type)} className={`group relative p-3 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all min-w-[95px] ${isSelected ? 'border-blue-500 bg-blue-500/10 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'} ${!canAfford ? 'opacity-40 grayscale cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1.5'}`}>
                  <span className={`text-[10px] font-orbitron font-bold uppercase tracking-tight ${isSelected ? 'text-blue-400' : 'text-slate-400'}`}>{type}</span>
                  <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                    {Object.entries(costs).map(([res, amt]) => (
                      <div key={res} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${(Number(inventoryRecord[res] || 0)) >= Number(amt) ? 'bg-slate-800 text-slate-300' : 'bg-red-900/20 text-red-400'}`}>{res[0]}:{amt}</div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UIOverlay;
