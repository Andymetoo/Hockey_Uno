import type { Direction, ItemId, ObjectiveKind } from './types.ts';

export const SAVE_VERSION = 1;
export const TUNING = {
  lightRadius: 1,
  spiritEveryTurns: 4,
  startingMatches: 6,
  minRooms: 9,
  maxRooms: 13,
  minFloors: 2,
  maxFloors: 3,
  roomSize: 9,
  generationAttempts: 12,
  maxLogEntries: 8,
} as const;
export const DIRECTIONS: Record<Direction, { x: number; y: number; label: string }> = {
  north: { x: 0, y: -1, label: 'North' },
  east: { x: 1, y: 0, label: 'East' },
  south: { x: 0, y: 1, label: 'South' },
  west: { x: -1, y: 0, label: 'West' },
};
export const ITEMS: Record<ItemId, { name: string; symbol: string; description: string }> = {
  'moth-key': { name: 'Moth key', symbol: '⚿', description: 'Opens locks engraved with a moth. Reusable.' },
  'thorn-key': { name: 'Thorn key', symbol: '⚿', description: 'Opens locks engraved with a thorn. Reusable.' },
  crowbar: { name: 'Crowbar', symbol: '⌐', description: 'Removes boards from passages. Reusable.' },
  'exit-key': { name: 'Front-door key', symbol: '⚿', description: 'Unlocks the front door. Return to the entrance.' },
  diary: { name: 'Missing diary', symbol: '▤', description: 'Bring the diary back to the entrance.' },
  keepsake: { name: 'Silver locket', symbol: '◇', description: 'Place this keepsake on the memorial, then leave.' },
};
export const OBJECTIVES: Record<ObjectiveKind, { title: string; description: string }> = {
  escape: { title: 'The last door', description: 'Find the front-door key and escape through the entrance.' },
  diary: { title: 'An unfinished story', description: 'Recover the missing diary and bring it back to the entrance.' },
  keepsake: { title: 'What remains', description: 'Recover the silver locket, place it on the memorial, then leave through the entrance.' },
};
