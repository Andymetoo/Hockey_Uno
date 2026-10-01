/** Presentation only: no draws, dice, rule mutations or hidden-state lookups. */
const friendly = value => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/^./, letter => letter.toUpperCase());
const upper = value => String(value ?? '').toUpperCase();
const continuousEvent = event => (event?.ruleset ?? event?.state?.ruleset) === 'v2-continuous';
const eventFighter = event => event?.state?.fighters?.find(fighter => fighter.id === event.fighterId);
const compact = new Set([
  'MISSION_BAG_REFILLED', 'COMBAT_BAG_REFILLED', 'ENEMY_DECK_SHUFFLED',
  'CREW_READIED', 'CREW_ACTION_READY', 'CREW_SELECTION_READY', 'NEXT_ROUND_READY',
  'GUNNER_FIRE_ENDED', 'FLAK_ENDED', 'WORK_TARGET_CHANGED', 'MEDICAL_NO_EFFECT',
  'UNAVAILABLE_DRAW_SKIPPED', 'AIRCRAFT_HIT_BURNING', 'CREW_HELD_POSITION',
  'ACTIVATION_COMPLETED', 'OPPORTUNITY_WINDOW_OPENED', 'CREW_CYCLE_REFRESHED', 'TURN_COMPLETE', 'ENGAGEMENT_SPENT', 'FIGHTER_DISENGAGED',
]);
const categoryIcons = { crew: '●', resource: '+', gunfire: '⌖', enemy: '✈', damage: '◆', injury: '✚', repair: '⚒', altitude: '↕', time: '◷', departure: '↗' };

export function eventCategory(event) {
  const type = event?.type ?? '';
  if (type === 'FIGHTER_BREAKING_OFF' || type === 'FIGHTER_DISENGAGED') return 'departure';
  if (/^(TIME_|PROGRESS_|CHECKPOINT_)/.test(type) || type === 'MISSION_TOKEN_DRAWN' && event.token === 'Time') return 'time';
  if (type === 'ENGAGEMENT_SPENT') return 'enemy';
  if (type === 'OPPORTUNITY_WINDOW_OPENED') return 'crew';
  if (/^OPPORTUNITY_/.test(type)) return 'resource';
  if (type === 'FIGHTER_DISRUPTED') return 'gunfire';
  if (type === 'ATTACK_DISRUPTED') return 'enemy';
  if (/^(CREW_INJURED|CREW_KILLED|CREW_ACTION_LOST|FIRE_STOPPED_BY_CREW)/.test(type)) return 'injury';
  if (/^(WORK_|MEDICAL_|CREW_HEALED|CREW_RETURNED|CREW_DISPLACED|AIRCRAFT_SQUARE_REPAIRED|FIRE_EXTINGUISHED|ENGINE_RESTART|ENGINE_REPAIR_READY|SECTION_RESTORED)/.test(type)) return 'repair';
  if (/^(AIRCRAFT_|FIRE_|SECTION_|ENGINE_DISABLED)/.test(type)) return 'damage';
  if (/^(ALTITUDE_|MISSION_ADVANCED|MISSION_ENDED|BOMBING_|ROUND_)/.test(type)) return 'altitude';
  if (/^(RESOURCE|MISSION_BAG|MISSION_TOKEN)/.test(type)) return event?.token === 'Enemy' ? 'enemy' : 'resource';
  if (/^(GUNNER_|COMBAT_|ADVANCED_FIRE|FIGHTER_DAMAGED|FIGHTER_DESTROYED)/.test(type)) return 'gunfire';
  if (/^(ENEMY_|FIGHTER_|FLAK_|ATTACK_EMPTY|ESCORT)/.test(type)) return 'enemy';
  return 'crew';
}

