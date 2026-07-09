import type {
  Aircraft,
  Aircrew,
  AlertLevel,
  AvailabilityReport,
  CampaignTab,
  CrewFatigue,
  CrewMorale,
  CrewStatus,
  DirectiveRelevance,
  GroundCrew,
  HiddenEffect,
  IntelConfidence,
  Mission,
  MissionEvent,
  MissionStage,
  PlanningState,
  ReconMission,
  ReconStatus,
  ReconType,
  RepairJob,
  RepairTier,
  RouteRisk,
  SaveState,
  Target,
  TargetType
} from "./types";

export const SAVE_KEY = "bomber-command-save-v1";
export const SAVE_VERSION = 1;

const SHORT_MISSION_MS = 5 * 60 * 1000;
const MAJOR_MISSION_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FATIGUE_RECOVERY_MS = 6 * 60 * 1000;

const AIRCRAFT_NAMES = [
  "Lucky Lady",
  "Morning Glory",
  "Sunday Punch",
  "Old Sinner",
  "Mary Alice",
  "Hell's Belle"
];

const PILOT_NAMES = [
  "Lt. George Maddox",
  "Lt. Peter Collins",
  "Lt. Frank Dwyer",
  "Lt. Owen Reese",
  "Lt. Daniel Mercer",
  "Lt. Harold Boone"
];

const GROUND_CREW_NAMES = ["M/Sgt. Walter Finch", "T/Sgt. Louis Harper"];

