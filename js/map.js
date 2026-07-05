import { NATIONS, TERRITORIES } from './data/territories.js';
import { UNIT_TYPES } from './data/units.js';

// TERRITORIES/NATIONS above are the fixed starting layout. Games mutate
// ownership and garrisons as they go, so every game gets its own deep copy
// instead of sharing (and corrupting) the template.
export function createGameMap() {
  return structuredClone(TERRITORIES);
}

export function getTerritory(map, territoryId) {
  const territory = map[territoryId];
  if (!territory) throw new Error(`Unknown territory: ${territoryId}`);
  return territory;
}

export function getAdjacentTerritories(map, territoryId) {
  return getTerritory(map, territoryId).adjacent.map(id => getTerritory(map, id));
}

export function isAdjacent(map, territoryIdA, territoryIdB) {
  return getTerritory(map, territoryIdA).adjacent.includes(territoryIdB);
}

export function getTerritoriesByOwner(map, nationId) {
  return Object.values(map).filter(t => t.owner === nationId);
}

export function totalGarrison(territory) {
  return Object.values(territory.units).reduce((sum, count) => sum + count, 0);
}

export function ipcIncome(map, nationId) {
  return getTerritoriesByOwner(map, nationId).reduce((sum, t) => sum + t.ipcValue, 0);
}

export function getCapital(map, nationId) {
  return Object.values(map).find(t => t.owner === nationId && t.isCapital) ?? null;
}

// Dev-time sanity check: adjacency should always be listed on both sides.
// Returns a list of one-way links found (empty array means the graph is clean).
export function findAsymmetricAdjacencies(map) {
  const problems = [];
  for (const territory of Object.values(map)) {
    for (const neighborId of territory.adjacent) {
      const neighbor = map[neighborId];
      if (!neighbor) {
        problems.push(`${territory.id} lists unknown neighbor ${neighborId}`);
      } else if (!neighbor.adjacent.includes(territory.id)) {
        problems.push(`${territory.id} -> ${neighborId} is not reciprocated`);
      }
    }
  }
  return problems;
}

export { NATIONS, UNIT_TYPES };
