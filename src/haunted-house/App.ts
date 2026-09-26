import HouseWorker from './generation.worker.ts?worker&inline';
import { DIRECTIONS, ITEMS, RULES, SPIRITS, TUNING, xpNeeded } from './content.ts';
import { act, objectiveReady, previewAttack, supplyPreview } from './game.ts';
import { known, illuminated, samePosition, tileAt, traversable } from './world.ts';
import { parseSave } from './persistence.ts';
import type { LoadResult, SaveResult } from './persistence.ts';
import type { Action, Direction, GameState, Position, Room, SupplyKind } from './types.ts';
type Services = { load: () => LoadResult; save: (state: GameState) => SaveResult; newSeed: () => string };
const escape = (v: unknown): string => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const supplyGlyphs: Record<SupplyKind, string> = { food: '♨', candle: '♧', tonic: '♙', oil: '◈', power: '✦', cache: '▣', treasure: '◇', note: '▤' };
const mansion = `<svg class="hh-mansion" viewBox="0 0 440 230" fill="none" aria-hidden="true"><defs><pattern id="hh-hatch" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 5L5 0" stroke="currentColor" stroke-width=".6"/></pattern></defs><circle cx="313" cy="54" r="31" stroke="currentColor"/><path d="M300 25a31 31 0 0 0 36 43" fill="currentColor" opacity=".1"/><path d="M27 205h386M53 199V114l53-44 45 38V81l69-61 68 61v27l45-38 54 44v85M58 114h91m142 0h91M151 82h137M169 81v118m101-118v118M72 199v-72h61v72m173 0v-72h61v72M182 199v-70h76v70M162 105h116M155 199h130" stroke="currentColor" stroke-width="2"/><path d="M53 114l53-44 45 38v6H53Zm238 0 42-44 54 44h-96ZM151 81l69-61 68 61H151Z" fill="url(#hh-hatch)"/><path d="M99 63V44h16v33M323 77V43h15v31M206 198v-41a14 14 0 0 1 28 0v41M205 80V61h30v19M82 155v-17h14v17Zm28 0v-17h14v17Zm207 0v-17h14v17Zm28 0v-17h14v17ZM191 120v-19h14v19Zm45 0v-17h14v17Z" stroke="currentColor" stroke-width="2"/><path d="M213 175h3M194 205l-14 18m64-18 15 18M28 199v-29l-9-9m9 21 12-11m365 28v-36l9-8m-9 25-11-10" stroke="currentColor"/><path d="M30 89h35m-17-8h29m282 17h41M12 211h112m176 0h120" stroke="currentColor" opacity=".35"/></svg>`;
const hauntingGlyph = '<svg class="hh-haunting-glyph" viewBox="0 0 24 28" aria-hidden="true"><path d="M3 26V12a9 9 0 0 1 18 0v14l-5-3-4 3-4-3-5 3Z" fill="currentColor"/><path d="M8 11v5m8-5v5" stroke="var(--hh-panel)" stroke-width="3"/></svg>';
const candleGlyph = '<svg class="hh-candle-glyph" viewBox="0 0 20 28" aria-hidden="true"><path d="M10 1c1 4 5 6 4 9-1 5-8 5-8 0 0-3 3-5 4-9Z" fill="currentColor"/><path d="M6 16h8v10H6zM3 27h14" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
export function mountGame(root: HTMLElement, services: Services): void {
 const saved = services.load();
 let state: GameState | undefined; let roomId = ''; let selected = ''; let mode: 'strike' | 'flare' = 'strike';
 let modal: 'help' | 'journal' | 'new' | 'restart' | 'lethal' | 'import' | undefined; let pending: Action | undefined; let imported: GameState | undefined;
 let worker: Worker | undefined; let busy = false; let feedback = ''; let saveStatus = ''; let returnFocus = '';
 root.innerHTML = '<div class="hh-view"></div><div class="hh-announcement" aria-live="polite" aria-atomic="true"></div>';
 const view = root.querySelector<HTMLElement>('.hh-view')!; const live = root.querySelector<HTMLElement>('.hh-announcement')!;
 const button = (label: string, action: string, extra = '', cls = '') => `<button type="button" class="hh-button ${cls}" data-action="${action}" data-focus="${escape(action)}" ${extra}>${label}</button>`;
 const pKey = (p: Position) => `${p.roomId}-${p.x}-${p.y}`;
 function persist(): void { if (state) saveStatus = services.save(state).message; }
 function commit(action: Action): void {
  if (!state || busy) return;
  const result = act(state, action); feedback = result.message;
  if (result.lethal) { pending = action; open('lethal'); return; }
  if (result.committed) {
   state = result.state; roomId = state.player.roomId; persist();
   if (action.type === 'undo') selected = '';
   if (action.type === 'attack' && state.hauntings.find(h => h.id === action.hauntingId)?.hp === 0) selected = '';
   if (action.type === 'use') selected = '';
  }
  render(action.type === 'move' || action.type === 'undo' ? 'tile-' + pKey(state.player) : undefined);
 }
 function start(seed: string): void {
  worker?.terminate(); modal = undefined; busy = true; feedback = 'Preparing and checking your house…'; render();
  try {
   worker = new HouseWorker();
   worker.onmessage = event => {
    if (event.data.attempt) { feedback = `Preparing and checking house · attempt ${event.data.attempt}. You can cancel while it works.`; render(); return; }
    busy = false; worker?.terminate(); worker = undefined;
    if (event.data.error) { feedback = event.data.error; render(); return; }
    state = event.data.state; roomId = state!.player.roomId; selected = ''; mode = 'strike';
    feedback = 'Begin by clicking discovered empty tiles to reveal their neighbors. Inspect spirits before committing to a fight.'; persist(); render('tile-' + pKey(state!.player));
   };
   worker.onerror = () => { busy = false; worker?.terminate(); worker = undefined; feedback = 'Could not prepare the house. Reload the page and try again. Your previous save is unchanged.'; render(); };
   worker.postMessage(seed);
  } catch { busy = false; feedback = 'This browser could not start house generation. Your previous save is unchanged.'; render(); }
 }
 function open(kind: NonNullable<typeof modal>): void { returnFocus = (document.activeElement as HTMLElement | null)?.dataset.focus ?? ''; modal = kind; render(); }
 function close(): void { modal = undefined; pending = undefined; imported = undefined; render(returnFocus); }
 function download(raw: string, name: string): void { const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
 function roomTile(game: GameState, room: Room, x: number, y: number): string {
  const p = { roomId: room.id, x, y }, seen = known(game, p), player = samePosition(game.player, p), tile = tileAt(room, x, y)!;
  const h = seen ? game.hauntings.find(h => h.hp > 0 && samePosition(h.position, p)) : undefined;
  const s = seen ? game.supplies.find(s => !s.used && samePosition(s.position, p)) : undefined;
  const c = seen ? game.connections.find(c => c.id === tile.connectionId) : undefined;
  let symbol = tile.kind === 'wall' ? '▧' : tile.kind === 'door' ? '∩' : tile.kind === 'stairs' ? '≋' : tile.kind === 'altar' ? '◇' : tile.kind === 'exit' ? '⇧' : '·';
  let label = tile.kind === 'floor' ? 'Empty floor. Click to move, one turn.' : tile.kind;
  if (h) { label = `${h.name}, ${h.hp}/${h.maxHp} health, ${h.attack} attack, ${h.xp} XP. Inspect freely.`; symbol = hauntingGlyph; }
  if (s) { label = `${s.name}. Inspect freely.`; symbol = s.kind === 'candle' ? candleGlyph : supplyGlyphs[s.kind]; }
  if (c) { label = `${c.kind}, ${c.opened ? 'open' : `locked: ${c.gate ? ITEMS[c.gate].name : 'closed'}`}. Inspect passage.`; }
  const id = h ? `h:${h.id}` : s ? `s:${s.id}` : c ? `c:${c.id}` : tile.kind;
  return `<button type="button" role="gridcell" tabindex="${player || (game.player.roomId !== room.id && seen && room.discovered.findIndex(Boolean) === y * room.width + x) ? '0' : '-1'}" class="hh-tile ${seen ? illuminated(game, p) ? 'is-lit' : 'is-memory' : 'is-dark'} ${seen ? 'is-' + tile.kind : ''} ${player ? 'is-player' : ''} ${h ? 'is-haunting' : ''} ${selected === id ? 'is-selected-target' : ''}" data-action="tile" data-room="${escape(room.id)}" data-x="${x}" data-y="${y}" data-focus="tile-${escape(pKey(p))}" aria-label="${escape(`Column ${x + 1}, row ${y + 1}. ${player ? 'You are here. ' : ''}${seen ? label : 'Unknown tile.'}`)}" title="${escape(seen ? label : 'Unknown tile')}">${player ? '<span class="hh-player">@</span>' : seen ? symbol : ''}${h ? `<small class="hh-tier">${h.boss ? '★' : h.tier}</small>` : ''}${c && !c.opened ? '<small class="hh-tier">×</small>' : ''}</button>`;
 }
 function resources(game: GameState): string {
  const r = game.resources;
  return `<section class="hh-resource-strip hh-combat-resources" aria-label="Your resources"><div><span class="hh-resource-label">Health</span><strong>${r.health}/${r.maxHealth}</strong></div><div><span class="hh-resource-label">Power</span><strong>${r.power}${r.empowered ? ' +4' : ''}</strong></div><div><span class="hh-resource-label">Light</span><strong>${r.light}/${r.maxLight}</strong></div><div><span class="hh-resource-label">Level ${r.level}</span><strong>${r.xp}/${xpNeeded(r.level)} <small>XP</small></strong></div>${button('↶ Undo turn', 'undo', game.undo.length ? '' : 'disabled', 'hh-undo')}</section>`;
 }
 function board(game: GameState): string {
  const room = game.rooms.find(r => r.id === roomId) ?? game.rooms[0];
  return `<section class="hh-room-panel"><header class="hh-room-heading"><div><p class="hh-eyebrow">${room.floor ? 'Upper floor' : 'Ground floor'} · turn ${game.turns}</p><h2>${escape(room.name)}</h2></div></header><nav class="hh-room-tabs" aria-label="Discovered rooms">${game.rooms.filter(r => r.discovered.some(Boolean)).map(r => button(`${escape(r.name)}${r.id === game.player.roomId ? ' · @' : ''}`, 'room', `data-id="${r.id}" aria-pressed="${r.id === room.id}"`, r.id === room.id ? 'is-selected' : '')).join('')}</nav><div class="hh-board-scroll"><div class="hh-board-frame" style="--hh-room-width:${room.width}"><div class="hh-board" role="grid" aria-label="${escape(room.name)}" style="--hh-columns:${room.width}">${Array.from({ length: room.height }, (_, y) => `<div role="row" class="hh-grid-row">${Array.from({ length: room.width }, (_, x) => roomTile(game, room, x, y)).join('')}</div>`).join('')}</div></div></div><p class="hh-board-caption">Click known empty floor · one turn at any distance</p><p class="hh-context-hint hh-board-help">Room tabs and inspection are free. Arrow keys browse tiles; Enter selects. WASD moves one tile. Z undoes.</p><div class="hh-controls">${button('Return to entrance · 1 turn', 'return', samePosition(game.player, game.entrance) || game.status !== 'active' ? 'disabled' : '')}${button('Leave house', 'leave', game.status !== 'active' || !objectiveReady(game) || !samePosition(game.player, game.entrance) ? 'disabled' : '', 'hh-primary')}</div></section>`;
 }
 function details(game: GameState): string {
  const r = game.resources; let body = ''; let title = 'Inspect a spirit or supply';
  if (selected.startsWith('h:')) {
   const h = game.hauntings.find(h => h.id === selected.slice(2));
   if (h && h.hp > 0 && known(game, h.position)) {
    title = h.name; const p = previewAttack(game, h, mode); const melee = previewAttack(game, h, 'strike');
    const hits = Math.ceil(h.hp / melee.damage); // Explicitly conditional; preparation and spell choices change it.
    body = `<p>${escape(SPIRITS[h.kind].description)}</p><dl class="hh-ritual-preview"><div><dt>Health</dt><dd>${h.hp}/${h.maxHp}</dd></div><div><dt>Attack</dt><dd>${h.attack}</dd></div><div><dt>Reward</dt><dd>${h.xp} XP</dd></div></dl><p>Recovers ${h.regen} health on each turn you do something else. ${h.reward ? `Carries ${escape(ITEMS[h.reward].name)}.` : ''}</p><div class="hh-detail-buttons">${button('Strike', 'strike-mode', `aria-pressed="${mode === 'strike'}"`, mode === 'strike' ? 'is-selected' : '')}${button('Flare · 4 light', 'flare-mode', `aria-pressed="${mode === 'flare'}"`, mode === 'flare' ? 'is-selected' : '')}</div><p class="hh-consequence"><strong>Next ${mode}:</strong> deal ${p.damage}; receive ${p.incoming}.<br>You: ${r.health} → ${p.healthAfter} health.<br>Spirit: ${h.hp} → ${p.enemyAfter} health.${mode === 'flare' ? `<br>Light: ${r.light} → ${Math.max(0, r.light - p.lightCost)}.` : ''}</p>${p.lethal ? '<p class="hh-danger">This attack will kill you, even if the spirit dies too.</p>' : p.kills ? `<p>Will banish it.${r.xp + h.xp >= xpNeeded(r.level) ? ' Then you level up and fully recover.' : ''}</p>` : ''}${!r.empowered && !r.ward ? `<p class="hh-muted">Uninterrupted strikes: ${hits} hits, ${hits * h.attack} total incoming damage. Assumes no spells, healing or buffs.</p>` : ''}${button(`${mode === 'strike' ? 'Strike' : 'Cast flare'}${p.kills ? ' · finishing hit' : ''}`, 'attack', !p.affordable || game.status !== 'active' ? 'disabled' : '', 'hh-primary')}`;
   }
  } else if (selected.startsWith('s:')) {
   const x = game.supplies.find(s => s.id === selected.slice(2));
   if (x && !x.used && known(game, x.position)) {
    title = x.name;
    if (x.kind === 'food' || x.kind === 'candle') { const p = supplyPreview(game, x); body = `<p>Restore ${p.received} ${x.kind === 'food' ? 'health' : 'light'}; <strong>${p.wasted} wasted</strong>. One use. Clears the tile and reveals its neighbors.</p><p class="hh-consequence">After use: ${p.total}/${x.kind === 'food' ? r.maxHealth : r.maxLight}. Wounded spirits regenerate this turn.</p>`; }
    else body = `<p>${escape(x.item ? `Contains ${ITEMS[x.item].name}. Reusable; never consumed by a lock.` : x.kind === 'power' ? `Gain ${x.amount} permanent power.` : x.kind === 'tonic' ? 'Collect a pocket tonic. Drink it later to restore half your maximum health.' : x.kind === 'oil' ? 'Collect consecrated oil. Prepare it later for +4 damage on one attack.' : x.kind === 'treasure' ? `Collect ${x.amount} optional treasure.` : x.text ?? '')}</p>`;
    body += button(x.kind === 'food' ? 'Eat now · 1 turn' : x.kind === 'candle' ? 'Use candle · 1 turn' : 'Collect · 1 turn', 'use', game.status !== 'active' ? 'disabled' : '', 'hh-primary');
   }
  } else if (selected.startsWith('c:')) {
   const c = game.connections.find(c => c.id === selected.slice(2));
   if (c) {
    const from = [c.a, c.b].find(p => p.roomId === roomId && known(game, p)) ?? [c.a, c.b].find(p => known(game, p));
    if (from) {
     const to = samePosition(from, c.a) ? c.b : c.a; title = c.kind === 'stairs' ? 'Staircase' : 'Doorway';
     body = `<p>${c.opened ? `Open. Leads to the ${escape(game.rooms.find(r => r.id === to.roomId)!.name)}.` : `Requires ${escape(c.gate ? ITEMS[c.gate].name : 'opening')}. ${c.gate && game.inventory.includes(c.gate) ? 'You have it.' : 'Check your journal for its last known location.'}`}</p>${button(c.opened ? 'Travel through · 1 turn' : 'Unlock · 1 turn', c.opened ? 'travel' : 'unlock', game.status !== 'active' || (!c.opened && c.gate && !game.inventory.includes(c.gate)) ? 'disabled' : '', 'hh-primary')}${c.opened && !samePosition(game.player, from) ? button('Stand in this doorway · 1 turn', 'stand', game.status !== 'active' ? 'disabled' : '') : ''}`;
    }
   }
  } else if (selected === 'altar') { title = 'Memorial'; body = `<p>Return the silver locket to its owner, then leave through the entrance. Placing it costs one turn and no resources.</p>${button(game.objective.completed ? 'Locket placed' : 'Place locket · 1 turn', 'settle', !game.inventory.includes('keepsake') || game.objective.completed || game.status !== 'active' ? 'disabled' : '', 'hh-primary')}`; }
  else if (selected === 'exit') { title = 'Front door'; body = `<p>${escape(game.objective.description)}</p><p>${objectiveReady(game) ? 'Your objective is ready. Return here and leave.' : 'Your task is still unfinished.'}</p>`; }
  return `<section class="hh-action-detail" aria-label="Inspection"><p class="hh-eyebrow">Inspection costs no turns</p><h3>${escape(title)}</h3>${body || '<p>Explore available empty tiles, then compare health, attack, experience and supplies. Nothing moves while you think.</p>'}</section>`;
 }
 function pocket(game: GameState): string {
  const r = game.resources, off = game.status !== 'active';
  return `<section class="hh-inventory"><h2 class="hh-eyebrow">In your pockets</h2><div class="hh-action-options">${button(`Tonic ×${r.tonics} · heal ${Math.min(r.maxHealth - r.health, Math.ceil(r.maxHealth / 2))}`, 'tonic', off || !r.tonics || r.health === r.maxHealth ? 'disabled' : '')}${button(`Oil ×${r.oils} · ${r.empowered ? 'prepared' : '+4 next hit'}`, 'oil', off || !r.oils || r.empowered ? 'disabled' : '')}${button(r.ward ? 'Ward prepared' : 'Ward · 3 light', 'ward', off || r.ward || r.light < TUNING.wardCost ? 'disabled' : '')}</div><p class="hh-pocket-note">Each use takes one turn. Ward halves your next strike’s incoming damage. Oil boosts your next attack.</p><ul class="hh-items">${game.inventory.map(id => `<li>${ITEMS[id].symbol} ${escape(ITEMS[id].name)}</li>`).join('')}</ul><p class="hh-treasure">${r.treasure} optional treasure</p></section>`;
 }
 function comparison(game: GameState): string {
  const spirits = game.hauntings.filter(h => h.hp > 0 && known(game, h.position));
  return `<section class="hh-known"><h2>Known spirits</h2><p class="hh-muted">Compare freely across the house. Select one to inspect or act.</p><div class="hh-table-scroll"><table><thead><tr><th>Spirit</th><th>HP</th><th>Hit</th><th>XP</th></tr></thead><tbody>${spirits.map(h => `<tr><td>${button(escape(h.name), 'inspect', `data-id="h:${h.id}"`, 'hh-quiet')}</td><td>${h.hp}/${h.maxHp}</td><td>${h.attack}</td><td>${h.xp}</td></tr>`).join('')}</tbody></table></div>${spirits.length ? '' : '<p class="hh-muted">No living spirits discovered yet.</p>'}</section>`;
 }
 function menu(): string {
  return `<main class="hh-menu"><div class="hh-menu-art">${mansion}</div><p class="hh-eyebrow">A quiet house. A finite chance.</p><h1>Haunted<br><em>House</em></h1><p class="hh-menu-copy">Uncover its rooms. Weigh each encounter.<br>Spend your strength carefully and find your way out.</p><div class="hh-menu-buttons">${saved.kind === 'loaded' ? button('Continue saved house', 'continue', '', 'hh-primary') : ''}${button('Enter a new house', 'new', '', saved.kind === 'loaded' ? '' : 'hh-primary')}${button('Import a save', 'choose-import')}</div>${saved.kind === 'error' ? `<p class="hh-storage-warning">${escape(saved.message)}</p>${saved.raw ? button('Download unreadable save', 'download-unreadable') : ''}` : ''}${saved.archives.length ? '<p class="hh-menu-saved">Earlier-rule saves are preserved. Start a new house for combat and discovery rules.</p>' + saved.archives.map((a, i) => button(`Download ${escape(a.key.endsWith('v2') ? 'v2' : 'v1')} save`, 'archive', `data-index="${i}"`)).join('') : ''}<p class="hh-menu-footnote">Deterministic combat · one turn per action · autosave · full-run undo</p></main>`;
 }
 function gameView(game: GameState): string {
  return `<main class="hh-main"><header class="hh-game-title"><div><p class="hh-eyebrow">Explore. Calculate. Commit.</p><h1>Haunted House</h1></div><div class="hh-run-controls">${button('Restart seed', 'restart', '', 'hh-quiet')}${button('New house', 'new', '', 'hh-quiet')}${button('Export save', 'export', '', 'hh-quiet')}</div></header>${resources(game)}<section class="hh-objective"><span class="hh-objective-mark">◇</span><div><p class="hh-eyebrow">${escape(game.objective.title)}</p><p>${escape(game.objective.description)}</p></div></section>${game.status !== 'active' ? `<section class="hh-ending"><h2>${game.status === 'won' ? 'Morning, at last.' : 'The house keeps you.'}</h2><p>${game.status === 'won' ? `Escaped in ${game.turns} turns with ${game.resources.treasure} treasure.` : 'Your health reached zero. Undo the fatal turn, restart this seed, or try another house.'}</p></section>` : ''}<p class="hh-feedback" role="status">${escape(feedback)}</p><div class="hh-game-layout"><div class="hh-exploration">${board(game)}${comparison(game)}</div><aside class="hh-sidebar">${details(game)}${pocket(game)}${button('Journal and remembered supplies', 'journal')}</aside></div><section class="hh-events"><div class="hh-section-heading"><h2>Recent turns</h2><span class="hh-save-status">${escape(saveStatus)}</span></div><ol>${game.log.map(line => `<li>${escape(line)}</li>`).join('')}</ol><p class="hh-seed">Seed: ${escape(game.seed)} · house ${game.variant + 1}</p></section></main>`;
 }
 function dialog(): string {
  if (!modal) return '';
  let title = ''; let body = '';
  if (modal === 'help') { title = 'How the house works'; body = `<ol class="hh-rules">${RULES.map(r => `<li>${escape(r)}</li>`).join('')}</ol><p>Legend: @ you · ghost + number: spirit and tier · ♨ food · ♧ candle · ♙ tonic · ◈ oil · ✦ power · ▣ key chest · ∩ doorway · ≋ stairs · ◇ memorial or treasure · ⇧ entrance.</p>`; }
  if (modal === 'journal') { title = 'Your journal'; body = state ? `<ul class="hh-journal-notes">${state.journal.map(n => `<li>${escape(n)}</li>`).join('')}</ul><div class="hh-journal-targets">${state.supplies.filter(s => !s.used && known(state!, s.position)).map(s => button(`${escape(s.name)} · ${escape(state!.rooms.find(r => r.id === s.position.roomId)!.name)}`, 'inspect', `data-id="s:${s.id}"`)).join('')}</div><p class="hh-seed">${escape(state.seed)}</p>` : '<p>Your notes will appear here after entering a house.</p>'; }
  if (modal === 'new' || modal === 'restart') { title = modal === 'restart' ? 'Restart this house?' : 'Enter a new house?'; body = `<p>${modal === 'restart' ? 'The same layout and ingredients will return, with all your progress reset.' : 'A new house will replace your current combat save. Older-rule saves remain preserved.'}</p>${state ? button('Export current save first', 'export') : saved.kind === 'error' && saved.raw ? button('Download unreadable save first', 'download-unreadable') : saved.kind === 'loaded' ? button('Export saved house first', 'export-saved') : ''}${modal === 'new' ? '<label class="hh-seed-input">Seed (optional)<input id="hh-seed" maxlength="100" autocomplete="off" placeholder="Leave blank for a new house"></label>' : ''}${button('Enter house', 'confirm-start', '', 'hh-primary')}`; }
  if (modal === 'lethal') { title = 'This will kill you'; body = `<p class="hh-danger">${escape(feedback)}</p><p>Strikes resolve together. Killing the spirit or earning a level will not prevent this death. Cancelling costs no turn.</p>${button('Attack anyway', 'confirm-lethal')}`; }
  if (modal === 'import') { title = 'Replace current house?'; body = `<p>Import seed ${escape(imported?.seed)} at turn ${imported?.turns}. This replaces the current combat save.</p>${state ? button('Export current save first', 'export') : ''}${button('Import this house', 'confirm-import', '', 'hh-primary')}`; }
  return `<dialog class="hh-dialog" aria-labelledby="hh-dialog-title"><header><h2 id="hh-dialog-title">${title}</h2>${button('Close', 'close-dialog')}</header><div class="hh-dialog-content">${body}</div><footer>${button(modal === 'lethal' ? 'Cancel attack' : 'Close', 'close-dialog')}</footer></dialog>`;
 }
 function render(focus?: string): void {
  const oldFocus = focus ?? (document.activeElement as HTMLElement | null)?.dataset.focus;
  view.innerHTML = `<div class="hh-shell"><header class="hh-topbar"><a class="hh-home" href="./index.html">← Minigames</a><span class="hh-topbar-brand">Haunted House</span><nav>${button('Rules', 'help', '', 'hh-nav-button')}${button('Journal', 'journal', '', 'hh-nav-button')}</nav></header>${busy ? `<main class="hh-menu"><div class="hh-menu-art">${mansion}</div><h2>Opening the house</h2><p class="hh-menu-copy" role="status">${escape(feedback)}</p>${button('Cancel generation', 'cancel-generation')}</main>` : state ? gameView(state) : menu()}${!state && !busy && feedback ? `<p class="hh-menu-feedback" role="status">${escape(feedback)}</p>` : ''}${!busy ? dialog() : ''}<input id="hh-import" type="file" accept="application/json,.json" hidden></div>`;
  live.textContent = feedback;
  const d = view.querySelector<HTMLDialogElement>('dialog');
  if (d) { d.showModal(); d.addEventListener('cancel', event => { event.preventDefault(); close(); }); d.querySelector<HTMLButtonElement>('[data-action="close-dialog"]')?.focus(); }
  else if (oldFocus) Array.from(view.querySelectorAll<HTMLElement>('[data-focus]')).find(e => e.dataset.focus === oldFocus)?.focus({ preventScroll: true });
 }
 root.addEventListener('click', event => {
  const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]'); if (!b || b.disabled) return;
  const action = b.dataset.action!;
  if (busy) { if (action === 'cancel-generation') { worker?.terminate(); worker = undefined; busy = false; feedback = 'Generation cancelled. Your previous save is unchanged.'; render(); } return; }
  if (action === 'help' || action === 'journal' || action === 'new' || action === 'restart') { open(action); return; }
  if (action === 'close-dialog') { close(); return; }
  if (action === 'confirm-start') { const seed = modal === 'restart' && state ? state.seed : view.querySelector<HTMLInputElement>('#hh-seed')?.value.trim() || services.newSeed(); start(seed); return; }
  if (action === 'confirm-lethal' && pending?.type === 'attack') { const a = { ...pending, acceptDeath: true }; modal = undefined; pending = undefined; commit(a); return; }
  if (action === 'continue' && saved.kind === 'loaded') { state = saved.state; roomId = state.player.roomId; saveStatus = `Loaded · turn ${state.turns}`; feedback = 'Your exact position, resources and discovery have been restored.'; render(); return; }
  if (action === 'export' && state) { download(JSON.stringify(state), `haunted-house-${state.seed.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`); return; }
  if (action === 'export-saved' && saved.kind === 'loaded') { download(JSON.stringify(saved.state), 'haunted-house-saved.json'); return; }
  if (action === 'archive') { const a = saved.archives[Number(b.dataset.index)]; if (a) download(a.raw, `${a.key}.json`); return; }
  if (action === 'download-unreadable' && saved.kind === 'error' && saved.raw) { download(saved.raw, 'haunted-house-unreadable.json'); return; }
  if (action === 'choose-import') { view.querySelector<HTMLInputElement>('#hh-import')?.click(); return; }
  if (action === 'confirm-import' && imported) { state = imported; roomId = state.player.roomId; selected = ''; imported = undefined; modal = undefined; feedback = 'Save imported.'; persist(); render(); return; }
  if (!state) return;
  if (action === 'inspect') { selected = b.dataset.id!; modal = undefined; render(); view.querySelector('.hh-action-detail')?.scrollIntoView({ block: 'nearest' }); return; }
  if (modal) return;
  if (action === 'undo') { commit({ type: 'undo' }); return; }
  if (action === 'room') { roomId = b.dataset.id!; selected = ''; render(); return; }
  if (action === 'strike-mode' || action === 'flare-mode') { mode = action === 'strike-mode' ? 'strike' : 'flare'; render(); return; }
  if (action === 'tile') {
   const p = { roomId: b.dataset.room!, x: Number(b.dataset.x), y: Number(b.dataset.y) };
   if (!known(state, p)) { feedback = 'Unknown tiles cannot be selected. Move to discovered empty floor to expand the edge of discovery.'; render(); return; }
   const h = state.hauntings.find(h => h.hp > 0 && samePosition(h.position, p)), s = state.supplies.find(s => !s.used && samePosition(s.position, p));
   const tile = tileAt(state.rooms.find(r => r.id === p.roomId)!, p.x, p.y)!;
   if (h || s || tile.connectionId || tile.kind === 'altar' || (tile.kind === 'exit' && samePosition(state.player, p))) {
    selected = h ? `h:${h.id}` : s ? `s:${s.id}` : tile.connectionId ? `c:${tile.connectionId}` : tile.kind; render();
    if (window.matchMedia('(max-width: 680px)').matches) view.querySelector('.hh-action-detail')?.scrollIntoView({ block: 'nearest' });
   } else if (traversable(state, p)) { selected = ''; commit({ type: 'move', to: p }); }
   return;
  }
  if (action === 'attack') commit({ type: 'attack', hauntingId: selected.slice(2), mode });
  else if (action === 'use') commit({ type: 'use', supplyId: selected.slice(2) });
  else if (action === 'unlock') commit({ type: 'unlock', connectionId: selected.slice(2) });
  else if (action === 'travel') { const c = state.connections.find(c => c.id === selected.slice(2)); const from = c && ([c.a, c.b].find(p => p.roomId === roomId && known(state!, p)) ?? [c.a, c.b].find(p => known(state!, p))); if (c && from) { selected = ''; commit({ type: 'travel', connectionId: c.id, from }); } }
  else if (action === 'stand') { const c = state.connections.find(c => c.id === selected.slice(2)); const from = c && ([c.a, c.b].find(p => p.roomId === roomId && known(state!, p)) ?? [c.a, c.b].find(p => known(state!, p))); if (from) commit({ type: 'move', to: from }); }
  else if (action === 'return') commit({ type: 'move', to: state.entrance });
  else if (['tonic', 'oil', 'ward', 'settle', 'leave'].includes(action)) commit({ type: action as 'tonic' | 'oil' | 'ward' | 'settle' | 'leave' });
 });
 root.addEventListener('change', async event => {
  const input = event.target as HTMLInputElement; if (input.id !== 'hh-import' || !input.files?.[0]) return;
  const file = input.files[0]; if (file.size > 12000000) { feedback = 'Save file is too large.'; render(); return; }
  const result = parseSave(await file.text());
  if (result.kind === 'loaded') { imported = result.state; open('import'); } else { feedback = result.kind === 'error' ? result.message : 'Could not read save.'; render(); }
 });
 root.addEventListener('keydown', event => {
  if (busy || modal || !state || event.ctrlKey || event.altKey || event.metaKey || (event.target as HTMLElement).closest('input,textarea,select')) return;
  const key = event.key.toLowerCase();
  if (key === 'z') { event.preventDefault(); if (!event.repeat) commit({ type: 'undo' }); return; }
  const directions: Record<string, Direction> = { w: 'north', a: 'west', s: 'south', d: 'east' };
  if (directions[key]) { event.preventDefault(); if (event.repeat) return; const d = DIRECTIONS[directions[key]]; commit({ type: 'move', to: { ...state.player, x: state.player.x + d.x, y: state.player.y + d.y } }); return; }
  const arrows: Record<string, Direction> = { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east' };
  const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-action="tile"]');
  if (arrows[event.key] && cell) { event.preventDefault(); const d = DIRECTIONS[arrows[event.key]], x = Number(cell.dataset.x) + d.x, y = Number(cell.dataset.y) + d.y; view.querySelector<HTMLElement>(`[data-action="tile"][data-x="${x}"][data-y="${y}"]`)?.focus(); }
 });
 render();
}
