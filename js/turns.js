// Turn-phase engine: cycles nations through Purchase -> Combat Move ->
// Combat Resolution -> Non-Combat Move -> Mobilize -> Income, wired to the
// map/territory model and the existing combat resolver. Pure logic - no DOM -
// so game.js can drive it and it stays testable in isolation.
import { UNIT_TYPES, createEmptyForce, totalUnits } from './units.js';
import { resolveCombatRound, selectCasualtiesCheapest } from './combat.js';
import { getTerritory, getTerritoriesByOwner, ipcIncome, getCapital, NATIONS } from './map.js';

export const PHASES = ['purchase', 'combatMove', 'combatResolution', 'nonCombatMove', 'mobilize', 'income'];
export const PHASE_LABELS = {
  purchase: 'Purchase Units',
  combatMove: 'Combat Move',
  combatResolution: 'Combat Resolution',
  nonCombatMove: 'Non-Combat Move',
  mobilize: 'Mobilize New Units',
  income: 'Collect Income',
};

// Classic 1942 turn order: Russia, Germany, UK, Japan, USA.
export const TURN_ORDER = ['ussr', 'germany', 'uk', 'japan', 'usa'];

export function createTurnState(map) {
  return {
    map,
    round: 1,
    nationIndex: 0,
    phaseIndex: 0,
    // Nations start with their first income already banked, so Purchase
    // phase is meaningful from turn one instead of forcing a dead round.
    treasury: Object.fromEntries(TURN_ORDER.map(n => [n, ipcIncome(map, n)])),
    pendingPurchase: Object.fromEntries(TURN_ORDER.map(n => [n, {}])),
    pendingAttack: null, // { nation, fromId, toId, force }
    log: [],
  };
}

export function currentNation(state) {
  return TURN_ORDER[state.nationIndex];
}

export function currentPhase(state) {
  return PHASES[state.phaseIndex];
}

function logEvent(state, text) {
  state.log.push({ round: state.round, nation: currentNation(state), phase: currentPhase(state), text });
}

// Buys `count` of `unitKey` for the current nation, deducting IPC immediately.
// Units sit in pendingPurchase until the Mobilize phase places them.
export function purchaseUnit(state, unitKey, count = 1) {
  if (currentPhase(state) !== 'purchase' || count <= 0) return { ok: false, reason: 'wrong-phase' };
  const unit = UNIT_TYPES.find(u => u.key === unitKey);
  const nation = currentNation(state);
  const cost = unit.cost * count;
  if (state.treasury[nation] < cost) return { ok: false, reason: 'insufficient-ipc' };

  state.treasury[nation] -= cost;
  state.pendingPurchase[nation][unitKey] = (state.pendingPurchase[nation][unitKey] || 0) + count;
  logEvent(state, `Purchased ${count} × ${unit.name} (${cost} IPC)`);
  return { ok: true };
}

// Refunds a pending (not yet mobilized) purchase, in case of a misclick.
export function undoPurchase(state, unitKey, count = 1) {
  if (currentPhase(state) !== 'purchase' || count <= 0) return { ok: false, reason: 'wrong-phase' };
  const nation = currentNation(state);
  const have = state.pendingPurchase[nation][unitKey] || 0;
  if (have < count) return { ok: false, reason: 'nothing-to-undo' };
  const unit = UNIT_TYPES.find(u => u.key === unitKey);
  state.pendingPurchase[nation][unitKey] = have - count;
  state.treasury[nation] += unit.cost * count;
  return { ok: true };
}