const TARGET_DEFS: Array<{
  name: string;
  type: TargetType;
  region: string;
  relevance: DirectiveRelevance;
  defense: number;
  weatherRisk: number;
  suspectedEffects: string;
  assessedCondition: string;
  weatherOutlook: string;
}> = [
  {
    name: "Bremen Fighter Assembly Plant",
    type: "factory",
    region: "Bremen sector",
    relevance: "high",
    defense: 74,
    weatherRisk: 42,
    suspectedEffects: "Staff believes useful disruption here could ease pressure on future bomber streams.",
    assessedCondition: "Believed operational, though recent strain on workshops has been reported.",
    weatherOutlook: "Cloud banks are expected inland. Aim-point visibility is uncertain."
  },
  {
    name: "Jever Fighter Airfield",
    type: "airfield",
    region: "Frisian coast",
    relevance: "high",
    defense: 58,
    weatherRisk: 30,
    suspectedEffects: "Operations suspects this field helps stage interceptor sorties on short notice.",
    assessedCondition: "Runways believed usable. Dispersal areas may be crowded.",
    weatherOutlook: "Low haze near the coast; takeoff and recovery routes appear fair."
  },
  {
    name: "Oldenburg Rail Junction",
    type: "rail",
    region: "Oldenburg",
    relevance: "medium",
    defense: 48,
    weatherRisk: 35,
    suspectedEffects: "Rail disruption might slow repairs and movement of fighter parts.",
    assessedCondition: "Traffic is reported steady. Exact yard congestion is uncertain.",
    weatherOutlook: "Broken cloud with intermittent clear patches."
  },
  {
    name: "Coastal Radar Station",
    type: "radar",
    region: "German Bight",
    relevance: "medium",
    defense: 44,
    weatherRisk: 22,
    suspectedEffects: "Intelligence suspects this site aids warning and vectoring, though the effect is hard to measure.",
    assessedCondition: "Masts believed intact. Operational effect of previous harassment is unknown.",
    weatherOutlook: "Visibility appears better than inland targets, though sea haze may drift in."
  },
  {
    name: "Bremen Approach Defenses",
    type: "defense",
    region: "Approach belt",
    relevance: "low",
    defense: 66,
    weatherRisk: 28,
    suspectedEffects: "Suppression here could help later strikes, but confirmation is usually poor.",
    assessedCondition: "Battery positions are believed active. Recent siting reports are fragmentary.",
    weatherOutlook: "Scattered cloud with likely flak markers visible through breaks."
  }
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function chance(value: number): boolean {
  return Math.random() < value;
}

function qualitativeBand(value: number, thresholds: [number, string][], fallback: string): string {
  for (const [threshold, text] of thresholds) {
    if (value >= threshold) {
      return text;
    }
  }
  return fallback;
}

function nextId(state: SaveState, prefix: string): string {
  const id = `${prefix}-${state.nextId}`;
  state.nextId += 1;
  return id;
}

function addLog(state: SaveState, id: string, at: number, category: string, text: string): void {
  if (state.campaign.logEntries.some((entry) => entry.id === id)) {
    return;
  }

  state.campaign.logEntries.unshift({ id, at, category, text });
}

export function getEffectiveNow(state: SaveState): number {
  return Date.now() + state.debug.clockOffsetMs;
}

export function formatTimestamp(state: SaveState, timestamp: number): string {
  const display = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `Day ${state.campaign.currentDay}, ${display}`;
}

function conditionSummary(hiddenCondition: number, status: Aircraft["status"]): string {
  if (status === "lost") {
    return "No return has been confirmed.";
  }
  if (status === "under_repair") {
    return "Maintenance has the aircraft open and unavailable for tasking.";
  }
  if (status === "diverted") {
    return "Reported down at another field and not ready for immediate use.";
  }
  if (hiddenCondition >= 82) {
    return "Maintenance judges the aircraft sound enough for another operation.";
  }
  if (hiddenCondition >= 68) {
    return "Maintenance considers the aircraft usable, though not without concern.";
  }
  if (hiddenCondition >= 52) {
    return "The aircraft appears worn and only marginally fit.";
  }
  return "The aircraft is believed too rough for another operation without work.";
}

function targetConditionText(target: Target): string {
  const actual = target.hiddenActualCondition;
  if (target.intelConfidence === "poor") {
    return qualitativeBand(
      actual,
      [
        [80, "Believed largely intact. Reliable strike evidence is lacking."],
        [60, "Possibly disturbed, though useful damage is unconfirmed."],
        [35, "Crews suspect visible damage, but operations has no reliable assessment."]
      ],
      "The target may be seriously affected, though present information is contradictory."
    );
  }

  if (target.intelConfidence === "fair") {
    return qualitativeBand(
      actual,
      [
        [80, "Believed operational, though some disruption is possible."],
        [60, "Probably affected in places, but likely still working."],
        [35, "Probably damaged with visible interruption to normal activity."]
      ],
      "Damage appears serious, though the full operational effect remains uncertain."
    );
  }

  return qualitativeBand(
    actual,
    [
      [80, "Recon believes the target remains substantially operational."],
      [60, "Recon judges the target partly impaired."],
      [35, "Recon reports clear and probably effective damage."]
    ],
    "Recon considers the target heavily affected."
  );
}

function defenseText(level: number): string {
  return qualitativeBand(
    level,
    [
      [72, "heavy"],
      [55, "moderate"],
      [40, "noticeable"]
    ],
    "light"
  );
}

function alertText(level: AlertLevel): string {
  if (level === "high") {
    return "high";
  }
  if (level === "elevated") {
    return "elevated";
  }
  return "low";
}

function confidenceText(confidence: IntelConfidence): string {
  return confidence;
}

function shiftFatigue(fatigue: CrewFatigue, steps: number): CrewFatigue {
  const ladder: CrewFatigue[] = ["rested", "tired", "exhausted"];
  const nextIndex = clamp(ladder.indexOf(fatigue) + steps, 0, ladder.length - 1);
  return ladder[nextIndex] as CrewFatigue;
}

function recoverFatigue(fatigue: CrewFatigue, steps: number): CrewFatigue {
  const ladder: CrewFatigue[] = ["rested", "tired", "exhausted"];
  const nextIndex = clamp(ladder.indexOf(fatigue) - steps, 0, ladder.length - 1);
  return ladder[nextIndex] as CrewFatigue;
}

function lowerMorale(morale: CrewMorale): CrewMorale {
  if (morale === "steady") {
    return "shaken";
  }
  if (morale === "shaken") {
    return "brittle";
  }
  return "brittle";
}

function raiseConfidence(confidence: IntelConfidence): IntelConfidence {
  if (confidence === "poor") {
    return "fair";
  }
  return "good";
}

function severityFromDamage(damage: number): string {
  if (damage >= 26) {
    return "serious";
  }
  if (damage >= 14) {
    return "useful";
  }
  return "limited";
}

function missionDurationForTarget(target: Target): number {
  return target.type === "factory" || target.type === "defense" ? MAJOR_MISSION_MS : SHORT_MISSION_MS;
}

function createPlanningState(targetId: string): PlanningState {
  return {
    selectedTargetId: targetId,
    assignedAircraftIds: ["aircraft-1", "aircraft-2", "aircraft-3", "aircraft-4"],
    routeRisk: "standard",
    standingOrders: {
      useSecondaryIfObscured: true,
      abortIfFormationBelow: false,
      damagedAircraftReturnEarly: true,
      allowRepeatBombRun: false
    },
    launchMode: "now",
    scheduleDelayMs: 2 * 60 * 1000
  };
}

export function createNewGame(now: number): SaveState {
  const groundCrews: GroundCrew[] = [
    {
      id: "ground-1",
      chiefName: GROUND_CREW_NAMES[0] as string,
      specialty: "quick_patch",
      fatigue: "rested",
      assignedAircraftIds: ["aircraft-1", "aircraft-2", "aircraft-3"],
      notes: "Known for getting damaged ships turned around quickly, though not always gently."
    },
    {
      id: "ground-2",
      chiefName: GROUND_CREW_NAMES[1] as string,
      specialty: "careful_inspection",
      fatigue: "rested",
      assignedAircraftIds: ["aircraft-4", "aircraft-5", "aircraft-6"],
      notes: "Slow and methodical. Engineering trusts this crew when a proper look is needed."
    }
  ];

  const crews: Aircrew[] = PILOT_NAMES.map((pilotName, index) => ({
    id: `crew-${index + 1}`,
    pilotName,
    experience: (index === 0 ? "veteran" : index <= 3 ? "regular" : "green") as Aircrew["experience"],
    fatigue: index === 5 ? "tired" : "rested",
    morale: "steady",
    status: "available",
    missionCount: index === 0 ? 8 : index <= 3 ? 3 : 1,
    familiarityAircraftId: `aircraft-${index + 1}`,
    notes: index === 5 ? "Operations notes the crew is willing, but still settling in." : "No unusual remarks."
  }));

  const aircraft: Aircraft[] = AIRCRAFT_NAMES.map((name, index) => ({
    id: `aircraft-${index + 1}`,
    name,
    status: index === 4 ? "damaged" : "serviceable",
    conditionSummary:
      index === 4
        ? "A recent training scrape left the aircraft slightly out of sorts, though it might still be pressed."
        : "Maintenance judges the aircraft sound enough for another operation.",
    hiddenCondition: index === 4 ? 64 : 88 - index * 3,
    assignedCrewId: `crew-${index + 1}`,
    assignedGroundCrewId: index <= 2 ? "ground-1" : "ground-2",
    missionCount: index === 0 ? 11 : index <= 2 ? 6 : 2,
    damageHistory: index === 4 ? ["Minor taxi collision repaired in part; inspection still advised."] : [],
    repairJobId: null,
    lastOutcomeNote: "No current remarks."
  }));

  const targets: Target[] = TARGET_DEFS.map((def, index) => ({
    id: `target-${index + 1}`,
    name: def.name,
    type: def.type,
    region: def.region,
    directiveRelevance: def.relevance,
    hiddenActualCondition: 100,
    hiddenDefenseLevel: def.defense,
    hiddenRepairRate: 8 + index * 2,
    assessedCondition: def.assessedCondition,
    intelConfidence: index === 0 ? "fair" : "poor",
    lastReconDay: null,
    weatherOutlook: def.weatherOutlook,
    suspectedEffects: def.suspectedEffects,
    connectedTargetIds: [],
    alertLevel: index <= 1 ? "elevated" : "low",
    evidence: ["File photographs are dated and incomplete."],
    hiddenWeatherRisk: def.weatherRisk
  }));

  targets[0]!.connectedTargetIds = ["target-2", "target-5"];
  targets[1]!.connectedTargetIds = ["target-1", "target-3"];
  targets[2]!.connectedTargetIds = ["target-1"];
  targets[3]!.connectedTargetIds = ["target-5"];
  targets[4]!.connectedTargetIds = ["target-1", "target-4"];

  const state: SaveState = {
    version: SAVE_VERSION,
    lastReconciledAt: now,
    nextId: 1,
    selectedTab: "command",
    campaign: {
      currentDay: 1,
      commandDirective: "Reduce enemy fighter pressure in the Bremen sector.",
      commandStanding: "High command wants a prompt operation, but not a wasted one.",
      campaignPhase: "Awaiting your first operation order.",
      activeMissionId: null,
      activeReconId: null,
      lastDebriefMissionId: null,
      logEntries: [],
      pendingDecisions: ["Choose the first operation target."]
    },
    aircraft,
    crews,
    groundCrews,
    targets,
    missions: [],
    repairJobs: [],
    reconMissions: [],
    planning: createPlanningState(targets[0]!.id),
    debug: {
      showHiddenValues: false,
      clockOffsetMs: 0
    }
  };

  addLog(
    state,
    "boot-directive",
    now,
    "command",
    "Group Headquarters has received a directive to ease fighter pressure around Bremen."
  );
  addLog(
    state,
    "boot-warning",
    now,
    "operations",
    "Intelligence reminds staff that current target folders are incomplete and should not be treated as exact."
  );

  return state;
}

export function loadState(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SaveState;
    if (parsed.version !== SAVE_VERSION) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to load bomber command save", error);
    return null;
  }
}

