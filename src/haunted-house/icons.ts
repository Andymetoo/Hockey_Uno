/**
 * Original Haunted House pixel icons, drawn on a 16×16 grid.
 * No third-party sheet is embedded. Keep this mapping separate from game rules so
 * a future licensed sprite sheet can replace the visuals without changing play.
 * Icons are decorative: their surrounding controls provide accessible labels.
 */
import type { Supply, SupplyKind } from './types.ts';

const palette = {
 ink: '#ece5ce', shadow: '#202729', spirit: '#94c5bf', pale: '#c7e3cd',
 violet: '#b3a5d1', iron: '#aab5b0', rust: '#c38b78', gold: '#dfbb76',
 flame: '#efae6b', blue: '#8cb5d0', green: '#a1ba84', wood: '#977e60',
};
const path = (d: string, fill: string = palette.ink) => `<path d="${d}" fill="${fill}"/>`;
const rect = (x: number, y: number, width: number, height: number, fill: string = palette.ink) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
const eyes = rect(5, 6, 2, 2, palette.shadow) + rect(10, 6, 2, 2, palette.shadow);
const bottle = (color: string) => path('M6 1h4v4h2v2h1v7H3V7h1V5h2Z', palette.iron) + rect(5, 7, 6, 5, color) + rect(6, 1, 4, 2, palette.wood) + rect(5, 7, 1, 3, palette.ink);
const flame = path('M8 1h2v4h2v2h2v5h-2v2H5v-2H3V8h2V5h2v3h1Z', palette.flame) + path('M8 8h2v3h1v2H6v-3h2Z', palette.gold);
const shield = path('M3 2h10v8h-2v2H9v2H7v-2H5v-2H3Z', palette.blue) + path('M5 4h6v5H9v2H7V9H5Z', palette.shadow) + rect(7, 4, 2, 5, palette.blue);
const book = path('M3 2h11v12H3v-1H2V3h1Z', palette.wood) + rect(5, 3, 8, 9, palette.ink) + rect(6, 5, 5, 1, palette.wood) + rect(6, 7, 4, 1, palette.wood) + rect(6, 9, 5, 1, palette.wood);
const key = path('M3 2h5v1h1v5H8v1H6v5H4v-2H2v-2h2V9H3V8H2V3h1Z', palette.gold) + rect(4, 4, 3, 3, palette.shadow);
const symbols = {
 player: path('M6 1h5v2h1v4h-1v1h2v5h-2v2H9v-3H7v3H5v-2H3V9h2V7H4V3h2Z', palette.green) + rect(6, 3, 4, 4, palette.ink) + rect(9, 4, 1, 1, palette.shadow) + rect(4, 8, 6, 3, palette.wood) + rect(12, 8, 2, 6, palette.gold) + rect(12, 6, 2, 2, palette.flame),
 shade: path('M6 2h5v1h2v2h1v9h-3v-2H9v2H6v-2H4v2H2V6h1V4h1V3h2Z', palette.spirit) + eyes + rect(7, 10, 3, 1, palette.shadow),
 wisp: path('M8 1h2v3h2v2h2v5h-2v2H9v2H7v-2H4v-2H2V7h2V5h3V3h1Z', palette.violet) + rect(5, 7, 2, 2, palette.shadow) + rect(10, 7, 2, 2, palette.shadow) + rect(6, 11, 4, 1, palette.pale),
 armour: path('M5 1h6v2h2v4h-2v1h3v5h-3v2H9v-3H7v3H5v-2H2V8h3V7H3V3h2Z', palette.iron) + rect(4, 4, 8, 2, palette.shadow) + rect(7, 3, 2, 4, palette.iron) + rect(5, 9, 6, 1, palette.shadow) + rect(7, 10, 2, 2, palette.rust),
 revenant: path('M4 2h7v1h2v5h-2v2h2v4H9v-2H7v2H3V9h2V7H3V3h1Z', palette.rust) + rect(5, 3, 6, 5, palette.pale) + eyes + rect(7, 9, 2, 3, palette.shadow) + rect(1, 8, 2, 6, palette.wood),
 food: path('M3 4h9v1h2v2h1v5H1V7h1V5h1Z', palette.wood) + path('M4 4h7v1h2v2h1v2H2V7h1V5h1Z', palette.gold) + rect(5, 5, 1, 3, palette.ink) + rect(9, 5, 1, 3, palette.ink) + rect(2, 12, 12, 2, palette.iron),
 candle: path('M8 1h1v2h2v3h-1v1H6V4h1V2h1Z', palette.flame) + rect(6, 8, 4, 6, palette.ink) + rect(8, 8, 2, 2, palette.gold) + rect(4, 14, 8, 1, palette.wood),
 tonic: bottle(palette.rust),
 oil: bottle(palette.gold),
 power: book + path('M8 4h2L8 8h3l-5 4 1-4H5Z', palette.violet),
 vitality: path('M6 1h4v2h2v2h2v6h-2v2h-2v2H6v-2H4v-2H2V5h2V3h2Z', palette.green) + path('M5 5h2v1h2V5h2v4h-1v1H9v1H7v-1H6V9H5Z', palette.ink),
 cache: path('M2 4h12v10H2Z', palette.wood) + rect(4, 1, 8, 3, palette.iron) + rect(6, 2, 4, 2, palette.shadow) + rect(2, 7, 12, 2, palette.gold) + rect(7, 6, 2, 4, palette.ink),
 treasure: path('M4 2h8v2h2v7h-2v2H4v-2H2V4h2Z', palette.gold) + rect(5, 4, 6, 6, palette.wood) + path('M7 4h2v1h2v2H9v1h2v2H9v1H7v-1H5V8h2V7H5V5h2Z', palette.gold),
 note: path('M3 1h8v2h2v12H3Z', palette.ink) + rect(5, 5, 6, 1, palette.wood) + rect(5, 8, 6, 1, palette.wood) + rect(5, 11, 4, 1, palette.wood) + rect(10, 1, 1, 3, palette.wood),
 flare: flame,
 ward: shield,
 heart: path('M3 3h3v1h1v1h2V4h1V3h3v1h1v1h1v4h-2v2h-2v2H9v2H7v-2H5v-2H3V9H1V5h1V4h1Z', palette.rust) + rect(3, 5, 2, 2, palette.ink),
 light: flame,
 xp: path('M7 1h2v4h2v2h4v2h-4v2H9v4H7v-4H5V9H1V7h4V5h2Z', palette.gold) + rect(7, 7, 2, 2, palette.ink),
 regen: path('M4 2h7v1h2v3h2v2h-6V6h2V5H9V4H5v1H3v5h1v2h6v-1h2v3H4v-1H2v-2H1V5h1V3h2Z', palette.green),
 brittle: path('M5 1h6v2h2v10h-2v2H5v-2H3V3h2Z', palette.iron) + path('M8 1h2L8 5h3L7 9h3l-4 6H4l3-5H5l3-4H6Z', palette.shadow),
 smouldering: flame,
 inventory: path('M4 4h8v2h2v8H2V6h2Z', palette.wood) + path('M5 1h6v4H9V3H7v2H5Z', palette.gold) + rect(2, 7, 12, 2, palette.gold) + rect(6, 8, 4, 3, palette.ink),
 floor: rect(7, 7, 2, 2, palette.wood),
 wall: path('M1 2h6v4H1Zm8 0h6v4H9ZM1 8h3v5H1Zm5 0h7v5H6Zm9 0h1v5h-1Z', palette.wood),
 door: path('M3 1h10v14h-3V4H6v11H3Z', palette.wood) + rect(6, 4, 5, 11, palette.shadow) + rect(9, 8, 1, 2, palette.gold),
 stairs: path('M11 1h4v3h-4ZM8 4h7v3H8ZM5 7h10v3H5ZM2 10h13v3H2Z', palette.iron),
 exit: path('M2 1h9v4H9V3H4v10h5v-2h2v4H2Z', palette.green) + path('M11 5h2v1h1v1h1v2h-1v1h-1v1h-2V9H6V7h5Z', palette.ink),
 altar: rect(2, 12, 12, 3, palette.wood) + rect(4, 8, 8, 4, palette.iron) + path('M7 1h2v2h2v2H9v2H7V5H5V3h2Z', palette.violet),
 key,
 'moth-key': path('M2 2h3v1h2v2h2V3h2V2h3v4h-2v2H9v6H7V8H4V6H2Z', palette.violet) + rect(7, 3, 2, 6, palette.ink) + rect(7, 11, 4, 2, palette.violet),
 'thorn-key': path('M4 1h6v2h2v4h-2v2H8v6H6V9H4V7H2V3h2Z', palette.green) + rect(5, 3, 4, 4, palette.shadow) + path('M8 10h3v2H8Zm-3 1H3v2h2Z', palette.green) + rect(6, 1, 2, 2, palette.ink),
 'exit-key': path('M5 1h6v2h2v4h-2v2H9v6H6v-2H4v-2h2V9H5V7H3V3h2Z', palette.gold) + rect(6, 3, 4, 4, palette.shadow) + rect(7, 4, 2, 2, palette.ink),
 relic: path('M6 1h4v2h2v2h2v6h-2v2h-2v2H6v-2H4v-2H2V5h2V3h2Z', palette.gold) + rect(5, 5, 6, 6, palette.violet) + path('M7 4h2v3h3v2H9v3H7V9H4V7h3Z', palette.ink),
 'grave-salt-seal': path('M3 1h10v10h-2v4l-3-2-3 2v-4H3Z', palette.ink) + rect(5, 3, 6, 6, palette.iron) + path('M7 3h2v2h2v2H9v2H7V7H5V5h2Z', palette.shadow) + rect(6, 11, 4, 1, palette.violet),
 'prism-lantern': path('M6 1h4v2h2v2h1v8h-2v2H5v-2H3V5h1V3h2Z', palette.gold) + rect(6, 2, 4, 2, palette.shadow) + rect(5, 5, 6, 7, palette.blue) + path('M8 5h1v2h1v2h-1v2H7V9H6V7h2Z', palette.violet) + rect(5, 13, 6, 1, palette.ink),
 'mourning-ribbon': path('M6 1h4v1h2v2h1v3h-2v2h-1l4 5h-4l-2-3-2 3H2l4-5H5V7H3V4h1V2h2Z', palette.violet) + path('M6 3h4v1h1v2H9V4H7v2H5V4h1Z', palette.shadow) + rect(7, 7, 2, 3, palette.iron),
 'ember-flask': path('M5 1h6v3H9v2h3v2h2v5h-2v2H4v-2H2V8h2V6h3V4H5Z', palette.wood) + path('M5 7h6v2h1v4H4V9h1Z', palette.rust) + path('M8 8h1v2h1v2H6v-2h2Z', palette.flame) + rect(5, 1, 6, 2, palette.gold),
 crowbar: path('M9 1h5v4h-2V3h-1v5H9v3H7v3H5v1H2v-2h3v-2h2V8h2Z', palette.iron),
 diary: book,
 keepsake: path('M4 1h8v2h-2v2H6V3H4ZM5 6h6v1h2v6h-2v2H5v-2H3V7h2Z', palette.gold) + rect(6, 8, 4, 4, palette.violet),
 lock: path('M5 1h6v2h2v4h1v8H2V7h1V3h2ZM5 3v4h6V3Z', palette.gold) + rect(7, 9, 2, 4, palette.shadow),
 menu: rect(2, 3, 12, 2) + rect(2, 7, 12, 2) + rect(2, 11, 12, 2),
 undo: path('M5 2h2v3h5v1h2v2h1v4h-2v2H7v-2h5V8h-1V7H7v3H5V9H4V8H3V7H2V5h1V4h1V3h1Z'),
 rooms: path('M1 2h6v5H1Zm8 0h6v5H9ZM1 9h6v5H1Zm8 0h6v5H9Z', palette.wood) + rect(3, 4, 2, 2, palette.ink) + rect(11, 4, 2, 2, palette.ink) + rect(3, 11, 2, 2, palette.ink) + rect(11, 11, 2, 2, palette.ink),
 objective: path('M3 1h2v14H3ZM5 2h8v7H5Z', palette.gold) + rect(5, 7, 3, 2, palette.wood),
 info: path('M4 1h8v1h2v2h1v8h-1v2h-2v1H4v-1H2v-2H1V4h1V2h2Z', palette.iron) + rect(7, 4, 2, 2, palette.shadow) + rect(7, 7, 2, 5, palette.shadow),
 close: path('M2 2h3v2h2v2h2V4h2V2h3v3h-2v2h-2v2h2v2h2v3h-3v-2H9v-2H7v2H5v2H2v-3h2V9h2V7H4V5H2Z'),
 skull: path('M4 1h8v1h2v2h1v6h-2v2h-2v3H5v-3H3v-2H1V4h1V2h2Z', palette.ink) + rect(3, 5, 4, 3, palette.shadow) + rect(9, 5, 4, 3, palette.shadow) + rect(7, 9, 2, 2, palette.shadow) + rect(6, 13, 1, 2, palette.shadow) + rect(9, 13, 1, 2, palette.shadow),
 check: path('M12 2h3v3h-2v2h-2v2H9v2H7v3H4v-2H2v-2H1V7h3v2h2V8h1V7h1V6h1V5h1V4h2Z', palette.green),
 strike: path('M11 1h4v4h-2v2h-2v2H9v2l2 2-2 2-3-3-2 3-3-3 3-2-3-3 2-2 2 2h2V7h2V5h2Z', palette.iron) + rect(4, 10, 2, 2, palette.wood),
 neutral: path('M6 3h4v1h2v2h1v4h-2v2H5v-2H3V6h1V4h2Z', palette.wood) + rect(5, 6, 2, 2, palette.shadow) + rect(9, 6, 2, 2, palette.shadow),
} as const;

