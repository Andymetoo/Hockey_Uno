/** V1 rules and separate V2 playtest values. V2 values are provisional. */
export const DEFAULT_CONFIG = Object.freeze({
  preferredRuleset: 'v1',
  startingOfficer: 3, startingEnlisted: 5,
  missionEnemy: 15, missionResource: 20, combatHit: 16, combatBurst: 4, combatMiss: 13,
  bf109Cards: 10, bf110Cards: 6, fw190Cards: 5, me262Cards: 3, flakCards: 4,
  bf109Hp: 2, bf110Hp: 2, fw190Hp: 3, me262Hp: 4,
  maxFighters: 3, flakShots: 2, spawnFacing: 0, clearFighters: true, unavailableDraws: true,
  fireCap: 4, repairCap: 3, engineerBonus: 1, eightWayWork: false,
  extinguishLeavesDamage: true, crewBlocksFirstFire: true,
  medicalDuration: 2, repairDuration: 2, fireDuration: 2,
  repairCost: 1, fireCost: 1, medicalCost: 1, escortCost: 1, directFireCost: 1,
  disruptOnHit: true, opportunityEnabled: true, startingOpportunity: 1, opportunityCap: 3, opportunityOnKill: true,
  conversionRate: 2, restartMax: 4,
  startingAltitude: 5, controlOfficerMin: 3, controlEnlistedMin: 5,
  structureSafe: 1, structureMid: 3, structureFatal: 6, structureMidMin: 3, structureHighMin: 5,
  enginesSafe: 1, enginesMid: 2, enginesAuto: 4, enginesMidMin: 3, enginesHighMin: 5,
  outboundLength: 14, returnLength: 5, bombingMin: 3, animationMs: 750, presentationSpeed: 'normal',
  v2CrewCycleTurns: 10,
  v2MissionEnemy: 20, v2MissionResource: 12, v2MissionTime: 10,
  v2TimePerProgress: 4, v2OutboundLength: 8, v2ReturnLength: 3,
  v2NavigatorUnmannedTimePenalty: 0, v2CrewCycleRefreshGrantsTime: false, v2UnavailableCrewPressure: 'full',
  v2RepairTime: 4, v2FireTime: 4, v2MedicalTime: 4,
  v2AssistedRepairTime: 2, v2AssistedFireTime: 2, v2AssistedMedicalTime: 2,
  v2FighterKillGrantsTime: true, v2DisruptEnabled: true, v2DisruptEffect: 'accuracy-penalty', v2MaxEscorts: 1,
  v2OpportunityProvokesEnemyPhase: false,
  v2Bf109Engagement: 5, v2Bf110Engagement: 5, v2Fw190Engagement: 5, v2Me262Engagement: 5,
  v2EngagementMode: 'any-action', v2RefillAtProgress: true,
});

const V1_FIELDS = new Set(['missionEnemy', 'missionResource', 'clearFighters', 'medicalDuration', 'repairDuration', 'fireDuration', 'outboundLength', 'returnLength']);
export function configScope(key) {
  return key === 'preferredRuleset' ? 'preferences' : key.startsWith('v2') ? 'v2' : V1_FIELDS.has(key) ? 'v1' : 'common';
}

