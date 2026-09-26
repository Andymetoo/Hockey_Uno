import { DIRECTIONS, ITEMS, TUNING } from './content.ts';
import { createGame } from './generation.ts';
import { act, banishCost, interactions, refillPreview, rewardText } from './game.ts';
import { planRoute } from './movement.ts';
import { illuminated, samePosition, tileAt } from './world.ts';
import type { Action, Direction, GameState, Interaction, Position, Room, Tile } from './types.ts';
import type { LoadResult, SaveResult } from './persistence.ts';

type Services = { load: () => LoadResult; save: (state: GameState) => SaveResult; newSeed: () => string };
type Overlay = 'help' | 'legend' | 'journal' | 'new' | 'restart';
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const directionKeys: Record<string, Direction> = { ArrowUp: 'north', w: 'north', ArrowRight: 'east', d: 'east', ArrowDown: 'south', s: 'south', ArrowLeft: 'west', a: 'west' };
const arrows: Record<Direction, string> = { north: '↑', east: '→', south: '↓', west: '←' };
const symbols: Record<Tile['kind'], string> = { wall: '▧', floor: '·', furniture: '▥', container: '▣', candle: '♧', door: '∩', stairs: '≋', altar: '◇', exit: '⇧' };
const mansion = `<svg class="hh-mansion" viewBox="0 0 440 230" fill="none" aria-hidden="true"><defs><pattern id="hh-hatch" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 5L5 0" stroke="currentColor" stroke-width=".6"/></pattern></defs><circle cx="313" cy="54" r="31" stroke="currentColor"/><path d="M300 25a31 31 0 0 0 36 43" fill="currentColor" opacity=".1"/><path d="M27 205h386M53 199V114l53-44 45 38V81l69-61 68 61v27l45-38 54 44v85M58 114h91m142 0h91M151 82h137M169 81v118m101-118v118M72 199v-72h61v72m173 0v-72h61v72M182 199v-70h76v70M162 105h116M155 199h130" stroke="currentColor" stroke-width="2"/><path d="M53 114l53-44 45 38v6H53Zm238 0 42-44 54 44h-96ZM151 81l69-61 68 61H151Z" fill="url(#hh-hatch)"/><path d="M99 63V44h16v33M323 77V43h15v31M206 198v-41a14 14 0 0 1 28 0v41M205 80V61h30v19M82 155v-17h14v17Zm28 0v-17h14v17Zm207 0v-17h14v17Zm28 0v-17h14v17ZM191 120v-19h14v19Zm45 0v-17h14v17Z" stroke="currentColor" stroke-width="2"/><path d="M213 175h3M194 205l-14 18m64-18 15 18M28 199v-29l-9-9m9 21 12-11m365 28v-36l9-8m-9 25-11-10" stroke="currentColor"/><path d="M30 89h35m-17-8h29m282 17h41M12 211h112m176 0h120" stroke="currentColor" opacity=".35"/></svg>`;
const hauntingGlyph = '<svg class="hh-haunting-glyph" viewBox="0 0 24 28" aria-hidden="true"><path d="M3 26V12a9 9 0 0 1 18 0v14l-5-3-4 3-4-3-5 3Z" fill="currentColor"/><path d="M8 11v5m8-5v5" stroke="var(--hh-panel)" stroke-width="3"/></svg>';
const candleGlyph = '<svg class="hh-candle-glyph" viewBox="0 0 20 28" aria-hidden="true"><path d="M10 1c1 4 5 6 4 9-1 5-8 5-8 0 0-3 3-5 4-9Z" fill="currentColor"/><path d="M6 16h8v10H6zM3 27h14" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

