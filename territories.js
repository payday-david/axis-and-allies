// Territory / map data model — simplified subset (not the full 1942 board).
// Two sides for now: "Axis" and "Allies". Each side has exactly one capital
// (Germany for Axis, Eastern US for Allies) — that's the territory the AI's
// "capital defense is a hard rule" logic and win condition should key off of.
//
// Fields:
//   id       — unique key, used in adjacency lists
//   name     — display name
//   type     — "land" or "sea" (sea zones move ships/fighters, no IPC income)
//   owner    — "Axis" | "Allies" (sea zones have no owner)
//   capital  — true for the one territory per side whose capture ends the game
//   ipc      — income generated per turn if owned (0 for sea zones)
//   adjacent — ids of directly connected territories/sea zones
//   garrison — starting units stationed there, by unit type
//              (unit types match combat-resolver.html: infantry, tank, fighter, bomber)

const TERRITORIES = {
  // ---- Allies ----
  easternUS: {
    id: "easternUS",
    name: "Eastern United States",
    type: "land",
    owner: "Allies",
    capital: true,
    ipc: 10,
    adjacent: ["westernUS", "northAtlantic"],
    garrison: { infantry: 3, tank: 1 },
  },
  westernUS: {
    id: "westernUS",
    name: "Western United States",
    type: "land",
    owner: "Allies",
    capital: false,
    ipc: 6,
    adjacent: ["easternUS", "northPacific"],
    garrison: { infantry: 1 },
  },
  unitedKingdom: {
    id: "unitedKingdom",
    name: "United Kingdom",
    type: "land",
    owner: "Allies",
    capital: false,
    ipc: 7,
    adjacent: ["northAtlantic", "balticSea"],
    garrison: { infantry: 2, fighter: 1 },
  },
  russia: {
    id: "russia",
    name: "Russia",
    type: "land",
    owner: "Allies",
    capital: false,
    ipc: 8,
    adjacent: ["easternEurope", "siberia"],
    garrison: { infantry: 3 },
  },
  siberia: {
    id: "siberia",
    name: "Siberia",
    type: "land",
    owner: "Allies",
    capital: false,
    ipc: 2,
    adjacent: ["russia", "manchuria"],
    garrison: { infantry: 1 },
  },

  // ---- Axis ----
  westernEurope: {
    id: "westernEurope",
    name: "Western Europe",
    type: "land",
    owner: "Axis",
    capital: false,
    ipc: 5,
    adjacent: ["germany", "northAtlantic"],
    garrison: { infantry: 2 },
  },
  germany: {
    id: "germany",
    name: "Germany",
    type: "land",
    owner: "Axis",
    capital: true,
    ipc: 10,
    adjacent: ["westernEurope", "easternEurope", "balticSea"],
    garrison: { infantry: 3, tank: 1, fighter: 1 },
  },
  easternEurope: {
    id: "easternEurope",
    name: "Eastern Europe",
    type: "land",
    owner: "Axis",
    capital: false,
    ipc: 3,
    adjacent: ["germany", "russia"],
    garrison: { infantry: 1 },
  },
  japan: {
    id: "japan",
    name: "Japan",
    type: "land",
    owner: "Axis",
    capital: false,
    ipc: 8,
    adjacent: ["seaOfJapan", "northPacific"],
    garrison: { infantry: 2, fighter: 1 },
  },
  manchuria: {
    id: "manchuria",
    name: "Manchuria",
    type: "land",
    owner: "Axis",
    capital: false,
    ipc: 3,
    adjacent: ["siberia", "seaOfJapan"],
    garrison: { infantry: 1 },
  },

  // ---- Sea zones (no owner, no income; navy/fighters pass through) ----
  northAtlantic: {
    id: "northAtlantic",
    name: "North Atlantic",
    type: "sea",
    owner: null,
    capital: false,
    ipc: 0,
    adjacent: ["easternUS", "unitedKingdom", "westernEurope"],
    garrison: {},
  },
  balticSea: {
    id: "balticSea",
    name: "Baltic Sea",
    type: "sea",
    owner: null,
    capital: false,
    ipc: 0,
    adjacent: ["germany", "unitedKingdom"],
    garrison: {},
  },
  northPacific: {
    id: "northPacific",
    name: "North Pacific",
    type: "sea",
    owner: null,
    capital: false,
    ipc: 0,
    adjacent: ["westernUS", "japan"],
    garrison: {},
  },
  seaOfJapan: {
    id: "seaOfJapan",
    name: "Sea of Japan",
    type: "sea",
    owner: null,
    capital: false,
    ipc: 0,
    adjacent: ["japan", "manchuria"],
    garrison: {},
  },
};
