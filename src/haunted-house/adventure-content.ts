import type { SpiritKind } from './types.ts';

export interface RoomIdentity {
 accent: string; geometry: 'chambers' | 'aisles' | 'gallery' | 'alcoves';
 spirits: SpiritKind[]; food: number; candle: number; smouldering: number;
}
const identities: Record<string, RoomIdentity> = {
 hall: { accent: 'stone', geometry: 'chambers', spirits: ['shade', 'shade', 'wisp', 'armour'], food: 1, candle: 1, smouldering: .5 },
 scullery: { accent: 'copper', geometry: 'chambers', spirits: ['wisp', 'wisp', 'revenant', 'shade'], food: 4, candle: 1, smouldering: .8 },
 library: { accent: 'ink', geometry: 'aisles', spirits: ['shade', 'shade', 'armour', 'wisp'], food: 1, candle: 3, smouldering: .25 },
 study: { accent: 'ink', geometry: 'alcoves', spirits: ['shade', 'shade', 'wisp', 'revenant'], food: 1, candle: 3, smouldering: .3 },
 gallery: { accent: 'silver', geometry: 'gallery', spirits: ['armour', 'armour', 'shade', 'wisp'], food: 1, candle: 2, smouldering: .2 },
 music: { accent: 'violet', geometry: 'chambers', spirits: ['wisp', 'wisp', 'shade', 'armour'], food: 1, candle: 2, smouldering: .7 },
 nursery: { accent: 'rose', geometry: 'alcoves', spirits: ['shade', 'shade', 'wisp', 'revenant'], food: 2, candle: 2, smouldering: .4 },
 attic: { accent: 'wood', geometry: 'aisles', spirits: ['revenant', 'armour', 'shade', 'revenant'], food: 1, candle: 1, smouldering: .25 },
 parlour: { accent: 'frost', geometry: 'chambers', spirits: ['wisp', 'shade', 'armour', 'wisp'], food: 2, candle: 2, smouldering: .2 },
 pantry: { accent: 'copper', geometry: 'aisles', spirits: ['revenant', 'shade', 'shade', 'wisp'], food: 5, candle: 1, smouldering: .6 },
 conservatory: { accent: 'frost', geometry: 'gallery', spirits: ['wisp', 'wisp', 'revenant', 'shade'], food: 2, candle: 1, smouldering: .2 },
 chapel: { accent: 'violet', geometry: 'aisles', spirits: ['armour', 'shade', 'shade', 'armour'], food: 1, candle: 4, smouldering: .3 },
 sewing: { accent: 'rose', geometry: 'alcoves', spirits: ['shade', 'revenant', 'shade', 'wisp'], food: 1, candle: 2, smouldering: .4 },
};
const guest: RoomIdentity = { accent: 'wood', geometry: 'alcoves', spirits: ['shade', 'revenant', 'wisp', 'shade'], food: 2, candle: 1, smouldering: .5 };
export const ROOM_IDENTITIES = ['study', 'scullery', 'parlour', 'library', 'nursery', 'guest', 'gallery', 'attic', 'servants', 'music', 'pantry', 'conservatory', 'chapel', 'sewing'] as const;
export const ROOM_NAMES: Record<string, string> = { hall: 'Entrance hall', study: 'Study', scullery: 'Scullery', parlour: 'Winter parlour', library: 'Library', nursery: 'Nursery', guest: 'Guest chamber', gallery: 'Long gallery', attic: 'Attic', servants: 'Servants’ hall', music: 'Music room' };
export function roomIdentity(identity: string): RoomIdentity { return identities[identity] ?? guest; }
Object.assign(ROOM_NAMES, { pantry: 'Pantry', conservatory: 'Conservatory', chapel: 'Chapel', sewing: 'Sewing room' });
export const ROOM_FLAVOR: Record<string, string> = {
 hall: 'Cold flagstones carry the marks of many arrivals.', study: 'An abandoned writing desk gathers dust.', scullery: 'Copper pans hang above the cold range.', parlour: 'Frost has silvered the window frames.', library: 'Tall shelves divide the room into narrow aisles.', nursery: 'A wooden horse waits beside faded wallpaper.', guest: 'Covered furniture waits for a visitor.', gallery: 'Portraits line a long, echoing gallery.', attic: 'Rafters hang low above dusty storage aisles.', servants: 'Plain benches stand beneath the servants’ bells.', music: 'An open piano holds its last silent chord.', pantry: 'Shelves of jars divide the cool storeroom.', conservatory: 'Pale moonlight falls through tall glass panes.', chapel: 'Candle niches flank the narrow nave.', sewing: 'Thread and folded cloth fill little work alcoves.',
};