export function mountGame(root: HTMLElement, services: Services): void {
  root.innerHTML = '<div class="hh-view"></div><div class="hh-announcement" aria-live="polite" aria-atomic="true"></div>';
  const view = root.querySelector<HTMLElement>('.hh-view')!;
  const liveRegion = root.querySelector<HTMLElement>('.hh-announcement')!;
  let saved = services.load();
  const legacyRaw = saved.kind === 'legacy' ? saved.raw : saved.kind === 'loaded' ? saved.legacyRaw : undefined;
  let state: GameState | undefined;
  let overlay: Overlay | undefined;
  let selectedInteraction: string | undefined;
  let saveStatus = 'No active house';
  let saveFailed = false;
  let announcement = '';
  let feedback = '';
  let returnFocus = '';
  let pendingRoute: Action[] = [];
  let routeTimer: number | undefined;
  let routeDestination: Position | undefined;

  const button = (label: string, action: string, extra = '', className = '') => `<button type="button" class="hh-button ${className}" data-action="${action}" ${extra.includes('data-focus=') ? '' : `data-focus="${action}"`} ${extra}>${label}</button>`;
  const roomOf = (game: GameState) => game.rooms.find(room => room.id === game.player.roomId)!;
  const floorName = (floor: number) => floor === 0 ? 'Ground floor' : `Floor ${floor + 1}`;
  const knownPosition = (game: GameState, position: Position) => {
    const room = game.rooms.find(candidate => candidate.id === position.roomId);
    return !!room?.discovered[position.y * room.width + position.x];
  };

  function cancelRoute(): void {
    if (routeTimer !== undefined) window.clearTimeout(routeTimer);
    routeTimer = undefined;
    pendingRoute = [];
    routeDestination = undefined;
  }

  function persist(): void {
    if (!state) return;
    const result = services.save(state);
    saveFailed = !result.ok;
    saveStatus = result.message;
    if (result.ok) saved = { kind: 'loaded', state };
  }

  function start(restart: boolean): void {
    cancelRoute();
    try {
      state = createGame(restart && state ? state.seed : services.newSeed());
      overlay = undefined;
      selectedInteraction = undefined;
      feedback = 'The house is still. Inspect what waits nearby before choosing your first ritual.';
      announcement = `${state.objective.description} You are in ${roomOf(state).name}. Light ${state.light} of ${state.maxLight}. Ritual power ${state.ritualPower}.`;
      persist();
      render('board');
    } catch (error) {
      overlay = undefined;
      feedback = `The house could not be prepared. ${error instanceof Error ? error.message : 'Please try again.'}`;
      announcement = feedback;
      render();
    }
  }

  function requestStart(kind: 'new' | 'restart'): void {
    cancelRoute();
    if (state?.status === 'active' || saved.kind === 'error' || (!state && saved.kind === 'loaded' && saved.state.status === 'active')) openOverlay(kind);
    else start(kind === 'restart');
  }

  function commit(action: Action): void {
    cancelRoute();
    if (!state || (state.status !== 'active' && action.type !== 'undo')) return;
    const result = act(state, action);
    state = result.state;
    feedback = result.message;
    announcement = `${feedback}${result.consequential || action.type === 'undo' ? ` Light ${state.light} of ${state.maxLight}. Ritual power ${state.ritualPower}.` : ''}`;
    if (action.type === 'undo') selectedInteraction = undefined;
    if (result.committed) persist();
    render(action.type === 'undo' ? 'board' : undefined);
  }

  function walkTo(position: Position, approach = false): void {
    cancelRoute();
    if (!state || state.status !== 'active' || overlay) return;
    const route = planRoute(state, position, approach);
    if (route === null) {
      feedback = 'No known clear route reaches that position. Explore nearby or open a passage first.';
      announcement = feedback;
      render();
      return;
    }
    if (!route.length) {
      feedback = approach ? 'You are within reach. Choose the action when you are ready.' : 'You are already here.';
      announcement = feedback;
      render();
      return;
    }
    pendingRoute = route;
    routeDestination = position;
    feedback = approach ? 'Walking within reach. The action remains yours to choose.' : 'Walking through known, clear space.';
    render();
    routeTimer = window.setTimeout(walkStep, TUNING.routeStepMs);
  }

  function walkStep(): void {
    routeTimer = undefined;
    if (!state || overlay || state.status !== 'active' || !pendingRoute.length) { cancelRoute(); return; }
    const previousRoom = state.player.roomId;
    const result = act(state, pendingRoute.shift()!);
    state = result.state;
    if (result.committed) persist();
    const stopped = !result.committed || result.discoveredChoice || state.player.roomId !== previousRoom || !pendingRoute.length;
    if (stopped) {
      cancelRoute();
      feedback = result.discoveredChoice ? 'Something new is within sight. Inspect it before continuing.' : result.message;
      announcement = feedback;
    }
    render();
    if (!stopped) routeTimer = window.setTimeout(walkStep, TUNING.routeStepMs);
  }

  function openOverlay(kind: Overlay): void {
    cancelRoute();
    returnFocus = (document.activeElement as HTMLElement | null)?.dataset.focus ?? '';
    overlay = kind;
    render();
  }

  function closeOverlay(): void {
    overlay = undefined;
    render(returnFocus);
  }

  function selectInteraction(id: string): void {
    cancelRoute();
    selectedInteraction = id;
    overlay = undefined;
    render(`interaction-${id}`);
    if (window.matchMedia('(max-width: 680px)').matches) root.querySelector('.hh-action-detail')?.scrollIntoView({ block: 'nearest' });
  }

  function visibleTile(game: GameState, room: Room, x: number, y: number, selectedPosition?: Position): string {
    const known = room.discovered[y * room.width + x];
    const lit = illuminated(game, x, y);
    const position = { roomId: room.id, x, y };
    const player = samePosition(game.player, position);
    const tile = tileAt(room, x, y)!;
    const container = known && tile.containerId ? room.containers.find(item => item.id === tile.containerId) : undefined;
    const connection = known && tile.connectionId ? game.connections.find(item => item.id === tile.connectionId) : undefined;
    const haunting = known ? game.hauntings.find(item => !item.banished && samePosition(item.position, position)) : undefined;
    const candle = known ? game.candles.find(item => samePosition(item.position, position)) : undefined;
    let name = known ? tile.label ?? tile.kind : 'Unexplored darkness';
    if (container) name = `${container.label}, ${container.opened ? 'searched' : 'unsearched'}`;
    if (connection) name = `${tile.kind === 'stairs' ? 'Staircase' : 'Doorway'}, ${connection.opened || !connection.gate ? 'open' : `requires ${ITEMS[connection.gate].name}`}`;
    if (haunting) name = haunting.resolution === 'keepsake'
      ? `${haunting.name}, bound soul. Release at the memorial with the silver locket. Select to inspect`
      : `${haunting.name}, stationary haunting. Resistance ${haunting.resistance}. Banish for ${banishCost(game, haunting)} light. Select to inspect`;
    if (candle) name = `${candle.name}, ${candle.used ? 'used' : `restores ${candle.restores} light once`}. Select to inspect`;
    const label = `Column ${x + 1}, row ${y + 1}. ${player ? 'You are here. ' : ''}${name}.${known ? lit ? ' In sight.' : ' Remembered.' : ''}`;
    const mark = haunting ? hauntingGlyph : candle ? candle.used ? '<span aria-hidden="true">♙</span>' : candleGlyph : `<span aria-hidden="true">${container?.opened ? '□' : symbols[tile.kind]}</span>`;
    const symbol = player ? '<span class="hh-player" aria-hidden="true">@</span>' : known ? mark : '<span aria-hidden="true">&nbsp;</span>';
    return `<button type="button" role="gridcell" tabindex="${player ? '0' : '-1'}" class="hh-tile ${known ? lit ? 'is-lit' : 'is-memory' : 'is-dark'} ${known ? `is-${tile.kind}` : ''} ${player ? 'is-player' : ''} ${haunting ? 'is-haunting' : ''} ${candle?.used ? 'is-used' : ''} ${selectedPosition && samePosition(selectedPosition, position) ? 'is-selected-target' : ''} ${routeDestination && samePosition(routeDestination, position) ? 'is-destination' : ''}" data-action="tile" data-x="${x}" data-y="${y}" data-focus="${player ? 'board' : `tile-${x}-${y}`}" aria-label="${escape(label)}" title="${escape(label)}">${symbol}${connection?.gate && !connection.opened ? '<span class="hh-gate-mark" aria-hidden="true">×</span>' : ''}</button>`;
  }

  function resources(game: GameState): string {
    return `<section class="hh-resource-strip" aria-label="Ritual resources"><div class="hh-light-resource"><span class="hh-resource-icon">${candleGlyph}</span><div><span class="hh-resource-label">Light</span><strong class="hh-light-value">${game.light}<span> / ${game.maxLight}</span></strong></div><span class="hh-light-pips" aria-hidden="true">${Array.from({ length: game.maxLight }, (_, index) => `<i class="${index < game.light ? 'is-full' : ''}"></i>`).join('')}</span></div><div class="hh-power-resource"><span class="hh-resource-label">Ritual power</span><strong class="hh-power-value">${game.ritualPower}</strong></div>${button('↶ <span>Undo last decision</span>', 'undo', `title="Restore the complete state before your last decision, including movement and exploration since then." ${!game.undo.length ? 'disabled' : ''}`, 'hh-undo')}</section>`;
  }

  function board(game: GameState): string {
    const room = roomOf(game);
    const selectedPosition = interactions(game).find(item => item.id === selectedInteraction)?.position;
    return `<section class="hh-room-panel" aria-labelledby="hh-room-title"><header class="hh-room-heading"><div><p class="hh-eyebrow">${floorName(room.floor)}</p><h2 id="hh-room-title">${escape(room.name)}</h2></div><span class="hh-room-number" title="Current position">${String(game.player.x + 1).padStart(2, '0')} / ${String(game.player.y + 1).padStart(2, '0')}</span></header><div class="hh-board-frame" style="--hh-room-width:${room.width}"><div class="hh-board" role="grid" aria-label="${escape(room.name)} room map" style="--hh-columns:${room.width}">${Array.from({ length: room.height }, (_, y) => `<div role="row" class="hh-grid-row">${Array.from({ length: room.width }, (_, x) => visibleTile(game, room, x, y, selectedPosition)).join('')}</div>`).join('')}</div></div><div class="hh-board-caption"><span><i class="hh-light-swatch"></i> In sight</span><span><i class="hh-memory-swatch"></i> Remembered</span><span><i class="hh-dark-swatch"></i> Unknown</span></div><div class="hh-controls"><div class="hh-dpad" aria-label="Movement controls">${(['north', 'west', 'south', 'east'] as Direction[]).map(direction => button(arrows[direction], `direction-${direction}`, `aria-label="Move ${direction}" ${game.status !== 'active' ? 'disabled' : ''}`, `hh-direction hh-${direction}`)).join('')}</div><div class="hh-control-actions">${pendingRoute.length ? button('Stop walking', 'cancel-route', '', 'hh-route-stop') : '<span class="hh-walking-note">Walking is free.</span>'}<span class="hh-key-hint">Arrow keys / WASD to step</span><span class="hh-key-hint">Click a known floor to walk</span><span class="hh-key-hint">Esc cancels a route</span></div></div></section>`;
  }

  function inventory(game: GameState): string {
    return `<section class="hh-inventory" aria-labelledby="hh-inventory-title"><p class="hh-eyebrow" id="hh-inventory-title">In your pockets</p>${game.inventory.length ? `<ul class="hh-items">${game.inventory.map(id => `<li title="${escape(ITEMS[id].description)}"><span aria-hidden="true">${ITEMS[id].symbol}</span>${escape(ITEMS[id].name)}${id === 'keepsake' && game.objective.completed ? ' · placed' : ''}</li>`).join('')}</ul>` : '<p class="hh-empty-inventory">No keys or tools. Yet.</p>'}<p class="hh-pocket-note">Keys and the crowbar are reusable.</p><p class="hh-treasure">${game.treasure} curious treasure${game.treasure === 1 ? '' : 's'} collected</p></section>`;
  }

  function interactionDetail(game: GameState, item: Interaction): string {
    const action = item.action;
    const room = game.rooms.find(candidate => candidate.id === item.position.roomId)!;
    const haunting = action.type === 'banish' ? game.hauntings.find(candidate => candidate.id === action.hauntingId) : undefined;
    const candle = action.type === 'refill' ? game.candles.find(candidate => candidate.id === action.candleId) : undefined;
    let preview = '';
    let actionLabel = item.label;
    if (haunting?.resolution === 'keepsake') {
      preview = `<p>${item.resolved ? 'The locket has returned to its owner. This tile is now clear.' : 'This soul is bound to the silver locket. Bring it to the memorial to release its owner.'}</p><p class="hh-consequence">${item.resolved ? 'Its haunting is settled.' : `Memorial ritual: ${game.objective.ritualCost} light. Force cannot release this soul.`}</p>`;
      actionLabel = 'Resolve at the memorial';
    } else if (haunting) {
      const cost = banishCost(game, haunting);
      preview = `<dl class="hh-ritual-preview"><div><dt>Resistance</dt><dd>${haunting.resistance}</dd></div><div><dt>Your power</dt><dd>${game.ritualPower}</dd></div><div><dt>Light cost</dt><dd>${cost}</dd></div></dl><p class="hh-reward"><strong>Reward:</strong> ${escape(rewardText(haunting.reward))}</p><p>${escape(haunting.benefit)}</p>${haunting.requires ? `<p class="hh-requirement">Requires ${escape(ITEMS[haunting.requires].name)}${game.inventory.includes(haunting.requires) ? ' · carried' : ' · not yet found'}.</p>` : ''}${!item.resolved ? `<p class="hh-consequence">${game.light >= cost ? `Light after banishment: ${game.light - cost} / ${game.maxLight}.` : `Needs ${cost} light; you have ${game.light}. ${cost > game.maxLight ? 'Increase ritual power to bring its cost within your capacity.' : 'A candle or more ritual power could help.'}`}</p>` : ''}`;
      actionLabel = `Banish · ${cost} light`;
    } else if (candle) {
      const refill = refillPreview(game, candle);
      preview = `<p class="hh-refill-preview">Restore <strong>${candle.restores} light</strong>. ${candle.used ? 'This candle has already been used.' : `You would receive <strong>${refill.received}</strong>; <strong>${refill.wasted}</strong> would be wasted.`}</p>${!candle.used ? `<p class="hh-consequence">Light after use: ${refill.total} / ${game.maxLight}. One use only.</p>` : ''}`;
      actionLabel = `Use candle · receive ${refill.received} light`;
    }
    const travel = action.type === 'travel';
    const canApproach = (!item.adjacent || travel) && item.position.roomId === game.player.roomId && planRoute(game, item.position, !travel) !== null;
    const details = preview ? item.resolved && !candle && !haunting?.resolution ? item.detail : '' : item.detail;
    return `<div class="hh-action-detail" id="hh-selected-detail"><p class="hh-eyebrow">${item.resolved ? 'Resolved' : item.adjacent ? 'Within reach' : 'Remembered'} · ${escape(room.name)}</p><h3 id="hh-selected-title">${escape(item.name)}</h3>${preview}${details ? `<p class="hh-detail-description">${escape(details)}</p>` : ''}${!item.adjacent && !item.resolved ? `<p class="hh-muted">${canApproach ? 'Move within reach to act.' : room.id === game.player.roomId ? 'No known clear approach yet. Explore or open a route.' : `Return to ${escape(room.name)} to act.`}</p>` : ''}${game.status === 'active' && !item.resolved ? `<div class="hh-detail-buttons">${canApproach ? button(travel ? 'Walk through passage' : 'Walk within reach', 'approach') : ''}${!travel || !canApproach ? button(escape(actionLabel), 'commit-interaction', `data-kind="${action.type}" ${!item.available ? 'disabled' : ''}`, 'hh-primary') : ''}</div>` : ''}<div class="hh-detail-dismiss">${button('Close inspection', 'cancel-action', '', 'hh-quiet')}</div></div>`;
  }

  function actions(game: GameState): string {
    const discovered = interactions(game);
    const selected = discovered.find(item => item.id === selectedInteraction);
    const local = discovered.filter(item => item.position.roomId === game.player.roomId && !item.resolved);
    return `<section class="hh-interactions" aria-labelledby="hh-actions-title"><div class="hh-section-heading"><h2 id="hh-actions-title">In this room</h2><span>Inspect freely</span></div><div class="hh-action-options">${local.map(item => button(`${item.action.type === 'banish' ? '<span class="hh-option-glyph">!</span> ' : ''}${escape(item.name)}`, 'select-interaction', `data-id="${escape(item.id)}" data-focus="interaction-${escape(item.id)}" aria-pressed="${selected?.id === item.id}"`, selected?.id === item.id ? 'is-selected' : '')).join('')}</div>${selected ? interactionDetail(game, selected) : `<p class="hh-context-hint">${local.length ? 'Choose a marked spirit, candle, or object to see its exact cost and benefit.' : 'A quiet corner. Explore the edges, or revisit a known lead in your journal.'}</p>`}${game.light === 0 && game.status === 'active' ? '<p class="hh-zero-note">No light remains. You can still explore, inspect, reach an unused candle, or undo a decision.</p>' : ''}</section>`;
  }

  function leads(game: GameState): string {
    const discovered = interactions(game);
    const blocked = discovered.filter(item => !item.resolved && item.action.type === 'unlock');
    return `<section class="hh-journal-prompt"><div class="hh-section-heading"><h2>The house so far</h2><span aria-hidden="true">⌑</span></div><p>${game.rooms.filter(room => room.visited).length} rooms visited. ${discovered.filter(item => !item.resolved && item.action.type === 'banish').length} known hauntings.</p>${game.journal.length ? `<p class="hh-latest-lead">${escape(game.journal[game.journal.length - 1])}</p>` : '<p>What you discover stays in your journal.</p>'}${blocked.length ? `<ul class="hh-blocked-leads">${blocked.slice(0, 3).map(item => `<li>${button(escape(item.name), 'select-interaction', `data-id="${escape(item.id)}" data-focus="lead-${escape(item.id)}"`, 'hh-lead-button')}</li>`).join('')}</ul>` : ''}${button('Open your journal <span aria-hidden="true">→</span>', 'journal')}</section>`;
  }

  function journal(game: GameState): string {
    const discovered = interactions(game);
    return `<p class="hh-dialog-intro">A record of what you have seen. Inspect any remembered presence or object; its location and state persist.</p>${game.journal.length ? `<ul class="hh-journal-notes">${game.journal.map(note => `<li>${escape(note)}</li>`).join('')}</ul>` : ''}<div class="hh-journal">${game.rooms.filter(room => room.visited).map(room => {
      const local = discovered.filter(item => item.position.roomId === room.id);
      const links = game.connections.filter(connection => [connection.a, connection.b].some(endpoint => endpoint.roomId === room.id && knownPosition(game, endpoint)));
      return `<section class="hh-journal-room"><div class="hh-section-heading"><h3>${escape(room.name)} ${room.id === game.player.roomId ? '<span class="hh-here">YOU</span>' : ''}</h3><span>${floorName(room.floor)}</span></div>${links.length ? `<ul>${links.map(connection => {
        const other = connection.a.roomId === room.id ? connection.b : connection.a;
        const destination = game.rooms.find(candidate => candidate.id === other.roomId)!;
        return `<li><span aria-hidden="true">${connection.kind === 'stairs' ? '≋' : '∩'}</span><div><strong>${destination.visited ? escape(destination.name) : 'Unvisited room'}</strong><small>${connection.kind === 'stairs' ? 'Staircase' : 'Doorway'} · ${connection.opened || !connection.gate ? 'open' : `requires ${escape(ITEMS[connection.gate].name)}`}</small></div></li>`;
      }).join('')}</ul>` : ''}${local.length ? `<div class="hh-journal-targets">${local.map(item => button(`${item.resolved ? '✓ ' : ''}${escape(item.name)}`, 'select-interaction', `data-id="${escape(item.id)}" data-focus="journal-${escape(item.id)}"`, 'hh-journal-target')).join('')}</div>` : '<p class="hh-muted">No objects recorded here.</p>'}</section>`;
    }).join('')}</div><p class="hh-rule-note">Undo restores the complete state before a decision, including your position and everything explored since that snapshot. It never changes the house or rerolls its contents.</p>${legacyRaw !== undefined ? button('Download earlier-rules save', 'download-legacy', '', 'hh-quiet') : ''}<p class="hh-seed">House seed: <code>${escape(game.seed)}</code></p>`;
  }

  function help(): string {
    return `<p class="hh-dialog-intro">Discover what the house offers. Spend your light where it opens the possibilities you need, then complete your errand and return home.</p><ol class="hh-rules"><li><strong>Explore without a clock.</strong> Arrow keys, WASD, or the touch controls move one tile. Click a revealed floor to walk there through known, clear space. A route stops when a new choice appears. Click another destination to replace it, or press Escape to stop. Walking uses no light.</li><li><strong>Inspect before committing.</strong> Click a marked haunting, candle, or object to learn its cost, reward, and requirements. Inspection is free, including remembered objects in your journal. Use “Walk within reach” to approach it. Movement never triggers a ritual or consumes a candle.</li><li><strong>Hauntings hold their ground.</strong> A haunting blocks its tile until banished. It cannot pursue or hurt you. Stand directly beside it and choose “Banish” to spend the displayed light and receive its reward. Nothing is spent if you cannot afford the action.</li><li><strong>Power lasts; light is spent.</strong> A banishment costs resistance minus ritual power, with a minimum of 1 light. Selected rewards permanently increase power for this adventure. Costs update immediately. Your light capacity stays at ${TUNING.maxLight}.</li><li><strong>Save a candle for the right moment.</strong> Each candle restores its stated amount once, only when you choose to use it. The preview shows what you receive and what would overflow your capacity. Light does not return through walking, revisiting, or reloading.</li><li><strong>Rewards change your options.</strong> A more expensive haunting may open access to replenishment, a tool, or a stronger ritual. You can leave optional treasure and hauntings behind. Search objects deliberately. Named keys and the crowbar are reusable; unlock a gate explicitly, then walk through the open passage or stairs.</li><li><strong>Find your way home.</strong> Follow the objective shown above the map. Escaping needs the front-door key. A missing diary must be brought back. A keepsake must be placed at its memorial to resolve its owner's haunting before you leave. The memorial shows any ritual cost.</li><li><strong>Reconsider a decision.</strong> “Undo last decision” restores the complete state before a banishment, candle, collection, unlock, or objective action. Movement and exploration since then are also restored. Up to ${TUNING.undoLimit} decisions are kept, including after closing the page. Contents never reroll. Zero light does not end the adventure: explore safely, look for a reachable candle, or undo.</li></ol><p class="hh-rule-note">The map stays visible even at zero light. Bright tiles are in sight; hatched tiles are remembered. Autosave records committed changes and undo; the footer reports any failure. “Restart” resets this same house. “New house” replaces the current adventure with a different one.</p>`;
  }

  function legend(): string {
    const entries = [['@', 'You', 'Your current tile.'], ['·', 'Floor', 'Click a known, reachable tile to walk there.'], [hauntingGlyph, 'Haunting', 'Stationary. Blocks its tile. Inspect its exact cost, requirement, and reward.'], [candleGlyph, 'Candle', 'A finite refill. Inspect the restoration and overflow; choose when to use it.'], ['♙', 'Used candle', 'Its light has already been received.'], ['▧', 'Wall', 'Impassable.'], ['▥', 'Furniture', 'A solid furnishing that shapes the room.'], ['▣', 'Searchable object', 'Stand beside it, inspect, then collect its contents deliberately.'], ['□', 'Searched object', 'Its contents remain collected.'], ['∩', 'Doorway', 'Walk onto an open passage to travel. A × marks a gate that needs a named key or crowbar.'], ['≋', 'Staircase', 'Walk onto it to travel between floors.'], ['◇', 'Memorial', 'A keepsake and a ritual may release its associated haunting.'], ['⇧', 'Entrance / exit', 'Return and choose to leave when your objective is complete.']];
    return `<p class="hh-dialog-intro">Every discovered presence stays marked until you resolve it.</p><dl class="hh-legend">${entries.map(([symbol, name, description]) => `<div><dt><span aria-hidden="true">${symbol}</span>${name}</dt><dd>${description}</dd></div>`).join('')}</dl><div class="hh-legend-memory"><p><strong>Bright:</strong> currently in sight.</p><p><strong>Dim and hatched:</strong> remembered tiles and objects.</p><p><strong>Dark:</strong> unexplored; contents are unknown.</p></div>`;
  }

  function dialog(): string {
    if (!overlay) return '';
    const confirming = overlay === 'new' || overlay === 'restart';
    const title = overlay === 'help' ? 'How to read the house' : overlay === 'legend' ? 'Read the room' : overlay === 'journal' ? 'Your house journal' : overlay === 'restart' ? 'Return to the beginning?' : 'Enter a new house?';
    const unreadable = saved.kind === 'error';
    const content = overlay === 'help' ? help() : overlay === 'legend' ? legend() : overlay === 'journal' && state ? journal(state) : `<p class="hh-dialog-intro">${unreadable ? 'Your existing save could not be read. Starting a new house may replace that saved data.' : overlay === 'restart' ? 'This resets the same house, its contents, and your progress to the beginning. Your undo history will be cleared.' : 'A different house and adventure will replace your current run and undo history.'}</p>${unreadable && saved.kind === 'error' ? `<div class="hh-storage-warning"><p>${escape(saved.message)}</p>${saved.raw !== undefined ? button('Download unreadable save', 'download-save') : ''}</div>` : ''}<div class="hh-confirm-buttons">${button('Keep current save', 'close-dialog', '', 'hh-primary')}${button(overlay === 'restart' ? 'Restart this house' : 'Start new house', 'confirm-start')}</div>`;
    return `<dialog class="hh-dialog ${confirming ? 'hh-confirm-dialog' : ''}" aria-labelledby="hh-dialog-title"><header><div><p class="hh-eyebrow">Haunted House</p><h2 id="hh-dialog-title">${title}</h2></div>${button('×', 'close-dialog', 'aria-label="Close dialog"', 'hh-close')}</header><div class="hh-dialog-content">${content}</div>${!confirming ? `<footer>${button('Back to the house', 'close-dialog', '', 'hh-primary')}</footer>` : ''}</dialog>`;
  }

  function menu(): string {
    return `<main class="hh-menu"><div class="hh-menu-art">${mansion}</div><p class="hh-eyebrow">A quiet game of exploration & ritual</p><h1>Haunted<br><em>House</em></h1><p class="hh-menu-copy">A little light. A house full of possibilities.<br>Choose what you leave behind.</p><div class="hh-menu-buttons">${saved.kind === 'loaded' ? button('Continue saved game <span aria-hidden="true">→</span>', 'continue', '', 'hh-primary') : ''}${button('New house <span aria-hidden="true">→</span>', 'new', '', saved.kind === 'loaded' ? '' : 'hh-primary')}</div>${saved.kind === 'loaded' ? `<p class="hh-menu-saved">${escape(saved.state.objective.title)} · ${saved.state.decisions} decisions${saved.state.status === 'won' ? ' · Escaped' : ''}</p>` : ''}${saved.kind === 'error' ? `<div class="hh-storage-warning"><strong>Saved house unavailable</strong><p>${escape(saved.message)} Your saved data has been preserved.</p>${saved.raw !== undefined ? button('Download unreadable save', 'download-save') : ''}</div>` : ''}${saved.kind === 'legacy' ? `<div class="hh-storage-warning"><strong>A house from earlier rules</strong><p>${escape(saved.message)} Start a new house to play this adventure. Your earlier save will remain intact.</p>${button('Download earlier-rules save', 'download-legacy')}</div>` : ''}${feedback ? `<p class="hh-menu-feedback">${escape(feedback)}</p>` : ''}<p class="hh-menu-footnote">No clock. Finite light. Time to think.</p></main>`;
  }

  function game(game: GameState): string {
    return `<main class="hh-main"><div class="hh-game-title"><div><p class="hh-eyebrow">A house with something to hide</p><h1>Haunted House</h1></div><div class="hh-run-controls">${button('New house', 'new', '', 'hh-quiet')}${button('Restart', 'restart', 'aria-label="Restart this house"', 'hh-quiet')}</div></div>${resources(game)}<section class="hh-objective" aria-labelledby="hh-objective-title"><span class="hh-objective-mark" aria-hidden="true">◇</span><div><p class="hh-eyebrow" id="hh-objective-title">${escape(game.objective.title)}</p><p>${escape(game.objective.description)}</p></div>${game.objective.completed ? '<span class="hh-objective-complete">Complete</span>' : ''}</section>${game.status === 'won' ? `<section class="hh-ending" aria-labelledby="hh-ending-title"><p class="hh-eyebrow">The night is behind you</p><h2 id="hh-ending-title">You made it home.</h2><p>You completed ${escape(game.objective.title.toLowerCase())} with ${game.treasure} treasure${game.treasure === 1 ? '' : 's'}, ${game.light} light remaining, and ${game.decisions} decisions.</p><div>${button('New house', 'new', '', 'hh-primary')}${button('Try this house again', 'restart')}</div></section>` : ''}<div class="hh-game-layout"><div class="hh-exploration">${board(game)}</div><aside class="hh-sidebar">${actions(game)}${inventory(game)}${leads(game)}</aside></div><section class="hh-events" aria-labelledby="hh-events-title"><div class="hh-section-heading"><h2 id="hh-events-title">Whispers & discoveries</h2><span>${game.decisions} decisions · ${game.steps} steps</span></div>${feedback ? `<p class="hh-feedback">${escape(feedback)}</p>` : ''}<ol>${game.log.slice(-5).reverse().map((event, index) => `<li class="${index === 0 ? 'is-latest' : ''}">${escape(event)}</li>`).join('')}</ol></section><footer class="hh-game-footer"><span class="hh-save-status ${saveFailed ? 'is-error' : ''}">${saveFailed ? '!' : '✓'} ${escape(saveStatus)}</span><span>Seed <code>${escape(game.seed)}</code></span></footer></main>`;
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

  function download(raw: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('a.hh-home')) { cancelRoute(); return; }
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action!;
    if (action === 'help' || action === 'legend' || action === 'journal') { openOverlay(action); return; }
    if (action === 'close-dialog') { closeOverlay(); return; }
    if (action === 'new' || action === 'restart') { requestStart(action); return; }
    if (action === 'confirm-start') { start(overlay === 'restart'); return; }
    if (action === 'download-save' && saved.kind === 'error' && saved.raw !== undefined) { download(saved.raw, 'haunted-house-unreadable-save.txt'); return; }
    if (action === 'download-legacy' && legacyRaw !== undefined) { download(legacyRaw, 'haunted-house-earlier-rules-save.txt'); return; }
    if (action === 'continue' && saved.kind === 'loaded') {
      cancelRoute(); state = saved.state; saveStatus = `Loaded · ${state.decisions} decisions`; saveFailed = false;
      announcement = `Continued your saved house. ${roomOf(state).name}. Light ${state.light} of ${state.maxLight}. Ritual power ${state.ritualPower}.`;
      render('board'); return;
    }
    if (!state) return;
    if (action === 'select-interaction') { selectInteraction(target.dataset.id!); return; }
    if (overlay) return;
    if (action === 'undo') { commit({ type: 'undo' }); return; }
    if (action === 'cancel-action') { cancelRoute(); selectedInteraction = undefined; render(); return; }
    if (state.status !== 'active') return;
    if (action.startsWith('direction-')) commit({ type: 'move', direction: action.slice(10) as Direction });
    else if (action === 'tile') {
      cancelRoute();
      const position = { roomId: state.player.roomId, x: Number(target.dataset.x), y: Number(target.dataset.y) };
      const tile = tileAt(roomOf(state), position.x, position.y);
      if (!knownPosition(state, position)) {
        const direction = (Object.keys(DIRECTIONS) as Direction[]).find(key => DIRECTIONS[key].x === position.x - state!.player.x && DIRECTIONS[key].y === position.y - state!.player.y);
        if (direction) commit({ type: 'move', direction });
        else { feedback = 'Explore closer before plotting a route into the unknown.'; announcement = feedback; render(); }
        return;
      }
      const item = interactions(state).find(candidate => samePosition(candidate.position, position) && candidate.action.type !== 'travel' && !(candidate.resolved && candidate.action.type === 'banish'));
      if (item) selectInteraction(item.id);
      else if (tile && ['floor', 'door', 'stairs', 'exit'].includes(tile.kind)) { selectedInteraction = undefined; walkTo(position); }
      else { feedback = `${tile?.label ?? 'A solid part of the room'}. Choose an open floor to walk.`; announcement = feedback; render(); }
    } else if (action === 'cancel-route') { cancelRoute(); feedback = 'Stopped. Take your time.'; announcement = feedback; render(); }
    else if (action === 'approach') {
      const item = interactions(state).find(candidate => candidate.id === selectedInteraction);
      if (item) walkTo(item.position, item.action.type !== 'travel');
    } else if (action === 'commit-interaction') {
      const item = interactions(state).find(candidate => candidate.id === selectedInteraction);
      if (item?.available) commit(item.action);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay && pendingRoute.length) { event.preventDefault(); cancelRoute(); feedback = 'Stopped. Take your time.'; announcement = feedback; render(); return; }
    if (!state || state.status !== 'active' || overlay || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
    const direction = directionKeys[event.key] ?? directionKeys[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    commit({ type: 'move', direction });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelRoute(); render(); } });
  render();
}
