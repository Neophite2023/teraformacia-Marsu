import { describe, it, expect } from 'vitest';
import { ResourceType } from '../../types';
import { canAfford, deductCost, addResource, addResources, calculateRecovery } from '../../utils/inventory';

const emptyInventory = () => ({
  [ResourceType.IRON]: 0,
  [ResourceType.SILICON]: 0,
  [ResourceType.MAGNESIUM]: 0,
  [ResourceType.TITANIUM]: 0,
});

const filledInventory = () => ({
  [ResourceType.IRON]: 10,
  [ResourceType.SILICON]: 5,
  [ResourceType.MAGNESIUM]: 3,
  [ResourceType.TITANIUM]: 7,
});

describe('Inventory utility - canAfford', () => {
  it('vracia true ak má hráč dosť surovín', () => {
    const inv = filledInventory();
    expect(canAfford(inv, { [ResourceType.IRON]: 5 })).toBe(true);
  });

  it('vracia false ak hráč nemá dosť surovín', () => {
    const inv = filledInventory();
    expect(canAfford(inv, { [ResourceType.IRON]: 20 })).toBe(false);
  });

  it('vracia true pre prázdny cost', () => {
    const inv = emptyInventory();
    expect(canAfford(inv, {})).toBe(true);
  });

  it('kontroluje všetky suroviny v nákladoch', () => {
    const inv = filledInventory();
    expect(canAfford(inv, {
      [ResourceType.IRON]: 5,
      [ResourceType.SILICON]: 5,
      [ResourceType.MAGNESIUM]: 5,  // Má iba 3!
    })).toBe(false);
  });
});

describe('Inventory utility - deductCost', () => {
  it('správne odpočíta náklady', () => {
    const inv = filledInventory();
    const result = deductCost(inv, { [ResourceType.IRON]: 3, [ResourceType.SILICON]: 2 });
    expect((result as unknown as Record<string, number>)[ResourceType.IRON]).toBe(7);
    expect((result as unknown as Record<string, number>)[ResourceType.SILICON]).toBe(3);
  });

  it('nemutuje pôvodný inventár', () => {
    const inv = filledInventory();
    deductCost(inv, { [ResourceType.IRON]: 3 });
    expect(inv[ResourceType.IRON]).toBe(10);
  });
});

describe('Inventory utility - addResource', () => {
  it('správne pridá surovinu', () => {
    const inv = emptyInventory();
    const result = addResource(inv, ResourceType.IRON, 5);
    expect(result[ResourceType.IRON]).toBe(5);
  });

  it('nemutuje pôvodný inventár', () => {
    const inv = emptyInventory();
    addResource(inv, ResourceType.IRON, 5);
    expect(inv[ResourceType.IRON]).toBe(0);
  });
});

describe('Inventory utility - addResources', () => {
  it('správne pridá viaceré suroviny', () => {
    const inv = emptyInventory();
    const result = addResources(inv, {
      [ResourceType.IRON]: 3,
      [ResourceType.SILICON]: 2,
    });
    expect((result as unknown as Record<string, number>)[ResourceType.IRON]).toBe(3);
    expect((result as unknown as Record<string, number>)[ResourceType.SILICON]).toBe(2);
  });
});

describe('Inventory utility - calculateRecovery', () => {
  it('vracia 50% surovín pri plnom zdraví', () => {
    const cost = { [ResourceType.IRON]: 10, [ResourceType.SILICON]: 6 };
    const result = calculateRecovery(cost, 1.0, 0.5);
    expect(result[ResourceType.IRON]).toBe(5);
    expect(result[ResourceType.SILICON]).toBe(3);
  });

  it('vracia menej surovín pri nižšom zdraví', () => {
    const cost = { [ResourceType.IRON]: 10 };
    const result = calculateRecovery(cost, 0.5);
    expect(result[ResourceType.IRON]).toBe(2); // floor(10 * 0.5 * 0.5) = 2
  });
});
