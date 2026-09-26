import { DIRECTIONS, ITEMS, TUNING } from './content.ts';
import { createGame } from './generation.ts';
import { act, candle, illuminated, interactions, tileAt, turnsUntilSpirit } from './game.ts';
import type { Action, Direction, GameState, Interaction, Room, Tile } from './types.ts';
import type { LoadResult, SaveResult } from './persistence.ts';

type Services = { load: () => LoadResult; save: (state: GameState) => SaveResult; newSeed: () => string };
type Overlay = 'help' | 'legend' | 'journal' | 'new' | 'restart';
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const directionKeys: Record<string, Direction> = { ArrowUp: 'north', w: 'north', ArrowRight: 'east', d: 'east', ArrowDown: 'south', s: 'south', ArrowLeft: 'west', a: 'west' };
const arrows: Record<Direction, string> = { north: '↑', east: '→', south: '↓', west: '←' };
const symbols: Record<Tile['kind'], string> = { wall: '▧', floor: '·', furniture: '▥', container: '▣', door: '∩', stairs: '≋', altar: '◇', exit: '⇧' };
const mansion = `<svg class="hh-mansion" viewBox="0 0 440 230" fill="none" aria-hidden="true"><defs><pattern id="hh-hatch" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 5L5 0" stroke="currentColor" stroke-width=".6"/></pattern></defs><circle cx="313" cy="54" r="31" stroke="currentColor"/><path d="M300 25a31 31 0 0 0 36 43" fill="currentColor" opacity=".1"/><path d="M27 205h386M53 199V114l53-44 45 38V81l69-61 68 61v27l45-38 54 44v85M58 114h91m142 0h91M151 82h137M169 81v118m101-118v118M72 199v-72h61v72m173 0v-72h61v72M182 199v-70h76v70M162 105h116M155 199h130" stroke="currentColor" stroke-width="2"/><path d="M53 114l53-44 45 38v6H53Zm238 0 42-44 54 44h-96ZM151 81l69-61 68 61H151Z" fill="url(#hh-hatch)"/><path d="M99 63V44h16v33M323 77V43h15v31M206 198v-41a14 14 0 0 1 28 0v41M205 80V61h30v19M82 155v-17h14v17Zm28 0v-17h14v17Zm207 0v-17h14v17Zm28 0v-17h14v17ZM191 120v-19h14v19Zm45 0v-19h14v19Z" stroke="currentColor" stroke-width="2"/><path d="M213 175h3M194 205l-14 18m64-18 15 18M28 199v-29l-9-9m9 21 12-11m365 28v-36l9-8m-9 25-11-10" stroke="currentColor"/><path d="M30 89h35m-17-8h29m282 17h41M12 211h112m176 0h120" stroke="currentColor" opacity=".35"/></svg>`;
const flame = `<svg viewBox="0 0 48 76" fill="none" aria-hidden="true"><path d="M24 4c4 10 12 13 10 23-1 7-6 10-10 10s-10-3-10-10c0-8 7-12 10-23Z" fill="currentColor"/><path d="M24 21c2 4 5 6 4 9-1 3-3 4-5 3-3-2-2-7 1-12Z" fill="var(--hh-bg)"/><path d="M24 36v6m-9 0h18v26H15V42Zm-5 26h28v5H10v-5Z" stroke="currentColor" stroke-width="2"/><path d="M20 43v8c0 4 5 4 5 0v-8" stroke="currentColor" stroke-width="2"/></svg>`;

