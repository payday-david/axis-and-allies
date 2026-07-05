// UI wiring for the playable turn loop: owns DOM state/rendering and calls
// into the pure game-logic modules (map, turns, combat) to do the actual work.
import { UNIT_TYPES, totalUnits } from './units.js';
import { createGameMap, NATIONS } from './map.js';
import {
  PHASES, PHASE_LABELS, TURN_ORDER,
  createTurnState, currentNation, currentPhase,
  purchaseUnit, undoPurchase,
  declareAttack, resolveCombatRoundOnce, retreatFromCombat,
  moveUnitsNonCombat, advancePhase,
} from './turns.js';

let map = createGameMap();
let state = createTurnState(map);

function startNewGame() {
  map = createGameMap();
  state = createTurnState(map);
  render();
}

function ownedTerritories(nation) {
  return Object.values(state.map).filter(t => t.owner === nation);
}

function ownedTerritoriesWithUnits(nation) {
  return ownedTerritories(nation).filter(t => totalUnits(t.units) > 0);
}

function unitLabel(units) {
  const parts = Object.entries(units).filter(([, n]) => n > 0).map(([key, n]) => `${n} ${key}`);
  return parts.length ? parts.join(', ') : 'none';
}

function renderHeader() {
  const nation = currentNation(state);
  const phase = currentPhase(state);
  document.getElementById('round-label').textContent = `Round ${state.round}`;
  const nationEl = document.getElementById('nation-label');
  nationEl.textContent = NATIONS[nation].name;
  nationEl.className = NATIONS[nation].side === 'axis' ? 'side-axis' : 'side-allies';
  document.getElementById('phase-label').textContent = PHASE_LABELS[phase];
  document.getElementById('treasury-label').textContent = `${state.treasury[nation]} IPC`;

  const stepsEl = document.getElementById('phase-steps');
  stepsEl.innerHTML = PHASES.map(p => {
    const cls = p === phase ? 'phase-step current' : 'phase-step';
    return `<span class="${cls}">${PHASE_LABELS[p]}</span>`;
  }).join('<span class="phase-arrow">›</span>');
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  Object.values(state.map).forEach(t => {
    const row = document.createElement('div');
    row.className = 'territory-row';
    const ownerLabel = t.owner ? NATIONS[t.owner].name : '(unowned)';
    const ownerCls = t.owner ? (NATIONS[t.owner].side === 'axis' ? 'side-axis' : 'side-allies') : '';
    row.innerHTML = `
      <span class="t-name">${t.name}${t.isCapital ? ' ★' : ''}</span>
      <span class="t-owner ${ownerCls}">${ownerLabel}</span>
      <span class="t-ipc">${t.ipcValue} IPC</span>
      <span class="t-units">${unitLabel(t.units)}</span>
    `;
    boardEl.appendChild(row);
  });
}

function renderLog() {
  const logEl = document.getElementById('log');
  logEl.innerHTML = state.log.slice().reverse().slice(0, 30).map(entry =>
    `<div class="log-line"><b>R${entry.round} · ${NATIONS[entry.nation].name}</b> — ${entry.text}</div>`
  ).join('') || '<div class="log-line" style="color:#6b6a5d;">No events yet.</div>';
}

function renderPhasePanel() {
  const panel = document.getElementById('phase-panel');
  const phase = currentPhase(state);
  const nation = currentNation(state);

  if (phase === 'purchase') {
    panel.innerHTML = renderPurchasePanel(nation);
    attachPurchaseEvents();
  } else if (phase === 'combatMove') {
    panel.innerHTML = renderCombatMovePanel(nation);
    attachCombatMoveEvents();
  } else if (phase === 'combatResolution') {
    panel.innerHTML = renderCombatResolutionPanel();
    attachCombatResolutionEvents();
  } else if (phase === 'nonCombatMove') {
    panel.innerHTML = renderNonCombatMovePanel(nation);
    attachNonCombatMoveEvents();
  } else if (phase === 'mobilize') {
    panel.innerHTML = renderMobilizePanel(nation);
  } else if (phase === 'income') {
    panel.innerHTML = renderIncomePanel(nation);
  }

  const nextBtn = document.getElementById('next-phase-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      advancePhase(state);
      render();
    });
  }
}

function renderPurchasePanel(nation) {
  const pending = state.pendingPurchase[nation];
  const rows = UNIT_TYPES.map(u => `
    <div class="unit-row">
      <div class="unit-name"><b>${u.name}</b><span>${u.sub}</span></div>
      <div class="stepper">
        <button class="buy-btn" data-key="${u.key}" data-delta="-1">−</button>
        <span class="count">${pending[u.key] || 0}</span>
        <button class="buy-btn" data-key="${u.key}" data-delta="1">+</button>
      </div>
    </div>
  `).join('');
  return `
    <div class="note">Buy units with this turn's IPC. They arrive at your capital during Mobilize.</div>
    ${rows}
    <button class="fire-btn" id="next-phase-btn">Next: Combat Move</button>
  `;
}

