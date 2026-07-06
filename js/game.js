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

// UI-only selection state for the clickable map (not part of game state -
// it resets whenever the phase changes or an action completes).
let selection = { from: null, to: null };

function startNewGame() {
  map = createGameMap();
  state = createTurnState(map);
  selection = { from: null, to: null };
  render();
}

// Board layout mirrors the ASCII adjacency diagram in js/data/territories.js -
// purely presentational, so it lives here rather than in the map data model.
const LAYOUT = {
  siberia: { col: 0, row: 0 }, russia: { col: 1, row: 0 }, easternEurope: { col: 2, row: 0 },
  germany: { col: 3, row: 0 }, westernEurope: { col: 4, row: 0 },
  manchuria: { col: 0, row: 1 }, balticSea: { col: 3, row: 1 }, northAtlantic: { col: 4, row: 1 },
  seaOfJapan: { col: 0, row: 2 }, unitedKingdom: { col: 3, row: 2 }, easternUS: { col: 4, row: 2 },
  japan: { col: 0, row: 3 }, northPacific: { col: 1, row: 3 }, westernUS: { col: 2, row: 3 },
};
const SHORT_NAMES = {
  easternUS: 'E. USA', westernUS: 'W. USA', unitedKingdom: 'UK', russia: 'Russia', siberia: 'Siberia',
  westernEurope: 'W. Europe', germany: 'Germany', easternEurope: 'E. Europe', japan: 'Japan',
  manchuria: 'Manchuria', northAtlantic: 'N. Atlantic', balticSea: 'Baltic Sea',
  northPacific: 'N. Pacific', seaOfJapan: 'Sea of Japan',
};
const NATION_COLORS = { germany: '#c48a7c', japan: '#d1a55c', usa: '#93a06a', uk: '#7b93a1', ussr: '#9b83a3' };
const UNOWNED_COLOR = '#d8d3c2';

const CELL_W = 150, CELL_H = 110, BOX_W = 132, BOX_H = 72, ORIGIN_X = 20, ORIGIN_Y = 20;