/** Stable, small UI contract; message remains the full raw rules explanation. */
export function describeEvent(event = {}) {
  event ??= {};
  const type = event.type ?? '';
  const continuous = continuousEvent(event);
  const category = eventCategory(event);
  const description = {
    category, icon: categoryIcons[category], title: friendly(type) || 'Ready for orders',
    detail: event.message ?? '', major: !compact.has(type), kind: 'text', tone: category,
  };
  if (type === 'ENEMY_PHASE_STARTED' && /no active fighters/i.test(event.message ?? '')) description.major = false;
  if (type === 'FIRE_PHASE_STARTED' && /^Fire phase: 0 unsuppressed/i.test(event.message ?? '') && !continuous) description.major = false;
  if (type === 'ALTITUDE_CHECK' && event.minimum === 0 && !continuous) description.major = false;
  if (type === 'ALTITUDE_MAINTAINED' && /without a roll/i.test(event.message ?? '')) description.major = false;
  if (type === 'MISSION_TOKEN_DRAWING' || type === 'COMBAT_TOKEN_DRAWING') {
    Object.assign(description, { kind: 'token', tokenBack: true, token: '', tone: 'neutral',
      title: type === 'MISSION_TOKEN_DRAWING' ? 'Draw a mission token' : 'Draw a combat token' });
  }
  if (type === 'MISSION_TOKEN_DRAWN' || type === 'GUNNER_SHOT_ROLL') {
    const value = upper(event.token);
    Object.assign(description, { kind: 'token', token: event.token, tokenBack: false,
      title: value === 'BURST' ? 'BURST ×2' : value,
      tone: value === 'ENEMY' ? 'enemy' : value === 'RESOURCE' ? 'resource' : value === 'TIME' ? 'time' : value === 'MISS' ? 'miss' : 'hit' });
  }
  if (type === 'ENEMY_ATTACK') description.title = `${event.source || event.message?.replace(/ attacks\.$/, '') || 'Enemy'} attacks`;
  if (type === 'ENEMY_ATTACK_ROLL') Object.assign(description, {
    kind: 'die', title: event.result === 'miss' ? 'MISS' : event.result === 'critical' ? 'CRITICAL HIT' : 'HIT',
    tone: event.result === 'miss' ? 'miss' : 'enemy', roll: event.roll,
  });
  if (type === 'ENEMY_HIT_LOCATION' || type === 'ENEMY_LOCATION_FOCUS') Object.assign(description, {
    kind: 'location', title: event.cellId ?? 'Hit location', tone: 'enemy',
    detail: type === 'ENEMY_LOCATION_FOCUS' ? `Following the shot to ${event.cellId}.` : description.detail,
  });
  if (type === 'ATTACK_EMPTY_SPACE') Object.assign(description, { title: 'EMPTY SPACE · NO DAMAGE', tone: 'miss' });
  if (type === 'AIRCRAFT_SQUARE_DAMAGED') description.title = `${event.cellId ?? ''} · DAMAGED`;
  if (type === 'FIRE_STARTED') description.title = `${event.cellId ?? ''} · FIRE`;
  if (type === 'CREW_KILLED') description.title = 'CREW LOST';
  if (type === 'GUNNER_FIRE_STARTED') description.title = event.message?.replace(/\.$/, '') || 'Gunner opens fire';
  if (type === 'ADVANCED_FIRE_RETRY') description.title = 'First miss · one free pull';
  if (type === 'FIGHTER_DISRUPTED') description.title = 'DISRUPTED · NEXT ATTACK CANCELLED';
  if (type === 'ATTACK_DISRUPTED') description.title = 'ATTACK DISRUPTED';
  if (type === 'OPPORTUNITY_GAINED') description.title = '+1 OPPORTUNITY';
  if (type === 'OPPORTUNITY_SPENT') description.title = 'OPPORTUNITY SHOT · ONE BASIC PULL';
  if (type === 'OPPORTUNITY_CAPPED') description.title = 'OPPORTUNITY AT CAP';
  if (type === 'ACTIVATION_COMPLETED') description.title = 'Crew action complete';
  if (type === 'TIME_GAINED') description.title = '+1 TIME';
  if (type === 'PROGRESS_PENDING') description.title = 'PROGRESS CHECKPOINT AFTER THIS TURN';
  if (type === 'PROGRESS_STARTED') description.title = 'Progress checkpoint';
  if (type === 'CHECKPOINT_JOBS_COMPLETED') description.title = 'Checkpoint · completed work checked';
  if (type === 'AIRCRAFT_CONDITION_CHECKED') description.title = 'Aircraft condition checked';
  if (type === 'PROGRESS_BAGS_REFILLED') description.title = event.normalRefill === false ? 'Time returned · discard refill OFF' : 'Bags refilled · Time reset';
  if (type === 'PROGRESS_COMPLETED') description.title = 'Progress complete · Time reset';
  if (type === 'CREW_CYCLE_REFRESHED') description.title = 'Crew readiness refreshed';
  if (type === 'TURN_COMPLETE') description.title = 'Turn complete';
  if (type === 'FIGHTER_DISENGAGED') description.title = 'Engagement ended · fighter disengages';
  if (type === 'FIGHTER_BREAKING_OFF') description.title = `${event.enemyType ?? eventFighter(event)?.type ?? 'Fighter'} BREAKS OFF`;
  if (type === 'ENGAGEMENT_SPENT' && continuous) {
    const remaining = event.engagementRemaining ?? eventFighter(event)?.engagementRemaining;
    description.major = remaining > 0;
    description.title = `${event.enemyType ?? eventFighter(event)?.type ?? 'Fighter'} · ${remaining ?? '?'} ENGAGEMENT REMAINING`;
  }
  if (type === 'WORK_TIME_ADVANCED') {
    const job = event.state?.jobs?.find(job => job.id === event.jobId);
    const kind = event.kind ?? job?.kind;
    const name = kind === 'fireControl' ? 'FIRE CONTROL' : upper(kind) || 'WORK';
    description.title = `${name} · ${event.remainingTime ?? job?.remainingTime ?? '?'} TIME REMAINING`;
  }
  if (type === 'FIRE_PHASE_STARTED' && continuous) description.title = 'Checkpoint · fire spread';
  if (type === 'OPPORTUNITY_WINDOW_OPENED') description.title = 'Opportunity window · fire or continue';
  if (type === 'FIGHTER_MOVED') description.title = 'Flyby · fighter repositions';
  if (type === 'FIGHTER_ROTATED') description.title = event.facing === 0 ? 'Fighter facing the B-17' : `Fighter ${event.facing ?? 90}° away`;
  if (type === 'ESCORT_INTERCEPT') description.title = 'ESCORT INTERCEPT';
  if (type === 'ALTITUDE_CHECK') {
    const target = event.minimum > 0 && event.minimum <= 6 ? ` · NEED ${event.minimum}+` : event.minimum === 7 ? ' · AUTOMATIC LOSS' : '';
    description.title = `${upper(event.cause)}${target}`;
  }
  if (type === 'ALTITUDE_ROLL') Object.assign(description, {
    kind: 'die', roll: event.roll, title: `${upper(event.cause)}${event.minimum ? ` · NEED ${event.minimum}+` : ''}`,
  });
  if (type === 'ALTITUDE_LOST') Object.assign(description, { title: 'ALTITUDE LOST', tone: 'damage' });
  if (type === 'ALTITUDE_MAINTAINED') description.title = `${upper(event.cause)} · ALTITUDE HELD`;
  if (type === 'FIRE_SPREAD_ROLL' || type === 'ENGINE_RESTART_ROLL' || type === 'BOMBING_ROLL') {
    Object.assign(description, { kind: 'die', roll: event.roll });
  }
  return description;
}

