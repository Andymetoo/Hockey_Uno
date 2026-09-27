import HouseWorker from './generation.worker.ts?worker&inline';
import { DIRECTIONS, ITEMS, RULES, SPIRITS, SPIRIT_TRAITS, TUNING, xpNeeded } from './content.ts';
import { act, exitReadiness, previewAttack, supplyPreview, restartState } from './game.ts';
import { known, illuminated, samePosition, tileAt, traversable } from './world.ts';
import { loadCompletedRuns, parseSave } from './persistence.ts';
import { beginRun, completionReport } from './completion.ts';
import { afterAction, attackMode, combatBars, emptyInteraction, selectedEnemy, tapEnemy, toggleFlare } from './interaction.ts';
import { icon, supplyIconName } from './icons.ts';
import { activeRelics, activeModifierDescriptions, describeRelicEffect, relicRecoveryPreview } from './item-definitions.ts';
import type { IconName } from './icons.ts';
import type { ResourceBar } from './interaction.ts';
import type { CompletionReport } from './completion.ts';
import type { LoadResult, SaveResult } from './persistence.ts';
import type { Action, Direction, GameState, Position, Room, ItemId } from './types.ts';

type Services = { load: () => LoadResult; save: (state: GameState) => SaveResult; newSeed: () => string };
type Modal = 'exit' | 'menu' | 'rooms' | 'help' | 'journal' | 'activity' | 'inventory' | 'ability' | 'target' | 'combat-details' | 'records' | 'report' | 'new' | 'restart' | 'lethal' | 'import';
type Ability = 'ward' | 'oil' | 'tonic';
type PanelContent = { title?: string; body: string; actions?: string };
const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const mansion = `<svg class="hh-mansion" viewBox="0 0 440 230" fill="none" aria-hidden="true"><defs><pattern id="hh-hatch" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 5L5 0" stroke="currentColor" stroke-width=".6"/></pattern></defs><circle cx="313" cy="54" r="31" stroke="currentColor"/><path d="M300 25a31 31 0 0 0 36 43" fill="currentColor" opacity=".1"/><path d="M27 205h386M53 199V114l53-44 45 38V81l69-61 68 61v27l45-38 54 44v85M58 114h91m142 0h91M151 82h137M169 81v118m101-118v118M72 199v-72h61v72m173 0v-72h61v72M182 199v-70h76v70M162 105h116M155 199h130" stroke="currentColor" stroke-width="2"/><path d="M53 114l53-44 45 38v6H53Zm238 0 42-44 54 44h-96ZM151 81l69-61 68 61H151Z" fill="url(#hh-hatch)"/><path d="M99 63V44h16v33M323 77V43h15v31M206 198v-41a14 14 0 0 1 28 0v41M205 80V61h30v19M82 155v-17h14v17Zm28 0v-17h14v17Zm207 0v-17h14v17Zm28 0v-17h14v17ZM191 120v-19h14v19Zm45 0v-17h14v17Z" stroke="currentColor" stroke-width="2"/><path d="M213 175h3M194 205l-14 18m64-18 15 18M28 199v-29l-9-9m9 21 12-11m365 28v-36l9-8m-9 25-11-10" stroke="currentColor"/><path d="M30 89h35m-17-8h29m282 17h41M12 211h112m176 0h120" stroke="currentColor" opacity=".35"/></svg>`;

