// UI wiring for the combat resolver page: owns DOM state/rendering and calls
// into the game-logic modules (units, combat, audit) to do the actual work.
import { UNIT_TYPES, createEmptyForce, totalUnits } from './units.js';
import { resolveCombatRound, selectCasualtiesCheapest, applyCasualties, casualtyLabel } from './combat.js';
import { createAuditTracker } from './audit.js';

const state = {
  attacker: { ...createEmptyForce(), fighter: 2, bomber: 2 },
  defender: createEmptyForce(),
};

const audit = createAuditTracker();
let pending = null; // in-progress owner's-choice casualty assignment

function renderUnitPanel(side) {
  const container = document.getElementById(side + '-units');
  container.innerHTML = '';
  UNIT_TYPES.forEach(u => {
    const row = document.createElement('div');
    row.className = 'unit-row';
    row.innerHTML = `
      <div class="unit-name"><b>${u.name}</b><span>${u.sub}</span></div>
      <div class="stepper">
        <button data-side="${side}" data-key="${u.key}" data-delta="-1">−</button>
        <span class="count" id="${side}-${u.key}-count">${state[side][u.key]}</span>
        <button data-side="${side}" data-key="${u.key}" data-delta="1">+</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function attachStepperEvents() {
  document.querySelectorAll('.stepper button').forEach(btn => {
    btn.addEventListener('click', () => {
      const side = btn.dataset.side, key = btn.dataset.key, delta = parseInt(btn.dataset.delta);
      const next = Math.max(0, state[side][key] + delta);
      state[side][key] = next;
      document.getElementById(`${side}-${key}-count`).textContent = next;
    });
  });
}

function buildRollLine(label, unit, rolls, threshold) {
  const hits = rolls.filter(r => r <= threshold).length;
  const diceHtml = rolls.map(r => `<span class="die ${r <= threshold ? 'hit' : ''}">${r}</span>`).join('');
  return `<div class="roll-line"><b>${label}</b> — ${unit.name} ×${rolls.length} (needs ≤${threshold})
    <span class="dice-row">${diceHtml}</span>
    <div class="result-line">${hits} hit${hits !== 1 ? 's' : ''}</div>
  </div>`;
}

function resolveCombat() {
  const aTotal = totalUnits(state.attacker);
  const dTotal = totalUnits(state.defender);
  if (aTotal === 0 && dTotal === 0) {
    document.getElementById('reportBody').innerHTML = `<div class="roll-line" style="border:none;color:#6b6a5d;">Add at least one unit to a side before rolling.</div>`;
    return;
  }

  const result = resolveCombatRound(state.attacker, state.defender);

  let html = '';
  result.attackerRolls.forEach(r => { html += buildRollLine('Attacker', r.unit, r.rolls, r.threshold); });
  result.defenderRolls.forEach(r => { html += buildRollLine('Defender', r.unit, r.rolls, r.threshold); });
  html += `<div class="roll-line"><b>Hits scored:</b> Attacker lands ${result.attackerHits} hit${result.attackerHits !== 1 ? 's' : ''} on the defender. Defender lands ${result.defenderHits} hit${result.defenderHits !== 1 ? 's' : ''} on the attacker.</div>`;

  document.getElementById('reportBody').innerHTML = html;

  const allRolls = [...result.attackerRolls, ...result.defenderRolls].flatMap(r => r.rolls);
  audit.record(allRolls);
  renderAudit();

  const rule = document.getElementById('casualtyRule').value;
  const { defenderLossesNeeded, attackerLossesNeeded } = result;

  if (rule === 'cheapest') {
    let casHtml = '';
    if (defenderLossesNeeded > 0) {
      const removed = selectCasualtiesCheapest(state.defender, defenderLossesNeeded);
      casHtml += `<div class="roll-line"><b>Defender casualties:</b> ${casualtyLabel(removed)}</div>`;
    }
    if (attackerLossesNeeded > 0) {
      const removed = selectCasualtiesCheapest(state.attacker, attackerLossesNeeded);
      casHtml += `<div class="roll-line"><b>Attacker casualties:</b> ${casualtyLabel(removed)}</div>`;
    }
    if (defenderLossesNeeded === 0 && attackerLossesNeeded === 0) {
      casHtml += `<div class="roll-line" style="border:none;color:#6b6a5d;">No hits landed on either side.</div>`;
    }
    document.getElementById('reportBody').innerHTML += casHtml;
    renderUnitPanel('attacker');
    renderUnitPanel('defender');
    attachStepperEvents();
    document.getElementById('stamp').style.display = 'inline-block';
  } else {
    if (defenderLossesNeeded === 0 && attackerLossesNeeded === 0) {
      document.getElementById('reportBody').innerHTML += `<div class="roll-line" style="border:none;color:#6b6a5d;">No hits landed on either side.</div>`;
      document.getElementById('stamp').style.display = 'inline-block';
      return;
    }
    pending = {
      defender: { needed: defenderLossesNeeded, assigned: {} },
      attacker: { needed: attackerLossesNeeded, assigned: {} },
    };
    UNIT_TYPES.forEach(u => { pending.defender.assigned[u.key] = 0; pending.attacker.assigned[u.key] = 0; });
    renderCasualtyPicker();
  }
}

function renderCasualtyPicker() {
  let html = '<div class="roll-line" style="border:none;"><b>Assign casualties</b> — pick which units are lost on each side, then confirm.</div>';

  ['defender', 'attacker'].forEach(side => {
    const p = pending[side];
    if (p.needed === 0) return;
    const assignedTotal = Object.values(p.assigned).reduce((a, b) => a + b, 0);
    html += `<div class="roll-line">
      <b>${side === 'defender' ? 'Defender' : 'Attacker'} must lose ${p.needed} unit${p.needed !== 1 ? 's' : ''}</b>
      (assigned: <span id="${side}-assigned-count">${assignedTotal}</span> / ${p.needed})`;
    UNIT_TYPES.forEach(u => {
      const available = state[side][u.key];
      if (available === 0) return;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;">
        <span>${u.name} (have ${available})</span>
        <span class="stepper">
          <button class="cas-btn" data-side="${side}" data-key="${u.key}" data-delta="-1">−</button>
          <span class="count" id="cas-${side}-${u.key}">${p.assigned[u.key]}</span>
          <button class="cas-btn" data-side="${side}" data-key="${u.key}" data-delta="1">+</button>
        </span>
      </div>`;
    });
    html += `</div>`;
  });

  html += `<button class="fire-btn" id="confirmCasualties" style="background:var(--olive);margin-top:4px;">Confirm Casualties</button>`;

  document.getElementById('reportBody').innerHTML += html;

  document.querySelectorAll('.cas-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const side = btn.dataset.side, key = btn.dataset.key, delta = parseInt(btn.dataset.delta);
      const p = pending[side];
      const assignedTotal = Object.values(p.assigned).reduce((a, b) => a + b, 0);
      const available = state[side][key];
      const next = p.assigned[key] + delta;
      if (next < 0) return;
      if (next > available) return;
      if (delta > 0 && assignedTotal >= p.needed) return;
      p.assigned[key] = next;
      document.getElementById(`cas-${side}-${key}`).textContent = next;
      const newTotal = Object.values(p.assigned).reduce((a, b) => a + b, 0);
      document.getElementById(`${side}-assigned-count`).textContent = newTotal;
    });
  });

  document.getElementById('confirmCasualties').addEventListener('click', () => {
    const ready = ['defender', 'attacker'].every(side => {
      const p = pending[side];
      const assignedTotal = Object.values(p.assigned).reduce((a, b) => a + b, 0);
      return assignedTotal === p.needed;
    });
    if (!ready) {
      alert('Assign exactly the required number of losses on each side before confirming.');
      return;
    }
    let casHtml = '';
    ['defender', 'attacker'].forEach(side => {
      const p = pending[side];
      if (p.needed === 0) return;
      applyCasualties(state[side], p.assigned);
      casHtml += `<div class="roll-line"><b>${side === 'defender' ? 'Defender' : 'Attacker'} casualties:</b> ${casualtyLabel(p.assigned)}</div>`;
    });
    document.getElementById('reportBody').innerHTML += casHtml;
    pending = null;
    renderUnitPanel('attacker');
    renderUnitPanel('defender');
    attachStepperEvents();
    document.getElementById('stamp').style.display = 'inline-block';
  });
}

function renderAudit() {
  const counts = audit.getCounts();
  const total = audit.getTotal();
  const barsEl = document.getElementById('bars');
  barsEl.innerHTML = '';
  const maxCount = Math.max(...counts, 1);
  for (let face = 1; face <= 6; face++) {
    const count = counts[face - 1];
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const heightPct = total > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 4 : 0) : 0;
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `
      <div style="position:relative; width:100%; height:100%; display:flex; align-items:flex-end;">
        <div class="bar" style="height:${heightPct}%;"></div>
      </div>
      <div class="bar-label">${face}</div>
      <div class="bar-pct">${pct}%</div>
    `;
    barsEl.appendChild(col);
  }
  document.getElementById('totalRolls').textContent = `Total dice rolled: ${total}`;
}

document.getElementById('fireBtn').addEventListener('click', resolveCombat);
document.getElementById('resetAudit').addEventListener('click', () => {
  audit.reset();
  renderAudit();
});

renderUnitPanel('attacker');
renderUnitPanel('defender');
attachStepperEvents();
renderAudit();