/** animationMs remains the user's scale; the 750 default now gives readable 1.5s beats. */
export function eventDelay(event, speed = 'normal', config = {}) {
  const description = describeEvent(event);
  if (speed === 'manual' || speed === 'step') return description.major ? Infinity : 0;
  if (speed === 'instant' || config.animationMs === 0 || !description.major) return 0;
  if (speed === 'fast') return 300;
  const base = (config.animationMs ?? 750) * 2;
  const factor = event?.type?.endsWith('_DRAWING') ? 0.7 : description.kind === 'token' || description.kind === 'die' ? 1.1 : 1;
  return Math.round(Math.max(500, base * factor));
}

const locationFocusBeat = (event, state) => ({
  type: 'ENEMY_LOCATION_FOCUS', message: `Focus on ${event.cellId}.`, cellId: event.cellId,
  fighterId: event.fighterId, presentationOnly: true, state,
});

/** Insert visual anticipation/focus beats using the last causal snapshot only.
 * previousEvent is supplied only when upgrading a legacy queue of raw events.
 */
export function expandPresentation(events, initialView, previousEvent = null) {
  const beats = [];
  let previous = initialView;
  let beforePrevious = initialView;
  // An older save can have presented the location but not its consequences yet.
  // That missing focus belongs before the remaining raw damage/empty-air event.
  if (previousEvent?.type === 'ENEMY_HIT_LOCATION' && events.length && events[0].type !== 'ENEMY_LOCATION_FOCUS') {
    beats.push(locationFocusBeat(previousEvent, initialView));
  }
  for (const [index, event] of events.entries()) {
    if (event.type === 'MISSION_TOKEN_DRAWN' || event.type === 'GUNNER_SHOT_ROLL') {
      const mission = event.type === 'MISSION_TOKEN_DRAWN';
      const refillType = mission ? 'MISSION_BAG_REFILLED' : 'COMBAT_BAG_REFILLED';
      // Emergency refill records historically carry a post-draw snapshot. Hold
      // the already-visible pre-refill bag until reveal so composition/discard
      // counts cannot identify a token while its face is still hidden. The raw
      // refill remains in the log; no rules, bag contents or RNG are changed.
      const drawView = events[index - 1]?.type === refillType ? beforePrevious : previous;
      beats.push({ type: mission ? 'MISSION_TOKEN_DRAWING' : 'COMBAT_TOKEN_DRAWING',
        message: mission ? 'Drawing from the mission bag…' : 'Pulling from the combat bag…',
        crewId: event.crewId, fighterId: event.fighterId, presentationOnly: true, state: drawView });
    }
    // Compatibility for saved events predating explicit altitude metadata.
    let enriched = event;
    if (event.type === 'ALTITUDE_CHECK' && event.minimum === undefined) {
      const next = events[index + 1];
      const minimum = next?.minimum ?? Number(next?.message?.match(/(\d)\+ maintains/)?.[1]);
      if (next?.type === 'ALTITUDE_MAINTAINED' && /without a roll/.test(next.message ?? '')) enriched = { ...event, minimum: 0 };
      else if (minimum) enriched = { ...event, minimum };
    }
    beats.push(enriched);
    beforePrevious = previous;
    previous = event.state ?? previous;
    if (event.type === 'ENEMY_HIT_LOCATION') beats.push(locationFocusBeat(event, previous));
  }
  return beats;
}

