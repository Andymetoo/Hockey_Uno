import { normalizeConfig, ENEMY_DEFS } from './config.mjs';
import { BOARD, BOARD_VERSION, CREW_DEFS, ENGINE_CELLS, STATIONS } from './board.mjs';
import { seedToInt, freshSortieSeed } from './random.mjs';
import { RULESETS, V2_CONFIG_VERSION } from './rulesets.mjs';
import { createV2Telemetry } from './telemetry.mjs';
import { CREW_POSITION_VERSION } from './crew-position.mjs';
import { createStory } from './story.mjs';

const copies = (count, value) => Array.from({ length: count }, () => value);
export function createGame(overrides = {}, seed, ruleset = overrides.preferredRuleset ?? 'v1') {
  seed ??= ruleset === 'v2-continuous' ? freshSortieSeed() : 'MILK-RUN';
  if (!RULESETS.includes(ruleset)) throw new RangeError(`Unknown sortie ruleset: ${ruleset}`);
  const config = normalizeConfig(overrides);
  const continuous = ruleset === 'v2-continuous';
  if (continuous && config.v2MissionTime < config.v2TimePerProgress + config.v2NavigatorUnmannedTimePenalty) {
    throw new RangeError('V2 needs at least as many mission Time tokens as Time Required Per Progress, including the Navigator Unmanned Time Penalty.');
  }
  return {
    version: 1, rulesVersion: continuous ? 4 : 3, ruleset, boardVersion: BOARD_VERSION, crewPositionVersion: CREW_POSITION_VERSION, config, seed: String(seed), rng: seedToInt(seed),
    round: 0, slot: 0, altitude: config.startingAltitude,
    ...(continuous ? { v2ConfigVersion: V2_CONFIG_VERSION, crewCycle: { number: 1, turn: 0 }, time: 0, timeTokens: [], overflowTimeTokens: [], pendingProgress: false, telemetry: createV2Telemetry() } : {}),
    ...(continuous && config.v2StoryMode ? { story: createStory(seed) } : {}),
    mission: { position: 0, bombed: false, bombingResult: null },
    resources: { Officer: config.startingOfficer, Enlisted: config.startingEnlisted },
    opportunity: config.opportunityEnabled ? Math.min(config.startingOpportunity, config.opportunityCap) : 0,
    crew: CREW_DEFS.map((member) => ({
      id: member.id, health: 'healthy', used: false, activationCompleted: false, lastAction: null,
      ...(continuous ? { cycleSlotConsumed: false } : {}),
      position: [...STATIONS[member.station].cells], station: member.station, homeStation: member.station, displaced: false, job: null,
    })),
    fighters: [],
    cells: Object.fromEntries(BOARD.filter((cell) => cell.structure).map((cell) => [cell.id, 'healthy'])),
    engines: Object.keys(ENGINE_CELLS).map((id) => ({ id, running: true })),
    compromised: [], jobs: [], escorts: [],
    bags: {
      mission: { tokens: continuous
        ? [...copies(config.v2MissionEnemy, 'Enemy'), ...copies(config.v2MissionResource, 'Resource'), ...copies(config.v2MissionTime, 'Time')]
        : [...copies(config.missionEnemy, 'Enemy'), ...copies(config.missionResource, 'Resource')], discard: [] },
      combat: { tokens: [...copies(config.combatHit, 'Hit'), ...copies(config.combatBurst, 'Burst'), ...copies(config.combatMiss, 'Miss')], discard: [] },
    },
    deck: {
      cards: [...Object.entries(ENEMY_DEFS).flatMap(([type, definition]) => copies(config[definition.countKey], type)), ...copies(config.flakCards, 'Flak')],
      discard: [],
    },
    phase: continuous ? 'select' : 'ready', activeCrew: null,
    stats: {
      ...(continuous ? { turns: 0 } : {}),
      rounds: 0, missionDraws: 0, fightersSpawned: 0, fightersKilled: 0,
      flakAttacks: 0, enemyAttacks: 0, enemyHits: 0, enemyCrits: 0,
      aircraftHits: 0, firesStarted: 0, repairs: 0,
      enginesDisabled: 0, enginesRestarted: 0, compromisedSections: 0,
      altitudeLostByCause: { control: 0, structure: 0, engines: 0 },
      crewInjured: 0, crewKilled: 0,
      OfficerGained: 0, OfficerSpent: 0, EnlistedGained: 0, EnlistedSpent: 0,
      opportunityGained: 0, opportunitySpent: 0,
    },
    startedAt: Date.now(), endedAt: null, outcome: null, nextId: 1,
  };
}