const mappedSymbols = { ...symbols, 'key-moth': symbols['moth-key'], 'key-thorn': symbols['thorn-key'], 'key-exit': symbols['exit-key'] } as const;
export type IconName = keyof typeof mappedSymbols;
export function icon(name: IconName): string {
 return `<svg class="hh-icon hh-icon-${name}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${mappedSymbols[name]}</svg>`;
}
export const supplyIcons: Record<SupplyKind, IconName> = {
 food: 'food', candle: 'candle', tonic: 'tonic', oil: 'oil', power: 'power',
 vitality: 'vitality', cache: 'cache', treasure: 'treasure', note: 'note', relic: 'relic',
};

/** Visual identity follows the effect stored in a save, never live balance data. */
export function supplyIconName(supply: Pick<Supply, 'kind' | 'item' | 'effect'>): IconName {
 if (supply.item) return supply.item;
 if (supply.kind !== 'relic' || !supply.effect) return supplyIcons[supply.kind];
 if (supply.effect.kind === 'damage') return supply.effect.mode === 'strike' ? 'grave-salt-seal' : 'prism-lantern';
 return supply.effect.kind === 'guard' ? 'mourning-ribbon' : 'ember-flask';
}
export function supplyIcon(supply: Pick<Supply, 'kind' | 'item' | 'effect'>): string {
 return icon(supplyIconName(supply));
}
