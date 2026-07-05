// Territory / map data model — simplified subset (not the full 1942 board).
// Five nations across two sides: Germany + Japan (Axis), USA + UK + USSR
// (Allies). Each side has exactly one capital (Germany for Axis, Eastern US
// for Allies) — that's the territory the AI's "capital defense is a hard
// rule" logic and win condition should key off of.
//
//   [Siberia]---[Russia]---[Eastern Europe]---[Germany]---[Western Europe]
//      |                                          |              |
//   [Manchuria]                              [Baltic Sea]  [North Atlantic]
//      |                                          |              |
//   [Sea of Japan]                          [United Kingdom] [Eastern US]
//      |                                                          |
//   [Japan]---[North Pacific]---[Western US]-----------------------
//
// `owner` is a NATIONS key, or null for unowned sea zones.
// `units` is a map of unit-type key -> count garrisoned there right now
// (keys match UNIT_TYPES in ./units.js: inf, tank, fighter, bomber).

export const NATIONS = {
  germany: { id: 'germany', name: 'Germany',        side: 'axis' },
  japan:   { id: 'japan',   name: 'Japan',           side: 'axis' },
  usa:     { id: 'usa',     name: 'United States',   side: 'allies' },
  uk:      { id: 'uk',      name: 'United Kingdom',  side: 'allies' },
  ussr:    { id: 'ussr',    name: 'USSR',            side: 'allies' },
};

export const TERRITORIES = {
  // ---- Allies ----
  easternUS: {
    id: 'easternUS',
    name: 'Eastern United States',
    type: 'land',
    owner: 'usa',
    isCapital: true,
    ipcValue: 10,
    adjacent: ['westernUS', 'northAtlantic'],
    units: { inf: 3, tank: 1 },
  },
  westernUS: {
    id: 'westernUS',
    name: 'Western United States',
    type: 'land',
    owner: 'usa',
    isCapital: false,
    ipcValue: 6,
    adjacent: ['easternUS', 'northPacific'],
    units: { inf: 1 },
  },
  unitedKingdom: {
    id: 'unitedKingdom',
    name: 'United Kingdom',
    type: 'land',
    owner: 'uk',
    isCapital: false,
    ipcValue: 7,
    adjacent: ['northAtlantic', 'balticSea'],
    units: { inf: 2, fighter: 1 },
  },
  russia: {
    id: 'russia',
    name: 'Russia',
    type: 'land',
    owner: 'ussr',
    isCapital: false,
    ipcValue: 8,
    adjacent: ['easternEurope', 'siberia'],
    units: { inf: 3 },
  },
  siberia: {
    id: 'siberia',
    name: 'Siberia',
    type: 'land',
    owner: 'ussr',
    isCapital: false,
    ipcValue: 2,
    adjacent: ['russia', 'manchuria'],
    units: { inf: 1 },
  },

  // ---- Axis ----
  westernEurope: {
    id: 'westernEurope',
    name: 'Western Europe',
    type: 'land',
    owner: 'germany',
    isCapital: false,
    ipcValue: 5,
    adjacent: ['germany', 'northAtlantic'],
    units: { inf: 2 },
  },
  germany: {
    id: 'germany',
    name: 'Germany',
    type: 'land',
    owner: 'germany',
    isCapital: true,
    ipcValue: 10,
    adjacent: ['westernEurope', 'easternEurope', 'balticSea'],
    units: { inf: 3, tank: 1, fighter: 1 },
  },
  easternEurope: {
    id: 'easternEurope',
    name: 'Eastern Europe',
    type: 'land',
    owner: 'germany',
    isCapital: false,
    ipcValue: 3,
    adjacent: ['germany', 'russia'],
    units: { inf: 1 },
  },
  japan: {
    id: 'japan',
    name: 'Japan',
    type: 'land',
    owner: 'japan',
    isCapital: false,
    ipcValue: 8,
    adjacent: ['seaOfJapan', 'northPacific'],
    units: { inf: 2, fighter: 1 },
  },
  manchuria: {
    id: 'manchuria',
    name: 'Manchuria',
    type: 'land',
    owner: 'japan',
    isCapital: false,
    ipcValue: 3,
    adjacent: ['siberia', 'seaOfJapan'],
    units: { inf: 1 },
  },

  // ---- Sea zones (no owner, no income; navy/fighters pass through) ----
  northAtlantic: {
    id: 'northAtlantic',
    name: 'North Atlantic',
    type: 'sea',
    owner: null,
    isCapital: false,
    ipcValue: 0,
    adjacent: ['easternUS', 'unitedKingdom', 'westernEurope'],
    units: {},
  },
  balticSea: {
    id: 'balticSea',
    name: 'Baltic Sea',
    type: 'sea',
    owner: null,
    isCapital: false,
    ipcValue: 0,
    adjacent: ['germany', 'unitedKingdom'],
    units: {},
  },
  northPacific: {
    id: 'northPacific',
    name: 'North Pacific',
    type: 'sea',
    owner: null,
    isCapital: false,
    ipcValue: 0,
    adjacent: ['westernUS', 'japan'],
    units: {},
  },
  seaOfJapan: {
    id: 'seaOfJapan',
    name: 'Sea of Japan',
    type: 'sea',
    owner: null,
    isCapital: false,
    ipcValue: 0,
    adjacent: ['japan', 'manchuria'],
    units: {},
  },
};
