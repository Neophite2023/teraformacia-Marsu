/**
 * Typovo bezpečné operácie nad inventárom surovín.
 * Odstraňuje opakované `as unknown as Record<string, number>` casty z App.tsx a UIOverlay.tsx.
 */

import { Resources, ResourceType } from '../types';

/** Typový alias pre nákladové definície budov. */
export type Cost = Record<string, number>;

/** Bezpečne získa počet surovín daného typu. */
export const getResourceCount = (inventory: Resources, type: ResourceType): number =>
  (inventory as unknown as Record<string, number>)[type] || 0;

/** Skontroluje, či inventár pokrýva všetky náklady. */
export const canAfford = (inventory: Resources, cost: Cost): boolean =>
  Object.entries(cost).every(
    ([res, amt]) => ((inventory as unknown as Record<string, number>)[res] || 0) >= amt,
  );

/**
 * Odpočíta náklady z inventáru. Vracia novú kópiu.
 * POZOR: Nekontroluje dostupnosť – volajúci má predtým zavolať `canAfford`.
 */
export const deductCost = (inventory: Resources, cost: Cost): Resources => {
  const newInventory = { ...inventory };
  const ref = newInventory as unknown as Record<string, number>;
  Object.entries(cost).forEach(([res, amt]) => {
    ref[res] = (ref[res] || 0) - amt;
  });
  return newInventory;
};

/** Pridá suroviny do inventáru. Vracia novú kópiu. */
export const addResources = (inventory: Resources, additions: Partial<Record<string, number>>): Resources => {
  const newInventory = { ...inventory };
  const ref = newInventory as unknown as Record<string, number>;
  Object.entries(additions).forEach(([type, amount]) => {
    if (amount) {
      ref[type] = (ref[type] || 0) + amount;
    }
  });
  return newInventory;
};

/** Pridá jednu surovinu do inventáru. Vracia novú kópiu. */
export const addResource = (inventory: Resources, type: ResourceType, amount: number): Resources => {
  const newInventory = { ...inventory };
  const ref = newInventory as unknown as Record<string, number>;
  ref[type] = (ref[type] || 0) + amount;
  return newInventory;
};

/**
 * Vypočíta návratnosť surovín pri recyklácii budovy.
 * @param cost - Pôvodná cena budovy
 * @param health - Aktuálne zdravie budovy (0-1)
 * @param recoveryRate - Percento návratnosti (default 0.5 = 50%)
 */
export const calculateRecovery = (
  cost: Cost,
  health: number,
  recoveryRate: number = 0.5,
): Record<string, number> => {
  const recovery: Record<string, number> = {};
  Object.entries(cost).forEach(([res, amt]) => {
    recovery[res] = Math.floor(amt * recoveryRate * health);
  });
  return recovery;
};