export function saveState(state: SaveState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function resetState(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function getTargetById(state: SaveState, targetId: string): Target | undefined {
  return state.targets.find((target) => target.id === targetId);
}

export function getCrewById(state: SaveState, crewId: string): Aircrew | undefined {
  return state.crews.find((crew) => crew.id === crewId);
}

export function getAircraftById(state: SaveState, aircraftId: string): Aircraft | undefined {
  return state.aircraft.find((aircraft) => aircraft.id === aircraftId);
}

function getGroundCrewById(state: SaveState, groundCrewId: string): GroundCrew | undefined {
  return state.groundCrews.find((crew) => crew.id === groundCrewId);
}

export function getActiveMission(state: SaveState): Mission | undefined {
  if (!state.campaign.activeMissionId) {
    return undefined;
  }
  return state.missions.find((mission) => mission.id === state.campaign.activeMissionId);
}

export function getLatestDebriefMission(state: SaveState): Mission | undefined {
  if (!state.campaign.lastDebriefMissionId) {
    return undefined;
  }
  return state.missions.find((mission) => mission.id === state.campaign.lastDebriefMissionId);
}

export function getActiveRecon(state: SaveState): ReconMission | undefined {
  if (!state.campaign.activeReconId) {
    return undefined;
  }
  return state.reconMissions.find((recon) => recon.id === state.campaign.activeReconId);
}

export function setSelectedTab(state: SaveState, tab: CampaignTab): void {
  state.selectedTab = tab;
}

export function setPlanningTarget(state: SaveState, targetId: string): void {
  state.planning.selectedTargetId = targetId;
}

export function toggleAssignedAircraft(state: SaveState, aircraftId: string): void {
  const report = getAircraftAvailability(state, aircraftId);
  if (report.level === "unavailable") {
    return;
  }

  const alreadyAssigned = state.planning.assignedAircraftIds.includes(aircraftId);
  if (alreadyAssigned) {
    state.planning.assignedAircraftIds = state.planning.assignedAircraftIds.filter((id) => id !== aircraftId);
    return;
  }

  state.planning.assignedAircraftIds = [...state.planning.assignedAircraftIds, aircraftId];
}

export function setRouteRisk(state: SaveState, routeRisk: RouteRisk): void {
  state.planning.routeRisk = routeRisk;
}

export function toggleStandingOrder(state: SaveState, key: keyof PlanningState["standingOrders"]): void {
  state.planning.standingOrders[key] = !state.planning.standingOrders[key];
}

export function setLaunchMode(state: SaveState, mode: PlanningState["launchMode"]): void {
  state.planning.launchMode = mode;
}

export function setScheduleDelay(state: SaveState, delayMs: number): void {
  state.planning.scheduleDelayMs = delayMs;
}

export function setShowHiddenValues(state: SaveState, show: boolean): void {
  state.debug.showHiddenValues = show;
}

export function getAircraftAvailability(state: SaveState, aircraftId: string): AvailabilityReport {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return {
      level: "unavailable",
      label: "Unavailable",
      reason: "Aircraft record missing",
      warnings: []
    };
  }

  const crew = getCrewById(state, aircraft.assignedCrewId);
  if (!crew) {
    return {
      level: "unavailable",
      label: "Unavailable",
      reason: "Crew record missing",
      warnings: []
    };
  }

  if (aircraft.status === "under_repair" || aircraft.repairJobId) {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft under repair", warnings: [] };
  }
  if (aircraft.status === "lost") {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft lost", warnings: [] };
  }
  if (aircraft.status === "diverted") {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft not yet back on station", warnings: [] };
  }
  if (crew.status === "missing") {
    return { level: "unavailable", label: "Unavailable", reason: "Crew missing", warnings: [] };
  }
  if (crew.status === "wounded") {
    return { level: "unavailable", label: "Unavailable", reason: "Crew wounded", warnings: [] };
  }

  const warnings: string[] = [];
  let marginal = false;

  if (aircraft.status === "damaged" || aircraft.hiddenCondition < 70) {
    marginal = true;
    warnings.push("Maintenance considers the aircraft only marginally fit.");
  }
  if (crew.status === "resting") {
    marginal = true;
    warnings.push("Crew is technically resting and would be recalled early.");
  }
  if (crew.fatigue === "tired") {
    marginal = true;
    warnings.push("Crew is tired. Operations recommends care.");
  }
  if (crew.fatigue === "exhausted") {
    marginal = true;
    warnings.push("Crew is exhausted. Command urgency would have to justify the risk.");
  }
  if (crew.morale === "shaken") {
    marginal = true;
    warnings.push("Recent strain has left the crew unsettled.");
  }
  if (crew.morale === "brittle") {
    marginal = true;
    warnings.push("Crew morale is brittle and could fail under pressure.");
  }

  if (marginal) {
    return {
      level: "marginal",
      label: "Marginal",
      reason: warnings[0] ?? "Assignable with warning",
      warnings
    };
  }

  return {
    level: "available",
    label: "Available",
    reason: "Ready for assignment",
    warnings: []
  };
}

function routeRiskMod(routeRisk: RouteRisk): number {
  if (routeRisk === "cautious") {
    return -9;
  }
  if (routeRisk === "direct") {
    return 11;
  }
  return 0;
}

function experienceMod(experience: Aircrew["experience"]): number {
  if (experience === "veteran") {
    return -10;
  }
  if (experience === "green") {
    return 9;
  }
  return 0;
}

function fatigueRisk(fatigue: CrewFatigue): number {
  if (fatigue === "exhausted") {
    return 16;
  }
  if (fatigue === "tired") {
    return 7;
  }
  return 0;
}

function stageReport(stage: MissionStage, target: Target, riskWord: string, visibility: string): { text: string; source: MissionEvent["source"]; confidence: MissionEvent["confidence"] } {
  switch (stage) {
    case "takeoff":
      return {
        text: "Tower reports the force has begun departing in sequence. Visibility over the field is serviceable, though exact assembly timing remains uncertain.",
        source: "tower",
        confidence: "confirmed"
      };
    case "assembly":
      return {
        text: "Group Operations believes the formation is climbing into place. Some gaps have been reported, but the overall picture remains fragmentary.",
        source: "group_operations",
        confidence: "fragmentary"
      };
    case "outbound":
      return {
        text: `Observers judge the route ${riskWord}. Wireless traffic suggests the force is approaching the enemy coast, though direct contact is incomplete.`,
        source: "group_operations",
        confidence: "estimated"
      };
    case "target_area":
      return {
        text: `Lead crews report ${visibility} over ${target.name}. Bombing is believed to have been carried out, but the exact aiming point cannot yet be confirmed.`,
        source: "lead_aircraft",
        confidence: "probable"
      };
    case "withdrawal":
      return {
        text: "Coastal watchers report the stream breaking up on the homeward leg. Several aircraft appear separated, and at least one return is uncertain.",
        source: "coastal_observer",
        confidence: "estimated"
      };
    case "recovery":
      return {
        text: "Aircraft are reported landing or diverting in ones and twos. Engineering is beginning to sort rumor from fact.",
        source: "tower",
        confidence: "confirmed"
      };
    case "debrief_ready":
      return {
        text: "Crews are available for debrief. Intelligence requests a provisional assessment before recommending the next move.",
        source: "crew_debrief",
        confidence: "confirmed"
      };
    default:
      return {
        text: `${target.name} remains under observation.`,
        source: "intelligence",
        confidence: "unverified"
      };
  }
}

function buildMission(state: SaveState, now: number): Mission | null {
  if (state.campaign.activeMissionId) {
    return null;
  }

  const target = getTargetById(state, state.planning.selectedTargetId);
  if (!target) {
    return null;
  }

  const assignedAircraftIds = state.planning.assignedAircraftIds.filter((id) => getAircraftAvailability(state, id).level !== "unavailable");
  if (assignedAircraftIds.length === 0) {
    return null;
  }

  const launchTime = state.planning.launchMode === "schedule" ? now + state.planning.scheduleDelayMs : now;
  const duration = missionDurationForTarget(target);
  const times = {
    takeoff: launchTime,
    assembly: launchTime + duration * 0.14,
    outbound: launchTime + duration * 0.34,
    target_area: launchTime + duration * 0.56,
    withdrawal: launchTime + duration * 0.72,
    recovery: launchTime + duration * 0.9,
    debrief_ready: launchTime + duration
  };

  const outcomes: Mission["hiddenOutcome"]["aircraftOutcomes"] = [];
  const avgCondition = assignedAircraftIds.reduce((sum, aircraftId) => sum + (getAircraftById(state, aircraftId)?.hiddenCondition ?? 70), 0) / assignedAircraftIds.length;
  const avgFatigue = assignedAircraftIds.reduce((sum, aircraftId) => {
    const aircraft = getAircraftById(state, aircraftId);
    const crew = aircraft ? getCrewById(state, aircraft.assignedCrewId) : undefined;
    return sum + (crew?.fatigue === "exhausted" ? 2 : crew?.fatigue === "tired" ? 1 : 0);
  }, 0) / assignedAircraftIds.length;
  const visibility = chance((target.hiddenWeatherRisk + (state.planning.standingOrders.useSecondaryIfObscured ? -5 : 5)) / 100)
    ? "obscured"
    : chance(0.45)
      ? "broken"
      : "clear";
  const riskBase = target.hiddenDefenseLevel + routeRiskMod(state.planning.routeRisk) + (100 - avgCondition) * 0.35 + avgFatigue * 7;
  let contributed = 0;

  for (const aircraftId of assignedAircraftIds) {
    const aircraft = getAircraftById(state, aircraftId);
    if (!aircraft) {
      continue;
    }
    const crew = getCrewById(state, aircraft.assignedCrewId);
    if (!crew) {
      continue;
    }

    const outcomeRisk = clamp(
      (riskBase + (100 - aircraft.hiddenCondition) * 0.45 + fatigueRisk(crew.fatigue) + experienceMod(crew.experience)) / 100,
      0.1,
      0.96
    );
    const abortChance = clamp((68 - aircraft.hiddenCondition) / 180 + (crew.fatigue === "exhausted" ? 0.08 : 0), 0, 0.35);
    let participation: Mission["hiddenOutcome"]["aircraftOutcomes"][number]["participation"] = "full";
    let finalStatus: Aircraft["status"] = "serviceable";
    let damageDelta = Math.round(4 + outcomeRisk * 18 + Math.random() * 12);
    let crewFatigue = shiftFatigue(crew.fatigue, 1);
    let crewMorale = crew.morale;
    let crewStatus: CrewStatus = "resting";
    let note = "Returned without confirmed major incident.";
    let contributedToStrike = true;

    if (chance(abortChance)) {
      participation = "aborted";
      finalStatus = "damaged";
      damageDelta = Math.round(8 + Math.random() * 8);
      note = "Dropped out before the main attack after mechanical trouble was reported.";
      crewFatigue = crew.fatigue === "rested" ? "tired" : crew.fatigue;
      contributedToStrike = false;
    } else if (chance(outcomeRisk * 0.14)) {
      participation = "lost";
      finalStatus = "lost";
      damageDelta = 100;
      note = "Failed to return and is now listed as missing after the operation.";
      crewFatigue = "exhausted";
      crewMorale = lowerMorale(crewMorale);
      crewStatus = "missing";
    } else if (chance(outcomeRisk * 0.24)) {
      participation = "diverted";
      finalStatus = chance(0.45) ? "diverted" : "damaged";
      damageDelta = Math.round(18 + Math.random() * 16);
      note = finalStatus === "diverted"
        ? "Reported down at an outlying strip after a rough return."
        : "Returned damaged and will require more than a quick patch.";
      crewFatigue = "exhausted";
      crewMorale = lowerMorale(crewMorale);
    } else if (chance(outcomeRisk * 0.44)) {
      finalStatus = "damaged";
      damageDelta = Math.round(10 + Math.random() * 12);
      note = "Returned with visible damage and several uncertain maintenance complaints.";
      if (chance(0.3)) {
        crewMorale = lowerMorale(crewMorale);
      }
    } else {
      damageDelta = Math.round(3 + Math.random() * 6);
      note = visibility === "obscured"
        ? "Returned safely, though the crew remains unsure of the bombing result."
        : "Returned safely and reports a reasonably orderly run.";
    }

    if (crewStatus !== "missing" && chance(outcomeRisk * 0.12)) {
      crewStatus = "wounded";
      crewMorale = lowerMorale(crewMorale);
      note = `${note} One or more crewmen are believed wounded.`;
    }

    outcomes.push({
      aircraftId,
      crewId: crew.id,
      participation,
      damageDelta,
      finalStatus,
      conditionSummary: note,
      crewFatigue,
      crewMorale,
      crewStatus,
      note,
      contributedToStrike
    });

    if (contributedToStrike) {
      contributed += 1;
    }
  }

  if (!outcomes.some((outcome) => outcome.finalStatus === "damaged" || outcome.finalStatus === "diverted" || outcome.finalStatus === "lost")) {
    const forcedOutcome = outcomes[outcomes.length - 1];
    if (forcedOutcome) {
      forcedOutcome.finalStatus = "damaged";
      forcedOutcome.damageDelta = 15;
      forcedOutcome.note = "Returned with enough damage to keep engineering occupied.";
      forcedOutcome.conditionSummary = forcedOutcome.note;
    }
  }

  const visibilityPenalty = visibility === "obscured" ? 0.45 : visibility === "broken" ? 0.72 : 1;
  const damage = Math.round(contributed * (8 + Math.random() * 5) * visibilityPenalty);
  const targetDamage = clamp(damage, 6, 42);
  const targetAssessment =
    visibility === "obscured"
      ? "Crews report fires near the objective, but smoke and cloud make useful damage difficult to confirm."
      : targetDamage >= 24
        ? "Several crews believe the aiming area was struck with probable effect."
        : "Bombing was carried out, though the visible operational effect remains uncertain.";
  const targetEvidence = visibility === "obscured"
    ? [
        "Crews report smoke over part of the target area.",
        "Intelligence notes that cloud probably masked the main impact zone."
      ]
    : targetDamage >= 24
      ? [
          "Multiple crews report bursts and fire near the intended works.",
          "Returning aircraft describe visible smoke columns over the target."
        ]
      : [
          "Bombing was observed, but exact impact points are disputed.",
          "At least one crew reports near misses around the target approaches."
        ];

  const riskWord = defenseText(target.hiddenDefenseLevel);
  const stages: Array<"takeoff" | "assembly" | "outbound" | "target_area" | "withdrawal" | "recovery" | "debrief_ready"> = [
    "takeoff",
    "assembly",
    "outbound",
    "target_area",
    "withdrawal",
    "recovery",
    "debrief_ready"
  ];
  const timelineEvents: MissionEvent[] = stages.map((stage) => {
    const report = stageReport(stage, target, riskWord, visibility);
    const hiddenEffects: HiddenEffect[] = [];

    if (stage === "assembly") {
      outcomes.forEach((outcome, index) => {
        if (outcome.participation === "aborted") {
          hiddenEffects.push({
            kind: "apply_aircraft_outcome",
            aircraftId: outcome.aircraftId,
            outcomeIndex: index
          });
        }
      });
    }
    if (stage === "target_area") {
      hiddenEffects.push({
        kind: "apply_target_damage",
        targetId: target.id
      });
    }
    if (stage === "recovery") {
      outcomes.forEach((outcome, index) => {
        if (outcome.participation !== "aborted") {
          hiddenEffects.push({
            kind: "apply_aircraft_outcome",
            aircraftId: outcome.aircraftId,
            outcomeIndex: index
          });
        }
      });
      hiddenEffects.push({
        kind: "set_campaign_phase",
        phaseText: "Recovery reports are in. Debrief should follow shortly."
      });
    }
    if (stage === "debrief_ready") {
      outcomes.forEach((outcome, index) => {
        hiddenEffects.push({
          kind: "apply_crew_outcome",
          crewId: outcome.crewId,
          outcomeIndex: index
        });
      });
      hiddenEffects.push({ kind: "generate_debrief" });
      hiddenEffects.push({ kind: "mark_mission_complete" });
    }

    return {
      id: nextId(state, "mission-event"),
      time: Math.round(times[stage]),
      stage,
      type: stage,
      targetId: target.id,
      severity: stage === "target_area" || stage === "recovery" ? "heavy" : "moderate",
      hiddenEffects,
      publicReportText: report.text,
      confidence: report.confidence,
      source: report.source,
      applied: false,
      revealed: false
    };
  });

  const missionId = nextId(state, "mission");
  return {
    id: missionId,
    plan: {
      targetId: target.id,
      assignedAircraftIds,
      scheduledLaunchTime: launchTime,
      routeRisk: state.planning.routeRisk,
      standingOrders: { ...state.planning.standingOrders },
      status: launchTime > now ? "scheduled" : "launched"
    },
    stage: launchTime > now ? "scheduled" : "takeoff",
    timelineEvents,
    generatedEvents: timelineEvents,
    reports: [],
    resultSummary: "",
    debrief: "",
    status: launchTime > now ? "scheduled" : "launched",
    debriefGenerated: false,
    hiddenOutcome: {
      targetDamage,
      visibility,
      targetAssessment,
      targetEvidence,
      targetSuspectedEffects:
        targetDamage >= 24
          ? "Staff believes the target may be materially hindered for a time."
          : "Some disruption is possible, though the operational effect is still uncertain.",
      aircraftOutcomes: outcomes
    }
  };
}

export function launchMission(state: SaveState, now: number): string | null {
  const mission = buildMission(state, now);
  if (!mission) {
    return "Mission could not be created.";
  }

  state.missions.unshift(mission);
  state.campaign.activeMissionId = mission.id;
  state.campaign.campaignPhase = mission.plan.status === "scheduled"
    ? "An operation has been scheduled. Reports will accumulate as time passes."
    : "An operation is now under way.";
  state.campaign.commandStanding = "High command expects a useful result, but the details will remain uncertain for some time.";
  state.campaign.pendingDecisions = ["Await timed reports and the returning crews."];
  state.selectedTab = "current-operation";

  const target = getTargetById(state, mission.plan.targetId);
  addLog(
    state,
    `mission-launch-${mission.id}`,
    now,
    "operations",
    `A strike has been ordered against ${target?.name ?? "the selected target"} with ${mission.plan.assignedAircraftIds.length} aircraft.`
  );

  for (const aircraftId of mission.plan.assignedAircraftIds) {
    const aircraft = getAircraftById(state, aircraftId);
    const crew = aircraft ? getCrewById(state, aircraft.assignedCrewId) : undefined;
    if (aircraft) {
      aircraft.missionCount += 1;
      aircraft.lastOutcomeNote = "Committed to the current operation.";
    }
    if (crew) {
      crew.missionCount += 1;
      crew.notes = "Aircrew is currently away on operation.";
    }
  }

  return null;
}

function applyAircraftOutcome(state: SaveState, mission: Mission, outcomeIndex: number | undefined): void {
  if (outcomeIndex === undefined) {
    return;
  }
  const outcome = mission.hiddenOutcome.aircraftOutcomes[outcomeIndex];
  if (!outcome) {
    return;
  }
  const aircraft = getAircraftById(state, outcome.aircraftId);
  if (!aircraft || aircraft.lastOutcomeNote === outcome.note) {
    return;
  }

  if (outcome.finalStatus === "lost") {
    aircraft.status = "lost";
    aircraft.hiddenCondition = 0;
  } else {
    aircraft.hiddenCondition = clamp(aircraft.hiddenCondition - outcome.damageDelta, 12, 100);
    aircraft.status = outcome.finalStatus;
  }
  aircraft.conditionSummary = conditionSummary(aircraft.hiddenCondition, aircraft.status);
  aircraft.lastOutcomeNote = outcome.note;
  if (outcome.damageDelta > 0) {
    aircraft.damageHistory.unshift(outcome.note);
  }

  if (aircraft.status === "damaged" || aircraft.status === "diverted") {
    aircraft.repairJobId = null;
  }
}

function applyCrewOutcome(state: SaveState, mission: Mission, outcomeIndex: number | undefined): void {
  if (outcomeIndex === undefined) {
    return;
  }
  const outcome = mission.hiddenOutcome.aircraftOutcomes[outcomeIndex];
  if (!outcome) {
    return;
  }
  const crew = getCrewById(state, outcome.crewId);
  if (!crew || crew.notes === outcome.note) {
    return;
  }

  crew.fatigue = outcome.crewFatigue;
  crew.morale = outcome.crewMorale;
  crew.status = outcome.crewStatus;
  crew.notes = outcome.note;
}

function generateDebrief(state: SaveState, mission: Mission): void {
  if (mission.debriefGenerated) {
    return;
  }

  const target = getTargetById(state, mission.plan.targetId);
  if (!target) {
    return;
  }

  const lostCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "lost").length;
  const damagedCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "damaged").length;
  const divertedCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "diverted").length;
  mission.resultSummary = `${severityFromDamage(mission.hiddenOutcome.targetDamage)} strike effect reported against ${target.name}; ${damagedCount} damaged, ${divertedCount} diverted, ${lostCount} missing or lost.`;
  mission.debrief = [
    `Crews report ${mission.hiddenOutcome.targetAssessment}`,
    `Aircraft accounting remains imperfect, but current reports indicate ${damagedCount} damaged return${damagedCount === 1 ? "" : "s"}, ${divertedCount} diverted, and ${lostCount} missing or lost.`,
    target.suspectedEffects
  ].join(" ");
  mission.status = "complete";
  mission.stage = "complete";
  mission.debriefGenerated = true;

  target.assessedCondition = targetConditionText(target);
  target.suspectedEffects = mission.hiddenOutcome.targetSuspectedEffects;
  for (const evidence of mission.hiddenOutcome.targetEvidence) {
    if (!target.evidence.includes(evidence)) {
      target.evidence.unshift(evidence);
    }
  }

  state.campaign.activeMissionId = null;
  state.campaign.lastDebriefMissionId = mission.id;
  state.campaign.campaignPhase = "Debrief filed. Engineering and intelligence await your next order.";
  state.campaign.commandStanding = "Staff recommends weighing the debrief against the temptation to strike again immediately.";
  state.campaign.pendingDecisions = ["Review damage, start repairs, or order recon."];
  addLog(state, `debrief-${mission.id}`, state.lastReconciledAt, "debrief", mission.debrief);
}

