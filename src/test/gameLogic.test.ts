import { describe, it, expect } from 'vitest';
import { BuildingType } from '../../types';
import { getUnlockedBuildings } from '../../constants';

describe('Herná logika - Odomykanie budov', () => {
  it('na začiatku hry (Misia 0) by mali byť odomknuté základné budovy', () => {
    const unlocked = getUnlockedBuildings(0);
    expect(unlocked).toContain(BuildingType.HEATER);
    expect(unlocked).toContain(BuildingType.SOLAR_PANEL);
    expect(unlocked).toContain(BuildingType.DRILL);
    expect(unlocked).toContain(BuildingType.LASER_TOWER);
    expect(unlocked.length).toBe(4);
  });

  it('v 6. misii by mali byť odomknuté aspoň 4 typy budov', () => {
    const unlocked = getUnlockedBuildings(5); // Misia index 5 je 6. misia
    expect(unlocked.length).toBeGreaterThanOrEqual(4);
    expect(unlocked).toContain(BuildingType.DRILL);
    expect(unlocked).toContain(BuildingType.SOLAR_PANEL);
  });

  it('v neskoršej fáze hry by mal byť odomknutý aj Skleník (VEGETUBE)', () => {
    const unlocked = getUnlockedBuildings(20);
    expect(unlocked).toContain(BuildingType.VEGETUBE);
  });
});