// Declares the current nation's one attack for this turn: `force` (unit key ->
// count) is pulled out of `fromId` immediately and staged against `toId` until
// Combat Resolution. Kept to a single attack per turn to keep the loop simple.
export function declareAttack(state, fromId, toId, force) {
  if (currentPhase(state) !== 'combatMove') return { ok: false, reason: 'wrong-phase' };
  if (state.pendingAttack) return { ok: false, reason: 'attack-already-declared' };

  const nation = currentNation(state);
  const from = getTerritory(state.map, fromId);
  const to = getTerritory(state.map, toId);

  if (from.owner !== nation) return { ok: false, reason: 'not-your-territory' };
  if (!from.adjacent.includes(toId)) return { ok: false, reason: 'not-adjacent' };
  if (to.owner === nation) return { ok: false, reason: 'cannot-attack-own-territory' };

  const entries = Object.entries(force).filter(([, count]) => count > 0);
  if (entries.length === 0) return { ok: false, reason: 'no-units-selected' };
  for (const [key, count] of entries) {
    if ((from.units[key] || 0) < count) return { ok: false, reason: `not-enough-${key}` };
  }

  entries.forEach(([key, count]) => {
    from.units[key] -= count;
    if (from.units[key] === 0) delete from.units[key];
  });

  state.pendingAttack = { nation, fromId, toId, force: Object.fromEntries(entries) };
  logEvent(state, `${NATIONS[nation].name} attacks ${to.name} from ${from.name}`);
  return { ok: true };
}

// Rolls exactly one round of combat for the declared attack (reuses the same
// combat.js math as the standalone resolver), applying cheapest-first
// casualties immediately. Call repeatedly until `concluded` is true, or stop
// early and call retreatFromCombat.
export function resolveCombatRoundOnce(state) {
  if (currentPhase(state) !== 'combatResolution') return null;
  const attack = state.pendingAttack;
  if (!attack) return null;

  const target = getTerritory(state.map, attack.toId);
  const attackerForce = { ...createEmptyForce(), ...attack.force };
  const defenderForce = { ...createEmptyForce(), ...target.units };

  const result = resolveCombatRound(attackerForce, defenderForce);
  if (result.defenderLossesNeeded > 0) selectCasualtiesCheapest(defenderForce, result.defenderLossesNeeded);
  if (result.attackerLossesNeeded > 0) selectCasualtiesCheapest(attackerForce, result.attackerLossesNeeded);

  attack.force = attackerForce;
  target.units = defenderForce;

  const attackerRemaining = totalUnits(attackerForce);
  const defenderRemaining = totalUnits(defenderForce);
  const concluded = attackerRemaining === 0 || defenderRemaining === 0;

  logEvent(state, `Combat round at ${target.name}: attacker ${result.attackerHits} hit(s), defender ${result.defenderHits} hit(s)`);

  return { ...result, concluded, attackerRemaining, defenderRemaining };
}

// Ends the declared attack early: survivors return to the territory they
// attacked from, no capture happens even if the defender was wiped out.
export function retreatFromCombat(state) {
  if (currentPhase(state) !== 'combatResolution' || !state.pendingAttack) return { ok: false };
  const attack = state.pendingAttack;
  const from = getTerritory(state.map, attack.fromId);
  Object.entries(attack.force).forEach(([key, count]) => {
    if (count > 0) from.units[key] = (from.units[key] || 0) + count;
  });
  logEvent(state, `${NATIONS[attack.nation].name} retreats survivors to ${from.name}`);
  state.pendingAttack = null;
  return { ok: true };
}

// Settles the outcome of the current attack: capture if the defender was
// wiped and the attacker has survivors, otherwise the attacker's survivors
// (if combat didn't conclude, e.g. phase was advanced mid-fight) fall back home.
function finalizeCombat(state) {
  const attack = state.pendingAttack;
  if (!attack) return;

  const target = getTerritory(state.map, attack.toId);
  const attackerRemaining = totalUnits(attack.force);
  const defenderRemaining = totalUnits(target.units);

  if (attackerRemaining > 0 && defenderRemaining === 0) {
    target.owner = attack.nation;
    target.units = { ...attack.force };
    logEvent(state, `${NATIONS[attack.nation].name} captures ${target.name}!`);
  } else if (attackerRemaining > 0) {
    const from = getTerritory(state.map, attack.fromId);
    Object.entries(attack.force).forEach(([key, count]) => {
      if (count > 0) from.units[key] = (from.units[key] || 0) + count;
    });
    logEvent(state, `${NATIONS[attack.nation].name}'s surviving attackers fall back to ${from.name}`);
  } else {
    logEvent(state, `${NATIONS[attack.nation].name}'s attack on ${target.name} was wiped out`);
  }
  state.pendingAttack = null;
}