function applyTargetDamage(state: SaveState, mission: Mission): void {
  const target = getTargetById(state, mission.plan.targetId);
  if (!target) {
    return;
  }

  const newCondition = clamp(target.hiddenActualCondition - mission.hiddenOutcome.targetDamage, 0, 100);
  if (newCondition === target.hiddenActualCondition) {
    return;
  }
  target.hiddenActualCondition = newCondition;
  target.assessedCondition = targetConditionText(target);
  if (target.alertLevel === "low") {
    target.alertLevel = "elevated";
  } else if (chance(0.35)) {
    target.alertLevel = "high";
  }
}

function applyMissionEffect(state: SaveState, mission: Mission, effect: HiddenEffect): void {
  switch (effect.kind) {
    case "apply_aircraft_outcome":
      applyAircraftOutcome(state, mission, effect.outcomeIndex);
      break;
    case "apply_crew_outcome":
      applyCrewOutcome(state, mission, effect.outcomeIndex);
      break;
    case "apply_target_damage":
      applyTargetDamage(state, mission);
      break;
    case "generate_debrief":
      generateDebrief(state, mission);
      break;
    case "set_campaign_phase":
      if (effect.phaseText) {
        state.campaign.campaignPhase = effect.phaseText;
      }
      break;
    case "mark_mission_complete":
      mission.status = "complete";
      break;
  }
}