function boxTopLeft(id) {
  const { col, row } = LAYOUT[id];
  return { x: ORIGIN_X + col * CELL_W, y: ORIGIN_Y + row * CELL_H };
}
function boxCenter(id) {
  const { x, y } = boxTopLeft(id);
  return { x: x + BOX_W / 2, y: y + BOX_H / 2 };
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

function compactUnits(units) {
  const abbr = { inf: 'I', tank: 'T', fighter: 'F', bomber: 'B' };
  const parts = Object.entries(units).filter(([, n]) => n > 0).map(([key, n]) => `${n}${abbr[key]}`);
  return parts.length ? parts.join(' ') : '—';
}

// Pure eligibility checks, independent of current selection - used both to
// decide what's clickable and to highlight valid choices on the map.
function territoryQualifiesAsSource(territoryId) {
  const phase = currentPhase(state);
  const nation = currentNation(state);
  const t = state.map[territoryId];
  if (t.owner !== nation || totalUnits(t.units) === 0) return false;
  if (phase === 'combatMove') return t.adjacent.some(id => state.map[id].owner !== nation);
  if (phase === 'nonCombatMove') return t.adjacent.some(id => state.map[id].owner === nation);
  return false;
}

function territoryQualifiesAsTarget(territoryId) {
  if (!selection.from) return false;
  const phase = currentPhase(state);
  const nation = currentNation(state);
  const from = state.map[selection.from];
  if (!from.adjacent.includes(territoryId)) return false;
  const t = state.map[territoryId];
  if (phase === 'combatMove') return t.owner !== nation;
  if (phase === 'nonCombatMove') return t.owner === nation;
  return false;
}

function handleTerritoryClick(territoryId) {
  const phase = currentPhase(state);
  if (phase !== 'combatMove' && phase !== 'nonCombatMove') return;
  if (phase === 'combatMove' && state.pendingAttack) return;

  if (selection.from === territoryId) {
    selection = { from: null, to: null };
  } else if (!selection.from) {
    if (territoryQualifiesAsSource(territoryId)) selection.from = territoryId;
  } else if (!selection.to) {
    if (territoryQualifiesAsTarget(territoryId)) {
      selection.to = territoryId;
    } else if (territoryQualifiesAsSource(territoryId)) {
      selection.from = territoryId;
    }
  }
  renderMap();
  renderPhasePanel();
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

function renderMap() {
  const svgEl = document.getElementById('map-svg');

  const edgesSeen = new Set();
  let linesHtml = '';
  Object.values(state.map).forEach(t => {
    t.adjacent.forEach(otherId => {
      const key = [t.id, otherId].sort().join('|');
      if (edgesSeen.has(key)) return;
      edgesSeen.add(key);
      const a = boxCenter(t.id), b = boxCenter(otherId);
      linesHtml += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="map-edge" />`;
    });
  });

  let boxesHtml = '';
  Object.values(state.map).forEach(t => {
    const { x, y } = boxTopLeft(t.id);
    const fill = t.owner ? NATION_COLORS[t.owner] : UNOWNED_COLOR;
    const classes = ['map-territory'];
    if (!t.owner) classes.push('map-unowned');
    if (!selection.from && territoryQualifiesAsSource(t.id)) classes.push('map-selectable');
    if (selection.from === t.id) classes.push('map-selected-from');
    if (selection.from && !selection.to && territoryQualifiesAsTarget(t.id)) classes.push('map-valid-target');
    if (selection.to === t.id) classes.push('map-selected-to');
    if (state.pendingAttack && (t.id === state.pendingAttack.fromId || t.id === state.pendingAttack.toId)) {
      classes.push('map-in-combat');
    }

    boxesHtml += `
      <g class="${classes.join(' ')}" data-territory="${t.id}">
        <rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="4" style="fill:${fill}"></rect>
        <text x="${x + BOX_W / 2}" y="${y + 17}" class="map-name" text-anchor="middle">${SHORT_NAMES[t.id]}${t.isCapital ? ' ★' : ''}</text>
        <text x="${x + BOX_W / 2}" y="${y + 33}" class="map-units" text-anchor="middle">${compactUnits(t.units)}</text>
        <text x="${x + BOX_W - 6}" y="${y + BOX_H - 6}" class="map-ipc" text-anchor="end">${t.ipcValue} IPC</text>
      </g>
    `;
  });

  svgEl.innerHTML = linesHtml + boxesHtml;
  svgEl.querySelectorAll('.map-territory').forEach(el => {
    el.addEventListener('click', () => handleTerritoryClick(el.dataset.territory));
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
      selection = { from: null, to: null };
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

  const hasSource = ownedTerritoriesWithUnits(nation).some(t => territoryQualifiesAsSource(t.id));
  if (!hasSource) {
    return `
      <div class="note">No territories with units available to attack from.</div>
      <button class="fire-btn" id="next-phase-btn">Next: Combat Resolution</button>
    `;
  }

  if (!selection.from) {
    return `
      <div class="note">Click one of your highlighted territories on the map to attack from.</div>
      <button class="fire-btn" id="next-phase-btn" style="background:var(--olive);">Skip Attack — Next: Combat Resolution</button>
    `;
  }

  const from = state.map[selection.from];
  if (!selection.to) {
    return `
      <div class="note">Attacking from <b>${from.name}</b> (${unitLabel(from.units)}). Click an outlined adjacent enemy territory to target it, or click ${from.name} again to cancel.</div>
      <button class="fire-btn" id="next-phase-btn" style="background:var(--olive);">Skip Attack — Next: Combat Resolution</button>
    `;
  }

  const to = state.map[selection.to];
  const unitsHtml = UNIT_TYPES
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

  return `
    <div class="note">Attacking <b>${to.name}</b> from <b>${from.name}</b>. Choose how many of each unit to send.</div>
    ${unitsHtml}
    <button class="fire-btn" id="declare-attack-btn" style="margin-top:10px;">Declare Attack</button>
    <button class="fire-btn" id="cancel-attack-btn" style="background:var(--olive);">Cancel</button>
  `;
}

function attachCombatMoveEvents() {
  if (selection.from && selection.to) {
    const from = state.map[selection.from];
    attachUnitStepper('.atk-unit-btn', (key) => (from.units[key] || 0));
    document.getElementById('declare-attack-btn').addEventListener('click', () => {
      const force = {};
      UNIT_TYPES.forEach(u => {
        const el = document.getElementById(`atk-${u.key}-count`);
        if (el) force[u.key] = parseInt(el.textContent, 10) || 0;
      });
      const result = declareAttack(state, selection.from, selection.to, force);
      if (!result.ok) {
        alert(`Can't declare attack: ${result.reason}`);
        return;
      }
      selection = { from: null, to: null };
      render();
    });
    document.getElementById('cancel-attack-btn').addEventListener('click', () => {
      selection = { from: null, to: null };
      render();
    });
  }
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
    renderMap();

    if (result.concluded) {
      rollBtn.disabled = true;
      retreatBtn.disabled = true;
    }
  });

  retreatBtn.addEventListener('click', () => {
    retreatFromCombat(state);
    render();
  });
}

