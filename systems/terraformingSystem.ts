/**
 * Systém terraformovania – štatistiky, misie, topenie ľadu.
 * Extrahované z App.tsx game loopu.
 */

import { Building, EnvFeature, TerraformingStats, BuildingType } from '../types';
import {
  BUILDING_STATS,
  ICE_MELT_THRESHOLD_TEMP,
  ICE_MELT_RATE,
  UPGRADE_STATS,
} from '../constants';

// ---------------------------------------------------------------------------
// Terraforming stats update
// ---------------------------------------------------------------------------

export interface TerraformUpdateResult {
  stats: TerraformingStats;
}

/**
 * Prepočíta terraformačné štatistiky na základe aktívnych budov a ich kapacít.
 */
export const updateTerraformingStats = (
  buildings: Building[],
  prevStats: TerraformingStats,
  dt: number,
  hasPower: boolean,
): TerraformingStats => {
  let hG = 0;
  let pG = 0;
  let oG = 0;
  let bG = 0;
  let hCap = 0;
  let pCap = 0;
  let oCap = 0;
  let bCap = 0;

  buildings.forEach(b => {
    if (
      b.progress >= 1 &&
      b.health > 0.1 &&
      (hasPower || b.type === BuildingType.SOLAR_PANEL)
    ) {
      const baseStats = BUILDING_STATS[b.type];
      const levelStats =
        b.level && UPGRADE_STATS[b.type]?.[b.level]
          ? UPGRADE_STATS[b.type]![b.level]
          : {};
      const s = { ...baseStats, ...levelStats };
      if (s.heat) hG += s.heat;
      if (s.heatCap) hCap += s.heatCap;
      if (s.pressure) pG += s.pressure;
      if (s.pressureCap) pCap += s.pressureCap;
      if (s.oxygen) oG += s.oxygen;
      if (s.oxygenCap) oCap += s.oxygenCap;
      if (s.biomass) bG += s.biomass;
      if (s.biomassCap) bCap += s.biomassCap;
    }
  });

  let newTemp = prevStats.temperature;
  let newPress = prevStats.pressure;
  let newOxy = prevStats.oxygen;
  let newBio = prevStats.biomass;

  if (newTemp < hCap) newTemp = Math.min(hCap, newTemp + hG * dt);
  if (newPress < pCap) newPress = Math.min(pCap, newPress + pG * dt);
  if (newOxy < oCap) newOxy = Math.min(oCap, newOxy + oG * dt);
  if (newBio < bCap) newBio = Math.min(bCap, newBio + bG * dt);

  return {
    temperature: newTemp,
    pressure: newPress,
    oxygen: newOxy,
    biomass: newBio,
  };
};

// ---------------------------------------------------------------------------
// Ice melt
// ---------------------------------------------------------------------------

/**
 * Aktualizuje topenie ľadu v kráteroch na základe teploty.
 */
export const updateIceMelt = (
  features: EnvFeature[],
  temperature: number,
  dt: number,
): EnvFeature[] => {
  if (temperature <= ICE_MELT_THRESHOLD_TEMP) return features;

  return features.map(f => {
    if (f.type === 'crater' && f.hasIce && (f.meltProgress || 0) < 1) {
      const nextMelt = Math.min(1, (f.meltProgress || 0) + ICE_MELT_RATE * dt);
      return { ...f, meltProgress: nextMelt };
    }
    return f;
  });
};