function attachPurchaseEvents() {
  document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const delta = parseInt(btn.dataset.delta, 10);
      const result = delta > 0 ? purchaseUnit(state, key, 1) : undoPurchase(state, key, 1);
      if (!result.ok) return;
      render();
    });
  });
}

function renderCombatMovePanel(nation) {
  if (state.pendingAttack) {
    const target = state.map[state.pendingAttack.toId];
    return `
      <div class="note">Attack declared on <b>${target.name}</b> with ${unitLabel(state.pendingAttack.force)}. Resolve it in the next phase.</div>
      <button class="fire-btn" id="next-phase-btn">Next: Combat Resolution</button>
    `;
  }

  const sources = ownedTerritoriesWithUnits(nation);
  if (sources.length === 0) {
    return `
      <div class="note">No territories with units available to attack from.</div>
      <button class="fire-btn" id="next-phase-btn">Next: Combat Resolution</button>
    `;
  }

  const fromOptions = sources.map(t => `<option value="${t.id}">${t.name} (${unitLabel(t.units)})</option>`).join('');
  return `
    <div class="note">Pick a territory you control, an adjacent enemy territory, and how many of each unit to send. One attack per turn.</div>
    <label class="field-label">Attack from</label>
    <select id="attack-from">${fromOptions}</select>
    <label class="field-label">Attack target</label>
    <select id="attack-to"></select>
    <div id="attack-units"></div>
    <button class="fire-btn" id="declare-attack-btn" style="margin-top:10px;">Declare Attack</button>
    <button class="fire-btn" id="next-phase-btn" style="background:var(--olive);">Skip Attack — Next: Combat Resolution</button>
  `;
}

function attachCombatMoveEvents() {
  const fromSel = document.getElementById('attack-from');
  const toSel = document.getElementById('attack-to');
  if (!fromSel) return;
  const nation = currentNation(state);

  function refreshTargets() {
    const from = state.map[fromSel.value];
    const hostile = from.adjacent.filter(id => state.map[id].owner !== nation);
    toSel.innerHTML = hostile.map(id => `<option value="${id}">${state.map[id].name}</option>`).join('');
    refreshUnitPickers();
  }

  function refreshUnitPickers() {
    const from = state.map[fromSel.value];
    const unitsEl = document.getElementById('attack-units');
    unitsEl.innerHTML = UNIT_TYPES
      .filter(u => (from.units[u.key] || 0) > 0)
      .map(u => `
        <div class="unit-row">
          <div class="unit-name"><b>${u.name}</b><span>have ${from.units[u.key]}</span></div>
          <div class="stepper">
            <button class="atk-unit-btn" data-key="${u.key}" data-delta="-1">−</button>
            <span class="count" id="atk-${u.key}-count">0</span>
            <button class="atk-unit-btn" data-key="${u.key}" data-delta="1">+</button>
          </div>
        </div>
      `).join('');
    attachUnitStepper('.atk-unit-btn', (key) => (from.units[key] || 0));
  }

  fromSel.addEventListener('change', refreshTargets);
  refreshTargets();

  document.getElementById('declare-attack-btn').addEventListener('click', () => {
    const force = {};
    UNIT_TYPES.forEach(u => {
      const el = document.getElementById(`atk-${u.key}-count`);
      if (el) force[u.key] = parseInt(el.textContent, 10) || 0;
    });
    const result = declareAttack(state, fromSel.value, toSel.value, force);
    if (!result.ok) {
      alert(`Can't declare attack: ${result.reason}`);
      return;
    }
    render();
  });
}

function attachUnitStepper(selector, maxForKey) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const delta = parseInt(btn.dataset.delta, 10);
      const countEl = btn.parentElement.querySelector('.count');
      const next = Math.max(0, Math.min(maxForKey(key), parseInt(countEl.textContent, 10) + delta));
      countEl.textContent = next;
    });
  });
}

function renderCombatResolutionPanel() {
  if (!state.pendingAttack) {
    return `
      <div class="note">No attack declared this turn — nothing to resolve.</div>
      <button class="fire-btn" id="next-phase-btn">Next: Non-Combat Move</button>
    `;
  }
  const attack = state.pendingAttack;
  const target = state.map[attack.toId];
  return `
    <div class="note">Attacking <b>${target.name}</b>. Attacker: ${unitLabel(attack.force)}. Defender: ${unitLabel(target.units)}.</div>
    <div id="combat-report"></div>
    <button class="fire-btn" id="roll-round-btn">Roll Combat Round</button>
    <button class="fire-btn" id="retreat-btn" style="background:var(--olive);">Retreat Survivors</button>
    <button class="fire-btn" id="next-phase-btn" style="background:var(--ink);">Next: Non-Combat Move</button>
  `;
}

function buildRollLine(label, unit, rolls, threshold) {
  const hits = rolls.filter(r => r <= threshold).length;
  const diceHtml = rolls.map(r => `<span class="die ${r <= threshold ? 'hit' : ''}">${r}</span>`).join('');
  return `<div class="roll-line"><b>${label}</b> — ${unit.name} ×${rolls.length} (needs ≤${threshold})
    <span class="dice-row">${diceHtml}</span>
    <div class="result-line">${hits} hit${hits !== 1 ? 's' : ''}</div>
  </div>`;
}