function applyMissionEvent(state: SaveState, mission: Mission, event: MissionEvent): void {
  if (!event.revealed) {
    event.revealed = true;
    mission.reports.push(event.publicReportText);
    addLog(state, `report-${event.id}`, event.time, "report", event.publicReportText);
  }

  if (event.applied) {
    return;
  }

  mission.stage = event.stage;
  if (event.stage === "recovery") {
    mission.status = "recovering";
  } else if (event.stage === "debrief_ready") {
    mission.status = "complete";
  } else if (event.stage !== "scheduled") {
    mission.status = "launched";
  }

  for (const effect of event.hiddenEffects) {
    applyMissionEffect(state, mission, effect);
  }

  event.applied = true;
}

function completeRepair(state: SaveState, job: RepairJob): void {
  if (job.completionApplied) {
    return;
  }
  const aircraft = getAircraftById(state, job.aircraftId);
  if (!aircraft) {
    return;
  }

  aircraft.hiddenCondition = job.hiddenNewCondition;
  aircraft.status = job.hiddenNewStatus;
  aircraft.conditionSummary = job.hiddenConditionSummary;
  aircraft.repairJobId = null;
  aircraft.lastOutcomeNote = job.resultText;
  if (!aircraft.damageHistory.includes(job.hiddenDamageNote)) {
    aircraft.damageHistory.unshift(job.hiddenDamageNote);
  }
  job.status = "complete";
  job.completionApplied = true;
  addLog(state, `repair-${job.id}`, job.completesAt, "maintenance", job.resultText);
}