/** Long-lived visual context stays independent of queue timing and the raw rules. */
export function advanceVisual(previous = {}, event = {}, view) {
  const visual = { ...previous };
  const type = event.type;
  if (['CREW_ACTIVATED', 'UNAVAILABLE_CREW_SLOT', 'ROUND_STARTED', 'CREW_ACTION'].includes(type)) {
    Object.assign(visual, { token: null, activeFighterId: null, focusCell: null, attackerId: null, attackMissFighter: null, escortId: null });
  }
  if (type === 'MISSION_TOKEN_DRAWING' || type === 'COMBAT_TOKEN_DRAWING') {
    visual.token = { bag: type === 'MISSION_TOKEN_DRAWING' ? 'mission' : 'combat', label: '?', value: null, back: true, tone: 'neutral' };
  }
  if (type === 'MISSION_TOKEN_DRAWN' || type === 'GUNNER_SHOT_ROLL') {
    const descriptor = describeEvent(event);
    visual.token = { bag: type === 'MISSION_TOKEN_DRAWN' ? 'mission' : 'combat', label: descriptor.title, value: event.token, back: false, tone: descriptor.tone };
  }
  if (type === 'GUNNER_FIRE_STARTED' || type === 'OPPORTUNITY_SPENT') Object.assign(visual, {
    token: null, activeFighterId: event.fighterId, shooterId: event.crewId, focusCell: null,
    attackerId: null, attackMissFighter: null, locationCell: null,
  });
  if (type === 'ENEMY_ATTACK') Object.assign(visual, {
    token: null, activeFighterId: event.fighterId ?? null, attackerId: event.fighterId ?? null,
    attackMissFighter: null, attackResult: null, emptyMissCell: null, focusCell: null, locationCell: null,
    shooterId: null, escortId: null,
  });
  if (type === 'ENEMY_ATTACK_ROLL') {
    visual.attackResult = event.result;
    visual.attackMissFighter = event.result === 'miss' ? event.fighterId ?? null : null;
    if (event.result === 'miss') Object.assign(visual, { focusCell: null, locationCell: null });
  }
  if (type === 'ATTACK_DISRUPTED') Object.assign(visual, {
    token:null, activeFighterId:event.fighterId, attackerId:event.fighterId,
    attackMissFighter:null, attackResult:'disrupted', focusCell:null, locationCell:null, escortId:null,
  });
  if (type === 'FIGHTER_BREAKING_OFF') Object.assign(visual, {
    departingFighter: event.fighterId, activeFighterId: event.fighterId,
    token: null, shooterId: null, attackerId: null, attackMissFighter: null,
    attackResult: null, focusCell: null, locationCell: null, emptyMissCell: null, escortId: null,
  });
  if (type === 'FIGHTER_DISENGAGED') visual.departingFighter = null;
  if (type === 'WORK_TIME_ADVANCED') visual.jobCountdown = { jobId: event.jobId, remainingTime: event.remainingTime ?? view?.jobs?.find(job => job.id === event.jobId)?.remainingTime };
  if (type === 'CREW_ACTION_READY' || type === 'PROGRESS_STARTED') visual.jobCountdown = null;
  if (type === 'PROGRESS_STARTED') Object.assign(visual, {
    token: null, activeFighterId: null, shooterId: null, attackerId: null, attackMissFighter: null,
    attackResult: null, focusCell: null, locationCell: null, emptyMissCell: null, escortId: null, departingFighter: null,
  });
  if (type === 'ENEMY_HIT_LOCATION') { visual.locationCell = event.cellId; visual.focusCell = null; }
  if (type === 'ENEMY_LOCATION_FOCUS') visual.focusCell = event.cellId;
  if (type === 'ATTACK_EMPTY_SPACE') visual.emptyMissCell = event.cellId;
  if (['FIGHTER_MOVED', 'FIGHTER_ROTATED', 'FIGHTER_SPAWNED', 'ESCORT_INTERCEPT'].includes(type)) visual.activeFighterId = event.fighterId ?? null;
  if (type === 'ESCORT_INTERCEPT') visual.escortId = event.escortId;
  if (type === 'ESCORTS_EXPIRED') visual.escortId = null;
  if (type === 'FIGHTERS_CLEARED' || type === 'FIGHTER_DISENGAGED') Object.assign(visual, { activeFighterId: null, attackerId: null, attackMissFighter: null });
  if (type === 'ALTITUDE_CHECK') Object.assign(visual, { token: null, altitudeCause: event.cause, altitudeMinimum: event.minimum, altitudeRoll: null });
  if (type === 'ALTITUDE_ROLL') visual.altitudeRoll = event.roll;
  if (type === 'ALTITUDE_LOST') visual.altitude = view?.altitude;
  return visual;
}

