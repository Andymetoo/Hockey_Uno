import type { Direction, ItemId, ObjectiveKind, Resources, SpiritKind } from './types.ts';
export const SAVE_VERSION = 3;
export const TUNING = { generationAttempts: 6, solverBudget: 450, solverWidth: 16, maxLogEntries: 6, flareCost: 4, wardCost: 3, oilBonus: 4 } as const;
export const initialResources = (): Resources => ({ health: 22, maxHealth: 22, light: 8, maxLight: 10, power: 6, level: 1, xp: 0, tonics: 1, oils: 1, ward: false, empowered: false, treasure: 0 });
export const xpNeeded = (level: number): number => level + 2;
export const DIRECTIONS: Record<Direction, { x: number; y: number }> = { north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 } };
export const ITEMS: Record<ItemId, { name: string; symbol: string }> = {
 'moth-key': { name: 'Moth key', symbol: '⚿' }, 'thorn-key': { name: 'Thorn key', symbol: '⚿' }, crowbar: { name: 'Crowbar', symbol: '⌐' },
 'exit-key': { name: 'Front-door key', symbol: '⚿' }, diary: { name: 'Missing diary', symbol: '▤' }, keepsake: { name: 'Silver locket', symbol: '◇' },
};
export const OBJECTIVES: Record<ObjectiveKind, { title: string; description: string }> = {
 escape: { title: 'The last door', description: 'Take the front-door key from the keeper and return to the entrance.' },
 diary: { title: 'An unfinished story', description: 'Recover the keeper’s diary and bring it to the entrance.' },
 keepsake: { title: 'What remains', description: 'Recover the keeper’s silver locket, place it at the memorial, then return to the entrance.' },
};
export const SPIRITS: Record<SpiritKind, { name: string; description: string }> = {
 shade: { name: 'Shade', description: 'An ordinary spirit. Your strike and its retaliation land together.' },
 wisp: { name: 'Wisp', description: 'Fragile, but hits hard. A flare can finish it without retaliation.' },
 armour: { name: 'Hollow armour', description: 'Reduces strike damage by 2 (minimum 1). Flares ignore armour.' },
 revenant: { name: 'Revenant', description: 'High health; recovers 3 health on turns you do not attack it.' },
};
export const RULES = [
 'Click any discovered empty tile to move there in one turn, regardless of distance or intervening obstacles. There is no pathfinding. Room tabs only change your view.',
 'Each arrival reveals its surrounding 3×3 square, including diagonals, even around corners. Discovery is permanent. Occupied tiles cannot be stood on until cleared; this can keep tiles beyond them hidden.',
 'Inspecting, selecting a spell, reading, and cancelling cost no turns. Movement, passage travel, unlocking, attacks, supplies and pocket abilities each cost one turn. Nothing happens while you think.',
 'Strikes deal simultaneous damage: a killing strike still hurts you. A flare costs 4 light, deals power + 4 damage, ignores armour and receives no retaliation.',
 'Ward costs 3 light and halves the next strike’s incoming damage, rounded up. Oil costs one bottle and adds 4 damage to the next strike or flare. Both take a turn to prepare and persist until used.',
 'Living wounded spirits recover their listed regeneration after every committed turn except a turn in which you attack that spirit. This happens throughout the house. Defeated spirits never return.',
 'Food heals 60% of maximum health, rounded up, immediately and only once. It stays on its tile until you choose to eat it. Candles restore 8 light. Excess is wasted; either can be consumed at full resources to clear its tile.',
 'Tonics and oil bottles can be collected into your pockets. A tonic restores half your maximum health, rounded up, on its own turn. Walking and exploring never heal you.',
 'Gain the shown experience for a kill. At level + 2 experience, level up: +3 maximum health, +2 power, and fully restore health and light. Survive the exchange first; a level-up cannot rescue a lethal attack.',
 'Every discovered spirit or supply can be acted on from anywhere; no approach move is added. Clearing its tile places you there and reveals the surrounding square. Locked passages require a reusable key or crowbar.',
 'At zero health the run ends. Lethal attacks ask for confirmation. Spending resources badly can also leave a living but unwinnable position; full-run undo and same-seed restart are always available.',
 'Undo restores the previous turn, including health, enemy regeneration, inventory and fog. Fresh houses are accepted only after a legal winning sequence is verified; this does not make every choice safe.',
];