const number = (key, label, group, min = 0, max = 40, step = 1) => ({ key, label, group, type: 'number', min, max, step });
const boolean = (key, label, group) => ({ key, label, group, type: 'boolean' });
export const CONFIG_FIELDS = [
  { key: 'preferredRuleset', label: 'Preferred ruleset for new sorties', group: 'New sortie', type: 'select', options: [
    { value: 'v1', label: 'V1 — Round-Based' }, { value: 'v2-continuous', label: 'V2 — Continuous Time — EXPERIMENTAL' },
  ] },
  { ...number('v2CrewCycleTurns', 'V2 Crew Cycle Turns (fixed at 10)', 'V2 — Continuous Time (Experimental)', 10, 10), fixedReason: 'Fixed at 10: each of the ten crew must account for one Turn before readiness refreshes.' },
  number('v2MissionEnemy', 'V2 Mission Enemy tokens', 'V2 — Continuous Time (Experimental)', 0, 100),
  number('v2MissionResource', 'V2 Mission Resource tokens', 'V2 — Continuous Time (Experimental)', 0, 100),
  number('v2MissionTime', 'V2 Mission Time tokens', 'V2 — Continuous Time (Experimental)', 1, 100),
  number('v2TimePerProgress', 'V2 Time Required Per Progress', 'V2 — Continuous Time (Experimental)', 1, 40),
  number('v2NavigatorUnmannedTimePenalty', 'Navigator Unmanned Time Penalty', 'V2 — Continuous Time (Experimental)', 0, 40),
  boolean('v2CrewCycleRefreshGrantsTime', 'Crew Cycle Refresh Grants Time', 'V2 — Continuous Time (Experimental)'),
  { key: 'v2UnavailableCrewPressure', label: 'Unavailable Crew Pressure', group: 'V2 — Continuous Time (Experimental)', type: 'select', options: [
    { value: 'full', label: 'Full Pressure (default)' }, { value: 'draw-only', label: 'Draw Only' }, { value: 'compressed', label: 'Compressed Pressure' },
  ] },
  boolean('v2RefillAtProgress', 'Refill mission and combat discards at Progress', 'V2 — Continuous Time (Experimental)'),
  number('v2OutboundLength', 'V2 Outbound Progress', 'V2 — Continuous Time (Experimental)', 1, 40),
  number('v2ReturnLength', 'V2 Return Progress', 'V2 — Continuous Time (Experimental)', 1, 40),
  number('v2RepairTime', 'V2 Repair Time', 'V2 — Crisis work (Experimental)', 1, 40),
  number('v2FireTime', 'V2 Fire Control Time', 'V2 — Crisis work (Experimental)', 1, 40),
  number('v2MedicalTime', 'V2 Medical Time', 'V2 — Crisis work (Experimental)', 1, 40),
  number('v2AssistedRepairTime', 'V2 Assisted Repair Time', 'V2 — Crisis work (Experimental)', 1, 40),
  number('v2AssistedFireTime', 'V2 Assisted Fire Control Time', 'V2 — Crisis work (Experimental)', 1, 40),
  number('v2AssistedMedicalTime', 'V2 Assisted Medical Time', 'V2 — Crisis work (Experimental)', 1, 40),
  boolean('v2FighterKillGrantsTime', 'Fighter Kill Grants Time', 'V2 — Combat & escort (Experimental)'),
  boolean('v2OpportunityProvokesEnemyPhase', 'Opportunity Provokes Enemy Phase', 'V2 — Combat & escort (Experimental)'),
  boolean('v2DisruptEnabled', 'Disrupt Enabled', 'V2 — Combat & escort (Experimental)'),
  { key: 'v2DisruptEffect', label: 'Disrupt Effect', group: 'V2 — Combat & escort (Experimental)', type: 'select', options: [
    { value: 'auto-miss', label: 'Auto Miss' }, { value: 'accuracy-penalty', label: '4+ to Hit' },
  ] },
  number('v2MaxEscorts', 'Maximum simultaneous Escorts', 'V2 — Combat & escort (Experimental)', 0, 10),
  number('v2Bf109Engagement', 'V2 BF-109 Engagement', 'V2 — Fighter Engagement (Experimental)', 1, 40),
  number('v2Bf110Engagement', 'V2 BF-110 Engagement', 'V2 — Fighter Engagement (Experimental)', 1, 40),
  number('v2Fw190Engagement', 'V2 FW-190 Engagement', 'V2 — Fighter Engagement (Experimental)', 1, 40),
  number('v2Me262Engagement', 'V2 Me-262 Engagement', 'V2 — Fighter Engagement (Experimental)', 1, 40),
  { key: 'v2EngagementMode', label: 'V2 Engagement Countdown Mode', group: 'V2 — Fighter Engagement (Experimental)', type: 'select', options: [
    { value: 'any-action', label: 'Any Enemy Action (default)' }, { value: 'attack-pass-only', label: 'Attack Pass Only (experimental)' },
  ] },
  number('startingOfficer', 'Starting Officer resources', 'Bags & resources'),
  number('startingEnlisted', 'Starting Enlisted resources', 'Bags & resources'),
  number('missionEnemy', 'Mission Enemy tokens', 'Bags & resources', 0, 100),
  number('missionResource', 'Mission Resource tokens', 'Bags & resources', 0, 100),
  number('combatHit', 'Combat Hit tokens', 'Bags & resources', 0, 100),
  number('combatBurst', 'Combat Burst ×2 tokens', 'Bags & resources', 0, 100),
  number('combatMiss', 'Combat Miss tokens', 'Bags & resources', 0, 100),
  boolean('disruptOnHit', 'Disrupt on damaging hit', 'Combat & Opportunity'),
  boolean('opportunityEnabled', 'Enable Opportunity shots', 'Combat & Opportunity'),
  number('startingOpportunity', 'Starting Opportunity', 'Combat & Opportunity', 0, 20),
  number('opportunityCap', 'Opportunity cap', 'Combat & Opportunity', 0, 20),
  boolean('opportunityOnKill', 'Fighter kills grant 1 Opportunity', 'Combat & Opportunity'),
  number('bf109Cards', 'BF-109 cards', 'Enemy deck'),
  number('bf110Cards', 'BF-110 cards', 'Enemy deck'),
  number('fw190Cards', 'FW-190 cards', 'Enemy deck'),
  number('me262Cards', 'Me-262 cards', 'Enemy deck'),
  number('flakCards', 'Flak cards (provisional)', 'Enemy deck'),
  number('bf109Hp', 'BF-109 hit points', 'Enemy pressure', 1, 20),
  number('bf110Hp', 'BF-110 hit points', 'Enemy pressure', 1, 20),
  number('fw190Hp', 'FW-190 hit points', 'Enemy pressure', 1, 20),
  number('me262Hp', 'Me-262 hit points', 'Enemy pressure', 1, 20),
  number('maxFighters', 'Active fighter cap', 'Enemy pressure', 1, 3),
  number('flakShots', 'Shots per Flak event', 'Enemy pressure', 1, 8),
  { key: 'spawnFacing', label: 'Fighter spawn facing', group: 'Enemy pressure', type: 'select', options: [{ value: 0, label: 'Toward B-17' }, { value: 90, label: '90° off-angle' }] },
  boolean('clearFighters', 'Clear fighters at round end', 'Enemy pressure'),
  boolean('unavailableDraws', 'Unavailable crew still make mission draws', 'Enemy pressure'),
  number('fireCap', 'Fire Control square cap', 'Crisis work', 1, 12),
  number('repairCap', 'Repair square cap', 'Crisis work', 1, 12),
  number('engineerBonus', 'Engineer additional repair squares', 'Crisis work', 0, 6),
  boolean('eightWayWork', 'Allow diagonal work connections', 'Crisis work'),
  boolean('extinguishLeavesDamage', 'Extinguished fire leaves Damage', 'Crisis work'),
  boolean('crewBlocksFirstFire', 'Healthy crew stop first fire spread', 'Crisis work'),
  number('medicalDuration', 'Medical duration (round starts)', 'Crisis work', 0, 4),
  number('repairDuration', 'Repair duration (round starts)', 'Crisis work', 0, 4),
  number('fireDuration', 'Fire Control duration (round starts)', 'Crisis work', 0, 4),
  number('repairCost', 'Repair resource cost', 'Action costs', 0, 5),
  number('fireCost', 'Fire Control resource cost', 'Action costs', 0, 5),
  number('medicalCost', 'Medical resource cost', 'Action costs', 0, 5),
  number('escortCost', 'Escort Enlisted resource cost', 'Action costs', 0, 5),
  number('directFireCost', 'Pilot Direct Fire Officer cost', 'Action costs', 0, 5),
  number('conversionRate', 'Copilot exchange: Enlisted per 1 Officer (both directions)', 'Action costs', 1, 5),
  number('restartMax', 'Engine restart succeeds on d6 ≤', 'Altitude & engines', 1, 6),
  number('startingAltitude', 'Starting altitude (0 = ground)', 'Altitude & engines', 1, 12),
  number('controlOfficerMin', 'Officer control succeeds on d6 ≥', 'Altitude & engines', 1, 6),
  number('controlEnlistedMin', 'Enlisted control succeeds on d6 ≥', 'Altitude & engines', 1, 6),
  number('structureSafe', 'Structure: safe up to compromised sections', 'Altitude & engines', 0, 7),
  number('structureMid', 'Structure: middle tier up to sections', 'Altitude & engines', 1, 7),
  number('structureFatal', 'Structure: destruction at sections', 'Altitude & engines', 1, 8),
  number('structureMidMin', 'Structure middle tier: d6 ≥', 'Altitude & engines', 1, 6),
  number('structureHighMin', 'Structure high tier: d6 ≥', 'Altitude & engines', 1, 6),
  number('enginesSafe', 'Engines: safe up to stopped engines', 'Altitude & engines', 0, 3),
  number('enginesMid', 'Engines: middle tier up to stopped', 'Altitude & engines', 1, 3),
  number('enginesAuto', 'Engines: automatic loss at stopped', 'Altitude & engines', 1, 4),
  number('enginesMidMin', 'Engines middle tier: d6 ≥', 'Altitude & engines', 1, 6),
  number('enginesHighMin', 'Engines high tier: d6 ≥', 'Altitude & engines', 1, 6),
  number('outboundLength', 'Rounds to target', 'Mission & presentation', 1, 20),
  number('returnLength', 'Rounds from target to HOME', 'Mission & presentation', 1, 20),
  number('bombingMin', 'Provisional bombing success: d6 ≥', 'Mission & presentation', 1, 6),
  number('animationMs', 'Event delay ms (0 = instant)', 'Mission & presentation', 0, 3000, 50),
  { key: 'presentationSpeed', label: 'Presentation speed', group: 'Mission & presentation', type: 'select', options: [
    { value: 'manual', label: 'Step / Manual' }, { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Fast' }, { value: 'instant', label: 'Instant' },
  ] },
].map(field => ({ ...field, scope: configScope(field.key) }));

/** Ignore unknown keys, coerce form input, and prevent impossible empty token systems. */
export function normalizeConfig(overrides = {}) {
  overrides = { ...overrides, ...(overrides.directFireCost === undefined && overrides.orderShotCost !== undefined ? { directFireCost: overrides.orderShotCost } : {}) };
  const config = { ...DEFAULT_CONFIG };
  for (const field of CONFIG_FIELDS) {
    const value = overrides[field.key];
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'boolean') config[field.key] = value === true || value === 'true';
    else if (field.type === 'select') {
      const option = field.options.find((item) => String(item.value) === String(value));
      if (option) config[field.key] = option.value;
    } else if (Number.isFinite(Number(value))) {
      config[field.key] = Math.min(field.max, Math.max(field.min, Math.round(Number(value))));
    }
  }
  if (config.missionEnemy + config.missionResource === 0) config.missionResource = 1;
  if (config.combatHit + config.combatBurst + config.combatMiss === 0) throw new RangeError('The combat bag needs at least one Hit, Burst, or Miss token.');
  if (config.bf109Cards + config.bf110Cards + config.fw190Cards + config.me262Cards + config.flakCards === 0) config.flakCards = 1;
  config.structureMid = Math.max(config.structureSafe, config.structureMid);
  config.structureFatal = Math.max(config.structureMid + 1, config.structureFatal);
  config.enginesMid = Math.max(config.enginesSafe, config.enginesMid);
  config.enginesAuto = Math.max(config.enginesMid + 1, config.enginesAuto);
  return config;
}