export function mountGame(root: HTMLElement, services: Services): void {
  root.innerHTML = '<div class="hh-view"></div><div class="hh-announcement" aria-live="polite" aria-atomic="true"></div>';
  const view = root.querySelector<HTMLElement>('.hh-view')!;
  const liveRegion = root.querySelector<HTMLElement>('.hh-announcement')!;
  let saved = services.load();
  let state: GameState | undefined;
  let overlay: Overlay | undefined;
  let selectedInteraction: string | undefined;
  let matchMode = false;
  let matchDirection: Direction | undefined;
  let saveStatus = 'No active house';
  let saveFailed = false;
  let announcement = '';
  let feedback = '';
  let returnFocus = '';

  const button = (label: string, action: string, extra = '', className = '') => `<button type="button" class="hh-button ${className}" data-action="${action}" ${extra.includes('data-focus=') ? '' : `data-focus="${action}"`} ${extra}>${label}</button>`;
  const roomOf = (game: GameState) => game.rooms.find(room => room.id === game.player.roomId)!;
  const floorName = (floor: number) => floor === 0 ? 'Ground floor' : `Floor ${floor + 1}`;

  function persist(): void {
    if (!state) return;
    const result = services.save(state);
    saveFailed = !result.ok;
    saveStatus = result.message;
    if (result.ok) saved = { kind: 'loaded', state };
  }

  function start(restart: boolean): void {
    try {
      state = createGame(restart && state ? state.seed : services.newSeed());
      overlay = undefined;
      selectedInteraction = undefined;
      matchMode = false;
      matchDirection = undefined;
      feedback = 'The house is still. Take your time.';
      announcement = `${state.objective.description} You are in ${roomOf(state).name}.`;
      persist();
      render('board');
    } catch (error) {
      feedback = `The house could not be prepared. ${error instanceof Error ? error.message : 'Please try again.'}`;
      announcement = feedback;
      render();
    }
  }

  function requestStart(kind: 'new' | 'restart'): void {
    if (state?.status === 'active' || saved.kind === 'error' || (!state && saved.kind === 'loaded' && saved.state.status === 'active')) {
      openOverlay(kind);
    } else start(kind === 'restart');
  }

  function commit(action: Action): void {
    if (!state || state.status !== 'active') return;
    const result = act(state, action);
    state = result.state;
    feedback = `${result.message}${result.spiritMoved ? action.type === 'match' ? ' The spirit moved. Earlier clues expired; this new match reading is current.' : ' The spirit moved. Earlier match clues expired; your map is unchanged.' : ''}`;
    announcement = `${feedback} Candle ${candle(state) ? 'guttering' : 'steady'}. Spirit moves in ${turnsUntilSpirit(state)} turns.`;
    if (result.committed) {
      selectedInteraction = undefined;
      matchMode = false;
      matchDirection = undefined;
      persist();
    }
    render();
  }

  function openOverlay(kind: Overlay): void {
    returnFocus = (document.activeElement as HTMLElement | null)?.dataset.focus ?? '';
    overlay = kind;
    render();
  }

  function closeOverlay(): void {
    overlay = undefined;
    render(returnFocus);
  }

  function visibleTile(game: GameState, room: Room, x: number, y: number): string {
    const index = y * room.width + x;
    const known = room.discovered[index];
    const lit = illuminated(game, x, y);
    const player = game.player.x === x && game.player.y === y;
    const adjacent = Math.abs(game.player.x - x) + Math.abs(game.player.y - y) === 1;
    const chosen = matchMode && matchDirection && DIRECTIONS[matchDirection].x === x - game.player.x && DIRECTIONS[matchDirection].y === y - game.player.y;
    const tile = tileAt(room, x, y)!;
    const container = known && tile.containerId ? room.containers.find(item => item.id === tile.containerId) : undefined;
    const connection = known && tile.connectionId ? game.connections.find(item => item.id === tile.connectionId) : undefined;
    const clue = game.evidence.find(evidence => evidence.epoch === game.spiritMoves && evidence.position.roomId === room.id && evidence.position.x === x && evidence.position.y === y);
    let name = known ? tile.label ?? tile.kind : 'Unexplored darkness';
    if (container) name = `${container.label}, ${container.opened ? 'searched' : 'unsearched'}`;
    if (connection) name = `${tile.kind === 'stairs' ? 'Staircase' : 'Doorway'}, ${connection.opened || !connection.gate ? 'open' : `requires ${ITEMS[connection.gate].name}`}`;
    const label = `Column ${x + 1}, row ${y + 1}. ${player ? 'You are here. ' : ''}${name}.${known ? lit ? ' Illuminated.' : ' Remembered layout; current safety unknown.' : ''}${clue ? ` Match: ${clue.haunted ? 'spirit present' : 'clear'} until the spirit moves.` : ''}${adjacent ? matchMode ? ' Select match target.' : ' Move here.' : ''}`;
    const symbol = player ? '<span class="hh-player" aria-hidden="true">@</span>' : known ? `<span aria-hidden="true">${container?.opened ? '□' : symbols[tile.kind]}</span>` : '<span aria-hidden="true">&nbsp;</span>';
    return `<button type="button" role="gridcell" tabindex="${player ? '0' : '-1'}" class="hh-tile ${known ? lit ? 'is-lit' : 'is-memory' : 'is-dark'} ${known ? `is-${tile.kind}` : ''} ${player ? 'is-player' : ''} ${adjacent && matchMode ? 'is-targetable' : ''} ${chosen ? 'is-chosen-target' : ''} ${clue ? 'has-clue' : ''}" data-action="tile" data-x="${x}" data-y="${y}" data-focus="${player ? 'board' : `tile-${x}-${y}`}" aria-label="${escape(label)}" title="${escape(label)}">${symbol}${clue ? `<span class="hh-clue" aria-hidden="true">${clue.haunted ? '!' : '○'}</span>` : ''}</button>`;
  }

  function board(game: GameState): string {
    const room = roomOf(game);
    return `<section class="hh-room-panel" aria-labelledby="hh-room-title"><header class="hh-room-heading"><div><p class="hh-eyebrow">${floorName(room.floor)}</p><h2 id="hh-room-title">${escape(room.name)}</h2></div><span class="hh-room-number" title="Current position">${String(game.player.x + 1).padStart(2, '0')} / ${String(game.player.y + 1).padStart(2, '0')}</span></header><div class="hh-mobile-status"><span>Candle: <strong>${candle(game) ? 'GUTTERING' : 'STEADY'}</strong></span><span>Spirit: ${turnsUntilSpirit(game)} turns</span>${game.turn > 0 && game.turn % TUNING.spiritEveryTurns === 0 ? '<small>Spirit shifted · earlier clues expired</small>' : ''}</div><div class="hh-board-frame"><div class="hh-board" role="grid" aria-label="${escape(room.name)} room map" style="--hh-columns:${room.width}">${Array.from({ length: room.height }, (_, y) => `<div role="row" class="hh-grid-row">${Array.from({ length: room.width }, (_, x) => visibleTile(game, room, x, y)).join('')}</div>`).join('')}</div></div><div class="hh-board-caption"><span><i class="hh-light-swatch"></i> In candlelight</span><span><i class="hh-memory-swatch"></i> Remembered</span><span><i class="hh-dark-swatch"></i> Unknown</span></div><div class="hh-controls"><div class="hh-dpad" aria-label="${matchMode ? 'Choose adjacent match target' : 'Movement controls'}">${(['north', 'west', 'south', 'east'] as Direction[]).map(direction => button(arrows[direction], `direction-${direction}`, `aria-label="${matchMode ? 'Select' : 'Move'} ${direction}" ${game.status !== 'active' ? 'disabled' : ''}`, `hh-direction hh-${direction} ${matchMode && matchDirection === direction ? 'is-selected' : ''}`)).join('')}</div><div class="hh-control-actions">${button('Wait <span aria-hidden="true">·</span> 1 turn', 'wait', game.status !== 'active' ? 'disabled' : '', 'hh-wait')}<span class="hh-key-hint">Arrow keys / WASD to step</span><span class="hh-key-hint">Tap an adjacent tile to move</span></div></div></section>`;
  }

  function candlePanel(game: GameState): string {
    const guttering = candle(game);
    const due = turnsUntilSpirit(game);
    const phase = TUNING.spiritEveryTurns - due;
    return `<section class="hh-candle-panel ${guttering ? 'is-guttering' : ''}" aria-labelledby="hh-candle-title"><p class="hh-eyebrow" id="hh-candle-title">Your candle</p><div class="hh-candle-reading"><div class="hh-flame">${flame}</div><div><h2>${guttering ? 'Guttering' : 'Steady'}</h2><p>${guttering ? 'The spirit is on one of the four tiles beside you.' : 'The four tiles directly beside you are clear.'}</p></div></div><div class="hh-rhythm"><div class="hh-rhythm-label"><span>Spirit moves in</span><strong>${due} ${due === 1 ? 'turn' : 'turns'}</strong></div><div class="hh-beats" aria-hidden="true">${Array.from({ length: TUNING.spiritEveryTurns }, (_, index) => `<span class="${index < phase ? 'is-spent' : ''}">${index + 1}</span>`).join('')}</div><p class="${game.turn > 0 && phase === 0 ? 'hh-shift-notice' : ''}">${game.turn > 0 && phase === 0 ? 'Spirit shifted. Earlier clues expired; your map remains.' : 'The house waits while you think.'}</p></div></section>`;
  }

  function inventory(game: GameState): string {
    return `<section class="hh-inventory" aria-labelledby="hh-inventory-title"><p class="hh-eyebrow" id="hh-inventory-title">In your pockets</p><div class="hh-supplies"><div><span class="hh-supply-icon" aria-hidden="true">╱</span><strong>${game.matches}</strong><span>matches</span></div><div><span class="hh-supply-icon" aria-hidden="true">◇</span><strong>${game.charm ? '1' : '0'}</strong><span>charm${game.charm ? '' : ' · spent'}</span></div></div><p class="hh-charm-note">${game.charm ? 'Your charm absorbs one contact and keeps you on your previous tile.' : 'Your charm is gone. Another contact ends this run.'}</p>${game.inventory.length ? `<ul class="hh-items">${game.inventory.map(id => `<li title="${escape(ITEMS[id].description)}"><span aria-hidden="true">${ITEMS[id].symbol}</span>${escape(ITEMS[id].name)}${id === 'keepsake' && game.objective.completed ? ' · placed' : ''}</li>`).join('')}</ul>` : '<p class="hh-empty-inventory">No keys or keepsakes. Yet.</p>'}${game.treasure ? `<p class="hh-treasure">${game.treasure} curious treasure${game.treasure === 1 ? '' : 's'} collected</p>` : ''}</section>`;
  }

  function actions(game: GameState): string {
    const nearby = interactions(game);
    const selected = nearby.find(item => item.id === selectedInteraction);
    return `<section class="hh-interactions" aria-labelledby="hh-actions-title"><div class="hh-section-heading"><h2 id="hh-actions-title">Within reach</h2><span>Choosing is free</span></div>${game.status !== 'active' ? '<p class="hh-muted">This adventure has ended.</p>' : `<div class="hh-action-options">${button('╱ Strike a match', 'match-mode', `aria-pressed="${matchMode}" ${game.matches < 1 ? 'disabled' : ''}`, matchMode ? 'is-selected' : '')}${nearby.map(item => button(escape(item.label), 'select-interaction', `data-id="${escape(item.id)}" data-focus="interaction-${escape(item.id)}" aria-pressed="${selected?.id === item.id}"`, selected?.id === item.id ? 'is-selected' : '')).join('')}</div>${matchMode ? `<div class="hh-action-detail"><p class="hh-eyebrow">A small, certain light</p><p>${matchDirection ? `Check the tile to the <strong>${matchDirection}</strong>.` : 'Choose one adjacent tile on the map or with the direction controls.'}</p><p class="hh-muted">Shows its state after this turn resolves. The clue expires when the spirit moves.</p><div class="hh-detail-buttons">${button('Check tile · 1 match, 1 turn', 'commit-match', !matchDirection ? 'disabled' : '', 'hh-primary')}${button('Cancel', 'cancel-action', '', 'hh-quiet')}</div></div>` : selected ? interactionDetail(selected) : `<p class="hh-context-hint">${nearby.length ? 'Choose an object to inspect its action before spending a turn.' : 'Move beside an object to interact. Stand on a doorway or staircase to travel.'}</p>`}`}</section>`;
  }

  function interactionDetail(item: Interaction): string {
    return `<div class="hh-action-detail"><p>${escape(item.detail)}</p><p class="hh-muted">Target: column ${item.position.x + 1}, row ${item.position.y + 1}.</p><div class="hh-detail-buttons">${button(`${escape(item.label)} · 1 turn`, 'commit-interaction', !item.available ? 'disabled' : '', 'hh-primary')}${button('Cancel', 'cancel-action', '', 'hh-quiet')}</div></div>`;
  }

  function journal(game: GameState): string {
    const known = game.rooms.filter(room => room.visited);
    return `<p class="hh-dialog-intro">Your record of places visited and passages seen. Remembered scenery says nothing about the spirit's current position.</p><div class="hh-journal">${known.map(room => {
      const links = game.connections.filter(connection => [connection.a, connection.b].some(endpoint => endpoint.roomId === room.id && room.discovered[endpoint.y * room.width + endpoint.x]));
      return `<section class="hh-journal-room"><div class="hh-section-heading"><h3>${escape(room.name)} ${room.id === game.player.roomId ? '<span class="hh-here">YOU</span>' : ''}</h3><span>${floorName(room.floor)}</span></div>${links.length ? `<ul>${links.map(connection => {
        const endpoint = connection.a.roomId === room.id ? connection.a : connection.b;
        const other = connection.a.roomId === room.id ? connection.b : connection.a;
        const destination = game.rooms.find(candidate => candidate.id === other.roomId)!;
        return `<li><span aria-hidden="true">${connection.kind === 'stairs' ? '≋' : '∩'}</span><div><strong>${destination.visited ? escape(destination.name) : 'Unvisited room'}</strong><small>Column ${endpoint.x + 1}, row ${endpoint.y + 1} · ${connection.kind === 'stairs' ? 'Staircase' : 'Doorway'} · ${connection.opened || !connection.gate ? 'open' : `requires ${escape(ITEMS[connection.gate].name)}`}</small></div></li>`;
      }).join('')}</ul>` : '<p class="hh-muted">No passages recorded yet.</p>'}</section>`;
    }).join('')}</div><p class="hh-seed">House seed: <code>${escape(game.seed)}</code></p>`;
  }

  function help(): string {
    return `<p class="hh-dialog-intro">Explore a house that changes with every adventure. Find what you need, follow the clues, and make your way home.</p><ol class="hh-rules"><li><strong>Take one step at a time.</strong> Use arrows, WASD, the direction buttons, or tap an adjacent tile. Move only north, east, south, and west. Stand on a door or stair tile, then choose its travel action. An open passage has a threshold ward: clear means its arrival tile is safe; disturbed means it is occupied. A disturbed threshold blocks travel without spending a turn. Wait for the next spirit movement, then check again.</li><li><strong>Read the candle.</strong> Steady means none of the four orthogonally adjacent tiles contains the spirit. Guttering means exactly one of those four tiles contains it. The reading concerns tiles in your current room, not the far side of a doorway. Diagonals do not count.</li><li><strong>Count the beats.</strong> A successful step, search, tool use, travel, or wait costs one turn. After every ${TUNING.spiritEveryTurns} turns, the spirit takes one legal step. It never steps onto you. Contact happens only when you enter its tile.</li><li><strong>Waiting is safe.</strong> When the candle gutters, you may wait until the spirit moves. If it is directly beside you, its next movement takes it out of those four adjacent tiles. Refresh your reading before moving.</li><li><strong>Use a match for certainty.</strong> Choose a neighboring tile, then confirm. A match costs one match and one turn. Its result describes the tile after that turn, including any spirit movement. A marked clue expires on the next spirit movement.</li><li><strong>Your charm offers one second chance.</strong> Contact consumes it and returns you to the tile you stepped from. The spirit is not secretly relocated. A second contact ends the run.</li><li><strong>Remember the house, not the danger.</strong> Candlelight reveals your tile and nearby physical surroundings. Dim tiles remember scenery. The spirit stays invisible. After it moves, old supernatural evidence expires, while your map remains.</li><li><strong>Search, unlock, return.</strong> Move beside containers and obstacles, choose an action, then confirm. Named keys and tools are reusable. The journal records only rooms and doorways you have discovered.</li></ol><p class="hh-rule-note">There is no clock, hunger, or turn limit. Reading, choosing an action, invalid moves, and unavailable actions are free. Your run saves after every committed action; the save status always reports failures.</p>`;
  }

  function legend(): string {
    const entries = [['@', 'You', 'Your current tile.'], ['·', 'Floor', 'An open tile you can step onto.'], ['▧', 'Wall', 'Impassable.'], ['▥', 'Furniture', 'A solid part of the room.'], ['▣', 'Container', 'Move beside it to search.'], ['□', 'Searched container', 'Its contents stay collected.'], ['∩', 'Doorway', 'Stand on it and choose travel. A gate may require a named key or crowbar.'], ['≋', 'Staircase', 'Stand on it and choose travel between floors.'], ['◇', 'Memorial', 'A place where a keepsake may belong.'], ['⇧', 'Entrance / exit', 'Return here when your objective is complete.'], ['○', 'Match: clear', 'Checked after your last match action. Expires when the spirit moves.'], ['!', 'Match: occupied', 'Do not enter before the spirit moves.']];
    return `<p class="hh-dialog-intro">Light shows the house. It does not reveal the spirit.</p><dl class="hh-legend">${entries.map(([symbol, name, description]) => `<div><dt><span aria-hidden="true">${symbol}</span>${name}</dt><dd>${description}</dd></div>`).join('')}</dl><div class="hh-legend-memory"><p><strong>Bright:</strong> currently in candlelight.</p><p><strong>Dim and hatched:</strong> remembered physical layout.</p><p><strong>Dark:</strong> unexplored. Its contents are unknown.</p></div>`;
  }

  function dialog(): string {
    if (!overlay) return '';
    const confirming = overlay === 'new' || overlay === 'restart';
    const title = overlay === 'help' ? 'How to survive the house' : overlay === 'legend' ? 'Read the room' : overlay === 'journal' ? 'Your house journal' : overlay === 'restart' ? 'Return to the beginning?' : 'Enter a new house?';
    const unreadable = saved.kind === 'error';
    const content = overlay === 'help' ? help() : overlay === 'legend' ? legend() : overlay === 'journal' && state ? journal(state) : `<p class="hh-dialog-intro">${unreadable ? 'Your existing save could not be read. Starting a new house may replace that saved data.' : overlay === 'restart' ? 'This resets the same house, its contents, and your progress to the beginning.' : 'A different house and adventure will replace your current run.'}</p>${unreadable && saved.kind === 'error' ? `<div class="hh-storage-warning"><p>${escape(saved.message)}</p>${saved.raw !== undefined ? button('Download unreadable save', 'download-save') : ''}</div>` : ''}<div class="hh-confirm-buttons">${button('Keep current save', 'close-dialog', '', 'hh-primary')}${button(overlay === 'restart' ? 'Restart this house' : 'Start new house', 'confirm-start')}</div>`;
    return `<dialog class="hh-dialog ${confirming ? 'hh-confirm-dialog' : ''}" aria-labelledby="hh-dialog-title"><header><div><p class="hh-eyebrow">Haunted House</p><h2 id="hh-dialog-title">${title}</h2></div>${button('×', 'close-dialog', 'aria-label="Close dialog"', 'hh-close')}</header><div class="hh-dialog-content">${content}</div>${!confirming ? `<footer>${button('Back to the house', 'close-dialog', '', 'hh-primary')}</footer>` : ''}</dialog>`;
  }

  function menu(): string {
    return `<main class="hh-menu"><div class="hh-menu-art">${mansion}</div><p class="hh-eyebrow">A quiet game of exploration & deduction</p><h1>Haunted<br><em>House</em></h1><p class="hh-menu-copy">A candle. A curious house.<br>Something you cannot see.</p><div class="hh-menu-buttons">${saved.kind === 'loaded' ? button('Continue saved game <span aria-hidden="true">→</span>', 'continue', '', 'hh-primary') : ''}${button('New house <span aria-hidden="true">→</span>', 'new', '', saved.kind === 'loaded' ? '' : 'hh-primary')}</div>${saved.kind === 'loaded' ? `<p class="hh-menu-saved">${escape(saved.state.objective.title)} · Turn ${saved.state.turn}${saved.state.status !== 'active' ? ` · ${saved.state.status === 'won' ? 'Escaped' : 'Run ended'}` : ''}</p>` : ''}${saved.kind === 'error' ? `<div class="hh-storage-warning"><strong>Saved house unavailable</strong><p>${escape(saved.message)} Your saved data has been preserved.</p>${saved.raw !== undefined ? button('Download unreadable save', 'download-save') : ''}</div>` : ''}${feedback ? `<p class="hh-menu-feedback">${escape(feedback)}</p>` : ''}<p class="hh-menu-footnote">No clock. No combat. Every step is your choice.</p></main>`;
  }

  function game(game: GameState): string {
    return `<main class="hh-main"><div class="hh-game-title"><div><p class="hh-eyebrow">A house with something to hide</p><h1>Haunted House</h1></div><div class="hh-run-controls">${button('New house', 'new', '', 'hh-quiet')}${button('Restart', 'restart', '', 'hh-quiet')}</div></div><section class="hh-objective" aria-labelledby="hh-objective-title"><span class="hh-objective-mark" aria-hidden="true">◇</span><div><p class="hh-eyebrow" id="hh-objective-title">${escape(game.objective.title)}</p><p>${escape(game.objective.description)}</p></div>${game.objective.completed ? '<span class="hh-objective-complete">Complete</span>' : ''}</section>${game.status !== 'active' ? `<section class="hh-ending" aria-labelledby="hh-ending-title"><p class="hh-eyebrow">${game.status === 'won' ? 'The night is behind you' : 'The candle has gone out'}</p><h2 id="hh-ending-title">${game.status === 'won' ? 'You made it home.' : 'The house keeps its secrets.'}</h2><p>${game.status === 'won' ? `You completed ${escape(game.objective.title.toLowerCase())} in ${game.turn} turns.` : 'You stepped into the spirit with no charm remaining.'}</p><div>${button('New house', 'new', '', 'hh-primary')}${button('Try this house again', 'restart')}</div></section>` : ''}<div class="hh-game-layout"><div class="hh-exploration">${board(game)}${actions(game)}</div><aside class="hh-sidebar">${candlePanel(game)}${inventory(game)}<section class="hh-journal-prompt"><div class="hh-section-heading"><h2>The house so far</h2><span aria-hidden="true">⌑</span></div><p>${game.rooms.filter(room => room.visited).length} ${game.rooms.filter(room => room.visited).length === 1 ? 'room' : 'rooms'} visited. Doors and requirements remembered.</p>${button('Open your journal <span aria-hidden="true">→</span>', 'journal')}</section></aside></div><section class="hh-events" aria-labelledby="hh-events-title"><div class="hh-section-heading"><h2 id="hh-events-title">Whispers & footfalls</h2><span>Turn ${String(game.turn).padStart(3, '0')}</span></div>${feedback ? `<p class="hh-feedback">${escape(feedback)}</p>` : ''}<ol>${game.log.slice(-5).reverse().map((event, index) => `<li class="${index === 0 ? 'is-latest' : ''}">${escape(event)}</li>`).join('')}</ol></section><footer class="hh-game-footer"><span class="hh-save-status ${saveFailed ? 'is-error' : ''}">${saveFailed ? '!' : '✓'} ${escape(saveStatus)}</span><span>Seed <code>${escape(game.seed)}</code></span></footer></main>`;
  }

  function render(focus?: string): void {
    const active = focus ?? (document.activeElement as HTMLElement | null)?.dataset.focus;
    view.innerHTML = `<div class="hh-shell"><header class="hh-topbar"><a href="./index.html" class="hh-home"><span aria-hidden="true">←</span> Minigames</a><span class="hh-topbar-brand">HH <span aria-hidden="true">/</span> ${state ? 'The adventure' : 'Est. after dark'}</span><nav aria-label="Game information">${state ? button('Journal', 'journal', '', 'hh-nav-button') : ''}${button('Rules', 'help', '', 'hh-nav-button')}${button('Legend', 'legend', '', 'hh-nav-button')}</nav></header>${state ? game(state) : menu()}${dialog()}</div>`;
    liveRegion.textContent = announcement;
    const modal = root.querySelector<HTMLDialogElement>('dialog');
    if (modal) {
      modal.showModal();
      modal.addEventListener('cancel', event => { event.preventDefault(); closeOverlay(); });
    } else if (active) {
      const focusTarget = root.querySelector<HTMLElement>(`[data-focus="${CSS.escape(active)}"]`) ?? root.querySelector<HTMLElement>('[data-focus="board"]');
      focusTarget?.focus({ preventScroll: true });
    }
  }

  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action!;
    if (action === 'help' || action === 'legend' || action === 'journal') { openOverlay(action); return; }
    if (action === 'close-dialog') { closeOverlay(); return; }
    if (action === 'new' || action === 'restart') { requestStart(action); return; }
    if (action === 'confirm-start') { start(overlay === 'restart'); return; }
    if (action === 'download-save' && saved.kind === 'error' && saved.raw !== undefined) {
      const url = URL.createObjectURL(new Blob([saved.raw], { type: 'text/plain' }));
      const link = document.createElement('a'); link.href = url; link.download = 'haunted-house-unreadable-save.txt'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (action === 'continue' && saved.kind === 'loaded') {
      state = saved.state; saveStatus = `Loaded · turn ${state.turn}`; saveFailed = false;
      announcement = `Continued your saved house at turn ${state.turn}. ${roomOf(state).name}.`;
      render('board'); return;
    }
    if (!state || overlay || state.status !== 'active') return;
    if (action.startsWith('direction-')) {
      const direction = action.slice(10) as Direction;
      if (matchMode) { matchDirection = direction; render(); } else commit({ type: 'move', direction });
    } else if (action === 'tile') {
      const dx = Number(target.dataset.x) - state.player.x, dy = Number(target.dataset.y) - state.player.y;
      const direction = (Object.keys(DIRECTIONS) as Direction[]).find(key => DIRECTIONS[key].x === dx && DIRECTIONS[key].y === dy);
      if (direction) { if (matchMode) { matchDirection = direction; render(); } else commit({ type: 'move', direction }); }
    } else if (action === 'wait') commit({ type: 'wait' });
    else if (action === 'match-mode') { matchMode = !matchMode; matchDirection = undefined; selectedInteraction = undefined; render(); }
    else if (action === 'commit-match' && matchDirection) commit({ type: 'match', direction: matchDirection });
    else if (action === 'select-interaction') { selectedInteraction = target.dataset.id; matchMode = false; matchDirection = undefined; render(); }
    else if (action === 'commit-interaction') {
      const item = interactions(state).find(candidate => candidate.id === selectedInteraction);
      if (item?.available) commit(item.action);
    } else if (action === 'cancel-action') { selectedInteraction = undefined; matchMode = false; matchDirection = undefined; render(); }
  });

  document.addEventListener('keydown', event => {
    if (!state || state.status !== 'active' || overlay || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
    const direction = directionKeys[event.key] ?? directionKeys[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    if (matchMode) { matchDirection = direction; render(); } else commit({ type: 'move', direction });
  });

  render();
}
