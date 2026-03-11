import { describe, it, expect } from 'vitest';
import { buildGrid, forEachInRadius, someInRadius } from '../../utils/grid';

interface TestItem { id: string; x: number; y: number }

const createItem = (id: string, x: number, y: number): TestItem => ({ id, x, y });

describe('Grid utility - buildGrid', () => {
  it('vytvorí prázdny grid pre prázdne pole', () => {
    const grid = buildGrid<TestItem>([], i => i.x, i => i.y);
    expect(grid.size).toBe(0);
  });

  it('zaradí položky do správnych buniek', () => {
    const items = [
      createItem('a', 50, 50),
      createItem('b', 250, 50),
      createItem('c', 50, 50),
    ];
    const grid = buildGrid<TestItem>(items, i => i.x, i => i.y);
    // Items a a c sú v rovnakej bunke (gridCoord(50) = 0)
    // Item b je v inej bunke (gridCoord(250) = 1)
    expect(grid.size).toBe(2);
  });
});

describe('Grid utility - forEachInRadius', () => {
  it('volá callback pre položky v okruhu', () => {
    const items = [
      createItem('a', 100, 100),
      createItem('b', 300, 300),
    ];
    const grid = buildGrid<TestItem>(items, i => i.x, i => i.y);

    const visited: string[] = [];
    forEachInRadius(grid, 100, 100, 50, item => {
      visited.push(item.id);
    });

    expect(visited).toContain('a');
    expect(visited).not.toContain('b');
  });

  it('nevolá callback pre prázdny grid', () => {
    const grid = new Map<string, TestItem[]>();
    let count = 0;
    forEachInRadius(grid, 0, 0, 100, () => count++);
    expect(count).toBe(0);
  });
});

describe('Grid utility - someInRadius', () => {
  it('vracia true ak existuje zhoda', () => {
    const items = [createItem('a', 100, 100)];
    const grid = buildGrid<TestItem>(items, i => i.x, i => i.y);
    expect(someInRadius(grid, 100, 100, 50, item => item.id === 'a')).toBe(true);
  });

  it('vracia false ak neexistuje zhoda', () => {
    const items = [createItem('a', 100, 100)];
    const grid = buildGrid<TestItem>(items, i => i.x, i => i.y);
    expect(someInRadius(grid, 100, 100, 50, item => item.id === 'b')).toBe(false);
  });

  it('vracia false pre prázdny grid', () => {
    const grid = new Map<string, TestItem[]>();
    expect(someInRadius(grid, 0, 0, 100, () => true)).toBe(false);
  });
});