const groupStarts = new Set(['ROUND_STARTED', 'CREW_ACTIVATED', 'UNAVAILABLE_CREW_SLOT', 'CREW_ACTION', 'OPPORTUNITY_SPENT', 'GUNNER_FIRE_STARTED', 'ENEMY_ATTACK', 'ATTACK_DISRUPTED', 'FLAK_STARTED', 'ROUND_END_STARTED', 'ALTITUDE_CHECK', 'MISSION_ADVANCED', 'BOMBING_ROLL', 'WORK_COMPLETING', 'PROGRESS_STARTED', 'CHECKPOINT_JOBS_COMPLETED', 'AIRCRAFT_CONDITION_CHECKED', 'PROGRESS_BAGS_REFILLED', 'WORK_TIME_ADVANCED', 'ENGAGEMENT_SPENT', 'FIGHTER_BREAKING_OFF']);

/** Each compact recorder entry expands to the original semantic event objects. */
export function groupEvents(log = []) {
  const groups = [];
  for (const event of log) {
    if (event.presentationOnly) continue;
    if (!groups.length || groupStarts.has(event.type) || groups.at(-1).round !== event.round) {
      const descriptor = describeEvent(event);
      groups.push({ id: `event-${event.sequence ?? groups.length + 1}`, title: descriptor.title,
        category: descriptor.category, icon: descriptor.icon, round: event.round, events: [] });
    }
    groups.at(-1).events.push(event);
  }
  for (const group of groups) {
    const first = group.events[0];
    const result = group.events.find(event => event.type === 'MISSION_TOKEN_DRAWN' || event.type === 'ENEMY_ATTACK_ROLL');
    const location = group.events.find(event => event.type === 'ENEMY_HIT_LOCATION');
    const consequences = group.events.filter(event => ['CREW_INJURED', 'CREW_KILLED', 'ENGINE_DISABLED', 'FIGHTER_DESTROYED', 'ALTITUDE_LOST'].includes(event.type));
    const pulls = group.events.filter(event => event.type === 'GUNNER_SHOT_ROLL');
    const pullsSummary = pulls.slice(0, 3).map(event => upper(event.token)).join(' → ') + (pulls.length > 3 ? ` (+${pulls.length - 3} pulls)` : '');
    const effects = [
      ['AIRCRAFT_SQUARE_DAMAGED', 'damage'], ['FIRE_STARTED', 'fire'], ['ATTACK_EMPTY_SPACE', 'empty space'],
      ['AIRCRAFT_SQUARE_REPAIRED', 'repaired'], ['FIRE_EXTINGUISHED', 'extinguished'],
    ].flatMap(([type, label]) => {
      const count = group.events.filter(event => event.type === type).length;
      return count ? [`${count > 1 ? `${count} squares ` : ''}${label}`] : [];
    });
    const detail = [result ? describeEvent(result).title : '', pullsSummary, location?.cellId ?? '', ...effects, ...consequences.map(event => describeEvent(event).title)].filter(Boolean).join(' · ');
    group.title = `${first.message?.split(/\. /)[0]?.replace(/\.$/, '') || group.title}${detail ? ` — ${detail}` : ''}`;
    group.summary = detail || group.events.at(-1).message || '';
  }
  return groups;
}
