import { normalizeConfig, ENEMY_DEFS } from './config.mjs';
import { BOARD, BOARD_VERSION, CREW_DEFS, ENGINE_CELLS, STATIONS } from './board.mjs';
import { seedToInt } from './random.mjs';

const copies = (count, value) => Array.from({ length: count }, () => value);
export function createGame(overrides = {}, seed = 'MILK-RUN') {
  const config = normalizeConfig(overrides);
  return {
    version: 1, rulesVersion: 3, boardVersion: BOARD_VERSION, config, seed: String(seed), rng: seedToInt(seed),
    round: 0, slot: 0, altitude: config.startingAltitude,
    mission: { position: 0, bombed: false, bombingResult: null },
    resources: { Officer: config.startingOfficer, Enlisted: config.startingEnlisted },
    opportunity: config.opportunityEnabled ? Math.min(config.startingOpportunity, config.opportunityCap) : 0,
    crew: CREW_DEFS.map((member) => ({
      id: member.id, health: 'healthy', used: false, activationCompleted: false,
      position: [...STATIONS[member.station].cells], station: member.station, job: null,
    })),
    fighters: [],
    cells: Object.fromEntries(BOARD.filter((cell) => cell.structure).map((cell) => [cell.id, 'healthy'])),
    engines: Object.keys(ENGINE_CELLS).map((id) => ({ id, running: true })),
    compromised: [], jobs: [], escorts: [],
    bags: {
      mission: { tokens: [...copies(config.missionEnemy, 'Enemy'), ...copies(config.missionResource, 'Resource')], discard: [] },
      combat: { tokens: [...copies(config.combatHit, 'Hit'), ...copies(config.combatBurst, 'Burst'), ...copies(config.combatMiss, 'Miss')], discard: [] },
    },
    deck: {
      cards: [...Object.entries(ENEMY_DEFS).flatMap(([type, definition]) => copies(config[definition.countKey], type)), ...copies(config.flakCards, 'Flak')],
      discard: [],
    },
    phase: 'ready', activeCrew: null,
    stats: {
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
