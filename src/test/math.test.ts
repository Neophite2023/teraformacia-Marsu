import { describe, it, expect } from 'vitest';
import { distance, distanceSq, clamp, normalizeAngle, randomId, randomBuildingId } from '../../utils/math';

describe('Math utility - distanceSq', () => {
  it('vracia 0 pre identické body', () => {
    expect(distanceSq(5, 5, 5, 5)).toBe(0);
  });

  it('správne počíta štvorcovú vzdialenosť', () => {
    expect(distanceSq(0, 0, 3, 4)).toBe(25);
  });

  it('je symetrická', () => {
    expect(distanceSq(1, 2, 3, 4)).toBe(distanceSq(3, 4, 1, 2));
  });
});

describe('Math utility - distance', () => {
  it('vracia 0 pre identické body', () => {
    expect(distance(0, 0, 0, 0)).toBe(0);
  });

  it('správne počíta euklidovskú vzdialenosť (3-4-5)', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('funguje s negatívnymi koordinátmi', () => {
    expect(distance(-1, -1, 2, 3)).toBe(5);
  });
});

describe('Math utility - clamp', () => {
  it('vracia min ak je hodnota pod ním', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('vracia max ak je hodnota nad ním', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('vracia hodnotu ak je v rozsahu', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe('Math utility - normalizeAngle', () => {
  it('vracia 0 pre 0', () => {
    expect(normalizeAngle(0)).toBe(0);
  });

  it('normalizuje uhol > π', () => {
    const result = normalizeAngle(Math.PI * 3);
    expect(result).toBeCloseTo(Math.PI, 10);
  });

  it('normalizuje uhol < -π', () => {
    const result = normalizeAngle(-Math.PI * 3);
    expect(result).toBeCloseTo(-Math.PI, 10);
  });

  it('zachováva uhol v rozsahu [-π, π]', () => {
    const angle = Math.PI / 4;
    expect(normalizeAngle(angle)).toBe(angle);
  });
});

describe('Math utility - randomId', () => {
  it('generuje neprázdny reťazec', () => {
    const id = randomId();
    expect(id.length).toBeGreaterThan(0);
  });

  it('generuje unikátne ID', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(randomId());
    expect(ids.size).toBe(100);
  });
});

describe('Math utility - randomBuildingId', () => {
  it('generuje uppercase ID', () => {
    const id = randomBuildingId();
    expect(id).toBe(id.toUpperCase());
  });
});
