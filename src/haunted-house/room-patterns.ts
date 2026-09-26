import type { Direction, Position, Room } from './types.ts';

/** Authored footprints. # is wall, F is solid furniture; letters are floor anchors. */
interface Pattern { id: string; rows: string[]; furniture?: string }
const PATTERNS: Record<string, Pattern> = {
  'foyer-wide': {
    id: 'foyer-wide', furniture: 'Covered settee', rows: [
      '###########', '#....N....#', '#..a...b..#', '#....FF...#', '#W..n....E#',
      '#.d..P....#', '#.c.......#', '#....S....#', '###########',
    ],
  },
  'foyer-l': {
    id: 'foyer-l', furniture: 'Umbrella stand', rows: [
      '###########', '#..N.######', '#.a..######', '#....######', '#W...F...E#',
      '#..n.P.b..#', '#.c.....d.#', '#....S....#', '###########',
    ],
  },
  'foyer-alcove': {
    id: 'foyer-alcove', furniture: 'Cloth-draped chair', rows: [
      '###########', '#..N..##d##', '#..a..##h##', '#.........#', '#W..n.F..E#',
      '#....Pb...#', '#.c.......#', '#....S....#', '###########',
    ],
  },
  workshop: {
    id: 'workshop', furniture: 'Heavy workbench', rows: [
      '#########', '#...N...#', '#.a.....#', '#W.FFF.E#', '#....b..#', '#...S...#', '#########',
    ],
  },
  study: {
    id: 'study', furniture: 'Tall bookcase', rows: [
      '#########', '#..N....#', '#.a...b.#', '#W.....E#', '#...F...#', '#.c.#####',
      '#...#####', '#..S#####', '#########',
    ],
  },
  landing: {
    id: 'landing', furniture: 'Portrait pedestal', rows: [
      '#######', '###N###', '###.###', '#W...E#', '##a..##', '###S###', '#######',
    ],
  },
  'long-hall': {
    id: 'long-hall', rows: [
      '###########', '#####N#####', '#W.......E#', '#####S#####', '###########',
    ],
  },
  'guard-gallery': {
    id: 'guard-gallery', furniture: 'Stone memorial bust', rows: [
      '###########', '#..N.######', '#.a..##...#', '#W...g...E#', '#....##...#',
      '#..S.######', '###########',
    ],
  },
  archive: {
    id: 'archive', furniture: 'Shelves of records', rows: [
      '###########', '#....N....#', '#..a...b..#', '#..FFF....#', '#W.F.....E#',
      '#..F...c..#', '#....S....#', '###########',
    ],
  },
  memorial: {
    id: 'memorial', furniture: 'Canopied bed', rows: [
      '###########', '#....N....#', '#..a...b..#', '#.....F...#', '#W....g..E#',
      '#..c..F...#', '#.........#', '#....S....#', '###########',
    ],
  },
  closet: { id: 'closet', rows: ['#####', '##N##', '#W.E#', '##S##', '#####'] },
  storage: { id: 'storage', furniture: 'Stacked trunks', rows: ['#######', '#..N..#', '#.a.F.#', '#W...E#', '#..S..#', '#######'] },
  nursery: {
    id: 'nursery', furniture: 'Empty cradle', rows: [
      '#########', '#...N...#', '#.a.F...#', '#...F...#', '#W.....E#', '#..b....#', '#...S...#', '#########',
    ],
  },
  'divided-parlour': {
    id: 'divided-parlour', furniture: 'Folding screen', rows: [
      '#############', '#.....N.....#', '#.a...#..b..#', '#.....#.....#', '#W....F....E#',
      '#.....#.....#', '#.....#..c..#', '#.....S.....#', '#############',
    ],
  },
  'treasure-alcove': {
    id: 'treasure-alcove', rows: [
      '#########', '#..N.####', '#....##a#', '#W...g..#', '#....####', '#..S.####', '#########',
    ],
  },
};

export interface PatternRoom { room: Room; ports: Partial<Record<Direction, Position>>; anchors: Record<string, Position> }

export function roomPatterns(): string[] { return Object.keys(PATTERNS); }

export function makePatternRoom(patternId: string, id: string, name: string, floor: number, mapX: number, mapY: number): PatternRoom {
  const pattern = PATTERNS[patternId];
  if (!pattern) throw new Error(`Unknown room pattern: ${patternId}`);
  const width = pattern.rows[0].length;
  if (pattern.rows.some(row => row.length !== width)) throw new Error(`Uneven rows in ${patternId}`);
  const ports: PatternRoom['ports'] = {};
  const anchors: PatternRoom['anchors'] = {};
  const portNames: Record<string, Direction> = { N: 'north', E: 'east', S: 'south', W: 'west' };
  const tiles: Room['tiles'] = [];
  pattern.rows.forEach((row, y) => [...row].forEach((character, x) => {
    const position = { roomId: id, x, y };
    if (character === '#') tiles.push({ kind: 'wall' });
    else if (character === 'F') tiles.push({ kind: 'furniture', label: pattern.furniture ?? 'Covered furniture' });
    else {
      tiles.push({ kind: 'floor' });
      if (portNames[character]) ports[portNames[character]] = position;
      else if (character !== '.') anchors[character] = position;
    }
  }));
  return { room: { id, name, floor, mapX, mapY, pattern: patternId, width, height: pattern.rows.length, tiles, containers: [], discovered: Array(tiles.length).fill(false), visited: false }, ports, anchors };
}
