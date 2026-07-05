// A small test map — not the full 1942 board. Just enough territories to
// exercise every kind of adjacency the real map will need: land-to-land,
// land-to-sea, and sea-to-sea, plus more than one owner.
//
//   [Eastern Front]---[Poland]---[Germany]---[North Sea]---[United Kingdom]
//        (USSR)         (Ger)       (Ger)          |               |
//                                      \            |               |
//                                       \--[Western Europe]--[Atlantic]--/
//
// Coordinates are left out on purpose — this is the logical graph only.
// Rendering positions can be layered on later without touching this data.

export const NATIONS = {
  germany: { id: 'germany', name: 'Germany', side: 'axis' },
  ussr:    { id: 'ussr',    name: 'USSR',     side: 'allies' },
  uk:      { id: 'uk',      name: 'United Kingdom', side: 'allies' },
};

// `owner` is a NATIONS key, or null for unowned sea zones.
// `units` is a map of unit-type key -> count garrisoned there right now.
export const TERRITORIES = {
  germany: {
    id: 'germany',
    name: 'Germany',
    type: 'land',
    owner: 'germany',
    isCapital: true,
    ipcValue: 10,
    adjacent: ['western_europe', 'poland', 'north_sea'],
    units: { inf: 3, tank: 2 },
  },
  western_europe: {
    id: 'western_europe',
    name: 'Western Europe',
    type: 'land',
    owner: 'germany',
    isCapital: false,
    ipcValue: 3,
    adjacent: ['germany', 'north_sea', 'atlantic'],
    units: { inf: 1 },
  },
  poland: {
    id: 'poland',
    name: 'Poland',
    type: 'land',
    owner: 'germany',
    isCapital: false,
    ipcValue: 2,
    adjacent: ['germany', 'eastern_front'],
    units: { inf: 2 },
  },
  eastern_front: {
    id: 'eastern_front',
    name: 'Eastern Front',
    type: 'land',
    owner: 'ussr',
    isCapital: false,
    ipcValue: 4,
    adjacent: ['poland'],
    units: { inf: 3 },
  },
  united_kingdom: {
    id: 'united_kingdom',
    name: 'United Kingdom',
    type: 'land',
    owner: 'uk',
    isCapital: true,
    ipcValue: 8,
    adjacent: ['north_sea', 'atlantic'],
    units: { inf: 2, fighter: 1 },
  },
  north_sea: {
    id: 'north_sea',
    name: 'North Sea',
    type: 'sea',
    owner: null,
    isCapital: false,
    ipcValue: 0,
    adjacent: ['germany', 'western_europe', 'united_kingdom', 'atlantic'],
    units: {},
  },
  atlantic: {
    id: 'atlantic',
    name: 'Atlantic',
    type: 'sea',
    owner: null,
    isCapital: false,
    ipcValue: 0,
    adjacent: ['western_europe', 'united_kingdom', 'north_sea'],
    units: {},
  },
};
