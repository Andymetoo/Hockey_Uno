export type Direction = 'north' | 'east' | 'south' | 'west';
export type ObjectiveKind = 'escape' | 'diary' | 'keepsake';
export type ItemId = 'moth-key' | 'thorn-key' | 'crowbar' | 'exit-key' | 'diary' | 'keepsake';
export type TileKind = 'wall' | 'floor' | 'furniture' | 'container' | 'candle' | 'door' | 'stairs' | 'altar' | 'exit';
export interface Position { roomId: string; x: number; y: number }
export interface Tile { kind: TileKind; label?: string; connectionId?: string; containerId?: string; candleId?: string }
export interface Reward { power?: number; item?: ItemId; treasure?: number }
export interface Lead { kind: 'room' | 'haunting' | 'candle' | 'container' | 'connection'; id: string }
export interface Container { id: string; label: string; x: number; y: number; opened: boolean; reward: Reward; note?: string; leads?: Lead[] }
export interface Candle { id: string; name: string; position: Position; restores: number; used: boolean }
export interface Haunting {
  id: string; name: string; position: Position; resistance: number; banished: boolean;
  reward: Reward; benefit: string; requires?: ItemId; resolution?: 'keepsake';
  /** Actual object/passage identifiers protected by this physical bottleneck. */
  guards?: string[];
}
export interface Room {
  id: string; name: string; floor: number; width: number; height: number; pattern: string;
  tiles: Tile[]; containers: Container[]; discovered: boolean[]; visited: boolean;
  /** Schematic placement, used by generation to align passage directions. */
  mapX: number; mapY: number;
}
export interface Connection { id: string; a: Position; b: Position; kind: 'door' | 'stairs'; gate?: 'moth-key' | 'thorn-key' | 'crowbar'; opened: boolean }
export interface Objective { kind: ObjectiveKind; title: string; description: string; completed: boolean; altar?: Position; hauntingId?: string; ritualCost: number }
export interface PuzzleCluster { id: string; members: Lead[]; vantage: Position }
export interface GameSnapshot {
  version: number; seed: string; rng: number;
  rooms: Room[]; connections: Connection[]; hauntings: Haunting[]; candles: Candle[]; clusters: PuzzleCluster[];
  player: Position; entrance: Position;
  steps: number; decisions: number;
  light: number; maxLight: number; ritualPower: number;
  inventory: ItemId[]; treasure: number; objective: Objective;
  journal: string[]; log: string[]; status: 'active' | 'won';
}
export interface GameState extends GameSnapshot { undo: GameSnapshot[] }
export type Action =
  | { type: 'move'; direction: Direction }
  | { type: 'travel'; connectionId: string }
  | { type: 'banish'; hauntingId: string }
  | { type: 'refill'; candleId: string }
  | { type: 'search'; containerId: string }
  | { type: 'unlock'; connectionId: string }
  | { type: 'settle' }
  | { type: 'leave' }
  | { type: 'undo' };
export interface ActionResult { state: GameState; committed: boolean; consequential: boolean; message: string; discoveredChoice: boolean }
export interface Interaction {
  id: string; label: string; name: string; detail: string; action: Action;
  available: boolean; adjacent: boolean; position: Position; resolved: boolean;
}
