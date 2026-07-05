// Combat resolution engine. Pure game logic - no DOM here, so it can be tested
// or reused (e.g. by the AI opponent later) without a page to render into.
import { UNIT_TYPES, totalUnits } from './units.js';
import { rollPool } from './dice.js';

// Rolls dice for every unit type present in `force`, using `statKey` ('atk' or 'def')
// as each unit type's hit threshold. Returns one entry per unit type that has units.
function rollForce(force, statKey) {
  const results = [];
  UNIT_TYPES.forEach(u => {
    const count = force[u.key];
    if (count > 0) {
      const rolls = rollPool(count);
      const threshold = u[statKey];
      const hits = rolls.filter(r => r <= threshold).length;
      results.push({ unit: u, rolls, threshold, hits });
    }
  });
  return results;
}

// Resolves one round of combat between an attacking and defending force.
// Does not mutate either force - casualty removal is a separate step so the
// UI can show the battle report before casualties are chosen.
export function resolveCombatRound(attackerForce, defenderForce) {
  const attackerRolls = rollForce(attackerForce, 'atk');
  const defenderRolls = rollForce(defenderForce, 'def');

  const attackerHits = attackerRolls.reduce((sum, r) => sum + r.hits, 0);
  const defenderHits = defenderRolls.reduce((sum, r) => sum + r.hits, 0);

  const defenderLossesNeeded = Math.min(attackerHits, totalUnits(defenderForce));
  const attackerLossesNeeded = Math.min(defenderHits, totalUnits(attackerForce));

  return {
    attackerRolls,
    defenderRolls,
    attackerHits,
    defenderHits,
    defenderLossesNeeded,
    attackerLossesNeeded,
  };
}

// "Cheapest first" official rule: removes lowest-IPC-cost units first.
// Mutates `force` in place and returns a map of how many of each unit type were removed.
export function selectCasualtiesCheapest(force, losses) {
  let remaining = losses;
  const removed = {};
  const sorted = [...UNIT_TYPES].sort((a, b) => a.cost - b.cost);
  for (const u of sorted) {
    if (remaining <= 0) break;
    const available = force[u.key];
    const take = Math.min(available, remaining);
    if (take > 0) {
      force[u.key] -= take;
      removed[u.key] = (removed[u.key] || 0) + take;
      remaining -= take;
    }
  }
  return removed;
}

// "Owner's choice" house rule: applies a manually-assigned casualty map
// (already validated by the UI to sum to the required loss count).
export function applyCasualties(force, assignedMap) {
  UNIT_TYPES.forEach(u => {
    force[u.key] -= (assignedMap[u.key] || 0);
  });
}

export function casualtyLabel(removedMap) {
  const parts = [];
  UNIT_TYPES.forEach(u => {
    const n = removedMap[u.key] || 0;
    if (n > 0) parts.push(`${n} × ${u.name}`);
  });
  return parts.length ? parts.join(', ') : 'none';
}