function attachCombatResolutionEvents() {
  const rollBtn = document.getElementById('roll-round-btn');
  const retreatBtn = document.getElementById('retreat-btn');
  if (!rollBtn) return;

  rollBtn.addEventListener('click', () => {
    const result = resolveCombatRoundOnce(state);
    if (!result) return;
    let html = '';
    result.attackerRolls.forEach(r => { html += buildRollLine('Attacker', r.unit, r.rolls, r.threshold); });
    result.defenderRolls.forEach(r => { html += buildRollLine('Defender', r.unit, r.rolls, r.threshold); });
    html += `<div class="roll-line"><b>Hits:</b> attacker ${result.attackerHits}, defender ${result.defenderHits}. Remaining — attacker ${result.attackerRemaining}, defender ${result.defenderRemaining}.</div>`;
    document.getElementById('combat-report').innerHTML = html + document.getElementById('combat-report').innerHTML;

    if (result.concluded) {
      rollBtn.disabled = true;
      retreatBtn.disabled = true;
      renderBoard();
    }
  });

  retreatBtn.addEventListener('click', () => {
    retreatFromCombat(state);
    render();
  });
}

function renderNonCombatMovePanel(nation) {
  const sources = ownedTerritoriesWithUnits(nation).filter(t =>
    t.adjacent.some(id => state.map[id].owner === nation)
  );
  if (sources.length === 0) {
    return `
      <div class="note">No repositioning available.</div>
      <button class="fire-btn" id="next-phase-btn">Next: Mobilize</button>
    `;
  }
  const fromOptions = sources.map(t => `<option value="${t.id}">${t.name} (${unitLabel(t.units)})</option>`).join('');
  return `
    <div class="note">Optionally reposition units between your own adjacent territories.</div>
    <label class="field-label">Move from</label>
    <select id="move-from">${fromOptions}</select>
    <label class="field-label">Move to</label>
    <select id="move-to"></select>
    <div id="move-units"></div>
    <button class="fire-btn" id="move-units-btn" style="margin-top:10px;">Move Units</button>
    <button class="fire-btn" id="next-phase-btn" style="background:var(--olive);">Next: Mobilize</button>
  `;
}

function attachNonCombatMoveEvents() {
  const fromSel = document.getElementById('move-from');
  const toSel = document.getElementById('move-to');
  if (!fromSel) return;
  const nation = currentNation(state);

  function refreshTargets() {
    const from = state.map[fromSel.value];
    const friendly = from.adjacent.filter(id => state.map[id].owner === nation);
    toSel.innerHTML = friendly.map(id => `<option value="${id}">${state.map[id].name}</option>`).join('');
    refreshUnitPickers();
  }

  function refreshUnitPickers() {
    const from = state.map[fromSel.value];
    const unitsEl = document.getElementById('move-units');
    unitsEl.innerHTML = UNIT_TYPES
      .filter(u => (from.units[u.key] || 0) > 0)
      .map(u => `
        <div class="unit-row">
          <div class="unit-name"><b>${u.name}</b><span>have ${from.units[u.key]}</span></div>
          <div class="stepper">
            <button class="mv-unit-btn" data-key="${u.key}" data-delta="-1">−</button>
            <span class="count" id="mv-${u.key}-count">0</span>
            <button class="mv-unit-btn" data-key="${u.key}" data-delta="1">+</button>
          </div>
        </div>
      `).join('');
    attachUnitStepper('.mv-unit-btn', (key) => (from.units[key] || 0));
  }

  fromSel.addEventListener('change', refreshTargets);
  refreshTargets();

  document.getElementById('move-units-btn').addEventListener('click', () => {
    const force = {};
    UNIT_TYPES.forEach(u => {
      const el = document.getElementById(`mv-${u.key}-count`);
      if (el) force[u.key] = parseInt(el.textContent, 10) || 0;
    });
    const result = moveUnitsNonCombat(state, fromSel.value, toSel.value, force);
    if (!result.ok) {
      alert(`Can't move units: ${result.reason}`);
      return;
    }
    render();
  });
}

function renderMobilizePanel(nation) {
  const pending = state.pendingPurchase[nation];
  const total = totalUnits(pending);
  return `
    <div class="note">${total > 0 ? `Placing ${unitLabel(pending)} at your capital.` : 'Nothing purchased this turn.'}</div>
    <button class="fire-btn" id="next-phase-btn">Next: Collect Income</button>
  `;
}

function renderIncomePanel(nation) {
  const preview = Object.values(state.map)
    .filter(t => t.owner === nation)
    .reduce((sum, t) => sum + t.ipcValue, 0);
  return `
    <div class="note">Territories you control will generate <b>${preview} IPC</b> this turn.</div>
    <button class="fire-btn" id="next-phase-btn">Collect Income &amp; End Turn</button>
  `;
}

function render() {
  renderHeader();
  renderBoard();
  renderPhasePanel();
  renderLog();
}

document.getElementById('new-game-btn').addEventListener('click', startNewGame);

render();
