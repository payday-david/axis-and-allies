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
// Each territory occupies a full grid cell; whether it visually touches its
// grid neighbor (zero-gap shared border, like a Risk-style province map) or
// stays separated by open parchment is derived below from real adjacency,
// so touching on screen always means "these are actually adjacent."
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
// Historical faction colors rather than an arbitrary palette: Germany
// feldgrau, Japan's rising-sun red-orange, US navy blue, UK khaki, USSR red.
const NATION_COLORS = { germany: '#6b6459', japan: '#c1533a', usa: '#3f6e8c', uk: '#7a7a4a', ussr: '#9c3b3b' };
const SEA_ZONES = new Set(['northAtlantic', 'balticSea', 'northPacific', 'seaOfJapan']);
const SEA_FILL = '#8fb3c4';

// Two adjacent pairs sit diagonally in the grid and never share a cell edge,
// so they can't touch no matter how the shapes are drawn - drawn instead as
// dashed sea-route arcs connecting the two territories.
const SEA_ROUTES = [
  { from: 'easternUS', to: 'westernUS', control: { x: 370, y: 430 } },
  { from: 'unitedKingdom', to: 'northAtlantic', control: { x: 650, y: 250 } },
];

const CELL_W = 170, CELL_H = 130, ORIGIN_X = 30, ORIGIN_Y = 30, MARGIN = 13;

function cellRect(id) {
  const { col, row } = LAYOUT[id];
  const x0 = ORIGIN_X + col * CELL_W, y0 = ORIGIN_Y + row * CELL_H;
  return { x0, y0, x1: x0 + CELL_W, y1: y0 + CELL_H };
}
function cellCenter(id) {
  const { x0, y0, x1, y1 } = cellRect(id);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

// For each territory, whether its North/East/South/West side sits against
// another territory it's actually adjacent to (computed once from the
// static adjacency graph - owner/units change during play, adjacency never does).
function computeSideTouch(territories) {
  const cellOf = {};
  Object.entries(LAYOUT).forEach(([id, pos]) => { cellOf[`${pos.col},${pos.row}`] = id; });
  const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const touch = {};
  Object.keys(LAYOUT).forEach(id => {
    touch[id] = {};
    Object.entries(DIRS).forEach(([dir, [dc, dr]]) => {
      const { col, row } = LAYOUT[id];
      const neighborId = cellOf[`${col + dc},${row + dr}`];
      touch[id][dir] = !!(neighborId && territories[id].adjacent.includes(neighborId));
    });
  });
  return touch;
}
const SIDE_TOUCH = computeSideTouch(map);

// Deterministic per-territory jitter so the hand-drawn wobble is stable
// across re-renders instead of reshuffling on every click.
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  return function next() {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds the outline of one territory: sides shared with an adjacent
// territory stay a straight zero-gap edge; open sides pull inward and get
// a jittered, multi-segment coastline for a hand-drawn feel.
function buildTerritoryOutline(id) {
  const rng = seededRandom(id);
  const { x0, y0, x1, y1 } = cellRect(id);
  const t = SIDE_TOUCH[id];
  const top = t.N ? y0 : y0 + MARGIN;
  const bottom = t.S ? y1 : y1 - MARGIN;
  const left = t.W ? x0 : x0 + MARGIN;
  const right = t.E ? x1 : x1 - MARGIN;

  const corners = { TL: [left, top], TR: [right, top], BR: [right, bottom], BL: [left, bottom] };
  const points = [corners.TL];

  function addSide(from, to, jagged) {
    if (!jagged) { points.push(to); return; }
    const steps = 4;
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const x = from[0] + dx * f, y = from[1] + dy * f;
      if (i === steps) { points.push([x, y]); continue; }
      const jitter = (rng() - 0.5) * 16;
      points.push([x + nx * jitter, y + ny * jitter]);
    }
  }

  addSide(corners.TL, corners.TR, !t.N);
  addSide(corners.TR, corners.BR, !t.E);
  addSide(corners.BR, corners.BL, !t.S);
  addSide(corners.BL, corners.TL, !t.W);
  return points;
}

// Land renders as straight jittered segments (angular, hand-cut coastline).
// Sea renders as smoothed curves through the same points (wavy water).
function pathFromPoints(points, smooth) {
  if (!smooth) {
    return `M ${points[0][0]},${points[0][1]} ` +
      points.slice(1).map(p => `L ${p[0]},${p[1]}`).join(' ') + ' Z';
  }
  let d = `M ${points[0][0]},${points[0][1]} `;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const midX = (curr[0] + next[0]) / 2, midY = (curr[1] + next[1]) / 2;
    d += `Q ${curr[0]},${curr[1]} ${midX},${midY} `;
  }
  return d + 'Z';
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

const WAVE_PATTERN_DEFS = `
  <defs>
    <pattern id="wavePattern" width="40" height="18" patternUnits="userSpaceOnUse">
      <path d="M0,9 Q10,2 20,9 T40,9" stroke="#5f8298" stroke-width="1.5" fill="none" opacity="0.55"></path>
    </pattern>
  </defs>
`;

function renderMap() {
  const svgEl = document.getElementById('map-svg');

  let routesHtml = '';
  SEA_ROUTES.forEach(({ from, to, control }) => {
    const a = cellCenter(from), b = cellCenter(to);
    routesHtml += `<path d="M ${a.x},${a.y} Q ${control.x},${control.y} ${b.x},${b.y}" class="map-route" />`;
  });

  let shapesHtml = '';
  Object.values(state.map).forEach(t => {
    const isSea = SEA_ZONES.has(t.id);
    const points = buildTerritoryOutline(t.id);
    const d = pathFromPoints(points, isSea);
    const fill = isSea ? SEA_FILL : NATION_COLORS[t.owner];
    const center = cellCenter(t.id);

    const classes = ['map-territory', isSea ? 'map-sea' : 'map-land'];
    if (!selection.from && territoryQualifiesAsSource(t.id)) classes.push('map-selectable');
    if (selection.from === t.id) classes.push('map-selected-from');
    if (selection.from && !selection.to && territoryQualifiesAsTarget(t.id)) classes.push('map-valid-target');
    if (selection.to === t.id) classes.push('map-selected-to');
    if (state.pendingAttack && (t.id === state.pendingAttack.fromId || t.id === state.pendingAttack.toId)) {
      classes.push('map-in-combat');
    }

    const labels = isSea
      ? `<text x="${center.x}" y="${center.y + 4}" class="map-name map-sea-name" text-anchor="middle">${SHORT_NAMES[t.id]}</text>`
      : `
        <text x="${center.x}" y="${center.y - 12}" class="map-name" text-anchor="middle">${SHORT_NAMES[t.id]}${t.isCapital ? ' ★' : ''}</text>
        <text x="${center.x}" y="${center.y + 4}" class="map-units" text-anchor="middle">${compactUnits(t.units)}</text>
        <text x="${center.x}" y="${center.y + 18}" class="map-ipc" text-anchor="middle">${t.ipcValue} IPC</text>
      `;

    shapesHtml += `
      <g class="${classes.join(' ')}" data-territory="${t.id}">
        <path d="${d}" class="map-shape" style="fill:${fill}"></path>
        ${isSea ? `<path d="${d}" class="map-wave-overlay"></path>` : ''}
        ${labels}
      </g>
    `;
  });

  svgEl.innerHTML = WAVE_PATTERN_DEFS + routesHtml + shapesHtml;
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
