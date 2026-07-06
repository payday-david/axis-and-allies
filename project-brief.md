# Project Brief: Axis & Allies-Style Single-Player Web Game

## What this is
A single-player, browser-based strategy game inspired by Axis & Allies (1942-style), played against an AI opponent. Turn-based, not real-time. This is a from-scratch build with custom rules (mostly matching the original, with some intentional tweaks to be decided during development).

## Why this project exists
The person building this (with Claude's help) noticed that the official "Axis & Allies 1942 Online" app has community complaints about its dice randomizer feeling biased/unfair. The core motivation for this project is a genuinely fair, provably random dice system, plus full control over rules and AI behavior.

## What's already been prototyped (in a separate chat, as an HTML file)
A standalone combat resolution module already exists and works. Key decisions already made and tested:

- **Fair dice**: uses `crypto.getRandomValues()` with rejection sampling (not `Math.random()`, not naive modulo) to guarantee no bias in 1–6 rolls.
- **Unit stats** (simplified 1942-style, attack/defense out of 6, IPC cost):
  - Infantry: atk 1 / def 2 / cost 3
  - Tank: atk 3 / def 3 / cost 5
  - Fighter: atk 3 / def 4 / cost 10
  - Bomber: atk 4 / def 1 / cost 12
- **Combat resolution**: each unit rolls its own die; a roll ≤ its attack (if attacking) or ≤ its defense (if defending) counts as a hit.
- **Casualty selection**: two modes were built —
  1. "Cheapest first" (official rule): lowest-IPC-cost units are removed first automatically.
  2. "Owner's choice" (house rule): the owning player manually picks which units are lost, with a UI enforcing the exact number of required losses before confirming.
- **Fairness audit**: a live histogram tracks every die rolled during a session against the expected 16.7% per face, so the person can visually verify the RNG isn't skewed — this was a deliberate feature, not just a nice-to-have, given the original motivation for the project.

This existing logic should be treated as a working spec for the combat engine — port/refactor it into the real project rather than redesigning it from scratch.

## Overall architecture needed (not yet built)
1. **Map & territories** — data structure for zones (land + sea), adjacency/borders, ownership, and what's garrisoned where. This is the foundation everything else depends on.
2. **Turn structure** — phase-based turn engine: Purchase units → Combat move → Combat resolution (existing module) → Non-combat move → Mobilize new units → Collect income.
3. **Economy** — territories generate IPC income; income funds unit purchases via a purchase UI.
4. **AI opponent** — rule-based (not ML), decision-by-scoring. Requirements already discussed and agreed:
   - **Aggression level: Balanced** — roughly even weighting between offensive and defensive unit purchases/investment, adjusted only when a territory is genuinely threatened.
   - **Must feel "decent from day one,"** meaning these specific safeguards are required, not optional polish:
     - Never attack unless the odds clearly favor the AI (not just >1 ratio) — prevents suicide attacks.
     - Before committing units to offense, check what's left defending the source territory — don't strip defenses to attack.
     - Capital defense is a hard rule, checked/reinforced before other spending every turn.
     - Mass forces before attacking rather than trickling units in piecemeal.
     - One-turn lookahead: before attacking, check whether the enemy could immediately retake the territory next turn — if so, weight that attack down even if current-turn odds look fine.
   - Scoring-based structure for attacks, purchases, and defense (see below for pseudocode reference).
5. **Win conditions** — territory/city count thresholds, similar to the original game.

## AI scoring reference (conceptual pseudocode from planning discussion)
```
function scoreAttack(territory) {
  let myPower = sumAttackValues(myUnitsAvailable);
  let theirPower = sumDefenseValues(territory.defenders);
  let oddsRatio = myPower / (theirPower + 1);

  let score = oddsRatio * territory.value;
  if (territory.isCapital) score *= 2;
  if (oddsRatio < 1.2) score *= 0.2; // penalize risky attacks
  return score;
}

function scorePurchase(unitType, situation) {
  if (situation.underDefended) return unitType.defense * 2;
  if (situation.planningOffense) return unitType.attack * 2;
  return unitType.attack + unitType.defense;
}
```
This is a starting point, not a spec to follow rigidly — refine as needed once real map/turn data exists to test against.

## Suggested build order for Claude Code
1. Set up project skeleton (recommend: plain HTML/JS/CSS or a lightweight framework — person has no coding background, so favor simplicity and readability over cleverness).
2. Port the existing combat resolution logic (dice + casualties) into the real project structure as its own module.
3. Build map/territory data model (start small — a simplified subset of territories, not the full 1942 board, to get the loop working end-to-end first).
4. Build turn-phase engine.
5. Build economy/purchase UI.
6. Build AI opponent using the scoring approach above, starting with attack/defense decisions before adding purchase logic.
7. Playtest loop, then iterate on rules and AI weighting based on how games actually feel.

## Known tech debt
- **Unit stats are duplicated**: `js/units.js` (array, used by app/combat/turns/game) and
  `js/data/units.js` (keyed object, used by map.js) both define the same Infantry/Tank/
  Fighter/Bomber stats independently. Fine to leave as-is for now, but reconcile into one
  shared source before building the AI opponent (item 4 above) — it needs to read
  consistent unit stats from a single place, and scoring logic shouldn't have to guess
  which copy is authoritative.

## Important context about the person building this
- No coding background — needs things explained in plain language, and code changes described in terms of what they do, not just what changed.
- Prefers incremental, testable pieces over big-bang builds.
- Cares specifically about dice fairness — this was the original spark for the whole project, so any change to randomization logic should be flagged clearly and explained.
- Plays Axis & Allies regularly with a friend group and has real rules knowledge — will give specific, informed feedback on whether mechanics feel right.
