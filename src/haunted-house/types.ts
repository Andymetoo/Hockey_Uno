export type Direction = 'north' | 'east' | 'south' | 'west';
export type ObjectiveKind = 'escape' | 'diary' | 'keepsake';
export type ItemId = 'moth-key' | 'thorn-key' | 'crowbar' | 'exit-key' | 'diary' | 'keepsake';
export type TileKind = 'wall' | 'floor' | 'furniture' | 'container' | 'door' | 'stairs' | 'altar' | 'exit';
export interface Position { roomId: string; x: number; y: number }
export interface Tile {
  kind: TileKind;
  label?: string;
  connectionId?: string;
  containerId?: string;
}
export interface Container {
  id: string;
  label: string;
  x: number;
  y: number;
  opened: boolean;
  item?: ItemId;
  matches?: number;
  treasure?: number;
  note?: string;
}
export interface Room {
  id: string;
  name: string;
  floor: number;
  width: number;
  height: number;
  tiles: Tile[];
  containers: Container[];
  discovered: boolean[];
  visited: boolean;
}
export interface Connection {
  id: string;
  a: Position;
  b: Position;
  kind: 'door' | 'stairs';
  gate?: 'moth-key' | 'thorn-key' | 'crowbar';
  opened: boolean;
}
export interface Objective {
  kind: ObjectiveKind;
  title: string;
  description: string;
  completed: boolean;
  altar?: Position;
}
export interface Evidence {
  position: Position;
  haunted: boolean;
  epoch: number;
}
export interface GameState {
  version: number;
  seed: string;
  rng: number;
  rooms: Room[];
  connections: Connection[];
  player: Position;
  spirit: Position;
  spiritPrevious?: Position;
  entrance: Position;
  turn: number;
  spiritMoves: number;
  inventory: ItemId[];
  matches: number;
  charm: boolean;
  treasure: number;
  objective: Objective;
  evidence: Evidence[];
  log: string[];
  status: 'active' | 'won' | 'lost';
}
export type Action =
  | { type: 'move'; direction: Direction }
  | { type: 'wait' }
  | { type: 'match'; direction: Direction }
  | { type: 'search'; containerId: string }
  | { type: 'unlock'; connectionId: string }
  | { type: 'travel'; connectionId: string }
  | { type: 'settle' }
  | { type: 'leave' };
export interface ActionResult {
  state: GameState;
  committed: boolean;
  message: string;
  spiritMoved: boolean;
}
export interface Interaction {
  id: string;
  label: string;
  detail: string;
  action: Action;
  available: boolean;
  position: Position;
}