// Moves units between two territories the current nation already owns
// (Non-Combat Move phase) - repositioning, not an attack.
export function moveUnitsNonCombat(state, fromId, toId, force) {
  if (currentPhase(state) !== 'nonCombatMove') return { ok: false, reason: 'wrong-phase' };
  const nation = currentNation(state);
  const from = getTerritory(state.map, fromId);
  const to = getTerritory(state.map, toId);

  if (from.owner !== nation) return { ok: false, reason: 'not-your-territory' };
  if (to.owner !== nation) return { ok: false, reason: 'destination-not-owned' };
  if (!from.adjacent.includes(toId)) return { ok: false, reason: 'not-adjacent' };

  const entries = Object.entries(force).filter(([, count]) => count > 0);
  if (entries.length === 0) return { ok: false, reason: 'no-units-selected' };
  for (const [key, count] of entries) {
    if ((from.units[key] || 0) < count) return { ok: false, reason: `not-enough-${key}` };
  }

  entries.forEach(([key, count]) => {
    from.units[key] -= count;
    if (from.units[key] === 0) delete from.units[key];
    to.units[key] = (to.units[key] || 0) + count;
  });

  logEvent(state, `Repositioned units from ${from.name} to ${to.name}`);
  return { ok: true };
}

// Only the two side capitals (Germany, Eastern US) exist in the map data -
// USSR, UK, and Japan mobilize at their own highest-value owned territory
// instead, so purchases always have somewhere to land.
function getMobilizationTerritory(map, nation) {
  return getCapital(map, nation) ??
    getTerritoriesByOwner(map, nation).reduce(
      (best, t) => (!best || t.ipcValue > best.ipcValue ? t : best), null
    );
}

// Places everything bought this turn into the nation's home territory.
function mobilizeUnits(state) {
  const nation = currentNation(state);
  const home = getMobilizationTerritory(state.map, nation);
  const pending = state.pendingPurchase[nation];
  const placed = totalUnits(pending);

  if (home) {
    Object.entries(pending).forEach(([key, count]) => {
      if (count > 0) home.units[key] = (home.units[key] || 0) + count;
    });
    if (placed > 0) logEvent(state, `Mobilized ${placed} unit(s) at ${home.name}`);
  } else if (placed > 0) {
    logEvent(state, `${NATIONS[nation].name} has no territory left to mobilize into — purchase lost`);
  }
  state.pendingPurchase[nation] = {};
}

function collectIncome(state) {
  const nation = currentNation(state);
  const income = ipcIncome(state.map, nation);
  state.treasury[nation] += income;
  logEvent(state, `Collected ${income} IPC income (treasury now ${state.treasury[nation]})`);
}

// Advances to the next phase, running whatever automatic effects the phase
// being left requires (finalizing unresolved combat, mobilizing purchases,
// collecting income). Income has no player input, so leaving it rolls
// straight into the next nation's Purchase phase in the same call.
export function advancePhase(state) {
  const phase = currentPhase(state);
  if (phase === 'combatResolution') finalizeCombat(state);
  if (phase === 'mobilize') mobilizeUnits(state);

  if (phase === 'income') {
    collectIncome(state);
    state.phaseIndex = 0;
    state.nationIndex = (state.nationIndex + 1) % TURN_ORDER.length;
    if (state.nationIndex === 0) state.round += 1;
  } else {
    state.phaseIndex += 1;
  }
}
