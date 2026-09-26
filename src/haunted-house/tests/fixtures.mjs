import { SAVE_VERSION, initialResources } from '../content.ts';
export const position = (x, y, roomId = 'hall') => ({ roomId, x, y });
export function makeRoom(id = 'hall', { width = 7, height = 7, known = true, solid = false } = {}) {
 return { id, name: id, floor: 0, width, height, tiles: Array.from({ length: width * height }, (_, i) => ({ kind: solid || i % width === 0 || i % width === width - 1 || i < width || i >= width * (height - 1) ? 'wall' : 'floor' })), discovered: Array(width * height).fill(known), visited: true };
}
export function baseFixture(options = {}) {
 const room = makeRoom('hall', options);
 const s = { version: SAVE_VERSION, seed: 'fixture', variant: 0, rooms: [room], hauntings: [], supplies: [], connections: [], player: position(3, 3), entrance: position(1, 1), resources: initialResources(), turns: 0, inventory: [], objective: { kind: 'escape', title: 'Escape', description: 'Find the key and leave.', completed: false }, journal: [], log: [], status: 'active', undo: [] };
 markTile(s, s.entrance, { kind: 'exit' }); return s;
}
export function markTile(s, p, tile) { const r = s.rooms.find(r => r.id === p.roomId); r.tiles[p.y * r.width + p.x] = tile; }
export function addHaunting(s, options = {}) {
 const h = { id: `h${s.hauntings.length}`, name: 'Shade', kind: 'shade', position: position(4, 3), tier: 1, hp: 17, maxHp: 17, attack: 4, regen: 2, xp: 1, boss: false, ...options }; s.hauntings.push(h); markTile(s, h.position, { kind: 'floor' }); return h;
}
export function addSupply(s, kind = 'food', options = {}) {
 const x = { id: `s${s.supplies.length}`, name: kind, kind, position: position(2, 3), used: false, amount: kind === 'candle' ? 8 : 1, ...options }; s.supplies.push(x); markTile(s, x.position, { kind: 'floor' }); return x;
}
export function addConnection(s, options = {}) {
 if (s.rooms.length === 1) s.rooms.push(makeRoom('study', { known: false }));
 const c = { id: 'passage', a: position(5, 5), b: position(1, 1, 'study'), kind: 'door', opened: true, ...options }; s.connections.push(c);
 for (const p of [c.a, c.b]) markTile(s, p, { kind: c.kind, connectionId: c.id }); return c;
}