function completeRecon(state: SaveState, recon: ReconMission): void {
  if (recon.completionApplied) {
    return;
  }
  const target = getTargetById(state, recon.targetId);
  if (!target) {
    return;
  }

  target.intelConfidence = raiseConfidence(target.intelConfidence);
  target.assessedCondition = recon.hiddenAssessment;
  target.lastReconDay = state.campaign.currentDay;
  if (!target.evidence.includes(recon.hiddenEvidence)) {
    target.evidence.unshift(recon.hiddenEvidence);
  }
  target.alertLevel = recon.enemyAlertEffect;
  recon.status = "complete";
  recon.completionApplied = true;
  state.campaign.activeReconId = null;
  addLog(state, `recon-${recon.id}`, recon.interpretedAt, "recon", recon.resultText);
}

function applyFatigueRecovery(state: SaveState, elapsedMs: number): boolean {
  const steps = Math.floor(elapsedMs / FATIGUE_RECOVERY_MS);
  if (steps <= 0) {
    return false;
  }

  let changed = false;
  for (const crew of state.crews) {
    const previousFatigue = crew.fatigue;
    const previousStatus = crew.status;
    crew.fatigue = recoverFatigue(crew.fatigue, steps);
    if (crew.status === "resting" && crew.fatigue === "rested") {
      crew.status = "available";
    }
    if (previousFatigue !== crew.fatigue && crew.status !== "missing" && crew.status !== "wounded") {
      crew.notes = crew.fatigue === "rested"
        ? "Crew has had enough time on the ground to seem composed again."
        : "Crew is still recovering from the last operation.";
    }
    if (previousFatigue !== crew.fatigue || previousStatus !== crew.status) {
      changed = true;
    }
  }
  return changed;
}

