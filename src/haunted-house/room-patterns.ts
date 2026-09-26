import type { Room } from './types.ts';
import { random, shuffled } from './world.ts';
/** Algorithmic footprints: a growing maze, small chambers and occasional loops. No authored levels. */
export function carveRoom(id: string, name: string, floor: number, rng: { rng: number }): Room {
 const cols = random(rng) < .5 ? 3 : 4; const rows = random(rng) < .45 ? 3 : 4;
 const width = cols * 2 + 1, height = rows * 2 + 1;
 const room: Room = { id, name, floor, width, height, visited: false, discovered: Array(width * height).fill(false), tiles: Array.from({ length: width * height }, () => ({ kind: 'wall' })) };
 const carve = (x: number, y: number) => { room.tiles[y * width + x] = { kind: 'floor' }; };
 const nodes = [{ x: 0, y: 0 }]; const seen = new Set(['0,0']); carve(1, 1);
 // Leave some peripheral cells solid to vary the actual footprint, not just decoration.
 const target = cols * rows - Math.floor(random(rng) * 3);
 while (seen.size < target) {
  const options = shuffled(nodes, rng).flatMap(p => shuffled([{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }], rng).map(d => ({ p, q: { x: p.x + d.x, y: p.y + d.y } })).filter(({ q }) => q.x >= 0 && q.y >= 0 && q.x < cols && q.y < rows && !seen.has(`${q.x},${q.y}`)));
  const edge = options[0]; if (!edge) break;
  const { p, q } = edge; carve(q.x * 2 + 1, q.y * 2 + 1); carve(p.x + q.x + 1, p.y + q.y + 1); seen.add(`${q.x},${q.y}`); nodes.push(q);
 }
 // Broaden a few junctions into alcoves. Other branches retain discovery bottlenecks.
 for (const p of shuffled(nodes, rng).slice(0, 1 + Math.floor(random(rng) * 3))) {
  for (let y = p.y * 2 + 1; y <= Math.min(height - 2, p.y * 2 + 2); y++) for (let x = p.x * 2 + 1; x <= Math.min(width - 2, p.x * 2 + 2); x++) carve(x, y);
 }
 for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
  if (random(rng) < .06 && room.tiles[y * width + x].kind === 'wall' && ((room.tiles[y * width + x - 1].kind === 'floor' && room.tiles[y * width + x + 1].kind === 'floor') || (room.tiles[(y - 1) * width + x].kind === 'floor' && room.tiles[(y + 1) * width + x].kind === 'floor'))) carve(x, y);
 }
 return room;
}
