export type Direction = 'north' | 'east' | 'south' | 'west';
export type ItemId = 'moth-key' | 'thorn-key' | 'crowbar' | 'exit-key' | 'diary' | 'keepsake';
export type ObjectiveKind = 'escape' | 'diary' | 'keepsake';
export type TileKind = 'wall' | 'floor' | 'door' | 'stairs' | 'exit' | 'altar';
export interface Position { roomId: string; x: number; y: number }
export interface Tile { kind: TileKind; connectionId?: string }
export interface Room { id: string; name: string; floor: number; width: number; height: number; tiles: Tile[]; discovered: boolean[]; visited: boolean }
export interface Connection { id: string; a: Position; b: Position; kind: 'door' | 'stairs'; gate?: ItemId; opened: boolean }
export type SpiritKind = 'shade' | 'wisp' | 'armour' | 'revenant';
export type SpiritTrait = 'brittle' | 'smouldering';
export type CombatRuleset = 'classic' | 'power-flare';
export interface Haunting { id: string; name: string; kind: SpiritKind; trait?: SpiritTrait; position: Position; tier: number; hp: number; maxHp: number; attack: number; regen: number; xp: number; reward?: ItemId; boss: boolean }
export type SupplyKind = 'food' | 'candle' | 'tonic' | 'oil' | 'power' | 'vitality' | 'cache' | 'treasure' | 'note';
export interface Supply { id: string; name: string; kind: SupplyKind; position: Position; used: boolean; amount: number; item?: ItemId; text?: string }
export interface Objective { kind: ObjectiveKind; title: string; description: string; completed: boolean; altar?: Position }
export interface Resources { health: number; maxHealth: number; light: number; maxLight: number; power: number; level: number; xp: number; tonics: number; oils: number; ward: boolean; empowered: boolean; treasure: number }
/** Only mutable data is retained in undo. Geometry is stored once per save. */
export interface UndoFrame { player: Position; resources: Resources; turns: number; discovered: boolean[][]; visited: boolean[]; hp: number[]; used: boolean[]; opened: boolean[]; inventory: ItemId[]; completed: boolean; status: 'active' | 'won' | 'dead'; journal: string[]; log: string[] }
export interface GameSnapshot { version: number; ruleset?: CombatRuleset; runId?: string; seed: string; variant: number; rooms: Room[]; connections: Connection[]; hauntings: Haunting[]; supplies: Supply[]; player: Position; entrance: Position; resources: Resources; turns: number; inventory: ItemId[]; objective: Objective; journal: string[]; log: string[]; status: 'active' | 'won' | 'dead' }
export interface GameState extends GameSnapshot { undo: UndoFrame[] }
export type Action =
 | { type: 'move'; to: Position }
 | { type: 'travel'; connectionId: string; from: Position }
 | { type: 'unlock'; connectionId: string }
 | { type: 'attack'; hauntingId: string; mode: 'strike' | 'flare'; acceptDeath?: boolean }
 | { type: 'use'; supplyId: string }
 | { type: 'tonic' | 'oil' | 'ward' | 'settle' | 'leave' | 'undo' };
export interface ActionResult { state: GameState; committed: boolean; message: string; lethal?: boolean }
export interface CombatPreview {
 damage: number; incoming: number; healthAfter: number; enemyAfter: number; lightCost: number; lightAfter: number;
 lethal: boolean; kills: boolean; affordable: boolean;
 powerDamage: number; oilDamage: number; flareBonus: number; armourReduction: number; traitDamage: number; unwardedIncoming: number;
 levelsGained: number; finalHealth: number; finalLight: number; finalMaxHealth: number; finalPower: number;
}