/** Scope badges describe actual rule changes, optionally for only one sortie. */
export function modifiedConfigScopes(config, activeRuleset) {
  const relevant = activeRuleset === 'v1' ? ['common', 'v1'] : activeRuleset === 'v2-continuous' ? ['common', 'v2'] : ['common', 'v1', 'v2', 'preferences'];
  try {
    const normalized = normalizeConfig(config);
    return relevant.filter(scope => Object.keys(DEFAULT_CONFIG).some(key => configScope(key) === scope && normalized[key] !== DEFAULT_CONFIG[key]));
  } catch { return relevant; }
}

export const ENEMY_DEFS = Object.freeze({
  'BF-109': { name: 'BF-109', hp: 2, hpKey: 'bf109Hp', countKey: 'bf109Cards', abilities: [] },
  'BF-110': { name: 'BF-110', hp: 2, hpKey: 'bf110Hp', countKey: 'bf110Cards', abilities: [] },
  'FW-190': { name: 'FW-190', hp: 3, hpKey: 'fw190Hp', countKey: 'fw190Cards', abilities: [] },
  'Me-262': { name: 'Me-262', hp: 4, hpKey: 'me262Hp', countKey: 'me262Cards', abilities: [] },
});

export const RESOURCE_BY_RANK = Object.freeze({ Officer: 'Officer', Enlisted: 'Enlisted' });
