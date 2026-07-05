// Simplified 1942-style unit stats (attack / defense out of 6, IPC cost).
// Same numbers as the combat-resolver.html prototype — this file becomes
// the single source of truth once that prototype gets ported to a module.
export const UNIT_TYPES = {
  inf:     { key: 'inf',     name: 'Infantry', atk: 1, def: 2, cost: 3 },
  tank:    { key: 'tank',    name: 'Tank',      atk: 3, def: 3, cost: 5 },
  fighter: { key: 'fighter', name: 'Fighter',   atk: 3, def: 4, cost: 10 },
  bomber:  { key: 'bomber',  name: 'Bomber',    atk: 4, def: 1, cost: 12 },
};