function renderNonCombatMovePanel(nation) {
  const hasSource = ownedTerritoriesWithUnits(nation).some(t => territoryQualifiesAsSource(t.id));
  if (!hasSource) {
    return `
      <div class="note">No repositioning available.</div>
      <button class="fire-btn" id="next-phase-btn">Next: Mobilize</button>
    `;
  }

  if (!selection.from) {
    return `
      <div class="note">Click one of your highlighted territories on the map to move units from, or continue to Mobilize.</div>
      <button class="fire-btn" id="next-phase-btn" style="background:var(--olive);">Next: Mobilize</button>
    `;
  }

  const from = state.map[selection.from];
  if (!selection.to) {
    return `
      <div class="note">Moving from <b>${from.name}</b> (${unitLabel(from.units)}). Click an outlined adjacent territory you own as the destination, or click ${from.name} again to cancel.</div>
      <button class="fire-btn" id="next-phase-btn" style="background:var(--olive);">Next: Mobilize</button>
    `;
  }

  const to = state.map[selection.to];
  const unitsHtml = UNIT_TYPES
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

  return `
    <div class="note">Moving units from <b>${from.name}</b> to <b>${to.name}</b>.</div>
    ${unitsHtml}
    <button class="fire-btn" id="move-units-btn" style="margin-top:10px;">Move Units</button>
    <button class="fire-btn" id="cancel-move-btn" style="background:var(--olive);">Cancel</button>
  `;
}

function attachNonCombatMoveEvents() {
  if (selection.from && selection.to) {
    const from = state.map[selection.from];
    attachUnitStepper('.mv-unit-btn', (key) => (from.units[key] || 0));
    document.getElementById('move-units-btn').addEventListener('click', () => {
      const force = {};
      UNIT_TYPES.forEach(u => {
        const el = document.getElementById(`mv-${u.key}-count`);
        if (el) force[u.key] = parseInt(el.textContent, 10) || 0;
      });
      const result = moveUnitsNonCombat(state, selection.from, selection.to, force);
      if (!result.ok) {
        alert(`Can't move units: ${result.reason}`);
        return;
      }
      selection = { from: null, to: null };
      render();
    });
    document.getElementById('cancel-move-btn').addEventListener('click', () => {
      selection = { from: null, to: null };
      render();
    });
  }
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
  renderMap();
  renderPhasePanel();
  renderLog();
}

document.getElementById('new-game-btn').addEventListener('click', startNewGame);

render();