/** Presentation state is intentionally separate from v4 saves and the rules engine. */
export function mountGame(root: HTMLElement, services: Services): void {
 const saved = services.load();
 let state: GameState | undefined, roomId = '', ui = emptyInteraction();
 let modal: Modal | undefined, inspected = '', inspectedFrom: Position | undefined, ability: Ability = 'ward';
 let pending: { action: Action; state: GameState } | undefined, imported: GameState | undefined;
 let worker: Worker | undefined, busy = false, feedback = '', notice = '', saveStatus = '', returnFocus = '';
 let renderEpoch = 0, readingLayout = false, resizing = false;
 let pointerSerial = 0, consumedPointer = -1, pointerSignature = '';
 const heldKeys = new Set<string>();
 root.innerHTML = '<div class="hh-view"></div><div class="hh-announcement" aria-live="polite" aria-atomic="true"></div>';
 const view = root.querySelector<HTMLElement>('.hh-view')!, live = root.querySelector<HTMLElement>('.hh-announcement')!;
 const pKey = (p: Position) => `${p.roomId}-${p.x}-${p.y}`;
 const button = (label: string, action: string, extra = '', cls = '') => `<button type="button" class="hh-button ${cls}" data-action="${action}" data-epoch="${renderEpoch}" data-focus="${escape(action + (extra.match(/data-id="([^"]+)"/)?.[1] ?? ''))}" ${extra}>${label}</button>`;
 const iconButton = (name: IconName, label: string, action: string, extra = '', cls = '') => button(`${icon(name)}<span class="hh-sr-only">${escape(label)}</span>`, action, `aria-label="${escape(label)}" title="${escape(label)}" ${extra}`, `hh-icon-button ${cls}`);
 function persist(): void { if (state) saveStatus = services.save(state).message; }
 function clearInput(): void { ui = emptyInteraction(); inspected = ''; inspectedFrom = undefined; pending = undefined; notice = ''; }
 function commit(action: Action): void {
  if (!state || busy) return;
  const result = act(state, action); feedback = result.message;
  if (result.lethal) { pending = { action, state }; open('lethal'); return; }
  if (!result.committed) { notice = result.message; render(); return; }
  const retainExit = modal === 'exit' && action.type === 'move';
  const oldPosition = state.player; state = result.state;
  if (!samePosition(oldPosition, state.player) || action.type === 'undo') roomId = state.player.roomId;
  ui = afterAction(state, ui, action, true, roomId);
  inspected = ''; inspectedFrom = undefined; pending = undefined; modal = undefined; notice = '';
  persist();
  if (state.status === 'won' && action.type === 'leave') modal = 'report';
  else if (retainExit && exitReadiness(state).atExit) modal = 'exit';
  const target = selectedEnemy(state, ui, roomId);
  render(target ? `tile-${pKey(target.position)}` : `tile-${pKey(state.player)}`);
 }
 function start(seed: string): void {
  worker?.terminate(); modal = undefined; busy = true; clearInput(); feedback = 'Preparing and checking your house…'; render();
  try {
   worker = new HouseWorker();
   worker.onmessage = event => {
    if (event.data.attempt) { feedback = `Preparing house · attempt ${event.data.attempt}. You can cancel while it works.`; render(); return; }
    busy = false; worker?.terminate(); worker = undefined;
    if (event.data.error) { feedback = event.data.error; render(); return; }
    state = beginRun(event.data.state); roomId = state!.player.roomId; clearInput();
    feedback = 'Tap a spirit to inspect. Tap that selected spirit again to Strike.'; persist(); render(`tile-${pKey(state!.player)}`);
   };
   worker.onerror = () => { busy = false; worker?.terminate(); worker = undefined; feedback = 'Could not prepare the house. Your previous save is unchanged.'; render(); };
   worker.postMessage(seed);
  } catch { busy = false; feedback = 'This browser could not start house generation. Your previous save is unchanged.'; render(); }
 }
 function open(kind: Modal): void {
  if (!modal) returnFocus = (document.activeElement as HTMLElement | null)?.dataset.focus ?? 'menu';
  modal = kind; render();
 }
 function openExit(): void { ui = emptyInteraction(); inspected = ''; inspectedFrom = undefined; pending = undefined; notice = ''; open('exit'); }
 function close(): void { modal = undefined; pending = undefined; imported = undefined; render(returnFocus); }
 function download(raw: string, name: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 }
 const keyIcon = (id: ItemId): IconName => id === 'moth-key' ? 'key-moth' : id === 'thorn-key' ? 'key-thorn' : id === 'exit-key' ? 'key-exit' : id;
 const keyPurpose = (id: ItemId): string => id === 'moth-key' ? 'Reusable. Opens locks marked with a moth.' : id === 'thorn-key' ? 'Reusable. Opens locks marked with a thorn.' : id === 'crowbar' ? 'Reusable. Opens boarded passages.' : id === 'exit-key' ? 'Opens the front door once you return to the entrance.' : id === 'diary' ? 'Bring the recovered diary to the entrance.' : 'Place the locket at the memorial before leaving.';
 function roomTile(game: GameState, room: Room, x: number, y: number): string {
  const p = { roomId: room.id, x, y }, seen = known(game, p), player = samePosition(game.player, p), tile = tileAt(room, x, y)!;
  const h = seen ? game.hauntings.find(h => h.hp > 0 && samePosition(h.position, p)) : undefined;
  const supply = seen ? game.supplies.find(s => !s.used && samePosition(s.position, p)) : undefined;
  const connection = seen ? game.connections.find(c => c.id === tile.connectionId) : undefined;
  const selected = !!h && ui.selectedEnemyId === h.id, queued = selected && ui.flareQueued;
  let glyph = '', label = tile.kind === 'floor' ? 'Empty floor. Move here in one turn.' : tile.kind === 'wall' ? 'Wall.' : `${tile.kind}. Inspect freely.`;
  let entity = tile.kind as string;
  if (tile.kind === 'exit') { const exit = exitReadiness(game); label = `Entrance. ${exit.canLeave ? exit.actionLabel + ' available.' : exit.missingRequirement ?? 'Inspect completion options.'} Activate for exit controls; no turn.`; }
  if (seen && !['floor', 'wall'].includes(tile.kind)) glyph = icon(tile.kind as IconName);
  if (h) { entity = `h:${h.id}`; glyph = icon(h.kind); label = `${h.name}. ${h.hp}/${h.maxHp} health, attack ${h.attack}, ${h.xp} XP. ${selected ? `Activate to ${ui.flareQueued ? 'cast Flare' : 'Strike'}, one turn.` : `Select to preview ${ui.flareQueued ? 'Flare' : 'Strike'}, no turn.`}`; }
  if (supply) { entity = `s:${supply.id}`; glyph = icon(supplyIconName(supply)); label = `${supply.name}. Inspect before using, no turn.`; }
  if (connection) { entity = `c:${connection.id}`; label = `${connection.name ?? connection.kind}, ${connection.opened ? 'open' : 'locked'}. Inspect local standing and travel options.`; }
  const available = seen && !player && traversable(game, p);
  const tabStop = player || (game.player.roomId !== room.id && room.discovered.findIndex(Boolean) === y * room.width + x);
  return `<button type="button" role="gridcell" tabindex="${tabStop ? 0 : -1}" class="hh-tile ${seen ? illuminated(game, p) ? 'is-lit' : 'is-memory' : 'is-dark'} ${seen ? `is-${tile.kind}` : ''} ${player ? 'is-player' : ''} ${h ? `is-haunting is-${h.kind}` : ''} ${supply ? `is-supply is-${supply.kind}` : ''} ${selected ? 'is-selected-target' : ''} ${queued ? 'is-queued-target' : ''} ${available ? 'is-available' : ''} ${connection && !connection.opened ? 'is-locked' : ''}" data-action="tile" data-epoch="${renderEpoch}" data-entity="${escape(entity)}" data-room="${escape(room.id)}" data-x="${x}" data-y="${y}" data-focus="tile-${escape(pKey(p))}" aria-selected="${selected}" aria-label="${escape(`Column ${x + 1}, row ${y + 1}. ${player ? 'You are here. ' : ''}${seen ? label : 'Unknown tile.'}`)}">${player ? icon('player') : seen ? glyph : ''}${player && tile.kind === 'exit' ? `<span class="hh-exit-mark" aria-hidden="true">${icon('exit')}</span>` : ''}${h ? `<small class="hh-tier">${h.boss ? 'K' : h.tier}</small>` : ''}${connection && !connection.opened ? `<span class="hh-lock-mark">${icon(connection.gate ? keyIcon(connection.gate) : 'lock')}</span>` : ''}${selected ? `<span class="hh-selection-mark" aria-hidden="true">${queued ? '+' : '⌜'}</span>` : ''}</button>`;
 }
 function board(game: GameState): string {
  const room = game.rooms.find(r => r.id === roomId) ?? game.rooms[0];
  return `<section class="hh-board-stage" data-identity="${escape(room.identity ?? 'legacy')}" data-accent="${escape(room.accent ?? 'stone')}" aria-label="Room board"><div class="hh-board-scroll" data-scroll="board" tabindex="0" data-focus="board-pan" role="region" aria-label="Room board; pan if needed"><div class="hh-board" role="grid" aria-label="${escape(room.name)}" aria-rowcount="${room.height}" aria-colcount="${room.width}" data-width="${room.width}" data-height="${room.height}" style="--hh-columns:${room.width}">${Array.from({ length: room.height }, (_, y) => `<div role="row" class="hh-grid-row">${Array.from({ length: room.width }, (_, x) => roomTile(game, room, x, y)).join('')}</div>`).join('')}</div></div></section>`;
 }
 function meter(id: string, name: string, glyph: IconName, bar: ResourceBar, lethal = false): string {
  const label = `${name}: ${bar.current} of ${bar.maximum}${bar.loss ? `. Projected loss ${bar.loss}; remaining ${bar.projected}${lethal ? '. Lethal' : ''}` : ''}`;
  return `<span class="hh-meter ${id === 'light' ? 'is-light' : 'is-health'} ${lethal ? 'is-lethal' : ''}" data-meter="${id}" data-current="${bar.current}" data-max="${bar.maximum}" data-loss="${bar.loss}" data-after="${bar.projected}" aria-label="${escape(label)}"><span class="hh-meter-label">${icon(glyph)}<strong>${bar.current}/${bar.maximum}</strong><small>${bar.loss ? `−${bar.loss}` : ''}</small></span><span class="hh-meter-track" aria-hidden="true"><span class="hh-meter-fill" style="width:${bar.currentPercent}%"></span><span class="hh-meter-loss" ${bar.loss ? '' : 'hidden'} style="left:${bar.remainingPercent}%;width:${bar.lossPercent}%"></span></span></span>`;
 }
 function combatPanel(game: GameState): string {
  const r = game.resources, enemy = selectedEnemy(game, ui, roomId), bars = combatBars(game, ui, roomId), p = bars.preview;
  const off = game.status !== 'active';
  const playerLabel = `Player details. Health ${r.health}/${r.maxHealth}, light ${r.light}/${r.maxLight}, power ${r.power}, Flare damage ${bars.flareDamage}. Level ${r.level}, ${r.xp}/${xpNeeded(r.level)} XP.${r.ward ? ' Ward prepared.' : ''}${r.empowered ? ' Oil prepared.' : ''}${p ? ` Projected health loss ${bars.playerHealth.loss}, leaving ${bars.playerHealth.projected}. Projected light cost ${bars.playerLight.loss}, leaving ${bars.playerLight.projected}.` : ui.flareQueued ? ` Queued Flare will spend ${bars.playerLight.loss} light, leaving ${bars.playerLight.projected}.` : ''}${p?.lethal ? ' Predicted death before recovery.' : ''}`;
  const player = `<button type="button" class="hh-fighter hh-player-panel ${p?.lethal ? 'is-lethal' : ''}" data-action="combat-details" data-epoch="${renderEpoch}" data-focus="player-details" aria-label="${escape(playerLabel)}"><span class="hh-identity">${icon('player')}<strong>You <small>Lv ${r.level}</small></strong>${p?.lethal ? `<span class="hh-outcome">${icon('skull')}<span class="hh-outcome-label">Death</span></span>` : ''}</span>${meter('player-health', 'Your health', 'heart', bars.playerHealth, !!p?.lethal)}${meter('light', 'Light', 'light', bars.playerLight)}<span class="hh-fighter-stats"><span aria-label="Power ${r.power}">${icon('power')}${r.power}</span><span aria-label="Flare damage ${bars.flareDamage}">${icon('flare')}${bars.flareDamage}</span><span class="hh-buffs">${r.ward ? `<span title="Ward prepared">${icon('ward')}✓</span>` : ''}${r.empowered ? `<span title="Oil prepared">${icon('oil')}✓</span>` : ''}</span></span><span class="hh-xp"><span>${icon('xp')}${r.xp}/${xpNeeded(r.level)}</span><span class="hh-xp-track" aria-hidden="true"><i style="width:${r.xp / xpNeeded(r.level) * 100}%"></i></span></span></button>`;
  const enemyCard = `<button type="button" class="hh-fighter hh-enemy-panel ${p?.kills ? 'is-defeated-preview' : ''} ${ui.flareQueued && enemy ? 'is-queued' : ''}" data-action="combat-details" data-epoch="${renderEpoch}" data-focus="enemy-details" aria-label="${escape(enemy ? `${enemy.name} details. Health ${enemy.hp}/${enemy.maxHp}, attack ${enemy.attack}, regeneration ${enemy.regen}, reward ${enemy.xp} XP. Projected health loss ${bars.enemyHealth!.loss}, leaving ${bars.enemyHealth!.projected}.${enemy.kind === 'armour' ? ' Armour reduces Strikes.' : ''}${enemy.trait ? ` ${SPIRIT_TRAITS[enemy.trait].name}. ${SPIRIT_TRAITS[enemy.trait].description}` : ''}${p?.kills ? ' Defeat predicted.' : ''}${p?.levelsGained ? ' Surviving kill earns a level-up.' : ''}` : 'No spirit selected. Tap a spirit on the board to preview an attack. Open player and combat details.')} ">${enemy ? `<span class="hh-identity">${icon(enemy.kind)}<strong>${escape(enemy.name)}</strong></span>${meter('enemy-health', 'Enemy health', 'heart', bars.enemyHealth!)}<span class="hh-fighter-stats"><span title="Attack">${icon('power')}${enemy.attack}</span><span title="XP reward">${icon('xp')}${enemy.xp}</span></span><span class="hh-traits"><span title="Regenerates on other action turns">${icon('regen')}${enemy.regen}</span>${enemy.kind === 'armour' ? `<span title="Armour reduces Strikes">${icon('armour')}</span>` : ''}${enemy.trait ? `<span title="${escape(SPIRIT_TRAITS[enemy.trait].description)}">${icon(enemy.trait)}<small>${escape(SPIRIT_TRAITS[enemy.trait].name)}</small></span>` : ''}</span><span class="hh-predictions">${p?.kills ? `<span class="hh-outcome">${icon('check')} Defeat</span>` : ''}${p?.levelsGained ? `<span class="hh-level-up">${icon('xp')} Level up</span>` : ''}</span>` : `<span class="hh-identity">${icon('shade')}<strong>No target</strong></span><span class="hh-neutral">Tap a spirit to inspect.<br>Tap it again to Strike.</span><span class="hh-detail-cue">${icon('info')} Tap panels for details</span>`}</button>`;
  const intent = notice || (off ? game.status === 'won' ? 'Objective complete · open Menu for your report' : 'Adventure ended · Undo is available' : ui.flareQueued ? enemy ? 'Flare queued · tap selected spirit to cast' : 'Flare queued · select a spirit' : enemy ? p?.lethal ? 'Lethal Strike · confirmation required' : 'Tap selected spirit to Strike · 1 turn' : exitReadiness(game).prerequisitesMet ? 'Objective ready - tap Exit above when you choose' : 'Explore empty tiles · tap spirits to inspect');
  return `<section class="hh-combat-panel" aria-label="Combat preview"><div class="hh-matchup">${player}${enemyCard}</div><div class="hh-combat-status ${p?.lethal ? 'is-lethal' : ''}" role="status">${escape(intent)}</div></section>`;
 }
 function abilities(game: GameState): string {
  const r = game.resources;
  return `<nav class="hh-ability-strip" aria-label="Abilities and inventory">${button(`${icon('flare')}<span class="hh-ability-name">Flare</span><small>${ui.flareQueued ? 'Cancel' : `${TUNING.flareCost} light`}</small>`, 'flare', `aria-pressed="${ui.flareQueued}" aria-label="${ui.flareQueued ? 'Cancel queued Flare, no turn' : `Queue Flare, ${TUNING.flareCost} light${r.light < TUNING.flareCost ? `; unavailable, only ${r.light} light` : ''}`}"`, `hh-ability ${ui.flareQueued ? 'is-queued' : ''} ${r.light < TUNING.flareCost || game.status !== 'active' ? 'is-unavailable' : ''}`)}${(['ward', 'oil', 'tonic'] as const).map(id => button(`${icon(id)}<span class="hh-ability-name">${id[0].toUpperCase() + id.slice(1)}</span><small>${id === 'ward' ? r.ward ? '✓ ready' : `${TUNING.wardCost} light` : id === 'oil' ? r.empowered ? '✓ ready' : `×${r.oils}` : `×${r.tonics}`}</small>`, id, `aria-label="${id} details${(id === 'ward' && r.ward) || (id === 'oil' && r.empowered) ? ', prepared' : ''}"`, `hh-ability ${(id === 'ward' && r.ward) || (id === 'oil' && r.empowered) ? 'is-prepared' : ''} ${game.status !== 'active' || (id === 'ward' ? r.ward || r.light < TUNING.wardCost : id === 'oil' ? r.empowered || !r.oils : !r.tonics || r.health === r.maxHealth) ? 'is-unavailable' : ''}`)).join('')}${button(`${icon('inventory')}<span class="hh-ability-name">Items</span><small>${game.inventory.length + activeRelics(game).length}</small>`, 'inventory', 'aria-label="Quest items and full inventory"', 'hh-ability')}</nav>`;
 }
 function gameView(game: GameState): string {
  const room = game.rooms.find(r => r.id === roomId)!, exit = exitReadiness(game);
  const objectiveControl = exit.prerequisitesMet && game.status === 'active' ? button(`${icon('exit')}<small>Exit</small>`, 'objective', `aria-label="${escape(exit.atExit ? exit.actionLabel + '; open completion options' : 'Objective ready; return to entrance and leave when you choose')}"`, 'hh-icon-button hh-exit-ready is-ready') : iconButton('objective', 'Objective and journal', 'objective');
  return `<main class="hh-play ${readingLayout ? 'is-reading-layout' : ''}" aria-label="Haunted House playing surface"><header class="hh-play-header">${button(`<strong>${escape(room.name)}</strong><small>${room.floor ? 'Upper floor' : 'Ground floor'} · ${game.turns} turns ${icon('rooms')}</small>`, 'rooms', 'aria-label="Change viewed room or travel to entrance"', 'hh-room-control')}${objectiveControl}${iconButton('undo', 'Undo previous turn', 'undo', game.undo.length ? '' : 'disabled')}${iconButton('menu', 'Open house menu', 'menu')}</header>${board(game)}${abilities(game)}${combatPanel(game)}</main>`;
 }
 function landing(): string {
  return `<main class="hh-menu"><div class="hh-menu-art">${mansion}</div><h1>Haunted House</h1><p>A short resource puzzle. Explore, compare spirits, and find your way out.</p>${feedback ? `<p role="status">${escape(feedback)}</p>` : ''}${busy ? `${button('Cancel preparation', 'cancel-generation')}` : `${state || saved.kind === 'loaded' ? button('Continue adventure', 'continue') : ''}${button('New adventure', 'new')}${button('Import save', 'choose-import')}${button('Completion history', 'records')}${button('How to play', 'help')}`}${saved.kind === 'error' ? `<p>${escape(saved.message)}</p>${saved.raw ? button('Download preserved save', 'archive-current') : ''}` : ''}${saved.archives.length ? `<p>Earlier-rule saves remain archived. These adventures need the rules they were created with.</p>${saved.archives.map((a,i) => button(`Download ${escape(a.key)}`, 'archive', `data-index="${i}"`)).join('')}` : ''}<a class="hh-button" href="./index.html">Other games</a></main>`;
 }
 function reportMarkup(report: CompletionReport): string {
  return `<p><strong>${escape(report.objective.title)}</strong> · ${report.objective.completed ? 'Completed' : 'In progress'}</p><dl class="hh-report-stats"><dt>Hauntings defeated</dt><dd>${report.hauntings.defeated}/${report.hauntings.total}</dd><dt>Playable tiles discovered</dt><dd>${report.exploration.discovered}/${report.exploration.total}</dd><dt>Treasure</dt><dd>${report.treasure.collected}/${report.treasure.total}</dd><dt>Supplies preserved</dt><dd>${report.supplies.total}</dd><dt>Turns</dt><dd>${report.turns}</dd></dl><p>On the floor: ${report.supplies.floor.food} food, ${report.supplies.floor.candle} candles, ${report.supplies.floor.tonic} tonic uses, ${report.supplies.floor.oil} oil uses${report.supplies.floor.recovery ? `, ${report.supplies.floor.recovery} recovery finds` : ''}. In pockets: ${report.supplies.pocket.tonic} tonics, ${report.supplies.pocket.oil} oils.</p>${report.commendations.map(c => `<p><strong>${escape(c.title)}</strong><br>${escape(c.description)}</p>`).join('')}<p>${escape(report.explanation)}</p><details><summary>What counts as exploration?</summary><p>Discoverable playable tiles, excluding decorative walls. Standing on every tile is unnecessary. Discovery is the surrounding 3×3 square; using leftover supplies to reveal more of the house is a valid finish.</p></details>`;
 }
 function abilityContent(game: GameState): PanelContent {
  const r = game.resources, trial = act(game, { type: ability }, false);
  const effect = ability === 'ward' ? `Spend ${TUNING.wardCost} light to halve the next Strike’s incoming damage, rounded up. Remains prepared through Flare.` : ability === 'oil' ? `Use one of ${r.oils} bottles to add ${TUNING.oilBonus} damage to the next Strike or Flare.` : `Use one of ${r.tonics} tonics. Restore half your maximum health, rounded up. ${trial.committed ? `Restores exactly ${trial.state.resources.health - r.health} health now, to ${trial.state.resources.health}/${r.maxHealth}.` : ''}`;
  return { body: `<p class="hh-overlay-icon">${icon(ability)} ${escape(effect)}</p><p>Use takes one turn. Other wounded spirits regenerate.</p>${!trial.committed ? `<p role="status">${escape(trial.message)}</p>` : ''}`, actions: button('Use · 1 turn', 'use-ability', `data-ability="${ability}" ${trial.committed ? '' : 'disabled'}`, 'hh-primary') };
 }
 function targetContent(game: GameState): PanelContent & { title: string } {
  if (inspected.startsWith('s:')) {
   const s = game.supplies.find(s => s.id === inspected.slice(2) && !s.used && known(game, s.position));
   if (!s) return { title: 'Nothing here', body: '<p>This supply is no longer available.</p>' };
   let effect = '';
   if (s.kind === 'food' || s.kind === 'candle') {
    const p = supplyPreview(game, s); effect = `Restores ${p.received} ${s.kind === 'food' ? 'health' : 'light'}; ${p.wasted} wasted. Result: ${p.total}/${s.kind === 'food' ? game.resources.maxHealth : game.resources.maxLight}.`;
   } else if (s.kind === 'power') effect = `Gain ${s.amount} permanent power.`;
   else if (s.kind === 'vitality') effect = `Gain ${s.amount} maximum and current health.`;
   else if (s.kind === 'note') effect = 'Information only. No stat bonus, XP, or quest reward. Reading and collecting clears the tile and reveals its neighbors.';
   else if (s.item) effect = `Collect ${ITEMS[s.item].name}. ${keyPurpose(s.item)}`;
   else if (s.kind === 'relic' && s.effect) {
    effect = describeRelicEffect(s.effect);
    if (s.effect.kind === 'recovery') { const p = relicRecoveryPreview(game,s); effect += ` Now: +${p.health.received} health (${p.health.wasted} wasted), +${p.light.received} light (${p.light.wasted} wasted). Result ${p.health.total}/${game.resources.maxHealth} health, ${p.light.total}/${game.resources.maxLight} light.`; }
   }
   else effect = `Collect ${s.amount} ${s.kind === 'oil' ? 'oil bottles' : s.kind === 'tonic' ? 'tonics' : 'treasure'}.`;
   return { title: s.name, body: `<p class="hh-overlay-icon">${icon(supplyIconName(s))} ${escape(effect)}</p>${s.text ? `<p class="hh-note-kind">${s.noteType === 'clue' ? 'Actionable clue' : s.noteType === 'flavor' ? 'Atmosphere' : s.noteType === 'objective' ? 'Objective clue' : 'Rules information'}</p><blockquote>${escape(s.text)}</blockquote>` : ''}<p>One turn; occupy the cleared tile and reveal its neighbors. Inspecting is free.</p>`, actions: button(s.kind === 'note' ? 'Read & clear · 1 turn' : s.kind === 'food' ? 'Eat & clear · 1 turn' : s.kind === 'candle' ? 'Use & clear · 1 turn' : 'Collect · 1 turn', 'use', `data-id="${escape(s.id)}" ${game.status === 'active' ? '' : 'disabled'}`, 'hh-primary') };
  }
  if (inspected.startsWith('c:') && inspectedFrom) {
   const c = game.connections.find(c => c.id === inspected.slice(2));
   if (!c || !known(game, inspectedFrom)) return { title: 'Passage', body: '<p>Discover this passage first.</p>' };
   const other = samePosition(c.a, inspectedFrom) ? c.b : c.a, to = game.rooms.find(r => r.id === other.roomId)!;
   const canStand = c.opened && traversable(game, inspectedFrom) && !samePosition(game.player, inspectedFrom) && game.status === 'active';
   const canTravel = c.opened && traversable(game, other, false) && game.status === 'active';
   const canUnlock = !c.opened && (!c.gate || game.inventory.includes(c.gate)) && game.status === 'active';
   return { title: c.name ?? (c.kind === 'stairs' ? 'Stair landing' : 'Doorway'), body: c.opened ? `<p>Passage to ${escape(to.name)}. Standing here reveals the nearby 3×3 square without travelling through.</p>${samePosition(game.player, inspectedFrom) ? '<p>You are already standing here.</p>' : ''}${!traversable(game, other, false) ? '<p>The other endpoint is occupied.</p>' : ''}` : `<p>${c.gate ? icon(keyIcon(c.gate)) : icon('lock')} ${c.description ? escape(c.description) + ' ' : ''}Locked${c.gate ? ` · requires ${escape(ITEMS[c.gate].name)}` : ''}. Unlock before standing here or travelling through.</p>`, actions: c.opened ? button(c.kind === 'stairs' ? 'Stand on this landing · 1 turn' : 'Stand in this doorway · 1 turn', 'stand', canStand ? '' : 'disabled', 'hh-primary') + button(`Travel to ${escape(to.name)} · 1 turn`, 'travel', canTravel ? '' : 'disabled') : button('Unlock · 1 turn', 'unlock', canUnlock ? '' : 'disabled', 'hh-primary') };
  }
  if (inspected === 'altar') return { title: 'Memorial', body: `<p>${escape(game.objective.description)}</p>`, actions: button('Place locket · 1 turn', 'settle', act(game,{type:'settle'},false).committed ? '' : 'disabled', 'hh-primary') };
  return exitContent(game);
 }
 function exitContent(game: GameState): PanelContent & { title: string } {
  const exit = exitReadiness(game);
  const explanation = exit.prerequisitesMet ? 'Your objective is ready. Leave when you choose; remaining spirits, exploration, treasure and supplies are optional.' : exit.missingRequirement!;
  return { title: exit.prerequisitesMet ? 'Ready to leave' : 'Front door',
   body: `<p>${escape(explanation)}</p>${!exit.atExit ? '<p>First move to the entrance in one turn. Leaving is a separate one-turn action.</p>' : '<p>You are standing at the entrance.</p>'}${game.status !== 'active' ? `<p>${escape(exit.missingRequirement ?? 'This adventure has ended.')}</p>` : ''}`,
   actions: exit.atExit ? button(`${escape(exit.actionLabel)} &middot; 1 turn`, 'leave', exit.canLeave ? '' : 'disabled', 'hh-primary') : button('Move to entrance &middot; 1 turn', 'return', game.status === 'active' ? '' : 'disabled', 'hh-primary') };
 }
 function combatDetails(game: GameState): string {
  const r = game.resources, h = selectedEnemy(game, ui, roomId), mode = attackMode(ui), p = h ? previewAttack(game, h, mode) : undefined;
  const general = `${activeModifierDescriptions(game).map(text => `<p>${escape(text)}</p>`).join('')}<p>Level ${r.level} · ${r.xp}/${xpNeeded(r.level)} XP · power ${r.power}. Health ${r.health}/${r.maxHealth}; light ${r.light}/${r.maxLight}.</p><p>${r.ward ? 'Ward prepared: next Strike’s incoming damage is halved, rounded up.' : 'Ward is not prepared.'} ${r.empowered ? `Oil prepared: +${TUNING.oilBonus} on your next Strike or Flare.` : 'Oil is not prepared.'}</p>`;
  if (!h || !p) return `${general}<p>Flare costs ${TUNING.flareCost} light and currently deals ${combatBars(game,ui,roomId).flareDamage} damage before spirit traits. It bypasses armour and receives no retaliation. Tap a spirit to see the exact exchange.</p>`;
  return `${general}<h3>${escape(h.name)} · ${mode === 'flare' ? 'Flare' : 'Strike'}</h3><p>${escape(SPIRITS[h.kind].description)} ${h.trait ? `${escape(SPIRIT_TRAITS[h.trait].name)}: ${escape(SPIRIT_TRAITS[h.trait].description)}` : ''}</p><p>${h.reward ? `Carries ${escape(ITEMS[h.reward].name)}. ` : ''}Health ${h.hp}/${h.maxHp} · attack ${h.attack} · reward ${h.xp} XP. Regenerates ${h.regen} health on other-action turns throughout the house.</p><dl class="hh-math"><dt>Power</dt><dd>${p.powerDamage}</dd><dt>Prepared Oil</dt><dd>+${p.oilDamage}</dd><dt>Flare bonus</dt><dd>+${p.flareBonus}</dd><dt>Spirit trait</dt><dd>+${p.traitDamage}</dd><dt>Collected relics</dt><dd>+${p.itemDamage}</dd><dt>Armour ${mode === 'flare' ? '(bypassed)' : ''}</dt><dd>−${p.armourReduction}</dd><dt>Damage dealt (minimum 1)</dt><dd>${p.damage}</dd><dt>Retaliation before Ward</dt><dd>${p.unwardedIncoming}</dd><dt>Relic reduction after Ward</dt><dd>${p.incomingReduction}</dd><dt>Damage received ${mode === 'strike' && r.ward ? '(Ward rounds up first)' : ''}</dt><dd>${p.incoming}</dd><dt>Light spent</dt><dd>${p.lightCost}</dd></dl><p>Immediately after the exchange: you ${p.healthAfter}/${r.maxHealth} health and ${p.lightAfter}/${r.maxLight} light; spirit ${p.enemyAfter}/${h.maxHp} health.</p><p>${p.kills ? 'Enemy defeat predicted. ' : ''}${p.lethal ? '<strong>Predicted death. Simultaneous retaliation is lethal, even on a killing Strike. No XP or level-up can rescue you.</strong>' : p.levelsGained ? `<strong>Surviving kill: ${p.levelsGained} level-up${p.levelsGained === 1 ? '' : 's'}.</strong> Then recover to ${p.finalHealth}/${p.finalMaxHealth} health and ${p.finalLight}/${r.maxLight} light; power becomes ${p.finalPower}.` : p.kills ? `Surviving kill awards ${h.xp} XP; no level-up.` : 'No level-up on this action.'}</p><p>The hatched bar segments mark immediate losses. Recovery is shown separately, never over the damage. Close this panel to act on the selected tile.</p>`;
 }
 function dialogMarkup(): string {
  if (!modal) return '';
  let title = '', body = '', actions = ''; const game = state;
  switch (modal) {
   case 'menu': title = 'House menu'; body = `${game ? `<p>Seed <code>${escape(game.seed)}</code> · ${game.turns} turns</p><p>${escape(saveStatus || 'Autosave after every committed action.')}</p>${button('Current objective', 'objective')}${button('Journal', 'journal')}${button('Activity history', 'activity')}${button('Full inventory', 'inventory')}${button('Run report', 'report')}${button('Export save', 'export')}${button('Restart this house', 'restart')}` : ''}${button('Rules & controls', 'help')}${button(readingLayout ? 'Use compact layout' : 'Use larger-text reading layout', 'reading-layout')}${button('Completion history', 'records')}${button('Import save', 'choose-import')}${button('New adventure', 'new')}<a class="hh-button" href="./index.html">Other games</a>`; break;
   case 'rooms': title = 'Rooms & travel'; body = game ? `<p>Change the room you are viewing for free. Select an empty discovered destination to move there in one turn.</p>${game.rooms.find(r => r.id === roomId)?.flavor ? `<p><strong>${escape(game.rooms.find(r => r.id === roomId)!.name)}</strong>: ${escape(game.rooms.find(r => r.id === roomId)!.flavor)}</p>` : ''}<div class="hh-room-list">${game.rooms.filter(r => r.discovered.some(Boolean)).map(r => button(`${escape(r.name)} <small>${r.floor ? 'Upper' : 'Ground'} floor${r.id === game.player.roomId ? ' · You are here' : ''}</small>`, 'room', `data-id="${escape(r.id)}" aria-current="${r.id === roomId}"`)).join('')}</div>` : ''; actions = game ? button('Return to entrance &middot; 1 turn', 'return', exitReadiness(game).atExit || game.status !== 'active' ? 'disabled' : '') + button('Exit options', 'exit-controls') : ''; break;
   case 'help': title = 'Rules & controls'; body = `<p>Tap an unselected spirit to inspect. Tap that selected spirit again to Strike once. Tap a different spirit to compare without attacking.</p><p>Tap Flare to queue it for free, then tap the selected spirit to cast. A second tap on Flare cancels. A successful cast or any other committed action returns to Strike. Ward, Oil and Tonic open explanations; Use commits.</p><p>Keyboard: Tab to a board tile; arrow keys browse, Enter or Space activates. W/A/S/D moves one tile, Z undoes a turn. Hold does not repeat actions. Escape closes a panel. Touch: drag inside the board if a small viewport needs panning.</p><p>Room selector changes your view for free. Hatched bar segments predict immediate damage or light cost. Tap either combat panel for exact arithmetic. Prepared Ward/Oil carry a check mark. The objective icon opens your journal. When ready, it becomes Exit and opens completion options. Tap the entrance (including beneath your character) to move there or leave. Keep exploring closes those options for free; cleanup is optional.</p><ol>${RULES.map(rule => `<li>${escape(rule.replace('Room tabs only change your view.', 'The room selector only changes your view.'))}</li>`).join('')}</ol><p>For enlarged text or very short screens, choose the reading layout in Menu. The playing surface scrolls internally; board tiles remain usable.</p>`; break;
   case 'journal': title = 'Objective & journal'; body = game ? `<h3>${escape(game.objective.title)}</h3><p>${escape(game.objective.description)}</p><p>${escape(exitReadiness(game).prerequisitesMet ? 'Objective ready: leave at the entrance whenever you choose. Cleanup is optional.' : exitReadiness(game).missingRequirement ?? 'Objective in progress.')}</p>${game.journal.map(t => `<p>${escape(t)}</p>`).join('') || '<p>No notes collected yet.</p>'}` : ''; actions = game ? button('Exit options', 'exit-controls') : ''; break;
   case 'activity': title = 'Activity history'; body = game ? `<p>${escape(saveStatus)}</p><ol>${game.log.map(t => `<li>${escape(t)}</li>`).join('')}</ol>` : ''; break;
   case 'inventory': title = 'Inventory'; body = game ? `<p>Treasure ${game.resources.treasure} · ${game.resources.tonics} tonics · ${game.resources.oils} oils</p>${button('Ward details', 'ward')}${button('Oil details', 'oil')}${button('Tonic details', 'tonic')}<h3>Quest items & reusable tools</h3>${game.inventory.length ? `<ul>${game.inventory.map(id => `<li>${icon(keyIcon(id))} ${escape(ITEMS[id].name)}: ${escape(keyPurpose(id))}</li>`).join('')}</ul>` : '<p>No quest items yet.</p>'}${activeRelics(game).length ? `<h3>Collected relics</h3>${activeRelics(game).map(x => `<p>${icon(supplyIconName(x))} <strong>${escape(x.name)}</strong><br>${escape(describeRelicEffect(x.effect!))}</p>`).join('')}` : ''}<p>Keys and tools are reusable. Tap supplies on the board to inspect their exact effect before collecting.</p>` : ''; break;
   case 'ability': title = `${ability[0].toUpperCase() + ability.slice(1)}${game && ((ability === 'ward' && game.resources.ward) || (ability === 'oil' && game.resources.empowered)) ? ' · prepared' : ''}`; if (game) ({body, actions = ''} = abilityContent(game)); break;
   case 'exit': if (game) ({title,body,actions = ''} = exitContent(game)); break;
   case 'target': if (game) ({title,body,actions = ''} = targetContent(game)); break;
   case 'combat-details': title = 'Combat arithmetic'; body = game ? combatDetails(game) : ''; break;
   case 'records': { title = 'Completed adventures'; const history = loadCompletedRuns(); body = `${history.message ? `<p>${escape(history.message)}</p>` : ''}${history.records.length ? [...history.records].reverse().map(r => `<details><summary>${escape(r.seed)} · ${escape(r.report.objective.title)}</summary>${reportMarkup(r.report)}</details>`).join('') : '<p>No completed adventures recorded yet.</p>'}`; break; }
   case 'report': title = game?.status === 'won' ? 'Into the morning' : 'Your adventure so far'; body = game ? `${reportMarkup(completionReport(game))}${button('Export this adventure', 'export')}${button('Completion history', 'records')}` : ''; break;
   case 'new': title = 'New adventure'; body = `<p>${game ? 'This replaces the current autosave. Export first if you want to keep it.' : 'Each seed prepares and validates a fresh house.'}</p><form data-form="new"><label for="seed">House seed (optional)</label><input id="seed" name="seed" maxlength="100" autocomplete="off" placeholder="A fresh house"><button class="hh-button" type="submit">Begin adventure</button></form>`; break;
   case 'restart': title = 'Restart this house?'; body = `<p>Begin again in this exact saved house, with the original contents and placements. This replaces the current autosave; export first to keep this attempt.</p>${button('Restart adventure', 'confirm-restart')}`; break;
   case 'lethal': title = 'Lethal attack'; body = `<p><strong>${escape(feedback)}</strong></p><p>Retaliation lands even on a killing Strike. Death resolves before XP or level-up recovery. Cancel leaves the adventure unchanged.</p>${button('Confirm lethal attack', 'accept-death', '', 'hh-danger')}`; break;
   case 'import': title = imported ? 'Load imported adventure?' : 'Import result'; body = imported ? `<p>Seed ${escape(imported.seed)} · turn ${imported.turns}. Loading replaces the current autosave.</p>${button('Load adventure', 'confirm-import')}` : `<p>${escape(feedback)}</p>`; break;
  }
  return `<dialog class="hh-dialog ${modal === 'ability' || modal === 'target' || modal === 'exit' ? 'is-compact' : ''}" aria-labelledby="hh-dialog-title" data-modal="${modal}"><header class="hh-dialog-header"><h2 id="hh-dialog-title">${escape(title)}</h2>${iconButton('close', 'Close panel', 'close-dialog')}</header><div class="hh-dialog-content">${body}</div><footer class="hh-dialog-actions-footer">${actions}${modal === 'exit' ? button('Keep exploring', 'keep-exploring') : button('Close', 'close-dialog')}</footer></dialog>`;
 }
 const pans = new Map<string, {left:number;top:number}>();
 let observed: Element | undefined;
 const resizeObserver = new ResizeObserver(() => fitBoard());
 function fitBoard(): void {
  if (resizing) return; resizing = true;
  const scroller = view.querySelector<HTMLElement>('.hh-board-scroll'), board = view.querySelector<HTMLElement>('.hh-board');
  if (scroller && board) {
   const width = Number(board.dataset.width), height = Number(board.dataset.height);
   const size = Math.max(32, Math.min(56, Math.floor(Math.min((scroller.clientWidth-10)/width,(scroller.clientHeight-10)/height))));
   board.style.setProperty('--hh-tile-size', `${size}px`);
   const pan = size * width + 10 > scroller.clientWidth || size * height + 10 > scroller.clientHeight;
   scroller.classList.toggle('is-pannable', pan);
  }
  resizing = false;
 }
 function viewport(): void {
  document.documentElement.style.setProperty('--hh-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
  fitBoard();
 }
 function focusControl(key: string): void {
  const controls = [...view.querySelectorAll<HTMLElement>('[data-focus]')];
  const el = controls.find(c => c.dataset.focus === key && !(c instanceof HTMLButtonElement && c.disabled)) ?? (state ? controls.find(c => c.dataset.focus === `tile-${pKey(state!.player)}`) : undefined) ?? controls.find(c => c.dataset.action === 'menu');
  el?.focus({ preventScroll: true });
 }
 function render(focus?: string): void {
  const active = document.activeElement as HTMLElement | null, oldFocus = active?.dataset.focus ?? '';
  const oldBoard = view.querySelector<HTMLElement>('.hh-board-scroll'), previousRoom = oldBoard?.querySelector<HTMLElement>('[data-room]')?.dataset.room;
  if (oldBoard && previousRoom) pans.set(previousRoom, {left:oldBoard.scrollLeft,top:oldBoard.scrollTop});
  const oldDialog = view.querySelector<HTMLDialogElement>('dialog'), oldModal = oldDialog?.dataset.modal, oldScroll = oldDialog?.querySelector('.hh-dialog-content')?.scrollTop ?? 0;
  const oldPlayScroll = view.querySelector('.hh-play')?.scrollTop ?? 0;
  oldDialog?.close();
  if (observed) resizeObserver.unobserve(observed);
  renderEpoch++;
  document.body.classList.toggle('hh-playing', !!state && !busy);
  view.innerHTML = `<div class="hh-shell">${state && !busy ? gameView(state) : landing()}</div>${dialogMarkup()}<input id="hh-import" class="hh-file-input" type="file" accept="application/json,.json" hidden aria-label="Import adventure save">`;
  live.textContent = feedback;
  viewport(); observed = view.querySelector('.hh-board-scroll') ?? undefined;
  if (observed) resizeObserver.observe(observed);
  const pan = pans.get(roomId), scroller = view.querySelector<HTMLElement>('.hh-board-scroll');
  if (scroller && pan) { scroller.scrollLeft=pan.left; scroller.scrollTop=pan.top; }
  const play = view.querySelector('.hh-play'); if(play) play.scrollTop=oldPlayScroll;
  const dialog = view.querySelector<HTMLDialogElement>('dialog');
  if (dialog) {
   dialog.showModal();
   dialog.addEventListener('cancel', event => {event.preventDefault();close();});
   (dialog.querySelector('[data-action="close-dialog"]') as HTMLElement)?.focus({preventScroll:true});
   const content = dialog.querySelector('.hh-dialog-content'); if (content && oldModal === modal) content.scrollTop=oldScroll;
  } else focusControl(focus ?? oldFocus);
 }
 const signature = (el: HTMLElement) => `${el.dataset.action}|${el.dataset.focus}|${el.dataset.entity ?? ''}`;
 view.addEventListener('pointerdown', event => {
  const el = (event.target as Element).closest<HTMLElement>('[data-action]');
  pointerSerial++; pointerSignature = el ? signature(el) : '';
 }, {capture:true});
 function activate(el: HTMLElement): void {
  if (!view.contains(el) || el.dataset.epoch !== String(renderEpoch) || el instanceof HTMLButtonElement && el.disabled) return;
  if (modal && !el.closest('dialog')) return;
  el.focus({preventScroll:true});
  const action = el.dataset.action;
  if (action === 'close-dialog' || action === 'keep-exploring') { close(); return; }
  if (action === 'cancel-generation') { worker?.terminate(); worker=undefined;busy=false;feedback='Preparation cancelled.';render();return; }
  if (busy) return;
  if (action === 'continue') { if(!state && saved.kind === 'loaded') state = saved.state; if(state){roomId=state.player.roomId;clearInput();persist();render();} return; }
  if (action === 'choose-import') { view.querySelector<HTMLInputElement>('input[type=file]')?.click(); return; }
  if (action === 'archive-current' && saved.kind === 'error' && saved.raw) { download(saved.raw,'haunted-house-preserved.json'); return; }
  if (action === 'archive') { const a = saved.archives[Number(el.dataset.index)]; if(a) download(a.raw,`${a.key}.json`); return; }
  if (action === 'objective') { if (state && exitReadiness(state).prerequisitesMet && state.status === 'active') openExit(); else open('journal'); return; }
  if (action === 'exit-controls' && state) { openExit(); return; }
  if (action === 'reading-layout') { readingLayout=!readingLayout;close();return; }
  if (['menu','rooms','help','journal','activity','inventory','records','report','new','restart','combat-details'].includes(action ?? '')) { open(action as Modal); return; }
  if (action === 'confirm-import') { if(imported){state=imported;roomId=state.player.roomId;clearInput();modal=undefined;imported=undefined;persist();feedback='Adventure imported.';render();}return; }
  if (!state) return;
  if (action === 'confirm-restart') { state=beginRun(restartState(state)); roomId=state.player.roomId; clearInput(); modal=undefined; feedback='Restarted this exact house.'; persist(); render(`tile-${pKey(state.player)}`); return; }
  if (action === 'export') { download(JSON.stringify(state,null,2),`haunted-house-${state.seed.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`);return; }
  if (action === 'undo') { commit({type:'undo'});return; }
  if (action === 'room') { const room=state.rooms.find(r => r.id===el.dataset.id && r.discovered.some(Boolean));if(room){roomId=room.id;clearInput();modal=undefined;render('rooms');}return; }
  if (action === 'flare') { const result=toggleFlare(state,ui);ui=result.ui;notice=result.reason ?? '';feedback=result.reason ?? (ui.flareQueued ? 'Flare queued. Select a spirit, then activate its tile to cast.' : 'Flare cancelled. Strike ready.');render('flare');return; }
  if (action === 'ward' || action === 'oil' || action === 'tonic') { ability=action;open('ability');return; }
  if (action === 'use-ability' && modal==='ability' && el.dataset.ability===ability) {commit({type:ability});return;}
  if (action === 'accept-death' && pending && pending.state===state && pending.action.type==='attack') {const a=pending.action;commit({...a,acceptDeath:true});return;}
  if (action === 'return') {ui=emptyInteraction();commit({type:'move',to:state.entrance});return;}
  if (action === 'leave') {ui=emptyInteraction();commit({type:'leave'});return;}
  if (action === 'settle' && modal==='target') {commit({type:'settle'});return;}
  if (action === 'use' && modal==='target' && inspected===`s:${el.dataset.id}`) {commit({type:'use',supplyId:el.dataset.id!});return;}
  if (modal==='target' && inspected.startsWith('c:') && inspectedFrom) {
   if (action==='stand') {commit({type:'move',to:inspectedFrom});return;}
   if (action==='travel') {commit({type:'travel',connectionId:inspected.slice(2),from:inspectedFrom});return;}
   if (action==='unlock') {commit({type:'unlock',connectionId:inspected.slice(2)});return;}
  }
  if (action === 'tile') {
   const p={roomId:el.dataset.room!,x:Number(el.dataset.x),y:Number(el.dataset.y)}, room=state.rooms.find(r=>r.id===p.roomId), tile=room && tileAt(room,p.x,p.y);
   if (!tile || p.roomId!==roomId || !known(state,p)) return;
   const h=state.hauntings.find(h=>h.hp>0 && samePosition(h.position,p)), s=state.supplies.find(s=>!s.used && samePosition(s.position,p));
   const entity=h?`h:${h.id}`:s?`s:${s.id}`:tile.connectionId?`c:${tile.connectionId}`:tile.kind;
   if (el.dataset.entity!==entity) return;
   if (h) {const result=tapEnemy(state,ui,h.id,roomId);ui=result.ui;notice=result.reason ?? '';inspected='';if(result.action)commit(result.action);else{feedback=`${h.name} selected. Preview ${ui.flareQueued?'Flare':'Strike'}. No turn spent.`;render(`tile-${pKey(p)}`);}return;}
   if (!s && tile.kind==='exit') { openExit(); return; }
   if (s || tile.connectionId || tile.kind==='altar') {inspected=entity;inspectedFrom=p;open('target');return;}
   if (traversable(state,p) && !samePosition(state.player,p)) commit({type:'move',to:p});
  }
 }
 view.addEventListener('click', event => {
  const el = (event.target as Element).closest<HTMLElement>('[data-action]'); if(!el)return;
  // Only click commits. Touch/pointer events identify an activation, never execute it.
  if (event.isTrusted && event.detail>0) {
   if (consumedPointer===pointerSerial || pointerSignature!==signature(el)) return;
   consumedPointer=pointerSerial;
  }
  activate(el);
 });
 view.addEventListener('submit', event => {
  const form=event.target as HTMLFormElement;if(form.dataset.form!=='new')return;event.preventDefault();
  if(!busy)start(String(new FormData(form).get('seed') ?? '').trim() || services.newSeed());
 });
 view.addEventListener('change', async event => {
  const input=event.target as HTMLInputElement;if(input.type!=='file' || !input.files?.[0])return;
  const file=input.files[0];if(file.size>12000000){feedback='This file is too large to be an adventure save.';open('import');return;}
  try {const result=parseSave(await file.text());imported=result.kind==='loaded'?result.state:undefined;feedback=result.kind==='error'?result.message:'Import ready.';open('import');}
  catch{imported=undefined;feedback='Could not read that save file.';open('import');}
 });
 document.addEventListener('keydown', event => {
  const target=event.target as HTMLElement,key=event.key.toLowerCase();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
  if ((key==='enter' || key===' ') && target.matches('button[data-action]')) {
   event.preventDefault();if(event.repeat || heldKeys.has(key))return;heldKeys.add(key);activate(target);return;
  }
  if(modal || !state || busy)return;
  const arrows:Record<string,[number,number]>={arrowup:[0,-1],arrowdown:[0,1],arrowleft:[-1,0],arrowright:[1,0]};
  if(arrows[key] && target.dataset.action==='tile') {
   event.preventDefault();const [dx,dy]=arrows[key], x=Number(target.dataset.x)+dx,y=Number(target.dataset.y)+dy;
   const next=view.querySelector<HTMLElement>(`.hh-tile[data-x="${x}"][data-y="${y}"]`); if(next){view.querySelectorAll<HTMLElement>('.hh-tile').forEach(t=>t.tabIndex=-1);next.tabIndex=0;next.focus({preventScroll:true});const scroll=view.querySelector<HTMLElement>('.hh-board-scroll')!,a=next.getBoundingClientRect(),b=scroll.getBoundingClientRect();if(a.left<b.left)scroll.scrollLeft-=b.left-a.left;if(a.right>b.right)scroll.scrollLeft+=a.right-b.right;if(a.top<b.top)scroll.scrollTop-=b.top-a.top;if(a.bottom>b.bottom)scroll.scrollTop+=a.bottom-b.bottom;}return;
  }
  const directions:Record<string,Direction>={w:'north',a:'west',s:'south',d:'east'};
  if(key==='z' || directions[key]) {
   event.preventDefault();if(event.repeat || heldKeys.has(key))return;heldKeys.add(key);
   if(key==='z')commit({type:'undo'});else{const delta=DIRECTIONS[directions[key]];commit({type:'move',to:{...state.player,x:state.player.x+delta.x,y:state.player.y+delta.y}});}
  }
 });
 document.addEventListener('keyup', event=>heldKeys.delete(event.key.toLowerCase()));
 window.addEventListener('blur',()=>heldKeys.clear());
 window.addEventListener('resize',viewport);window.visualViewport?.addEventListener('resize',viewport);
 render();
}