function nudgeTargetRepairs(state: SaveState, elapsedMs: number): boolean {
  const daySteps = Math.floor(elapsedMs / DAY_MS);
  if (daySteps <= 0) {
    return false;
  }

  let changed = false;
  for (const target of state.targets) {
    const previous = target.hiddenActualCondition;
    target.hiddenActualCondition = clamp(target.hiddenActualCondition + target.hiddenRepairRate * daySteps, 0, 100);
    target.assessedCondition = targetConditionText(target);
    if (previous !== target.hiddenActualCondition) {
      changed = true;
    }
  }
  return changed;
}

export function reconcileState(state: SaveState, now: number): boolean {
  const previous = state.lastReconciledAt;
  let changed = false;

  for (const mission of state.missions) {
    const dueEvents = mission.timelineEvents
      .filter((event) => event.time <= now && (!event.applied || !event.revealed))
      .sort((left, right) => left.time - right.time);

    for (const event of dueEvents) {
      applyMissionEvent(state, mission, event);
      changed = true;
    }
  }

  for (const job of state.repairJobs) {
    if (job.status !== "complete" && job.completesAt <= now) {
      completeRepair(state, job);
      changed = true;
    }
  }

  for (const recon of state.reconMissions) {
    if (!recon.completionApplied && recon.interpretedAt <= now) {
      completeRecon(state, recon);
      changed = true;
    } else if (recon.status === "airborne" && recon.returnsAt <= now) {
      recon.status = "awaiting_interpretation";
      changed = true;
    }
  }

  const elapsedMs = Math.max(0, now - previous);
  if (elapsedMs > 0) {
    changed = applyFatigueRecovery(state, elapsedMs) || changed;
    changed = nudgeTargetRepairs(state, elapsedMs) || changed;
  }

  state.lastReconciledAt = now;
  return changed;
}

export function startRepair(state: SaveState, aircraftId: string, tier: RepairTier, now: number): string | null {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return "Aircraft not found.";
  }
  if (aircraft.repairJobId) {
    return "Aircraft already under repair.";
  }
  if (aircraft.status !== "damaged") {
    return "No damaged aircraft selected.";
  }

  const groundCrew = getGroundCrewById(state, aircraft.assignedGroundCrewId);
  if (!groundCrew) {
    return "Ground crew not found.";
  }

  const speedBonus = groundCrew.specialty === "quick_patch" && tier === "patch"
    ? -60 * 1000
    : groundCrew.specialty === "careful_inspection" && tier === "thorough"
      ? -90 * 1000
      : 0;
  const baseDuration =
    tier === "patch"
      ? 2.5 * 60 * 1000
      : tier === "standard"
        ? 5 * 60 * 1000
        : 7.5 * 60 * 1000;
  const duration = Math.max(60 * 1000, baseDuration + speedBonus);
  const hiddenNewCondition = clamp(
    aircraft.hiddenCondition + (tier === "patch" ? 13 : tier === "standard" ? 22 : 30),
    36,
    96
  );
  const hiddenNewStatus: Aircraft["status"] = hiddenNewCondition >= 72 ? "serviceable" : "damaged";
  const resultText =
    tier === "patch"
      ? `${aircraft.name} has received a quick patch. Maintenance will allow it back only with reservations.`
      : tier === "standard"
        ? `${aircraft.name} has completed a standard repair cycle and is believed fit enough for use.`
        : `${aircraft.name} has undergone a thorough inspection and is considered steadier than before.`;
  const job: RepairJob = {
    id: nextId(state, "repair"),
    aircraftId,
    groundCrewId: groundCrew.id,
    repairTier: tier,
    startedAt: now,
    completesAt: Math.round(now + duration),
    status: "in_progress",
    riskNote:
      tier === "patch"
        ? "Fastest option. Maintenance warns hidden strain may remain."
        : tier === "standard"
          ? "Balanced turnround. Normal hidden risk."
          : "Slowest field option. Hidden risk should be lower afterward.",
    resultText,
    completionApplied: false,
    hiddenNewCondition,
    hiddenNewStatus,
    hiddenConditionSummary: conditionSummary(hiddenNewCondition, hiddenNewStatus),
    hiddenDamageNote:
      tier === "patch"
        ? "Quick patch completed; maintenance still distrusts the deeper structure."
        : tier === "standard"
          ? "Standard repair completed after post-mission damage."
          : "Thorough inspection completed and cleared the aircraft more carefully."
  };

  aircraft.status = "under_repair";
  aircraft.repairJobId = job.id;
  state.repairJobs.unshift(job);
  addLog(state, `repair-start-${job.id}`, now, "maintenance", `${groundCrew.chiefName} has started ${tier} work on ${aircraft.name}.`);
  return null;
}

