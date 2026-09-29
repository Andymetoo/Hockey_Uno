// Explicit historical settings for baseline-home-witness.json. This is test data,
// not a legacy game engine, and must not follow new DEFAULT_CONFIG values.
import { createGame } from '../../state.mjs';

export const LEGACY_WITNESS_CONFIG = Object.freeze({
  startingOfficer: 3, startingEnlisted: 5,
  missionEnemy: 15, missionResource: 20, combatHit: 20, combatMiss: 13,
  bf109Cards: 10, bf110Cards: 6, fw190Cards: 5, me262Cards: 3, flakCards: 4,
  maxFighters: 3, flakShots: 2, spawnFacing: 0, clearFighters: true, unavailableDraws: true,
  fireCap: 4, repairCap: 3, engineerBonus: 1, eightWayWork: false,
  extinguishLeavesDamage: true, crewBlocksFirstFire: true,
  medicalDuration: 1, repairDuration: 1, fireDuration: 1,
  repairCost: 1, fireCost: 1, medicalCost: 1, escortCost: 1, orderShotCost: 1,
  conversionRate: 2, restartMax: 4,
  startingAltitude: 5, controlOfficerMin: 3, controlEnlistedMin: 5,
  structureSafe: 1, structureMid: 3, structureFatal: 6, structureMidMin: 3, structureHighMin: 5,
  enginesSafe: 1, enginesMid: 2, enginesAuto: 4, enginesMidMin: 3, enginesHighMin: 5,
  outboundLength: 6, returnLength: 4, bombingMin: 3, animationMs: 750,
});

export function legacyWitnessState(seed) {
  const state = createGame({ ...LEGACY_WITNESS_CONFIG, combatBurst: 0, disruptOnHit: false,
    opportunityEnabled: false, startingOpportunity: 0 }, seed);
  state.config = { ...LEGACY_WITNESS_CONFIG };
  delete state.rulesVersion;
  delete state.opportunity;
  return state;
}
