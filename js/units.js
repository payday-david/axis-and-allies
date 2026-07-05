// Simplified Axis & Allies 1942-style unit stats: attack / defense out of 6, IPC cost.
export const UNIT_TYPES = [
  { key: 'inf', name: 'Infantry', sub: 'atk 1 / def 2 · 3 IPC', atk: 1, def: 2, cost: 3 },
  { key: 'tank', name: 'Tank', sub: 'atk 3 / def 3 · 5 IPC', atk: 3, def: 3, cost: 5 },
  { key: 'fighter', name: 'Fighter', sub: 'atk 3 / def 4 · 10 IPC', atk: 3, def: 4, cost: 10 },
  { key: 'bomber', name: 'Bomber', sub: 'atk 4 / def 1 · 12 IPC', atk: 4, def: 1, cost: 12 },
];

export function createEmptyForce() {
  const force = {};
  UNIT_TYPES.forEach(u => { force[u.key] = 0; });
  return force;
}

export function totalUnits(force) {
  return Object.values(force).reduce((a, b) => a + b, 0);
}