export function startRecon(state: SaveState, targetId: string, type: ReconType, now: number): string | null {
  if (state.campaign.activeReconId) {
    return "Recon section already occupied.";
  }

  const target = getTargetById(state, targetId);
  if (!target) {
    return "Target not found.";
  }

  const duration = type === "post_strike" ? 3.5 * 60 * 1000 : 2.5 * 60 * 1000;
  const recon: ReconMission = {
    id: nextId(state, "recon"),
    targetId,
    type,
    launchedAt: now,
    returnsAt: Math.round(now + duration * 0.6),
    interpretedAt: Math.round(now + duration),
    status: "airborne",
    resultText:
      type === "post_strike"
        ? `Recon photography over ${target.name} suggests ${target.hiddenActualCondition < 70 ? "some visible disturbance" : "only partial evidence"}, though complete interpretation remains uncertain.`
        : `Recon sortie over ${target.name} has returned with partial weather and route observations.`,
    confidenceChange: raiseConfidence(target.intelConfidence),
    enemyAlertEffect: target.alertLevel === "high" ? "high" : chance(0.4) ? "high" : "elevated",
    completionApplied: false,
    hiddenAssessment:
      target.hiddenActualCondition < 45
        ? "Recon reports visible damage and probable interruption to operations."
        : target.hiddenActualCondition < 72
          ? "Recon suggests useful disturbance, though parts of the target remain hard to judge."
          : "Recon finds the target still appears largely operational.",
    hiddenEvidence:
      target.hiddenActualCondition < 45
        ? "Fresh photography shows obvious disturbance in the target area."
        : "Recon photographs provide partial but usable new evidence."
  };

  state.reconMissions.unshift(recon);
  state.campaign.activeReconId = recon.id;
  addLog(state, `recon-start-${recon.id}`, now, "recon", `A ${type.replaceAll("_", " ")} recon sortie has been dispatched against ${target.name}.`);
  return null;
}

export function advanceCampaignDay(state: SaveState): void {
  state.campaign.currentDay += 1;
  state.debug.clockOffsetMs += DAY_MS;
  state.campaign.commandStanding = "A new day of pressure has begun. Staff believes the enemy has had some time to recover its balance.";
  addLog(
    state,
    `day-${state.campaign.currentDay}`,
    getEffectiveNow(state),
    "command",
    `Campaign day ${state.campaign.currentDay} has begun. Routine rest and repair time have accrued.`
  );
}

export function skipToNextReport(state: SaveState, now: number): string | null {
  const mission = getActiveMission(state);
  if (!mission) {
    return "No active mission.";
  }
  const nextEvent = mission.timelineEvents
    .filter((event) => !event.revealed)
    .sort((left, right) => left.time - right.time)[0];
  if (!nextEvent) {
    return "No further reports pending.";
  }
  state.debug.clockOffsetMs += Math.max(0, nextEvent.time - now + 1000);
  return null;
}

export function skipToDebrief(state: SaveState, now: number): string | null {
  const mission = getActiveMission(state);
  if (!mission) {
    return "No active mission.";
  }
  const debriefEvent = mission.timelineEvents.find((event) => event.stage === "debrief_ready");
  if (!debriefEvent) {
    return "Debrief not ready.";
  }
  state.debug.clockOffsetMs += Math.max(0, debriefEvent.time - now + 1000);
  return null;
}

export function completeCurrentRecon(state: SaveState, now: number): string | null {
  const recon = getActiveRecon(state);
  if (!recon) {
    return "Recon section already clear.";
  }
  recon.returnsAt = now - 1000;
  recon.interpretedAt = now - 500;
  return null;
}

export function completeAllRepairs(state: SaveState, now: number): string | null {
  const jobs = state.repairJobs.filter((job) => !job.completionApplied);
  if (jobs.length === 0) {
    return "No active repairs.";
  }
  jobs.forEach((job) => {
    job.completesAt = now - 1000;
  });
  return null;
}

export function getTargetOperationalSummary(target: Target): string {
  return `${target.assessedCondition} Defense is believed ${defenseText(target.hiddenDefenseLevel)}, alert appears ${alertText(target.alertLevel)}, and intelligence is ${confidenceText(target.intelConfidence)}.`;
}

export function getCurrentOperationSummary(state: SaveState): string {
  const mission = getActiveMission(state);
  if (!mission) {
    return "No active mission. The operations board is quiet for now.";
  }
  const unrevealed = mission.timelineEvents.filter((event) => !event.revealed).sort((a, b) => a.time - b.time)[0];
  if (!unrevealed) {
    return "All known mission reports have arrived. Debrief should be reviewed.";
  }
  return `Current stage is ${mission.stage.replaceAll("_", " ")}. Next report is expected after some delay.`;
}

export function getDisabledReasonForLaunch(state: SaveState): string | null {
  if (state.campaign.activeMissionId) {
    return "Operation already in progress";
  }
  if (state.planning.assignedAircraftIds.length === 0) {
    return "No aircraft assigned";
  }
  const target = getTargetById(state, state.planning.selectedTargetId);
  if (!target) {
    return "No target selected";
  }
  return null;
}
