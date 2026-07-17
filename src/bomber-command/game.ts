import type {
  Aircraft,
  Aircrew,
  AlertLevel,
  AvailabilityReport,
  AttackDoctrine,
  CampaignCausalHook,
  CampaignEndCondition,
  CampaignEvaluation,
  CampaignEvent,
  CampaignInsight,
  CampaignOpportunity,
  CampaignPhase,
  CampaignProfile,
  CampaignResolutionState,
  CampaignTab,
  CampaignSpinePhase,
  CommandBrief,
  CommandBriefAction,
  CommandBriefDecision,
  CommandBriefDelta,
  CrewExperience,
  CrewFatigue,
  CrewMember,
  CrewMorale,
  CrewRole,
  CrewSpecialty,
  CrewStatus,
  ConsequenceLedgerEntry,
  DirectiveState,
  DirectiveRelevance,
  GroundCrew,
  HiddenEffect,
  InjurySeverity,
  Mission,
  MissionAircraftCrewSnapshot,
  MissionCrewEffect,
  MissionCrewSnapshotMember,
  MissionEvent,
  MissionStage,
  OperationType,
  PersonnelDecision,
  PersonnelDecisionAction,
  PlanningState,
  RecoveryCrewUpdate,
  RecoveryJob,
  ReconMission,
  ReconResultQuality,
  ReconType,
  RepairJob,
  RepairTier,
  RouteRisk,
  SaveState,
  StrategicEffectCategory,
  StrategicEffectRecord,
  StaffRecommendation,
  StaffConference,
  Target,
  TargetType,
  TimeAdvanceKind,
  TutorialStepDisplay,
  TutorialStepId,
  UiReadState,
  UiNotification
} from "./types";

export const SAVE_KEY = "bomber-command-save-v1";
export const SAVE_VERSION = 12;

const SHORT_MISSION_MS = 5 * 60 * 1000;
const MAJOR_MISSION_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FATIGUE_RECOVERY_MS = 6 * 60 * 1000;
const LIGHT_WOUND_RECOVERY_MS = 12 * 60 * 60 * 1000;
const TOAST_LIFETIME_MS = 12 * 1000;
const SHORT_WAIT_DRIFT_THRESHOLD_MS = 8 * 60 * 1000;
const DEFAULT_CAMPAIGN_DAYS = 8;
const CAMPAIGN_CONCLUDED_MESSAGE = "The campaign has concluded. No further operational orders may be issued.";

const AIRCRAFT_NAMES = [
  "Lucky Lady",
  "Morning Glory",
  "Sunday Punch",
  "Old Sinner",
  "Mary Alice",
  "Hell's Belle"
];

const PILOT_NAMES = [
  "Capt. George Maddox",
  "Capt. Peter Collins",
  "Capt. Frank Dwyer",
  "Capt. Owen Reese",
  "Capt. Daniel Mercer",
  "Capt. Harold Boone"
];

const FIRST_NAMES = [
  "George",
  "Peter",
  "Frank",
  "Owen",
  "Daniel",
  "Harold",
  "Walter",
  "Louis",
  "James",
  "Thomas",
  "Edward",
  "Charles",
  "Robert",
  "Joseph",
  "Henry",
  "William",
  "Arthur",
  "Samuel",
  "Richard",
  "Paul",
  "John",
  "Eugene",
  "Alan",
  "Victor"
];

const LAST_NAMES = [
  "Maddox",
  "Collins",
  "Dwyer",
  "Reese",
  "Mercer",
  "Boone",
  "Harris",
  "Fletcher",
  "Conway",
  "Dunn",
  "Palmer",
  "Holt",
  "Pierce",
  "Lawson",
  "Burke",
  "Crawford",
  "Hayes",
  "Bennett",
  "Rourke",
  "Morrison",
  "Adler",
  "Keller",
  "Pritchard",
  "Fenton"
];

const GROUND_CREW_NAMES = ["M/Sgt. Walter Finch", "T/Sgt. Louis Harper"];
const CREW_ROLES: CrewRole[] = [
  "pilot",
  "copilot",
  "navigator",
  "bombardier",
  "engineer_top_turret",
  "radio_operator",
  "ball_turret",
  "left_waist",
  "right_waist",
  "tail_gunner"
];

const REQUIRED_ROLES: CrewRole[] = ["pilot", "copilot", "navigator", "bombardier"];
const ENLISTED_ROLE_SET = new Set<CrewRole>([
  "engineer_top_turret",
  "radio_operator",
  "ball_turret",
  "left_waist",
  "right_waist",
  "tail_gunner"
]);

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

type TutorialStepDefinition = {
  id: TutorialStepId;
  title: string;
  body: string;
  suggestedTab?: CampaignTab;
  prerequisites?: TutorialStepId[];
  trigger: (state: SaveState) => boolean;
};

const TAB_LABELS: Record<CampaignTab, string> = {
  command: "Command",
  "target-board": "Target Board",
  "aircraft-crews": "Aircraft & Crews",
  "mission-planning": "Mission Planning",
  "current-operation": "Current Operation",
  debrief: "Debrief / Assessment",
  maintenance: "Maintenance",
  recon: "Recon / Intelligence",
  "event-log": "Event Log",
  debug: "Debug"
};

const TUTORIAL_STEPS: TutorialStepDefinition[] = [
  {
    id: "welcome",
    title: "Opening Decision",
    body: "Your first question is whether to weaken fighter resistance at Jever or pursue direct progress at Bremen. Staff recommends Jever, but both are valid.",
    suggestedTab: "command",
    trigger: (state) => state.missions.length === 0 && state.campaign.currentDay === 1
  },
  {
    id: "planning-basics",
    title: "Planning",
    body: "Staff has prepared a launchable Jever order. Review the proposed order, expand advanced controls only when needed, then launch.",
    suggestedTab: "mission-planning",
    prerequisites: ["welcome"],
    trigger: (state) => state.missions.length === 0 && state.campaign.activeMissionId === null
  },
  {
    id: "mission-launched",
    title: "Mission Underway",
    body: "Reports are fragmentary. No new strategic decision is required until debrief.",
    suggestedTab: "current-operation",
    prerequisites: ["planning-basics"],
    trigger: (state) => Boolean(getActiveMission(state))
  },
  {
    id: "debrief-review",
    title: "Debrief",
    body: "Review what changed, what it cost, and what remains uncertain.",
    suggestedTab: "debrief",
    prerequisites: ["mission-launched"],
    trigger: (state) => state.campaign.lastDebriefMissionId !== null
  },
  {
    id: "maintenance-follow-up",
    title: "Follow Up with Maintenance",
    body: "After each debrief, inspect Maintenance for damaged or diverted aircraft. Start repairs quickly to restore sortie capacity for the next operation.",
    suggestedTab: "maintenance",
    prerequisites: ["debrief-review"],
    trigger: (state) => state.tutorial.firstLoopCompleted && state.aircraft.some((aircraft) => aircraft.status === "damaged" || aircraft.status === "diverted")
  },
  {
    id: "recon-follow-up",
    title: "Recon Underway",
    body: "Recon is already in motion. Let the sortie finish and review the interpretation before hardening the next decision.",
    suggestedTab: "recon",
    prerequisites: ["debrief-review"],
    trigger: (state) => state.tutorial.firstLoopCompleted && state.campaign.activeReconId !== null
  },
  {
    id: "recon-results",
    title: "Use Recon Interpretation",
    body: "Recon interpretation is now filed. Re-check target confidence, defense outlook, and alert level before selecting your next operation profile.",
    suggestedTab: "recon",
    prerequisites: ["recon-follow-up"],
    trigger: (state) => {
      const latestRecon = getLatestCompletedRecon(state);
      return Boolean(latestRecon && state.uiReadState.lastViewedReconId !== latestRecon.id);
    }
  },
  {
    id: "first-loop-complete",
    title: "Follow-Up",
    body: "Choose whether to exploit, confirm with recon, repair or recover, redirect, or stand down.",
    suggestedTab: "command",
    prerequisites: ["debrief-review"],
    trigger: (state) => state.missions.some((mission) => mission.debriefGenerated)
  },
  {
    id: "personnel-decisions",
    title: "Personnel Decision Pending",
    body: "A recovered original crew member can reclaim a seat from a temporary replacement. Resolve the personnel decision to stabilize crew cohesion.",
    suggestedTab: "aircraft-crews",
    prerequisites: ["first-loop-complete"],
    trigger: (state) => state.campaign.personnelDecisions.some((decision) => !decision.resolved)
  },
  {
    id: "replacement-crew",
    title: "Replacement Crew in Use",
    body: "Replacements keep aircraft flying, but too many substitutions can strain cohesion. Keep an eye on role coverage and fatigue before launch.",
    suggestedTab: "aircraft-crews",
    prerequisites: ["first-loop-complete"],
    trigger: (state) => state.crewMembers.some((member) => member.isReplacement && member.assignedAircraftId !== null)
  },
  {
    id: "command-patience",
    title: "Command Patience Is Dropping",
    body: "Command pressure is increasing. Prioritize operations that support the directive while keeping enough aircraft serviceable for sustained tempo.",
    suggestedTab: "command",
    prerequisites: ["first-loop-complete"],
    trigger: (state) => state.campaign.directiveState.commandPatience < 58
  }
];

const TUTORIAL_STEP_MAP = new Map<TutorialStepId, TutorialStepDefinition>(
  TUTORIAL_STEPS.map((step) => [step.id, step])
);

function createInitialTutorialState(): SaveState["tutorial"] {
  return {
    enabled: true,
    activeStepId: null,
    completedStepIds: [],
    firstLoopCompleted: false,
    suppressModalUntilAt: null
  };
}

function createInitialUiReadState(now: number): UiReadState {
  return {
    lastViewedCommandUpdateAt: now,
    lastViewedDebriefMissionId: null,
    lastViewedReconId: null,
    lastViewedTargetChangeAt: now,
    lastViewedMaintenanceAt: now,
    lastViewedPersonnelDecisionAt: now
  };
}

function hasCompletedTutorialStep(state: SaveState, stepId: TutorialStepId): boolean {
  return state.tutorial.completedStepIds.includes(stepId);
}

function prerequisitesMet(state: SaveState, step: TutorialStepDefinition): boolean {
  if (!step.prerequisites || step.prerequisites.length === 0) {
    return true;
  }
  return step.prerequisites.every((required) => hasCompletedTutorialStep(state, required));
}

function updateFirstLoopTutorialFlag(state: SaveState): boolean {
  const shouldBeComplete = state.missions.some((mission) => mission.debriefGenerated);
  if (state.tutorial.firstLoopCompleted === shouldBeComplete) {
    return false;
  }
  state.tutorial.firstLoopCompleted = shouldBeComplete;
  return true;
}

function findNextTutorialStep(state: SaveState): TutorialStepDefinition | null {
  for (const step of TUTORIAL_STEPS) {
    if (hasCompletedTutorialStep(state, step.id)) {
      continue;
    }
    if (!prerequisitesMet(state, step)) {
      continue;
    }
    if (!step.trigger(state)) {
      continue;
    }
    return step;
  }
  return null;
}

export function evaluateTutorial(state: SaveState): boolean {
  if (!state.tutorial.enabled) {
    return false;
  }
  if (state.tutorial.suppressModalUntilAt && getEffectiveNow(state) < state.tutorial.suppressModalUntilAt) {
    return false;
  }
  let changed = updateFirstLoopTutorialFlag(state);
  if (state.tutorial.activeStepId) {
    return changed;
  }
  const nextStep = findNextTutorialStep(state);
  if (!nextStep) {
    return changed;
  }
  state.tutorial.activeStepId = nextStep.id;
  return true;
}

export function dismissActiveTutorialStep(state: SaveState): boolean {
  const activeStepId = state.tutorial.activeStepId;
  if (!activeStepId) {
    return false;
  }
  if (!state.tutorial.completedStepIds.includes(activeStepId)) {
    state.tutorial.completedStepIds.push(activeStepId);
  }
  state.tutorial.activeStepId = null;
  evaluateTutorial(state);
  return true;
}

export function getActiveTutorialStep(state: SaveState): TutorialStepDisplay | null {
  if (!state.tutorial.enabled || !state.tutorial.activeStepId) {
    return null;
  }
  const definition = TUTORIAL_STEP_MAP.get(state.tutorial.activeStepId);
  if (!definition) {
    return null;
  }
  const suggestedTab = definition.suggestedTab ?? null;
  return {
    id: definition.id,
    title: definition.title,
    body: definition.body,
    suggestedTab,
    suggestedTabLabel: suggestedTab ? TAB_LABELS[suggestedTab] : null
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pick<T>(items: readonly T[]): T {
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

function addNotification(state: SaveState, id: string, kind: UiNotification["kind"], text: string, now: number): void {
  if (state.notifications.some((notification) => notification.id === id)) {
    return;
  }
  state.notifications.unshift({
    id,
    kind,
    text,
    createdAt: now,
    expiresAt: now + TOAST_LIFETIME_MS
  });
}

function pruneExpiredNotifications(state: SaveState, now: number): boolean {
  const next = state.notifications.filter((notification) => notification.expiresAt > now);
  if (next.length === state.notifications.length) {
    return false;
  }
  state.notifications = next;
  return true;
}

function createStationWeather(day: number): string {
  const outlooks = [
    "Station weather: fair, but coastal haze is likely by midday.",
    "Station weather: low cloud is moving in and inland visibility remains uncertain.",
    "Station weather: a clear start is expected, though staff distrusts older target forecasts.",
    "Station weather: broken cloud may complicate recon interpretation later in the day."
  ];
  return outlooks[(day - 1) % outlooks.length] as string;
}

function createInitialDirectiveState(): DirectiveState {
  return {
    fighterPressure: 78,
    fighterReplacementFlow: 74,
    regionalRepairCapacity: 71,
    warningCoordination: 69,
    approachDanger: 73,
    commandPatience: 67,
    directiveProgress: 14,
    operationsElapsed: 0,
    recentStrategicEffects: []
  };
}

function createFallbackEnemyResponseProfile(): CampaignProfile["enemyResponse"] {
  return {
    codeName: "Measured resistance",
    interceptionBias: 1,
    repairBias: 1,
    adaptationBias: 1,
    radarLeverage: 1,
    railLeverage: 1,
    repeatAttackSensitivity: 1,
    opportunityDecay: 1
  };
}

const ENEMY_PROFILE_BUNDLES: Array<{
  codeName: string;
  base: CampaignProfile["enemyResponse"];
}> = [
  {
    codeName: "Aggressive interception",
    base: {
      codeName: "Aggressive interception",
      interceptionBias: 1.16,
      repairBias: 0.96,
      adaptationBias: 1.04,
      radarLeverage: 1.08,
      railLeverage: 0.94,
      repeatAttackSensitivity: 1.08,
      opportunityDecay: 1.04
    }
  },
  {
    codeName: "Rapid repair movement",
    base: {
      codeName: "Rapid repair movement",
      interceptionBias: 0.98,
      repairBias: 1.16,
      adaptationBias: 1.02,
      radarLeverage: 0.94,
      railLeverage: 1.12,
      repeatAttackSensitivity: 0.98,
      opportunityDecay: 1.02
    }
  },
  {
    codeName: "Adaptive sector command",
    base: {
      codeName: "Adaptive sector command",
      interceptionBias: 1.02,
      repairBias: 1,
      adaptationBias: 1.16,
      radarLeverage: 1.04,
      railLeverage: 0.96,
      repeatAttackSensitivity: 1.14,
      opportunityDecay: 1.08
    }
  },
  {
    codeName: "Strained logistics",
    base: {
      codeName: "Strained logistics",
      interceptionBias: 0.94,
      repairBias: 0.9,
      adaptationBias: 0.94,
      radarLeverage: 0.96,
      railLeverage: 1.04,
      repeatAttackSensitivity: 0.96,
      opportunityDecay: 0.94
    }
  },
  {
    codeName: "Diffuse warning network",
    base: {
      codeName: "Diffuse warning network",
      interceptionBias: 0.96,
      repairBias: 1,
      adaptationBias: 1,
      radarLeverage: 1.16,
      railLeverage: 0.92,
      repeatAttackSensitivity: 1,
      opportunityDecay: 0.98
    }
  }
];

function buildTargetModMap(state: SaveState, selector: (target: Target) => number): Record<string, number> {
  return Object.fromEntries(state.targets.map((target) => [target.id, selector(target)]));
}

function validateCampaignProfile(profile: CampaignProfile): boolean {
  const viableApproaches = profile.viableApproachSummaries.length >= 2;
  const boundedPriority = Object.values(profile.targetPriorityMods).every((value) => value >= 0.8 && value <= 1.25);
  const boundedRepair = Object.values(profile.targetRepairMods).every((value) => value >= 0.75 && value <= 1.25);
  const boundedDefense = Object.values(profile.targetDefenseMods).every((value) => value >= 0.8 && value <= 1.25);
  const supportTargets = Object.entries(profile.targetPriorityMods)
    .filter(([targetId]) => targetId !== profile.primaryDirectiveTargetId)
    .map(([, value]) => value);
  const noMandatorySupport = supportTargets.filter((value) => value >= 1.12).length <= 2;
  const reachableDirective = profile.enemyResponse.repairBias * profile.enemyResponse.interceptionBias <= 1.28;
  const coherentBundle =
    profile.enemyResponse.codeName === "Aggressive interception"
      ? profile.enemyResponse.interceptionBias >= 1.08
      : profile.enemyResponse.codeName === "Rapid repair movement"
        ? profile.enemyResponse.repairBias >= 1.08
        : profile.enemyResponse.codeName === "Adaptive sector command"
          ? profile.enemyResponse.adaptationBias >= 1.08
          : true;
  return viableApproaches && boundedPriority && boundedRepair && boundedDefense && noMandatorySupport && reachableDirective && coherentBundle;
}

function createCampaignProfile(state: SaveState, now: number): CampaignProfile {
  const primaryTargetId = state.targets.find((target) => target.type === "factory")?.id ?? state.targets[0]!.id;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const bundle = pick(ENEMY_PROFILE_BUNDLES);
    const enemyResponse = {
      codeName: bundle.codeName,
      interceptionBias: clamp(bundle.base.interceptionBias + (Math.random() * 0.08 - 0.04), 0.88, 1.2),
      repairBias: clamp(bundle.base.repairBias + (Math.random() * 0.08 - 0.04), 0.86, 1.2),
      adaptationBias: clamp(bundle.base.adaptationBias + (Math.random() * 0.08 - 0.04), 0.88, 1.2),
      radarLeverage: clamp(bundle.base.radarLeverage + (Math.random() * 0.08 - 0.04), 0.86, 1.18),
      railLeverage: clamp(bundle.base.railLeverage + (Math.random() * 0.08 - 0.04), 0.86, 1.18),
      repeatAttackSensitivity: clamp(bundle.base.repeatAttackSensitivity + (Math.random() * 0.08 - 0.04), 0.88, 1.2),
      opportunityDecay: clamp(bundle.base.opportunityDecay + (Math.random() * 0.08 - 0.04), 0.88, 1.16)
    };
    const profile: CampaignProfile = {
      profileId: `profile-${now}-${attempt}`,
      generatedAt: now,
      expectedDays: DEFAULT_CAMPAIGN_DAYS,
      applicationMode: "drift_only",
      primaryDirectiveTargetId: primaryTargetId,
      enemyResponse,
      targetPriorityMods: buildTargetModMap(state, (target) => {
        if (target.type === "factory") {
          return 1.08 + Math.random() * 0.12;
        }
        if (target.type === "airfield" || target.type === "rail" || target.type === "radar") {
          return 0.9 + Math.random() * 0.25;
        }
        return 0.82 + Math.random() * 0.2;
      }),
      targetRepairMods: buildTargetModMap(state, (target) => {
        if (target.type === "rail") {
          return 0.82 + Math.random() * 0.2;
        }
        if (target.type === "factory") {
          return 0.95 + Math.random() * 0.2;
        }
        return 0.88 + Math.random() * 0.2;
      }),
      targetDefenseMods: buildTargetModMap(state, (target) => {
        if (target.type === "radar" || target.type === "defense") {
          return 0.95 + Math.random() * 0.22;
        }
        return 0.85 + Math.random() * 0.22;
      }),
      viableApproachSummaries: [
        "Direct pressure on Bremen after one preparatory disruption remains plausible.",
        "Indirect pressure through airfield, radar, or rail shaping can still open a later strike."
      ]
    };
    if (validateCampaignProfile(profile)) {
      return profile;
    }
  }
  return {
    profileId: `profile-${now}-fallback`,
    generatedAt: now,
    expectedDays: DEFAULT_CAMPAIGN_DAYS,
    applicationMode: "drift_only",
    primaryDirectiveTargetId: primaryTargetId,
    enemyResponse: createFallbackEnemyResponseProfile(),
    targetPriorityMods: buildTargetModMap(state, (target) => target.type === "factory" ? 1.1 : 1),
    targetRepairMods: buildTargetModMap(state, () => 1),
    targetDefenseMods: buildTargetModMap(state, () => 1),
    viableApproachSummaries: [
      "Direct pressure on Bremen remains viable.",
      "Support-target shaping can still create a later opening."
    ]
  };
}

function getCampaignProfileTargetMod(profile: CampaignProfile, targetId: string, kind: "priority" | "repair" | "defense"): number {
  const source =
    kind === "priority" ? profile.targetPriorityMods
      : kind === "repair" ? profile.targetRepairMods
        : profile.targetDefenseMods;
  return source[targetId] ?? 1;
}

function applyCampaignProfileToTargets(state: SaveState): void {
  for (const target of state.targets) {
    target.hiddenDefenseLevel = clamp(
      Math.round(target.hiddenDefenseLevel * getCampaignProfileTargetMod(state.campaign.profile, target.id, "defense")),
      18,
      100
    );
  }
}

function getCampaignResolutionState(state: SaveState): CampaignResolutionState {
  return state.campaign.resolutionState;
}

function isCampaignClosedToOrders(state: SaveState): boolean {
  return getCampaignResolutionState(state) !== "active";
}

function getCampaignClosedOrderMessage(state: SaveState): string | null {
  return isCampaignClosedToOrders(state) ? CAMPAIGN_CONCLUDED_MESSAGE : null;
}

function registerOperationalBeat(state: SaveState, tracker?: { count: number }): boolean {
  state.campaign.operationalBeat += 1;
  if (tracker) {
    tracker.count += 1;
  }
  return true;
}

function getResolutionPendingWorkSummary(state: SaveState): string[] {
  const pending: string[] = [];
  if (getActiveMission(state)) {
    pending.push("mission");
  }
  if (getActiveRecon(state)) {
    pending.push("recon");
  }
  if (state.repairJobs.some((job) => !job.completionApplied && state.campaign.pendingResolutionRepairIds.includes(job.id))) {
    pending.push("repair");
  }
  if (state.recoveryJobs.some((job) => !job.completionApplied && state.campaign.pendingResolutionRecoveryIds.includes(job.id))) {
    pending.push("recovery");
  }
  return pending;
}

function hasPendingResolutionWork(state: SaveState): boolean {
  if (getActiveMission(state) || getActiveRecon(state)) {
    return true;
  }
  if (state.repairJobs.some((job) => !job.completionApplied && state.campaign.pendingResolutionRepairIds.includes(job.id))) {
    return true;
  }
  if (state.recoveryJobs.some((job) => !job.completionApplied && state.campaign.pendingResolutionRecoveryIds.includes(job.id))) {
    return true;
  }
  return false;
}

function selectRelevantHooks(
  state: SaveState,
  options: { targetId?: string | null; allowEvidenceUnknown?: boolean; limit?: number; hookTypes?: string[] } = {}
): CampaignCausalHook[] {
  const limit = options.limit ?? 2;
  const filtered = state.campaign.causalHooks
    .filter((hook) => hook.state !== "resolved")
    .filter((hook) => options.allowEvidenceUnknown || hook.evidenceKnown)
    .filter((hook) => !options.targetId || hook.relatedTargetId === options.targetId || hook.relatedTargetId === null)
    .filter((hook) => !options.hookTypes || options.hookTypes.includes(hook.hookType))
    .sort((left, right) => right.strength - left.strength || right.createdAt - left.createdAt);
  return filtered.slice(0, limit);
}

function hookFlavorLine(hook: CampaignCausalHook): string {
  switch (hook.hookType) {
    case "fighter_response_softened":
      return "Staff still suspects fighter response is softer than usual, if only briefly.";
    case "repair_network_slowed":
      return "Earlier disruption still appears to be slowing repair movement around Bremen.";
    case "warning_coordination_disrupted":
      return "Warning coordination may still be less settled than the older files imply.";
    case "repeat_attack_alert":
      return "Repeated attention to the same objective may be making the defenses more watchful.";
    case "command_pressure":
      return "Higher command is increasingly impatient with indirect answers.";
    default:
      return hook.summary;
  }
}

function createOrRefreshHook(
  state: SaveState,
  input: Omit<CampaignCausalHook, "id" | "strength"> & { strength?: number }
): CampaignCausalHook {
  const existing = state.campaign.causalHooks.find((hook) =>
    hook.hookType === input.hookType
    && hook.relatedTargetId === input.relatedTargetId
    && hook.state !== "resolved"
  );
  if (existing) {
    existing.sourceId = input.sourceId;
    existing.createdDay = input.createdDay;
    existing.createdAt = input.createdAt;
    existing.state = input.state;
    existing.fadingStartsDay = input.fadingStartsDay;
    existing.fadingStartsBeat = input.fadingStartsBeat;
    existing.fadesAfterDay = input.fadesAfterDay;
    existing.fadesAfterBeat = input.fadesAfterBeat;
    existing.evidenceKnown = existing.evidenceKnown || input.evidenceKnown;
    existing.summary = input.summary;
    existing.strength = clamp(existing.strength + (input.strength ?? 1), 1, 5);
    return existing;
  }
  const hook: CampaignCausalHook = {
    id: nextId(state, "hook"),
    strength: input.strength ?? 1,
    ...input
  };
  state.campaign.causalHooks.unshift(hook);
  return hook;
}

function resolveHook(state: SaveState, hookType: string, relatedTargetId: string | null, consumedById: string | null): void {
  const hook = state.campaign.causalHooks.find((entry) =>
    entry.hookType === hookType && entry.relatedTargetId === relatedTargetId && entry.state !== "resolved"
  );
  if (!hook) {
    return;
  }
  hook.state = "resolved";
  hook.consumedById = consumedById;
}

function upsertInsight(state: SaveState, subject: string, conclusion: string, status: CampaignInsight["status"], now: number): CampaignInsight {
  const existing = state.campaign.insights.find((insight) => insight.subject === subject && insight.conclusion === conclusion);
  if (existing) {
    existing.status = status;
    existing.evidenceCount += 1;
    existing.updatedAt = now;
    return existing;
  }
  const insight: CampaignInsight = {
    id: nextId(state, "insight"),
    subject,
    conclusion,
    status,
    evidenceCount: 1,
    discoveredAt: now,
    updatedAt: now
  };
  state.campaign.insights.unshift(insight);
  return insight;
}

function addCampaignEvent(
  state: SaveState,
  kind: string,
  title: string,
  body: string,
  now: number,
  relatedTargetId: string | null = null,
  relatedHookIds: string[] = []
): void {
  const id = `${kind}-${relatedTargetId ?? "campaign"}-${state.campaign.currentDay}-${title}`.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  if (state.campaign.events.some((event) => event.id === id)) {
    return;
  }
  state.campaign.events.unshift({
    id,
    kind,
    title,
    body,
    createdAt: now,
    day: state.campaign.currentDay,
    relatedTargetId,
    relatedHookIds
  });
  addLog(state, id, now, "command", `${title}: ${body}`);
}

function maybeCreateOpportunity(
  state: SaveState,
  kind: string,
  description: string,
  sourceTargetId: string | null,
  relatedTargetId: string | null,
  beneficiaryTargetIds: string[],
  eligibleOperationTypes: OperationType[],
  eligibleRouteRisks: RouteRisk[],
  hookIds: string[],
  now: number,
  fadesAfterBeatDelta: number
): CampaignOpportunity {
  const existing = state.campaign.opportunities.find((opportunity) =>
    opportunity.kind === kind && opportunity.relatedTargetId === relatedTargetId && opportunity.state !== "resolved"
  );
  if (existing) {
    existing.state = "active";
    existing.fadingStartsDay = null;
    existing.fadesAfterDay = null;
    existing.fadingStartsBeat = state.campaign.operationalBeat + Math.max(0, fadesAfterBeatDelta - 1);
    existing.fadesAfterBeat = state.campaign.operationalBeat + fadesAfterBeatDelta;
    existing.description = description;
    existing.sourceTargetId = sourceTargetId;
    existing.beneficiaryTargetIds = beneficiaryTargetIds;
    existing.eligibleOperationTypes = eligibleOperationTypes;
    existing.eligibleRouteRisks = eligibleRouteRisks;
    existing.relatedHookIds = hookIds;
    existing.confirmedAt = null;
    existing.confirmationNote = null;
    return existing;
  }
  const opportunity: CampaignOpportunity = {
    id: nextId(state, "opportunity"),
    kind,
    description,
    createdDay: state.campaign.currentDay,
    createdAt: now,
    sourceTargetId,
    relatedTargetId,
    beneficiaryTargetIds,
    eligibleOperationTypes,
    eligibleRouteRisks,
    relatedHookIds: hookIds,
    state: "active",
    fadingStartsDay: null,
    fadingStartsBeat: state.campaign.operationalBeat + Math.max(0, fadesAfterBeatDelta - 1),
    fadesAfterDay: null,
    fadesAfterBeat: state.campaign.operationalBeat + fadesAfterBeatDelta,
    disposition: "pending",
    dispositionAt: null,
    dispositionReason: null,
    confirmedAt: null,
    confirmationNote: null
  };
  state.campaign.opportunities.unshift(opportunity);
  addCampaignEvent(state, "opportunity", "Opportunity appears", description, now, relatedTargetId, hookIds);
  return opportunity;
}

function opportunityExpiryReached(opportunity: CampaignOpportunity, state: SaveState): boolean {
  return (opportunity.fadesAfterBeat !== null && state.campaign.operationalBeat >= opportunity.fadesAfterBeat)
    || (opportunity.fadesAfterDay !== null && state.campaign.currentDay >= opportunity.fadesAfterDay);
}

function opportunityShouldFade(opportunity: CampaignOpportunity, state: SaveState): boolean {
  return (opportunity.fadingStartsBeat !== null && state.campaign.operationalBeat >= opportunity.fadingStartsBeat)
    || (opportunity.fadingStartsDay !== null && state.campaign.currentDay >= opportunity.fadingStartsDay);
}

export function isOpportunityUsable(opportunity: CampaignOpportunity, state: SaveState): boolean {
  return opportunity.disposition === "pending"
    && (opportunity.state === "active" || opportunity.state === "fading")
    && !opportunityExpiryReached(opportunity, state);
}

function isRepairNetworkBenefitTarget(target: Target | null | undefined): target is Target {
  return Boolean(target && target.hiddenActualCondition < 85);
}

export function doesOperationExploitOpportunity(
  state: SaveState,
  opportunity: CampaignOpportunity,
  targetId: string,
  operationType: OperationType,
  routeRisk: RouteRisk
): boolean {
  const targetMatch = opportunity.beneficiaryTargetIds.length === 0 || opportunity.beneficiaryTargetIds.includes(targetId);
  const operationMatch = opportunity.eligibleOperationTypes.length === 0 || opportunity.eligibleOperationTypes.includes(operationType);
  const routeMatch = opportunity.eligibleRouteRisks.length === 0 || opportunity.eligibleRouteRisks.includes(routeRisk);
  if (!targetMatch || !operationMatch || !routeMatch) {
    return false;
  }
  if (opportunity.kind === "repair_network_slowed") {
    return isRepairNetworkBenefitTarget(getTargetById(state, targetId));
  }
  return true;
}

export function getPrimaryUsableOpportunity(state: SaveState): CampaignOpportunity | null {
  return state.campaign.opportunities.find((opportunity) => isOpportunityUsable(opportunity, state)) ?? null;
}

function recordOpportunityDisposition(
  state: SaveState,
  opportunity: CampaignOpportunity,
  disposition: CampaignOpportunity["disposition"],
  reason: string,
  now: number
): void {
  if (opportunity.disposition !== "pending") {
    return;
  }
  opportunity.disposition = disposition;
  opportunity.dispositionAt = now;
  opportunity.dispositionReason = reason;
  opportunity.state = "resolved";
  for (const hookId of opportunity.relatedHookIds) {
    const hook = state.campaign.causalHooks.find((entry) => entry.id === hookId && entry.state !== "resolved");
    if (hook) {
      hook.state = "resolved";
      hook.consumedById = opportunity.id;
    }
  }
  addCampaignEvent(
    state,
    "opportunity",
    disposition === "exploited"
      ? "Opportunity exploited"
      : disposition === "lost_through_delay"
        ? "Opportunity lost"
        : disposition === "confirmed_not_exploited"
          ? "Opportunity surrendered"
          : "Opportunity resolved",
    reason,
    now,
    opportunity.relatedTargetId,
    opportunity.relatedHookIds
  );
}

function markSelectedOpportunitiesExploited(state: SaveState, mission: Mission, now: number): void {
  for (const opportunityId of mission.campaignContext?.selectedOpportunityIds ?? []) {
    const opportunity = state.campaign.opportunities.find((entry) => entry.id === opportunityId);
    if (!opportunity || !isOpportunityUsable(opportunity, state)) {
      continue;
    }
    if (doesOperationExploitOpportunity(state, opportunity, mission.plan.targetId, mission.plan.operationType, mission.plan.routeRisk)) {
      recordOpportunityDisposition(state, opportunity, "exploited", "A relevant operation was launched before the opening faded.", now);
    }
  }
}

function updateOpportunityStates(state: SaveState, now: number, beatDelta: number, dayAdvanced: boolean): void {
  if (beatDelta <= 0 && !dayAdvanced) {
    return;
  }
  for (const opportunity of state.campaign.opportunities) {
    if (opportunity.state === "resolved") {
      continue;
    }
    if (opportunityExpiryReached(opportunity, state)) {
      recordOpportunityDisposition(state, opportunity, opportunity.disposition === "pending" ? "lost_through_delay" : opportunity.disposition, "The opening faded before it was used.", now);
      continue;
    }
    if (opportunityShouldFade(opportunity, state)) {
      if (opportunity.state !== "fading") {
        addCampaignEvent(state, "opportunity", "Opportunity fading", `${opportunity.description} Staff doubts the opening will last much longer.`, now, opportunity.relatedTargetId, opportunity.relatedHookIds);
      }
      opportunity.state = "fading";
    }
  }
}

function updateHookLifecycle(state: SaveState, now: number, beatDelta: number, dayAdvanced: boolean): void {
  if (beatDelta <= 0 && !dayAdvanced) {
    return;
  }
  for (const hook of state.campaign.causalHooks) {
    if (hook.state === "resolved") {
      continue;
    }
    const shouldFade =
      (hook.fadingStartsBeat !== null && state.campaign.operationalBeat >= hook.fadingStartsBeat)
      || (hook.fadingStartsDay !== null && state.campaign.currentDay >= hook.fadingStartsDay);
    const beatExpired = hook.fadesAfterBeat !== null && state.campaign.operationalBeat >= hook.fadesAfterBeat;
    const dayExpired = hook.fadesAfterDay !== null && state.campaign.currentDay >= hook.fadesAfterDay;
    if (beatExpired || dayExpired) {
      hook.state = "resolved";
      if (hook.consumedById === null) {
        hook.consumedById = "lifecycle";
      }
      continue;
    }
    if (hook.state === "active" && shouldFade) {
      hook.state = "fading";
    }
  }
}

function getActiveOpportunityBenefitsForTarget(state: SaveState, targetId: string): CampaignOpportunity[] {
  return state.campaign.opportunities.filter((opportunity) =>
    isOpportunityUsable(opportunity, state)
    && (opportunity.beneficiaryTargetIds.length === 0 || opportunity.beneficiaryTargetIds.includes(targetId))
  );
}

const OPPORTUNITY_INFLUENCE_PRIORITY: Record<string, number> = {
  warning_coordination_disrupted: 0,
  fighter_response_softened: 1,
  repair_network_slowed: 2
};

function buildMissionCampaignContext(
  state: SaveState,
  target: Target,
  operationType: OperationType,
  routeRisk: RouteRisk
): Mission["campaignContext"] {
  const repeatedTarget = state.missions.some((mission) => mission.debriefGenerated && mission.hiddenOutcome.attackedTargetId === target.id);
  const repeatHook = repeatedTarget
    ? selectRelevantHooks(state, {
      targetId: target.id,
      allowEvidenceUnknown: true,
      limit: 1,
      hookTypes: ["repeat_attack_alert"]
    })[0] ?? null
    : null;
  const candidateOpportunities = getActiveOpportunityBenefitsForTarget(state, target.id)
    .filter((opportunity) => doesOperationExploitOpportunity(state, opportunity, target.id, operationType, routeRisk))
    .sort((left, right) =>
      (OPPORTUNITY_INFLUENCE_PRIORITY[left.kind] ?? Number.MAX_SAFE_INTEGER) - (OPPORTUNITY_INFLUENCE_PRIORITY[right.kind] ?? Number.MAX_SAFE_INTEGER)
      || left.createdAt - right.createdAt
      || left.id.localeCompare(right.id)
    );
  const context: NonNullable<Mission["campaignContext"]> = {
    contextVersion: 1,
    enemyProfileLabel: state.campaign.profile.enemyResponse.codeName,
    profileTraits: {
      interceptionBias: state.campaign.profile.enemyResponse.interceptionBias,
      repairBias: state.campaign.profile.enemyResponse.repairBias,
      adaptationBias: state.campaign.profile.enemyResponse.adaptationBias,
      radarLeverage: state.campaign.profile.enemyResponse.radarLeverage,
      railLeverage: state.campaign.profile.enemyResponse.railLeverage,
      repeatAttackSensitivity: state.campaign.profile.enemyResponse.repeatAttackSensitivity,
      opportunityDecay: state.campaign.profile.enemyResponse.opportunityDecay
    },
    selectedHookIds: [],
    selectedOpportunityIds: [],
    riskModifiers: [],
    reportModifiers: [],
    repeatedTarget,
    adaptationRiskApplied: false
  };
  const addRisk = (key: string, amount: number, reason: string) => {
    if (amount === 0) {
      return;
    }
    context.riskModifiers.push({ key, amount, reason });
  };
  const addReport = (key: string, amount: number, reason: string) => {
    context.reportModifiers.push({ key, amount, reason });
  };
  addRisk("interception_bias", Math.round((context.profileTraits.interceptionBias - 1) * 18), "Enemy response profile");
  addRisk("route_pressure", Math.round((state.campaign.directiveState.warningCoordination - 50) / 8), "Current warning coordination");
  let influenceSlotsRemaining = 2;
  for (const opportunity of candidateOpportunities) {
    if (influenceSlotsRemaining <= 0) {
      break;
    }
    if (opportunity.kind === "fighter_response_softened") {
      addRisk("fighter_response_softened", -8, "Earlier pressure appears to have softened fighter response.");
      addReport("fighter_response_softened", 1, "Crews may meet a slower and less concentrated response.");
      context.selectedOpportunityIds.push(opportunity.id);
      influenceSlotsRemaining -= 1;
      continue;
    }
    if (opportunity.kind === "warning_coordination_disrupted") {
      addRisk("warning_coordination_disrupted", routeRisk === "direct" || operationType === "main_strike" ? -9 : -5, "Radar disruption may weaken warning coordination.");
      addReport("warning_coordination_disrupted", 1, "Interception may be less coordinated than staff feared.");
      context.selectedOpportunityIds.push(opportunity.id);
      influenceSlotsRemaining -= 1;
      continue;
    }
    if (opportunity.kind === "repair_network_slowed") {
      addRisk("repair_network_slowed", -2, "Earlier disruption may be holding older damage in place.");
      addReport("repair_network_slowed", 1, "Older damage may be holding longer than expected.");
      context.selectedOpportunityIds.push(opportunity.id);
      influenceSlotsRemaining -= 1;
    }
  }
  if (repeatHook && influenceSlotsRemaining > 0) {
    const repeatRisk = Math.round((context.profileTraits.repeatAttackSensitivity + context.profileTraits.adaptationBias - 2) * 10) + 4;
    if (repeatRisk !== 0) {
      addRisk("repeat_attack_alert", repeatRisk, "Enemy defenses may be adapting to repeated visits.");
      addReport("repeat_attack_alert", 1, "Defenses may be unusually alert to another visit.");
      context.selectedHookIds.push(repeatHook.id);
      context.adaptationRiskApplied = repeatRisk > 0;
    }
  }
  return context;
}

function missionContextRiskTotal(context: Mission["campaignContext"]): number {
  if (!context) {
    return 0;
  }
  return context.riskModifiers.reduce((sum, modifier) => sum + modifier.amount, 0);
}

function describeContextualReport(
  stage: MissionStage,
  baseText: string,
  context: Mission["campaignContext"]
): string {
  if (!context || context.reportModifiers.length === 0) {
    return baseText;
  }
  const reasons = new Set(context.reportModifiers.map((modifier) => modifier.key));
  if (stage === "outbound" && reasons.has("warning_coordination_disrupted")) {
    return `${baseText} Wireless reports suggest interception is less coordinated than on earlier routes.`;
  }
  if (stage === "target_area" && reasons.has("repeat_attack_alert")) {
    return `${baseText} Several crews believe the defenses were waiting for another visit.`;
  }
  if (stage === "withdrawal" && reasons.has("fighter_response_softened")) {
    return `${baseText} Fighter contact appears slower and less concentrated than staff feared.`;
  }
  if (stage === "debrief_ready" && reasons.has("repair_network_slowed")) {
    return `${baseText} Staff suspects earlier damage may be holding longer than expected.`;
  }
  return baseText;
}

function applyMissionCampaignConsequences(state: SaveState, mission: Mission, target: Target, now: number): void {
  const hookIds: string[] = [];
  const opportunityDecay = state.campaign.profile.enemyResponse.opportunityDecay;
  const opportunityBeatDelta = opportunityDecay <= 0.95
    ? 3
    : opportunityDecay >= 1.08
      ? (chance(0.5) ? 1 : 2)
      : 2;
  if (mission.hiddenOutcome.targetDamage >= 12) {
    if (target.type === "airfield") {
      const hook = createOrRefreshHook(state, {
        hookType: "fighter_response_softened",
        sourceId: mission.id,
        relatedTargetId: target.id,
        createdDay: state.campaign.currentDay,
        createdAt: now,
        state: "active",
        fadingStartsDay: null,
        fadingStartsBeat: state.campaign.operationalBeat + Math.max(0, opportunityBeatDelta - 1),
        fadesAfterDay: null,
        fadesAfterBeat: state.campaign.operationalBeat + opportunityBeatDelta,
        evidenceKnown: true,
        consumedById: null,
        summary: "A successful airfield strike may have softened fighter response for a short window."
      });
      hookIds.push(hook.id);
      maybeCreateOpportunity(
        state,
        "fighter_response_softened",
        "Staff believes fighter response may stay softer through the current operational window.",
        target.id,
        target.id,
        state.targets.filter((entry) => entry.type !== "airfield").map((entry) => entry.id),
        ["main_strike", "reduced_strike", "follow_up_attack"],
        [],
        hookIds,
        now,
        opportunityBeatDelta
      );
      upsertInsight(state, "fighter-response", "Intelligence increasingly suspects near-term fighter response can be blunted by pressure on the airfield network.", state.campaign.insights.some((entry) => entry.subject === "fighter-response") ? "established" : "emerging", now);
    }
    if (target.type === "rail") {
      const hook = createOrRefreshHook(state, {
        hookType: "repair_network_slowed",
        sourceId: mission.id,
        relatedTargetId: target.id,
        createdDay: state.campaign.currentDay,
        createdAt: now,
        state: "active",
        fadingStartsDay: null,
        fadingStartsBeat: state.campaign.operationalBeat + Math.max(0, opportunityBeatDelta - 1),
        fadesAfterDay: null,
        fadesAfterBeat: state.campaign.operationalBeat + opportunityBeatDelta,
        evidenceKnown: true,
        consumedById: null,
        summary: "The earlier rail disruption may be slowing repair movement into Bremen."
      });
      hookIds.push(hook.id);
      const beneficiaryIds = (target.connectedTargetIds.length > 0 ? target.connectedTargetIds : [state.campaign.profile.primaryDirectiveTargetId])
        .filter((targetId, index, ids) => ids.indexOf(targetId) === index)
        .filter((targetId) => {
          const beneficiary = getTargetById(state, targetId);
          return Boolean(beneficiary && beneficiary.hiddenActualCondition <= 84);
        });
      if (beneficiaryIds.length > 0) {
        maybeCreateOpportunity(
          state,
          "repair_network_slowed",
          "Repair traffic appears slowed. A follow-up strike may land before the damage is erased.",
          target.id,
          target.id,
          beneficiaryIds,
          ["main_strike", "follow_up_attack", "reduced_strike"],
          [],
          hookIds,
          now,
          opportunityBeatDelta
        );
      }
      upsertInsight(state, "repair-network", "Intelligence increasingly suspects unusually rapid repair movement can be interrupted through rail disruption.", state.campaign.insights.some((entry) => entry.subject === "repair-network") ? "established" : "emerging", now);
    }
    if (target.type === "radar") {
      const hook = createOrRefreshHook(state, {
        hookType: "warning_coordination_disrupted",
        sourceId: mission.id,
        relatedTargetId: target.id,
        createdDay: state.campaign.currentDay,
        createdAt: now,
        state: "active",
        fadingStartsDay: null,
        fadingStartsBeat: state.campaign.operationalBeat + Math.max(0, opportunityBeatDelta - 1),
        fadesAfterDay: null,
        fadesAfterBeat: state.campaign.operationalBeat + opportunityBeatDelta,
        evidenceKnown: true,
        consumedById: null,
        summary: "Radar disruption may have unsettled warning coordination along the route."
      });
      hookIds.push(hook.id);
      maybeCreateOpportunity(
        state,
        "warning_coordination_disrupted",
        "Staff believes route warning coordination may still be unsettled.",
        target.id,
        target.id,
        state.targets.filter((entry) => entry.type === "factory" || entry.type === "defense").map((entry) => entry.id),
        ["main_strike", "reduced_strike", "follow_up_attack"],
        ["direct"],
        hookIds,
        now,
        opportunityBeatDelta
      );
      upsertInsight(state, "warning-coordination", "Repeated reports suggest interception control depends heavily on coastal radar.", state.campaign.insights.some((entry) => entry.subject === "warning-coordination") ? "established" : "emerging", now);
    }
  }
  const attacksOnTarget = state.missions.filter((entry) =>
    entry.debriefGenerated && entry.hiddenOutcome.attackedTargetId === target.id
  ).length;
  if (attacksOnTarget >= 2) {
    createOrRefreshHook(state, {
      hookType: "repeat_attack_alert",
      sourceId: mission.id,
      relatedTargetId: target.id,
      createdDay: state.campaign.currentDay,
      createdAt: now,
      state: "active",
      fadingStartsDay: null,
      fadingStartsBeat: state.campaign.operationalBeat + opportunityBeatDelta,
      fadesAfterDay: null,
      fadesAfterBeat: state.campaign.operationalBeat + opportunityBeatDelta + 1,
      evidenceKnown: mission.hiddenOutcome.targetDamage <= 0,
      consumedById: null,
      summary: "Enemy defenses appear to be adapting to repeated attacks on the same objective."
    });
    upsertInsight(state, "defense-adaptation", "Enemy defenses appear to be adapting to repeated attacks on the same objective.", attacksOnTarget >= 3 ? "established" : "emerging", now);
  }
}

function applyReconCampaignConsequences(state: SaveState, recon: ReconMission, target: Target, now: number): void {
  if (recon.type === "post_strike") {
    const opportunity = state.campaign.opportunities.find((entry) =>
      entry.state !== "resolved"
      && entry.disposition === "pending"
      && (entry.relatedTargetId === target.id || entry.beneficiaryTargetIds.includes(target.id))
    );
    if (opportunity) {
      opportunity.confirmedAt = now;
      opportunity.confirmationNote = "Recon clarified the opening, but the choice to exploit it still remains.";
      addCampaignEvent(state, "opportunity", "Opportunity confirmed", opportunity.confirmationNote, now, opportunity.relatedTargetId, opportunity.relatedHookIds);
    }
  }
  if (target.type === "factory" && recon.resultQuality === "clear") {
    upsertInsight(state, "bremen-vulnerability", "Recon increasingly suggests the Bremen works can be held down if follow-up pressure arrives before repairs settle.", state.campaign.insights.some((entry) => entry.subject === "bremen-vulnerability") ? "established" : "emerging", now);
  }
}

function getGroupEffectivenessScore(state: SaveState): number {
  const available = state.aircraft.filter((aircraft) => aircraft.status === "serviceable").length;
  const lost = state.aircraft.filter((aircraft) => aircraft.status === "lost").length;
  const wounded = state.crewMembers.filter((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded").length;
  return clamp(available * 16 - lost * 10 - wounded * 2 + state.campaign.directiveState.commandPatience / 4, 0, 100);
}

function getCampaignPhaseLabel(phase: CampaignPhase): string {
  switch (phase) {
    case "opening":
      return "Opening";
    case "pressure":
      return "Pressure";
    case "opportunity":
      return "Opportunity";
    case "crisis":
      return "Crisis";
    case "commitment":
      return "Commitment";
    case "resolution":
      return "Resolution";
    default:
      return "Campaign";
  }
}

function computeCampaignPhase(state: SaveState): CampaignPhase {
  if (state.campaign.resolutionState !== "active") {
    return "resolution";
  }
  if (getGroupEffectivenessScore(state) < 34 || hasReadinessCrisis(state)) {
    return "crisis";
  }
  if (getPrimaryUsableOpportunity(state)) {
    return "opportunity";
  }
  if (state.campaign.directiveState.commandPatience < 42 || state.campaign.currentDay >= Math.max(5, state.campaign.expectedDurationDays - 2)) {
    return "commitment";
  }
  if (state.missions.some((mission) => mission.debriefGenerated)) {
    return "pressure";
  }
  return "opening";
}

function setCampaignPhase(state: SaveState, phase: CampaignPhase, now: number): void {
  if (state.campaign.campaignPhaseId === phase) {
    return;
  }
  state.campaign.campaignPhaseId = phase;
  state.campaign.campaignPhase = `${getCampaignPhaseLabel(phase)} phase. ${phase === "resolution" ? "The campaign is drawing to its close." : "Staff is revising the group posture."}`;
  addCampaignEvent(state, "phase", `${getCampaignPhaseLabel(phase)} phase`, state.campaign.campaignPhase, now);
}

function detectCampaignEndCondition(state: SaveState): CampaignEndCondition | null {
  if (state.campaign.evaluation) {
    return state.campaign.evaluation.endCondition;
  }
  const effectiveness = getGroupEffectivenessScore(state);
  if (state.campaign.directiveState.directiveProgress >= 72 && effectiveness >= 42) {
    return "directive_complete";
  }
  if (effectiveness < 20 || state.aircraft.filter((aircraft) => aircraft.status === "lost").length >= 3) {
    return "group_collapse";
  }
  if (state.campaign.directiveState.commandPatience <= 12) {
    return "command_relief";
  }
  if (
    state.campaign.currentDay > state.campaign.expectedDurationDays
    && (Boolean(getPrimaryUsableOpportunity(state)) || Boolean(getActiveMission(state)))
  ) {
    state.campaign.extensionReason = "A final opportunity or committed operation is still in motion.";
    return null;
  }
  if (state.campaign.currentDay > state.campaign.expectedDurationDays && !getPrimaryUsableOpportunity(state)) {
    return "window_exhausted";
  }
  return null;
}

function markCampaignResolutionPending(state: SaveState, endCondition: CampaignEndCondition, now: number): void {
  if (state.campaign.resolutionState !== "active") {
    return;
  }
  state.campaign.resolutionState = "pending";
  state.campaign.pendingEndCondition = endCondition;
  state.campaign.pendingResolutionDetectedAt = now;
  state.campaign.pendingResolutionReason = endCondition.replaceAll("_", " ");
  state.campaign.pendingResolutionMissionIds = state.missions.filter((mission) => !mission.debriefGenerated).map((mission) => mission.id);
  state.campaign.pendingResolutionReconIds = state.reconMissions.filter((recon) => !recon.completionApplied).map((recon) => recon.id);
  state.campaign.pendingResolutionRepairIds = state.repairJobs.filter((job) => !job.completionApplied).map((job) => job.id);
  state.campaign.pendingResolutionRecoveryIds = state.recoveryJobs.filter((job) => !job.completionApplied).map((job) => job.id);
  state.campaign.pendingDecisions = ["The campaign is closing. Allow committed work to finish; no new operational orders may be issued."];
  addCampaignEvent(
    state,
    "resolution-pending",
    "Resolution pending",
    "An end condition has been reached. Already-committed work will be allowed to finish before the campaign is judged.",
    now
  );
}

function generateCampaignEvaluation(state: SaveState, now: number): CampaignEvaluation {
  const endCondition = state.campaign.pendingEndCondition ?? detectCampaignEndCondition(state) ?? "window_exhausted";
  const effectiveness = getGroupEffectivenessScore(state);
  const losses = state.aircraft.filter((aircraft) => aircraft.status === "lost").length;
  const exploited = state.campaign.opportunities.filter((entry) => entry.disposition === "exploited").length;
  const missed = state.campaign.opportunities.filter((entry) => entry.disposition === "lost_through_delay" || entry.disposition === "ignored").length;
  const judgment =
    endCondition === "directive_complete" && effectiveness >= 55
      ? "Decisive success, group still effective"
      : endCondition === "directive_complete"
        ? "Directive achieved at severe cost"
        : endCondition === "group_collapse"
          ? "Group relieved after unacceptable losses"
          : endCondition === "command_relief"
            ? "Campaign inconclusive under command pressure"
            : effectiveness >= 45
              ? "Useful partial success with force preserved"
              : "Main directive unresolved";
  const notableChains = [
    state.campaign.causalHooks[0]?.summary ?? "The last campaign effects remained difficult to disentangle.",
    state.campaign.insights[0]?.conclusion ?? "Staff never completely solved the enemy's local pattern."
  ].slice(0, 2);
  return {
    generatedAt: now,
    endCondition,
    judgment,
    summary: `Campaign result filed. ${judgment}. ${getDirectiveProgressSummary(state).progress.replace("Progress: ", "")} ${getDirectiveProgressSummary(state).groupCondition.replace("Group condition: ", "")}`,
    commandJudgment: state.campaign.directiveState.commandPatience < 30
      ? "Higher command judged the campaign increasingly harshly by the end."
      : "Higher command judged the campaign as a meaningful use of a strained force.",
    staffJudgment: exploited > missed
      ? "Staff believes the group recognized and used more openings than it wasted."
      : "Staff believes the group saw opportunities, but too many slipped while the picture remained uncertain.",
    directiveAssessment: getDirectiveProgressSummary(state).progress,
    groupAssessment: buildGroupConditionText(state),
    lossesAssessment: `${losses} aircraft lost. ${roleLossText(state)}`,
    opportunityAssessment: `${exploited} opportunities exploited, ${missed} missed or lost through delay.`,
    notableChains
  };
}

function maybeFinalizeCampaign(state: SaveState, now: number): void {
  if (state.campaign.evaluation || state.campaign.frozenFinalState) {
    return;
  }
  const endCondition = detectCampaignEndCondition(state);
  if (state.campaign.resolutionState === "active" && endCondition) {
    markCampaignResolutionPending(state, endCondition, now);
  }
  if (state.campaign.resolutionState !== "pending" || hasPendingResolutionWork(state)) {
    return;
  }
  state.campaign.evaluation = generateCampaignEvaluation(state, now);
  state.campaign.resolutionState = "finalized";
  state.campaign.finalSummaryMode = true;
  state.campaign.frozenFinalState = true;
  state.campaign.campaignPhaseId = "resolution";
  state.campaign.campaignPhase = "Campaign concluded. Final summary follows.";
  state.campaign.pendingDecisions = [];
  addCampaignEvent(state, "campaign-final", "Campaign concluded", state.campaign.evaluation.summary, now);
}

function randomName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function rankForRole(role: CrewSpecialty): string {
  switch (role) {
    case "pilot":
      return "Capt.";
    case "copilot":
      return "1st Lt.";
    case "navigator":
      return "Lt.";
    case "bombardier":
      return "Lt.";
    case "engineer_top_turret":
      return "T/Sgt.";
    case "radio_operator":
      return "S/Sgt.";
    case "ball_turret":
    case "left_waist":
    case "right_waist":
    case "tail_gunner":
    case "enlisted_airman":
      return "Sgt.";
  }
}

function roleLabel(role: CrewRole | CrewSpecialty): string {
  return role.replaceAll("_", " ");
}

function experienceMod(experience: CrewExperience): number {
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

function shiftFatigue(fatigue: CrewFatigue, steps: number): CrewFatigue {
  const ladder: CrewFatigue[] = ["rested", "tired", "exhausted"];
  return ladder[clamp(ladder.indexOf(fatigue) + steps, 0, ladder.length - 1)] as CrewFatigue;
}

function recoverFatigue(fatigue: CrewFatigue, steps: number): CrewFatigue {
  const ladder: CrewFatigue[] = ["rested", "tired", "exhausted"];
  return ladder[clamp(ladder.indexOf(fatigue) - steps, 0, ladder.length - 1)] as CrewFatigue;
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

function raiseConfidence(confidence: Target["intelConfidence"]): Target["intelConfidence"] {
  if (confidence === "poor") {
    return "fair";
  }
  return "good";
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

function defaultVisibleDefenseAssessment(intelConfidence: Target["intelConfidence"], alertLevel: AlertLevel): string {
  if (intelConfidence === "poor") {
    return "The defense picture is incomplete and may already be out of date.";
  }
  if (alertLevel === "high") {
    return "Defenses are believed alert and potentially stubborn around the target.";
  }
  if (alertLevel === "elevated") {
    return "Some organized defense is expected, though the exact weight remains uncertain.";
  }
  return "Only a modest public defense estimate is on file.";
}

function buildVisibleDefenseAssessment(target: Target, assessment: string, sourceLabel: string): string {
  if (/obscured|no reliable|contradictory|uncertain/i.test(assessment) || /Debrief note/i.test(sourceLabel)) {
    return "The defense estimate remains stale and uncertain after the latest reports.";
  }
  if (target.intelConfidence === "poor") {
    return "The public defense estimate remains rough and should not be treated as settled.";
  }
  if (target.alertLevel === "high") {
    return "Crews believe the target defenses remain alert and difficult to read cleanly.";
  }
  if (target.alertLevel === "elevated") {
    return "Crews report noticeable defenses, though the exact strength is still uncertain.";
  }
  return "The latest file suggests lighter organized defense than the older folders implied.";
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

function missionDurationForTarget(target: Target): number {
  return target.type === "factory" || target.type === "defense" ? MAJOR_MISSION_MS : SHORT_MISSION_MS;
}

function createPlanningState(targetId: string): PlanningState {
  return {
    selectedTargetId: targetId,
    operationType: "main_strike",
    secondaryTargetId: null,
    leadAircraftId: "aircraft-1",
    assignedAircraftIds: ["aircraft-1", "aircraft-2", "aircraft-3", "aircraft-4"],
    routeRisk: "standard",
    attackDoctrine: "single_pass",
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

function stageReport(
  stage: MissionStage,
  target: Target,
  riskWord: string,
  visibility: string,
  context: {
    operationType: OperationType;
    weather: string;
    targetType: TargetType;
    leadLabel: string;
    aircraftCount: number;
    hasLossRisk: boolean;
    hasDiversionRisk: boolean;
    missionContext: Mission["campaignContext"];
  }
): { text: string; source: MissionEvent["source"]; confidence: MissionEvent["confidence"] } {
  let report: { text: string; source: MissionEvent["source"]; confidence: MissionEvent["confidence"] };
  switch (stage) {
    case "takeoff":
      report = {
        text: pickOne([
          "Tower reports the force has begun departing in sequence. Visibility over the field is serviceable, though exact assembly timing remains uncertain.",
          context.aircraftCount >= 4
            ? "Tower reports a steady stream leaving the field. Ground staff cautions that assembly may take time with a package this large."
            : "Tower reports the smaller force lifting cleanly enough, though the full order of departure is still being sorted."
        ]),
        source: "tower",
        confidence: "confirmed"
      };
      break;
    case "assembly":
      report = {
        text: pickOne([
          context.leadLabel === "Trusted lead"
            ? "Group Operations believes the formation is climbing into place in reasonably good order, though the picture remains fragmentary."
            : "Group Operations believes the formation is climbing into place. Some gaps have been reported, but the overall picture remains fragmentary.",
          context.operationType === "reduced_strike"
            ? "Assembly reports suggest the reduced force is forming without much drama, though no one is claiming a perfectly tidy picture."
            : "Wireless traffic suggests the formation is still sorting itself out above the field. Staff is withholding judgment on cohesion."
        ]),
        source: "group_operations",
        confidence: "fragmentary"
      };
      break;
    case "outbound":
      report = {
        text: pickOne([
          `Observers judge the route ${riskWord}. Wireless traffic suggests the force is approaching the enemy coast, though direct contact is incomplete.`,
          `Operations reports ${context.weather.toLowerCase()} on the route. The outbound stream is believed to be holding together, but only in fragments.`,
          context.operationType === "support_raid"
            ? "The lighter raid appears to be outbound on schedule. Staff believes the route is manageable, though the enemy picture is not yet firm."
            : "Observers believe the force is nearing the enemy coast. Radio traffic remains patchy enough that staff is avoiding tidy conclusions."
        ]),
        source: "group_operations",
        confidence: "estimated"
      };
      break;
    case "target_area":
      report = {
        text: pickOne([
          `Lead crews report ${visibility} over ${target.name}. Bombing is believed to have been carried out, but the exact aiming point cannot yet be confirmed.`,
          context.targetType === "airfield"
            ? `Crews report ${visibility} over the airfield approaches. Bombing is believed to have gone in, though the visible effect is still disputed.`
            : `Target-area reports remain hazy. Crews describe ${visibility} conditions over ${target.name}, with no clean agreement yet on the fall of bombs.`,
          context.leadLabel === "Questionable lead"
            ? `Wireless traffic from the target area is confused. Staff believes an attack was attempted under ${visibility} conditions, but the picture is uneven.`
            : `Lead elements report ${visibility} over ${target.name}. A strike appears to have been pressed, though no firm assessment is yet trusted.`
        ]),
        source: "lead_aircraft",
        confidence: "probable"
      };
      break;
    case "withdrawal":
      report = {
        text: pickOne([
          context.hasLossRisk || context.hasDiversionRisk
            ? "Coastal watchers report the stream returning in fragments. Counting is unreliable, and at least one aircraft may be overdue."
            : "The homeward stream is scattered but moving. Tower has been warned to expect staggered arrivals rather than a neat return.",
          "Wireless traffic suggests confusion near the coast. Staff is withholding judgment until landings begin.",
          "Group Operations has no clean count yet on the withdrawing force. Several elements appear separated on the return."
        ]),
        source: "coastal_observer",
        confidence: "estimated"
      };
      break;
    case "recovery":
      report = {
        text: pickOne([
          "Aircraft are reported landing or diverting in ones and twos. Engineering is beginning to sort rumor from fact.",
          context.hasDiversionRisk
            ? "Recovery reports remain uneven. Some aircraft are landing normally, while others appear to be straggling or diverting."
            : "Landing reports are coming in steadily, though staff still lacks a perfectly trusted count of every aircraft."
        ]),
        source: "tower",
        confidence: "confirmed"
      };
      break;
    case "debrief_ready":
      report = {
        text: pickOne([
          "Crews are available for debrief. Intelligence requests a provisional assessment before recommending the next move.",
          "Returning crews are now in position to be heard. Staff expects the next useful judgment to come from debrief rather than rumor.",
          "Debrief can begin. Operations and intelligence both warn that the broad meaning of the sortie may still be hazy."
        ]),
        source: "crew_debrief",
        confidence: "confirmed"
      };
      break;
    default:
      report = {
        text: `${target.name} remains under observation.`,
        source: "intelligence",
        confidence: "unverified"
      };
      break;
  }
  return {
    ...report,
    text: describeContextualReport(stage, report.text, context.missionContext)
  };
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

function fuzzyTimeUntil(now: number, timestamp: number, exact: boolean): string {
  if (exact) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  const diffMinutes = Math.max(0, Math.round((timestamp - now) / 60000));
  if (diffMinutes <= 1) {
    return "imminently";
  }
  if (diffMinutes <= 4) {
    return "shortly";
  }
  if (diffMinutes <= 9) {
    return "before long";
  }
  return "later today";
}

function pickOne<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)]!;
}

function createCrewMember(
  state: SaveState,
  role: CrewSpecialty,
  assignedAircraftId: string | null,
  originalAircraftId: string | null,
  nameOverride?: string
): CrewMember {
  const name = nameOverride ?? `${rankForRole(role)} ${randomName()}`;
  return {
    id: nextId(state, "crew-member"),
    name,
    rank: rankForRole(role),
    role,
    currentAssignmentRole: role === "enlisted_airman" ? null : role,
    status: assignedAircraftId ? "fit" : "unassigned",
    fatigue: "rested",
    morale: "steady",
    experience: chance(0.18) ? "veteran" : chance(0.35) ? "green" : "regular",
    missionsFlown: 0,
    assignedAircraftId,
    originalAircraftId,
    isReplacement: assignedAircraftId === null,
    isPermanentReplacement: false,
    injurySeverity: "none",
    recoveryAvailableAt: null,
    notes: assignedAircraftId ? "No unusual remarks." : "Held in the replacement pool."
  };
}

function assignCrewMemberToAircraft(member: CrewMember, aircraftId: string, role: CrewRole): void {
  member.assignedAircraftId = aircraftId;
  member.currentAssignmentRole = role;
  member.status = member.status === "unassigned" ? "fit" : member.status;
  member.notes = member.isReplacement
    ? "Assigned from the replacement pool and still settling with the crew."
    : member.notes;
}

function getRoleForRecoveredOriginal(member: CrewMember): CrewRole | null {
  if (member.role === "enlisted_airman") {
    return null;
  }
  return member.role;
}

function ensureAircraftRoleAssignments(state: SaveState): void {
  for (const aircraft of state.aircraft) {
    aircraft.assignedCrewMemberIds = state.crewMembers
      .filter((member) => member.assignedAircraftId === aircraft.id)
      .map((member) => member.id);
  }
}

function deriveCrewSummaryForAircraft(state: SaveState, aircraft: Aircraft): Aircrew {
  const manifest = getCrewMembersForAircraft(state, aircraft.id);
  const pilot = manifest.find((member) => member.currentAssignmentRole === "pilot");
  const avgExperienceScore = manifest.reduce((sum, member) => {
    return sum + (member.experience === "veteran" ? 2 : member.experience === "regular" ? 1 : 0);
  }, 0) / Math.max(1, manifest.length);
  const fatigueScore = manifest.reduce((sum, member) => {
    return sum + (member.fatigue === "exhausted" ? 2 : member.fatigue === "tired" ? 1 : 0);
  }, 0);
  const woundedCount = manifest.filter((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded").length;
  const missingCount = manifest.filter((member) => member.status === "missing" || member.status === "kia" || member.status === "pow").length;
  const status: CrewStatus =
    missingCount > 0
      ? "missing"
      : woundedCount > 0
        ? "lightly_wounded"
        : fatigueScore > 6
          ? "resting"
          : "fit";
  const fatigue: CrewFatigue =
    fatigueScore >= 8 ? "exhausted" : fatigueScore >= 3 ? "tired" : "rested";
  const morale: CrewMorale = manifest.some((member) => member.morale === "brittle")
    ? "brittle"
    : manifest.some((member) => member.morale === "shaken")
      ? "shaken"
      : "steady";
  return {
    id: aircraft.assignedCrewId,
    assignedAircraftId: aircraft.id,
    pilotName: pilot?.name ?? "No fit pilot assigned",
    experience: avgExperienceScore >= 1.5 ? "veteran" : avgExperienceScore >= 0.8 ? "regular" : "green",
    fatigue,
    morale,
    status,
    missionCount: manifest.reduce((sum, member) => sum + member.missionsFlown, 0),
    familiarityAircraftId: aircraft.id,
    notes: aircraft.lastCrewIssueNote
  };
}

function syncDerivedCrews(state: SaveState): void {
  state.crews = state.aircraft.map((aircraft) => deriveCrewSummaryForAircraft(state, aircraft));
}

function createInitialCrewManifest(state: SaveState, aircraftId: string, pilotName: string): CrewMember[] {
  return CREW_ROLES.map((role, index) => {
    const roleType: CrewSpecialty = role;
    const member = createCrewMember(
      state,
      roleType,
      aircraftId,
      aircraftId,
      role === "pilot" ? pilotName : undefined
    );
    member.experience =
      role === "pilot" && index === 0 ? "veteran" : chance(0.2) ? "green" : "regular";
    return member;
  });
}

function createReplacementPool(state: SaveState): CrewMember[] {
  const roles: CrewSpecialty[] = [
    "pilot",
    "copilot",
    "navigator",
    "bombardier",
    "enlisted_airman",
    "enlisted_airman",
    "enlisted_airman",
    "enlisted_airman"
  ];
  return roles.map((role) => createCrewMember(state, role, null, null));
}

function buildAircraftIssueNote(state: SaveState, aircraft: Aircraft): string {
  const manifest = getCrewMembersForAircraft(state, aircraft.id);
  const serious = manifest.filter((member) => member.status === "seriously_wounded").length;
  const light = manifest.filter((member) => member.status === "lightly_wounded").length;
  const replacements = manifest.filter((member) => member.isReplacement).length;
  if (serious > 0) {
    return `${aircraft.name} has ${serious} seriously wounded crew member${serious === 1 ? "" : "s"} and will need replacements.`;
  }
  if (light > 0) {
    return `${aircraft.name} has ${light} lightly wounded crew member${light === 1 ? "" : "s"} still recovering.`;
  }
  if (replacements > 0) {
    return `${aircraft.name} is flying with ${replacements} replacement crew member${replacements === 1 ? "" : "s"}.`;
  }
  return "No current crew issue note.";
}

export function createNewGame(now: number): SaveState {
  const state = {
    version: SAVE_VERSION,
    lastReconciledAt: now,
    nextId: 1,
    selectedTab: "command",
    campaign: {
      currentDay: 1,
      commandDirective: "Reduce enemy fighter pressure in the Bremen sector.",
      commandStanding: "High command wants a prompt operation, but not a wasted one.",
      campaignPhase: "Awaiting your first operation order.",
      campaignPhaseId: "opening",
      activeMissionId: null,
      activeReconId: null,
      lastDebriefMissionId: null,
      logEntries: [],
      pendingDecisions: ["Choose the first operation target."],
      personnelDecisions: [],
      stationWeather: createStationWeather(1),
      latestIntelUpdate: null,
      latestStrategicIntelNote: null,
      latestWaitNote: null,
      pendingTimeAdvanceKind: null,
      consequenceLedger: [],
      directiveState: createInitialDirectiveState(),
      profile: {
        profileId: "pending",
        generatedAt: now,
        expectedDays: DEFAULT_CAMPAIGN_DAYS,
        applicationMode: "drift_only" as CampaignProfile["applicationMode"],
        primaryDirectiveTargetId: "target-1",
        enemyResponse: createFallbackEnemyResponseProfile(),
        targetPriorityMods: {} as Record<string, number>,
        targetRepairMods: {} as Record<string, number>,
        targetDefenseMods: {} as Record<string, number>,
        viableApproachSummaries: [] as string[]
      },
      expectedDurationDays: DEFAULT_CAMPAIGN_DAYS,
      extensionReason: null,
      operationalBeat: 0,
      causalHooks: [],
      opportunities: [],
      insights: [],
      events: [],
      resolutionState: "active",
      pendingEndCondition: null,
      pendingResolutionDetectedAt: null,
      pendingResolutionReason: null,
      pendingResolutionMissionIds: [],
      pendingResolutionReconIds: [],
      pendingResolutionRepairIds: [],
      pendingResolutionRecoveryIds: [],
      evaluation: null,
      finalSummaryMode: false,
      frozenFinalState: false
    },
    aircraft: [] as Aircraft[],
    crews: [] as Aircrew[],
    crewMembers: [] as CrewMember[],
    groundCrews: [
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
    ],
    targets: [] as Target[],
    missions: [] as Mission[],
    repairJobs: [] as RepairJob[],
    recoveryJobs: [] as RecoveryJob[],
    reconMissions: [] as ReconMission[],
    notifications: [] as UiNotification[],
    planning: createPlanningState("target-1"),
    tutorial: createInitialTutorialState(),
    uiReadState: createInitialUiReadState(now),
    debug: {
      showHiddenValues: false,
      clockOffsetMs: 0
    }
  } satisfies SaveState;

  state.aircraft = AIRCRAFT_NAMES.map((name, index) => ({
    id: `aircraft-${index + 1}`,
    name,
    status: index === 4 ? "damaged" : "serviceable",
    conditionSummary:
      index === 4
        ? "A recent training scrape left the aircraft slightly out of sorts, though it might still be pressed."
        : "Maintenance judges the aircraft sound enough for another operation.",
    hiddenCondition: index === 4 ? 64 : 88 - index * 3,
    assignedCrewId: `crew-summary-${index + 1}`,
    assignedCrewMemberIds: [],
    assignedGroundCrewId: index <= 2 ? "ground-1" : "ground-2",
    missionCount: index === 0 ? 11 : index <= 2 ? 6 : 2,
    damageHistory: index === 4 ? ["Minor taxi collision repaired in part; inspection still advised."] : [],
    repairJobId: null,
    recoveryJobId: null,
    lastOutcomeNote: "No current remarks.",
    crewCohesion: index <= 1 ? "Crew has flown together often." : "Crew cohesion is adequate but not exceptional.",
    lastCrewIssueNote: "No current crew issue note."
  }));

  state.targets = TARGET_DEFS.map((def, index) => ({
    id: `target-${index + 1}`,
    name: def.name,
    type: def.type,
    region: def.region,
    directiveRelevance: def.relevance,
    hiddenActualCondition: 100,
    hiddenDefenseLevel: def.defense,
    hiddenRepairRate: 8 + index * 2,
    assessedCondition: def.assessedCondition,
    assessedDefense: defaultVisibleDefenseAssessment(index === 0 ? "fair" : "poor", index <= 1 ? "elevated" : "low"),
    intelConfidence: index === 0 ? "fair" : "poor",
    lastReconDay: null,
    lastReconAt: null,
    lastReconSummary: null,
    weatherOutlook: def.weatherOutlook,
    suspectedEffects: def.suspectedEffects,
    connectedTargetIds: [],
    alertLevel: index <= 1 ? "elevated" : "low",
    evidence: ["File photographs are dated and incomplete."],
    hiddenWeatherRisk: def.weatherRisk,
    latestIntelNote: null,
    latestIntelRecommendation: null,
    latestIntelSource: null,
    latestIntelUpdatedAt: null,
    lastMissionSummary: null,
    lastMissionAt: null,
    lastDebriefSummary: null,
    lastDebriefAt: null
  }));

  state.targets[0]!.connectedTargetIds = ["target-2", "target-5"];
  state.targets[1]!.connectedTargetIds = ["target-1", "target-3"];
  state.targets[2]!.connectedTargetIds = ["target-1"];
  state.targets[3]!.connectedTargetIds = ["target-5"];
  state.targets[4]!.connectedTargetIds = ["target-1", "target-4"];
  state.campaign.profile = createCampaignProfile(state, now);
  state.campaign.expectedDurationDays = state.campaign.profile.expectedDays;
  applyCampaignProfileToTargets(state);

  for (const aircraft of state.aircraft) {
    const pilotName = aircraft.id === "aircraft-1"
      ? PILOT_NAMES[0]!
      : aircraft.id === "aircraft-2"
        ? PILOT_NAMES[1]!
        : aircraft.id === "aircraft-3"
          ? PILOT_NAMES[2]!
          : aircraft.id === "aircraft-4"
            ? PILOT_NAMES[3]!
            : aircraft.id === "aircraft-5"
              ? PILOT_NAMES[4]!
              : PILOT_NAMES[5]!;
    const manifest = createInitialCrewManifest(state, aircraft.id, pilotName);
    state.crewMembers.push(...manifest);
  }
  state.crewMembers.push(...createReplacementPool(state));
  ensureAircraftRoleAssignments(state);
  for (const aircraft of state.aircraft) {
    aircraft.lastCrewIssueNote = buildAircraftIssueNote(state, aircraft);
  }
  syncDerivedCrews(state);
  state.planning = createPlanningState(state.targets[0]!.id);
  evaluateTutorial(state);

  addLog(state, "boot-directive", now, "command", "Group Headquarters has received a directive to ease fighter pressure around Bremen.");
  addLog(state, "boot-warning", now, "operations", "Intelligence reminds staff that current target folders are incomplete and should not be treated as exact.");
  return state;
}

function migrateLegacyState(parsed: Partial<SaveState>): SaveState {
  const baseline = createNewGame(Date.now());
  const state = parsed as SaveState;
  state.version = SAVE_VERSION;
  state.campaign ||= baseline.campaign;
  state.campaign.stationWeather ||= createStationWeather(state.campaign.currentDay ?? 1);
  state.campaign.latestIntelUpdate ??= null;
  state.campaign.latestStrategicIntelNote ??= null;
  state.campaign.latestWaitNote ??= null;
  state.campaign.pendingTimeAdvanceKind ??= null;
  state.campaign.consequenceLedger ??= [];
  state.campaign.personnelDecisions ??= [];
  state.campaign.campaignPhaseId ??= "opening";
  state.campaign.directiveState ??= createInitialDirectiveState();
  state.campaign.profile ??= createCampaignProfile(baseline, Date.now());
  state.campaign.profile.applicationMode ??= "legacy_baked_repair";
  state.campaign.expectedDurationDays ??= state.campaign.profile.expectedDays ?? DEFAULT_CAMPAIGN_DAYS;
  state.campaign.extensionReason ??= null;
  state.campaign.operationalBeat ??= state.campaign.directiveState.operationsElapsed ?? 0;
  state.campaign.causalHooks ??= [];
  state.campaign.opportunities ??= [];
  state.campaign.insights ??= [];
  state.campaign.events ??= [];
  state.campaign.resolutionState ??= state.campaign.evaluation ? "finalized" : "active";
  state.campaign.pendingEndCondition ??= null;
  state.campaign.pendingResolutionDetectedAt ??= null;
  state.campaign.pendingResolutionReason ??= null;
  state.campaign.pendingResolutionMissionIds ??= [];
  state.campaign.pendingResolutionReconIds ??= [];
  state.campaign.pendingResolutionRepairIds ??= [];
  state.campaign.pendingResolutionRecoveryIds ??= [];
  state.campaign.evaluation ??= null;
  state.campaign.finalSummaryMode ??= Boolean(state.campaign.evaluation);
  state.campaign.frozenFinalState ??= Boolean(state.campaign.evaluation);
  state.campaign.directiveState.fighterPressure ??= baseline.campaign.directiveState.fighterPressure;
  state.campaign.directiveState.fighterReplacementFlow ??= baseline.campaign.directiveState.fighterReplacementFlow;
  state.campaign.directiveState.regionalRepairCapacity ??= baseline.campaign.directiveState.regionalRepairCapacity;
  state.campaign.directiveState.warningCoordination ??= baseline.campaign.directiveState.warningCoordination;
  state.campaign.directiveState.approachDanger ??= baseline.campaign.directiveState.approachDanger;
  state.campaign.directiveState.commandPatience ??= baseline.campaign.directiveState.commandPatience;
  state.campaign.directiveState.directiveProgress ??= baseline.campaign.directiveState.directiveProgress;
  state.campaign.directiveState.operationsElapsed ??= 0;
  state.campaign.directiveState.recentStrategicEffects ??= [];
  for (const effect of state.campaign.directiveState.recentStrategicEffects) {
    effect.followUpPending ??= false;
    effect.followUpDeliveredAt ??= null;
  }
  state.notifications ??= [];
  state.recoveryJobs ??= [];
  state.targets ??= baseline.targets;
  for (const target of state.targets) {
    target.assessedDefense ??= defaultVisibleDefenseAssessment(target.intelConfidence ?? "poor", target.alertLevel ?? "low");
    target.lastReconAt ??= null;
    target.lastReconSummary ??= null;
    target.latestIntelNote ??= null;
    target.latestIntelRecommendation ??= null;
    target.latestIntelSource ??= null;
    target.latestIntelUpdatedAt ??= null;
    target.lastMissionSummary ??= null;
    target.lastMissionAt ??= null;
    target.lastDebriefSummary ??= null;
    target.lastDebriefAt ??= null;
  }

  if (!state.crewMembers || state.crewMembers.length === 0) {
    state.crewMembers = [];
    for (const aircraft of state.aircraft) {
      aircraft.assignedCrewMemberIds = [];
      aircraft.crewCohesion ??= "Crew cohesion is adequate but not exceptional.";
      aircraft.lastCrewIssueNote ??= "No current crew issue note.";
      const legacyCrew = state.crews.find((crew) => crew.id === aircraft.assignedCrewId);
      const manifest = createInitialCrewManifest(state, aircraft.id, legacyCrew?.pilotName ?? `${rankForRole("pilot")} ${randomName()}`);
      for (const member of manifest) {
        if (legacyCrew && member.currentAssignmentRole === "pilot") {
          member.experience = legacyCrew.experience;
          member.fatigue = legacyCrew.fatigue;
          member.morale = legacyCrew.morale;
          const legacyStatus = legacyCrew.status as string;
          member.status =
            legacyStatus === "missing"
              ? "missing"
              : legacyStatus === "wounded"
                ? "lightly_wounded"
                : legacyStatus === "resting"
                  ? "resting"
                  : "fit";
          member.notes = legacyCrew.notes;
        }
        state.crewMembers.push(member);
      }
    }
    state.crewMembers.push(...createReplacementPool(state));
  }
  for (const aircraft of state.aircraft) {
    aircraft.assignedCrewMemberIds ??= [];
    aircraft.recoveryJobId ??= null;
    aircraft.crewCohesion ??= "Crew cohesion is adequate but not exceptional.";
    aircraft.lastCrewIssueNote ??= "No current crew issue note.";
  }
  for (const member of state.crewMembers) {
    member.isPermanentReplacement ??= false;
    member.injurySeverity ??= member.status === "seriously_wounded" ? "serious" : member.status === "lightly_wounded" ? "light" : "none";
    member.recoveryAvailableAt ??= null;
    member.currentAssignmentRole ??= member.role === "enlisted_airman" ? null : (member.role as CrewRole);
    normalizeSeriousWoundMember(member);
  }
  for (const mission of state.missions ?? []) {
    mission.campaignContext ??= null;
    mission.debriefCasualtyLines ??= [];
    mission.plan.operationType ??= "main_strike";
    mission.plan.secondaryTargetId ??= null;
    mission.plan.leadAircraftId ??= mission.plan.assignedAircraftIds[0] ?? null;
    mission.plan.attackDoctrine ??= mission.plan.standingOrders.allowRepeatBombRun ? "repeat_if_needed" : "single_pass";
    mission.plan.staffWarningsAtLaunch ??= [];
    mission.plan.launchCrewManifests ??= [];
    mission.hiddenOutcome.attackedTargetId ??= mission.plan.targetId;
    mission.hiddenOutcome.attackedTargetName ??= getTargetById(state, mission.plan.targetId)?.name ?? "Unknown target";
    mission.hiddenOutcome.attackedSecondary ??= false;
    mission.hiddenOutcome.doctrineNote ??= "The attack followed the standing orders in effect at launch.";
    mission.hiddenOutcome.leadNote ??= "Lead influence was not separately logged in this earlier order.";
    mission.hiddenOutcome.commandAssessment ??= "Command is still weighing the broader meaning of the operation.";
    for (const outcome of mission.hiddenOutcome.aircraftOutcomes) {
      outcome.launchManifest ??= {
        aircraftId: outcome.aircraftId,
        crewMemberIds: [],
        members: []
      };
      outcome.crewEffects ??= [];
      outcome.casualtySummary ??= [];
    }
  }
  for (const hook of state.campaign.causalHooks) {
    hook.fadingStartsDay ??= hook.fadesAfterDay !== null ? Math.max(0, hook.fadesAfterDay - 1) : null;
    hook.fadingStartsBeat ??= hook.fadesAfterBeat !== null ? Math.max(0, hook.fadesAfterBeat - 1) : null;
  }
  for (const opportunity of state.campaign.opportunities) {
    opportunity.sourceTargetId ??= opportunity.relatedTargetId ?? null;
    opportunity.beneficiaryTargetIds ??= opportunity.relatedTargetId ? [opportunity.relatedTargetId] : [];
    opportunity.eligibleOperationTypes ??= [];
    opportunity.eligibleRouteRisks ??= [];
    opportunity.confirmedAt ??= null;
    opportunity.confirmationNote ??= null;
    opportunity.fadingStartsDay ??= opportunity.fadesAfterDay !== null ? Math.max(0, opportunity.fadesAfterDay - 1) : null;
    opportunity.fadingStartsBeat ??= opportunity.fadesAfterBeat !== null ? Math.max(0, opportunity.fadesAfterBeat - 1) : null;
  }
  state.planning.operationType ??= "main_strike";
  state.planning.secondaryTargetId ??= null;
  state.planning.leadAircraftId ??= state.planning.assignedAircraftIds?.[0] ?? state.aircraft[0]?.id ?? null;
  state.planning.attackDoctrine ??= state.planning.standingOrders?.allowRepeatBombRun ? "repeat_if_needed" : "single_pass";
  state.tutorial ??= createInitialTutorialState();
  state.tutorial.enabled ??= true;
  state.tutorial.activeStepId ??= null;
  state.tutorial.completedStepIds ??= [];
  state.tutorial.firstLoopCompleted ??= false;
  state.tutorial.suppressModalUntilAt ??= null;
  state.uiReadState ??= createInitialUiReadState(state.lastReconciledAt ?? Date.now());
  state.uiReadState.lastViewedCommandUpdateAt ??= state.campaign.consequenceLedger[0]?.createdAt ?? state.lastReconciledAt ?? Date.now();
  state.uiReadState.lastViewedDebriefMissionId ??= state.campaign.lastDebriefMissionId ?? null;
  state.uiReadState.lastViewedReconId ??= getLatestCompletedRecon(state)?.id ?? null;
  state.uiReadState.lastViewedTargetChangeAt ??= state.targets.reduce((latest, target) => Math.max(latest, target.latestIntelUpdatedAt ?? target.lastDebriefAt ?? target.lastMissionAt ?? 0), 0) || state.lastReconciledAt;
  state.uiReadState.lastViewedMaintenanceAt ??= Math.max(
    ...state.repairJobs.filter((job) => job.completionApplied).map((job) => job.completesAt),
    ...state.recoveryJobs.filter((job) => job.completionApplied).map((job) => job.completesAt),
    state.lastReconciledAt
  );
  state.uiReadState.lastViewedPersonnelDecisionAt ??= state.campaign.personnelDecisions[state.campaign.personnelDecisions.length - 1]?.createdAt ?? state.lastReconciledAt;
  state.tutorial.completedStepIds = state.tutorial.completedStepIds.filter((stepId) => TUTORIAL_STEP_MAP.has(stepId));
  if (state.tutorial.activeStepId && !TUTORIAL_STEP_MAP.has(state.tutorial.activeStepId)) {
    state.tutorial.activeStepId = null;
  }
  for (const recon of state.reconMissions ?? []) {
    recon.resultQuality ??= "partial";
    recon.recommendation ??= "Staff recommends treating the result cautiously.";
  }
  ensureAircraftRoleAssignments(state);
  cleanupPlanningState(state);
  for (const aircraft of state.aircraft) {
    aircraft.lastCrewIssueNote = buildAircraftIssueNote(state, aircraft);
  }
  syncDerivedCrews(state);
  syncPendingDecisionNotes(state);
  evaluateTutorial(state);
  if (state.campaign.evaluation) {
    state.campaign.resolutionState = "finalized";
    state.campaign.finalSummaryMode = true;
    state.campaign.frozenFinalState = true;
  }
  return state;
}

export function loadState(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const state = migrateLegacyState(parsed);
    const rawNow = getEffectiveNow(state);
    const boundedNow = getBoundedOperationalNow(state, rawNow);
    if (boundedNow < rawNow) {
      state.debug.clockOffsetMs -= rawNow - boundedNow;
      state.campaign.pendingTimeAdvanceKind = "offline_return";
    }
    return state;
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

export function getCrewMemberById(state: SaveState, crewMemberId: string): CrewMember | undefined {
  return state.crewMembers.find((member) => member.id === crewMemberId);
}

function getGroundCrewById(state: SaveState, groundCrewId: string): GroundCrew | undefined {
  return state.groundCrews.find((crew) => crew.id === groundCrewId);
}

export function getCrewMembersForAircraft(state: SaveState, aircraftId: string): CrewMember[] {
  return state.crewMembers.filter((member) => member.assignedAircraftId === aircraftId);
}

export function getReplacementPool(state: SaveState): CrewMember[] {
  return state.crewMembers.filter((member) => member.isReplacement && member.assignedAircraftId === null);
}

export function getUnavailablePersonnel(state: SaveState): CrewMember[] {
  return state.crewMembers.filter((member) =>
    member.status !== "fit" && member.status !== "resting" && member.status !== "unassigned"
  );
}

export function getRestingPersonnel(state: SaveState): CrewMember[] {
  return state.crewMembers.filter((member) => member.status === "resting");
}

export function getMedicalPersonnel(state: SaveState): CrewMember[] {
  return state.crewMembers.filter((member) =>
    member.status === "lightly_wounded" || member.status === "seriously_wounded"
  );
}

export function getHardUnavailablePersonnel(state: SaveState): CrewMember[] {
  return state.crewMembers.filter((member) =>
    member.status === "missing" || member.status === "kia" || member.status === "pow"
  );
}

function canRoleFly(member: CrewMember): boolean {
  return member.status === "fit" || member.status === "resting";
}

function isRoleCompatible(member: CrewMember, role: CrewRole): boolean {
  if (member.role === "pilot") {
    return role === "pilot" || role === "copilot";
  }
  if (member.role === "copilot") {
    return role === "copilot";
  }
  if (member.role === "navigator") {
    return role === "navigator";
  }
  if (member.role === "bombardier") {
    return role === "bombardier";
  }
  if (member.role === "enlisted_airman") {
    return ENLISTED_ROLE_SET.has(role);
  }
  return member.role === role;
}

function getMemberAssignedToRole(state: SaveState, aircraftId: string, role: CrewRole): CrewMember | undefined {
  return getCrewMembersForAircraft(state, aircraftId).find((member) => member.currentAssignmentRole === role);
}

export function getEffectiveRoleOccupant(state: SaveState, aircraftId: string, role: CrewRole): CrewMember | undefined {
  const candidates = getCrewMembersForAircraft(state, aircraftId)
    .filter((member) => member.currentAssignmentRole === role);
  const flyable = candidates.filter((member) => canRoleFly(member));
  if (flyable.length === 0) {
    return undefined;
  }
  return flyable.sort((left, right) => {
    const leftReplacementPenalty = left.isReplacement ? 1 : 0;
    const rightReplacementPenalty = right.isReplacement ? 1 : 0;
    const leftExperienceScore = left.experience === "veteran" ? 2 : left.experience === "regular" ? 1 : 0;
    const rightExperienceScore = right.experience === "veteran" ? 2 : right.experience === "regular" ? 1 : 0;
    const leftFatiguePenalty = left.fatigue === "exhausted" ? 2 : left.fatigue === "tired" ? 1 : 0;
    const rightFatiguePenalty = right.fatigue === "exhausted" ? 2 : right.fatigue === "tired" ? 1 : 0;
    return (leftReplacementPenalty + leftFatiguePenalty - leftExperienceScore)
      - (rightReplacementPenalty + rightFatiguePenalty - rightExperienceScore);
  })[0];
}

export function getPersonnelDecisionsForAircraft(state: SaveState, aircraftId: string): PersonnelDecision[] {
  return state.campaign.personnelDecisions.filter((decision) => !decision.resolved && decision.aircraftId === aircraftId);
}

function syncPendingDecisionNotes(state: SaveState): void {
  const unresolved = state.campaign.personnelDecisions.filter((decision) => !decision.resolved);
  state.campaign.pendingDecisions = state.campaign.pendingDecisions.filter((entry) => !entry.startsWith("Personnel: "));
  if (unresolved.length > 0) {
    state.campaign.pendingDecisions.push(
      unresolved.length === 1
        ? "Personnel: one recovered original is awaiting a crew-seat decision."
        : `Personnel: ${unresolved.length} recovered originals are awaiting crew-seat decisions.`
    );
  }
}

function maybeCreateRecoveredOriginalDecision(state: SaveState, member: CrewMember, now: number): void {
  if (member.isReplacement || member.assignedAircraftId === null) {
    return;
  }
  const role = getRoleForRecoveredOriginal(member);
  if (!role) {
    return;
  }
  const replacement = getCrewMembersForAircraft(state, member.assignedAircraftId).find((candidate) =>
    candidate.id !== member.id
    && candidate.isReplacement
    && !candidate.isPermanentReplacement
    && candidate.currentAssignmentRole === role
    && canRoleFly(candidate)
  );
  if (!replacement) {
    return;
  }
  const existing = state.campaign.personnelDecisions.find((decision) =>
    decision.crewMemberId === member.id
    && decision.replacementCrewMemberId === replacement.id
    && decision.aircraftId === member.assignedAircraftId
    && decision.role === role
  );
  if (existing) {
    return;
  }
  state.campaign.personnelDecisions.push({
    id: nextId(state, "personnel"),
    crewMemberId: member.id,
    replacementCrewMemberId: replacement.id,
    aircraftId: member.assignedAircraftId,
    role,
    createdAt: now,
    resolved: false
  });
  member.notes = `${member.name} has recovered, but ${replacement.name} is still covering ${roleLabel(role)}.`;
  syncPendingDecisionNotes(state);
}

export function getEffectiveRoleCoverage(state: SaveState, aircraftId: string): Array<{
  role: CrewRole;
  occupant: CrewMember | undefined;
  candidates: CrewMember[];
  hasConflict: boolean;
}> {
  return CREW_ROLES.map((role) => {
    const candidates = getCrewMembersForAircraft(state, aircraftId)
      .filter((member) => member.currentAssignmentRole === role);
    const occupant = getEffectiveRoleOccupant(state, aircraftId, role);
    return {
      role,
      occupant,
      candidates,
      hasConflict: candidates.length > 1
    };
  });
}

export function getRoleCoverageProblems(state: SaveState, aircraftId: string): Array<{
  role: CrewRole;
  occupant: CrewMember | undefined;
  hasConflict: boolean;
}> {
  return getEffectiveRoleCoverage(state, aircraftId)
    .filter((entry) => !entry.occupant || entry.hasConflict)
    .map((entry) => ({
      role: entry.role,
      occupant: entry.occupant,
      hasConflict: entry.hasConflict
    }));
}

function getCompatibleReplacements(state: SaveState, role: CrewRole): CrewMember[] {
  return getReplacementPool(state).filter((member) => isRoleCompatible(member, role) && member.status === "unassigned");
}

const LEAD_INVALID_WARNING = "Lead aircraft is no longer valid. Select a new lead before launch.";

function syncPlanningWarnings(state: SaveState): void {
  state.campaign.pendingDecisions = state.campaign.pendingDecisions.filter((entry) => entry !== LEAD_INVALID_WARNING);
  if (!state.planning.leadAircraftId && state.planning.assignedAircraftIds.length > 0) {
    state.campaign.pendingDecisions.push(LEAD_INVALID_WARNING);
  }
}

function normalizeSeriousWoundMember(member: CrewMember): void {
  if (member.status !== "seriously_wounded") {
    return;
  }
  member.recoveryAvailableAt = null;
  member.injurySeverity = "serious";
  if (/recover|later today|tomorrow|soon|brief medical recovery/i.test(member.notes) || member.notes.trim().length === 0) {
    member.notes = "Seriously wounded; replacement required. Not expected back during this operation cycle.";
  }
}

function cleanupPlanningState(state: SaveState): boolean {
  const validAircraftIds = new Set(state.aircraft.map((aircraft) => aircraft.id));
  const previousAssigned = state.planning.assignedAircraftIds;
  const previousWarnings = state.campaign.pendingDecisions.join("|");
  state.planning.assignedAircraftIds = state.planning.assignedAircraftIds.filter((aircraftId) => validAircraftIds.has(aircraftId));
  let changed = previousAssigned.length !== state.planning.assignedAircraftIds.length;
  const hadLead = state.planning.leadAircraftId;
  if (
    hadLead
    && (
      !state.planning.assignedAircraftIds.includes(hadLead)
      || getAircraftAvailability(state, hadLead).level === "unavailable"
    )
  ) {
    state.planning.leadAircraftId = null;
    changed = true;
  }
  syncPlanningWarnings(state);
  return changed || previousWarnings !== state.campaign.pendingDecisions.join("|");
}

export function getCrewAircraftLabel(state: SaveState, member: CrewMember): string {
  if (!member.assignedAircraftId) {
    return member.isReplacement ? "Aircraft: Replacement pool" : "Aircraft: Unassigned";
  }
  return `Aircraft: ${getAircraftById(state, member.assignedAircraftId)?.name ?? "Unknown aircraft"}`;
}

export function getCrewSeatLabel(member: CrewMember): string {
  const normalRole = member.role === "enlisted_airman" ? "Enlisted replacement" : roleLabel(member.role);
  const currentSeat = member.currentAssignmentRole ? roleLabel(member.currentAssignmentRole) : "No active seat";
  return `Seat: ${currentSeat}. Specialty: ${normalRole}.`;
}

export function getMedicalRecoveryLabel(member: CrewMember, now: number): string {
  if (member.status === "fit") {
    return "Recovery: Fit for duty";
  }
  if (member.status === "resting") {
    return "Recovery: Resting; returns when fatigue clears";
  }
  if (member.status === "lightly_wounded") {
    if (!member.recoveryAvailableAt) {
      return "Recovery: Recovering; medical has not filed a firm time";
    }
    const diff = member.recoveryAvailableAt - now;
    const fuzzy = diff <= 6 * 60 * 60 * 1000
      ? "later today"
      : diff <= 24 * 60 * 60 * 1000
        ? "tomorrow"
        : "soon";
    return `Recovery: passive, expected ${fuzzy}`;
  }
  if (member.status === "seriously_wounded") {
    return "Recovery: Seriously wounded; out indefinitely for this campaign slice";
  }
  if (member.status === "missing" || member.status === "pow" || member.status === "kia") {
    return "Recovery: Not available";
  }
  if (member.status === "unassigned" && member.isReplacement) {
    return "Recovery: Available in replacement pool";
  }
  return "Recovery: No firm medical note filed";
}

export function getReplacementCoveringMember(state: SaveState, member: CrewMember): CrewMember | undefined {
  if (!member.assignedAircraftId) {
    return undefined;
  }
  const decision = state.campaign.personnelDecisions.find((entry) => !entry.resolved && entry.crewMemberId === member.id);
  const expectedRole = member.currentAssignmentRole ?? decision?.role ?? getRoleForRecoveredOriginal(member);
  if (!expectedRole) {
    return undefined;
  }
  return getCrewMembersForAircraft(state, member.assignedAircraftId).find((candidate) =>
    candidate.id !== member.id
    && candidate.currentAssignmentRole === expectedRole
    && candidate.isReplacement
    && canRoleFly(candidate)
  );
}

export function getMedicalActionLabel(state: SaveState, member: CrewMember): string {
  if (member.status === "lightly_wounded") {
    return "Action: none";
  }
  if (member.status === "seriously_wounded") {
    return "Action: replacement required";
  }
  if (member.status === "resting") {
    return "Action: none";
  }
  if (member.status === "missing" || member.status === "pow" || member.status === "kia") {
    return "Action: none";
  }
  if (state.campaign.personnelDecisions.some((entry) => !entry.resolved && entry.crewMemberId === member.id)) {
    return "Action: resolve personnel decision";
  }
  const covering = getReplacementCoveringMember(state, member);
  if (covering) {
    return "Action: none";
  }
  return member.isReplacement && member.assignedAircraftId === null ? "Action: available for assignment" : "Action: none";
}

function syncAircraftCrewNotes(state: SaveState, aircraftId: string): void {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return;
  }
  const manifest = getCrewMembersForAircraft(state, aircraftId);
  const replacements = manifest.filter((member) => member.isReplacement).length;
  const shaken = manifest.filter((member) => member.morale !== "steady").length;
  aircraft.assignedCrewMemberIds = manifest.map((member) => member.id);
  aircraft.crewCohesion =
    replacements >= 3
      ? "Crew cohesion is badly strained by unfamiliar faces."
      : replacements > 0
        ? "Crew cohesion is reduced by recent replacements."
        : shaken >= 3
          ? "Crew is flying under noticeable strain."
          : "Crew has a reasonably settled working rhythm.";
  aircraft.lastCrewIssueNote = buildAircraftIssueNote(state, aircraft);
}

function updateAllDerivedCrewState(state: SaveState): void {
  for (const aircraft of state.aircraft) {
    syncAircraftCrewNotes(state, aircraft.id);
  }
  syncDerivedCrews(state);
  cleanupPlanningState(state);
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

export function getLatestCompletedRecon(state: SaveState): ReconMission | undefined {
  return state.reconMissions.find((recon) => recon.completionApplied);
}

export function getActiveMissionCrewIds(state: SaveState): string[] {
  const mission = getActiveMission(state);
  if (!mission) {
    return [];
  }
  return mission.plan.launchCrewManifests.flatMap((snapshot) => snapshot.crewMemberIds);
}

function getActiveFieldJobForGroundCrew(state: SaveState, groundCrewId: string): RepairJob | RecoveryJob | undefined {
  return state.repairJobs.find((job) => job.groundCrewId === groundCrewId && !job.completionApplied)
    ?? state.recoveryJobs.find((job) => job.groundCrewId === groundCrewId && !job.completionApplied);
}

function getLatestCommandUpdateAt(state: SaveState): number {
  return Math.max(
    state.campaign.consequenceLedger[0]?.createdAt ?? 0,
    state.campaign.latestIntelUpdate?.updatedAt ?? 0,
    state.campaign.events[0]?.createdAt ?? 0,
    state.campaign.pendingDecisions.length > 0 ? state.lastReconciledAt : 0
  );
}

function acknowledgeTabView(state: SaveState, tab: CampaignTab): void {
  const now = getEffectiveNow(state);
  switch (tab) {
    case "command":
      state.uiReadState.lastViewedCommandUpdateAt = getLatestCommandUpdateAt(state) || now;
      break;
    case "debrief":
      state.uiReadState.lastViewedDebriefMissionId = getLatestDebriefMission(state)?.id ?? state.uiReadState.lastViewedDebriefMissionId;
      break;
    case "recon":
      state.uiReadState.lastViewedReconId = getLatestCompletedRecon(state)?.id ?? state.uiReadState.lastViewedReconId;
      break;
    case "target-board":
      state.uiReadState.lastViewedTargetChangeAt = Math.max(
        ...state.targets.map((target) => target.latestIntelUpdatedAt ?? target.lastDebriefAt ?? target.lastMissionAt ?? 0),
        now
      );
      break;
    case "maintenance":
      state.uiReadState.lastViewedMaintenanceAt = now;
      break;
    case "aircraft-crews":
      state.uiReadState.lastViewedPersonnelDecisionAt = now;
      break;
  }
}

export function setSelectedTab(state: SaveState, tab: CampaignTab): void {
  state.selectedTab = tab;
}

export function acknowledgeVisibleTab(state: SaveState, tab: CampaignTab): void {
  acknowledgeTabView(state, tab);
}

export function setPlanningTarget(state: SaveState, targetId: string): void {
  state.planning.selectedTargetId = targetId;
  const secondaryOptions = getSecondaryTargetOptions(state, targetId);
  if (state.planning.secondaryTargetId && !secondaryOptions.some((target) => target.id === state.planning.secondaryTargetId)) {
    state.planning.secondaryTargetId = null;
  }
}

export function toggleAssignedAircraft(state: SaveState, aircraftId: string): void {
  if (state.planning.assignedAircraftIds.includes(aircraftId)) {
    state.planning.assignedAircraftIds = state.planning.assignedAircraftIds.filter((id) => id !== aircraftId);
    if (state.planning.leadAircraftId === aircraftId) {
      state.planning.leadAircraftId = null;
    }
    cleanupPlanningState(state);
    return;
  }
  const availability = getAircraftAvailability(state, aircraftId);
  if (availability.level === "unavailable") {
    return;
  }
  state.planning.assignedAircraftIds = [...state.planning.assignedAircraftIds, aircraftId];
  if (!state.planning.leadAircraftId) {
    state.planning.leadAircraftId = aircraftId;
  }
  cleanupPlanningState(state);
}

export function setRouteRisk(state: SaveState, routeRisk: RouteRisk): void {
  state.planning.routeRisk = routeRisk;
}

export function setOperationType(state: SaveState, operationType: OperationType): void {
  state.planning.operationType = operationType;
}

export function setSecondaryTarget(state: SaveState, targetId: string | null): void {
  if (!targetId) {
    state.planning.secondaryTargetId = null;
    return;
  }
  const options = getSecondaryTargetOptions(state, state.planning.selectedTargetId);
  state.planning.secondaryTargetId = options.some((target) => target.id === targetId) ? targetId : null;
}

export function setLeadAircraft(state: SaveState, aircraftId: string): void {
  if (!state.planning.assignedAircraftIds.includes(aircraftId)) {
    return;
  }
  state.planning.leadAircraftId = aircraftId;
  cleanupPlanningState(state);
}

export function setAttackDoctrine(state: SaveState, doctrine: AttackDoctrine): void {
  state.planning.attackDoctrine = doctrine;
  state.planning.standingOrders.allowRepeatBombRun = doctrine === "repeat_if_needed";
  if (doctrine === "repeat_if_needed") {
    state.planning.standingOrders.useSecondaryIfObscured = true;
  }
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

export function assignReplacementCrewMember(state: SaveState, crewMemberId: string, aircraftId: string, role: CrewRole): string | null {
  const member = getCrewMemberById(state, crewMemberId);
  if (!member) {
    return "Replacement crew member not found.";
  }
  if (!member.isReplacement || member.assignedAircraftId !== null) {
    return "Crew member is not available in the replacement pool.";
  }
  if (!isRoleCompatible(member, role)) {
    return `No suitable ${roleLabel(member.role)} can fill ${roleLabel(role)}.`;
  }

  const existing = getEffectiveRoleOccupant(state, aircraftId, role);
  if (existing && existing.status !== "unassigned") {
    return `${roleLabel(role)} is already covered on this aircraft.`;
  }

  const roleOccupants = getCrewMembersForAircraft(state, aircraftId)
    .filter((assigned) => assigned.currentAssignmentRole === role && !canRoleFly(assigned));
  for (const occupant of roleOccupants) {
    occupant.currentAssignmentRole = null;
    occupant.notes = `Attached to ${getAircraftById(state, aircraftId)?.name ?? "this crew"}; not currently occupying ${roleLabel(role)} seat while recovering or unfit for duty.`;
  }
  assignCrewMemberToAircraft(member, aircraftId, role);
  member.notes = `Assigned as ${roleLabel(role)} replacement on ${getAircraftById(state, aircraftId)?.name ?? "the aircraft"}.`;
  state.tutorial.suppressModalUntilAt = getEffectiveNow(state) + 15000;
  updateAllDerivedCrewState(state);
  const aircraft = getAircraftById(state, aircraftId);
  const displaced = roleOccupants[0];
  const confirmation = displaced
    ? `${member.name} assigned as ${roleLabel(role)} on ${aircraft?.name ?? "the aircraft"}. ${displaced.name} remains attached to the crew but is not covering the ${roleLabel(role)} seat.`
    : `${member.name} assigned as ${roleLabel(role)} on ${aircraft?.name ?? "the aircraft"}.`;
  addLog(state, `replacement-assign-${member.id}-${aircraftId}-${role}`, getEffectiveNow(state), "personnel", confirmation);
  addNotification(state, `toast-replacement-${member.id}-${aircraftId}-${role}`, "operations", confirmation, getEffectiveNow(state));
  return null;
}

function findRestorableOriginalForRole(state: SaveState, aircraftId: string, role: CrewRole, excludedMemberId?: string): CrewMember | undefined {
  return getCrewMembersForAircraft(state, aircraftId).find((candidate) => {
    if (candidate.id === excludedMemberId || candidate.isReplacement || !canRoleFly(candidate)) {
      return false;
    }
    const decisionRole = state.campaign.personnelDecisions.find((entry) => !entry.resolved && entry.crewMemberId === candidate.id)?.role;
    return getRoleForRecoveredOriginal(candidate) === role || decisionRole === role;
  });
}

export function removeReplacementCrewMember(state: SaveState, crewMemberId: string): string | null {
  const member = getCrewMemberById(state, crewMemberId);
  if (!member) {
    return "Crew member not found.";
  }
  if (!member.isReplacement || member.assignedAircraftId === null) {
    return "Crew member is not an assigned replacement.";
  }
  if (getActiveMissionCrewIds(state).includes(member.id)) {
    return "This replacement is currently airborne with the active mission and cannot be removed yet.";
  }
  const previousAircraftId = member.assignedAircraftId;
  const vacatedRole = member.currentAssignmentRole;
  member.assignedAircraftId = null;
  member.currentAssignmentRole = null;
  member.status = "unassigned";
  member.notes = "Returned to the replacement pool.";
  if (previousAircraftId && vacatedRole && !getEffectiveRoleOccupant(state, previousAircraftId, vacatedRole)) {
    const original = findRestorableOriginalForRole(state, previousAircraftId, vacatedRole, member.id);
    if (original && !getEffectiveRoleOccupant(state, previousAircraftId, vacatedRole)) {
      original.currentAssignmentRole = vacatedRole;
      original.notes = `Attached to ${getAircraftById(state, previousAircraftId)?.name ?? "this crew"} and restored to the ${roleLabel(vacatedRole)} seat after replacement removal.`;
    }
  }
  updateAllDerivedCrewState(state);
  if (previousAircraftId) {
    syncAircraftCrewNotes(state, previousAircraftId);
  }
  return null;
}

export function markReplacementPermanent(state: SaveState, crewMemberId: string): string | null {
  const member = getCrewMemberById(state, crewMemberId);
  if (!member) {
    return "Crew member not found.";
  }
  if (!member.isReplacement || member.assignedAircraftId === null) {
    return "Only an assigned replacement can be marked permanent.";
  }
  member.isPermanentReplacement = true;
  member.notes = "Marked as the crew's permanent replacement.";
  updateAllDerivedCrewState(state);
  return null;
}

function resolvePersonnelDecision(state: SaveState, decisionId: string): PersonnelDecision | undefined {
  const decision = state.campaign.personnelDecisions.find((entry) => entry.id === decisionId && !entry.resolved);
  if (decision) {
    decision.resolved = true;
  }
  syncPendingDecisionNotes(state);
  return decision;
}

export function restoreOriginalCrewMember(state: SaveState, decisionId: string): string | null {
  const decision = state.campaign.personnelDecisions.find((entry) => entry.id === decisionId && !entry.resolved);
  if (!decision) {
    return "Personnel decision no longer available.";
  }
  const original = getCrewMemberById(state, decision.crewMemberId);
  const replacement = getCrewMemberById(state, decision.replacementCrewMemberId);
  if (!original || !replacement) {
    resolvePersonnelDecision(state, decisionId);
    return "Crew records for that personnel decision are incomplete.";
  }
  original.currentAssignmentRole = decision.role;
  original.status = original.status === "unassigned" ? "fit" : original.status;
  original.notes = `Returned to the ${roleLabel(decision.role)} seat after recovering.`;
  replacement.currentAssignmentRole = null;
  replacement.notes = `Kept with ${getAircraftById(state, decision.aircraftId)?.name ?? "the crew"} temporarily after the original returned to ${roleLabel(decision.role)}.`;
  resolvePersonnelDecision(state, decisionId);
  updateAllDerivedCrewState(state);
  return null;
}

export function keepReplacementTemporary(state: SaveState, decisionId: string): string | null {
  const decision = state.campaign.personnelDecisions.find((entry) => entry.id === decisionId && !entry.resolved);
  if (!decision) {
    return "Personnel decision no longer available.";
  }
  const original = getCrewMemberById(state, decision.crewMemberId);
  const replacement = getCrewMemberById(state, decision.replacementCrewMemberId);
  if (!original || !replacement) {
    resolvePersonnelDecision(state, decisionId);
    return "Crew records for that personnel decision are incomplete.";
  }
  original.currentAssignmentRole = null;
  original.notes = `${replacement.name} remains on the ${roleLabel(decision.role)} seat for now while ${original.name} stays available on the crew.`;
  resolvePersonnelDecision(state, decisionId);
  updateAllDerivedCrewState(state);
  return null;
}

export function markReplacementPermanentFromDecision(state: SaveState, decisionId: string): string | null {
  const decision = state.campaign.personnelDecisions.find((entry) => entry.id === decisionId && !entry.resolved);
  if (!decision) {
    return "Personnel decision no longer available.";
  }
  const original = getCrewMemberById(state, decision.crewMemberId);
  const replacement = getCrewMemberById(state, decision.replacementCrewMemberId);
  if (!original || !replacement) {
    resolvePersonnelDecision(state, decisionId);
    return "Crew records for that personnel decision are incomplete.";
  }
  const error = markReplacementPermanent(state, replacement.id);
  if (error) {
    return error;
  }
  original.currentAssignmentRole = null;
  original.notes = `${replacement.name} has been retained permanently in the ${roleLabel(decision.role)} seat.`;
  resolvePersonnelDecision(state, decisionId);
  updateAllDerivedCrewState(state);
  return null;
}

function currentIntelAge(state: SaveState, target: Target): string {
  const latest = target.latestIntelUpdatedAt ?? target.lastDebriefAt ?? target.lastMissionAt ?? target.lastReconAt;
  if (!latest) {
    return "No recent filing";
  }
  const diff = getEffectiveNow(state) - latest;
  if (diff < 12 * 60 * 1000) {
    return "current";
  }
  if (diff < DAY_MS) {
    return "still useful";
  }
  if (diff < 2 * DAY_MS) {
    return "aging";
  }
  return "stale";
}

export function getTargetIntelAgeLabel(state: SaveState, targetId: string): string {
  const target = getTargetById(state, targetId);
  return target ? currentIntelAge(state, target) : "unknown";
}

export function getQualitativeAgeLabel(state: SaveState, timestamp: number | null): string {
  if (!timestamp) {
    return "no recent filing";
  }
  const diff = Math.max(0, getEffectiveNow(state) - timestamp);
  if (diff < 60 * 60 * 1000) {
    return "moments ago";
  }
  if (diff < 12 * 60 * 60 * 1000) {
    return "earlier today";
  }
  if (diff < DAY_MS) {
    return "yesterday";
  }
  if (diff < 2 * DAY_MS) {
    return "two days ago";
  }
  return "several days old";
}

function isOptionalInspectionCandidate(state: SaveState, aircraftId: string): boolean {
  const aircraft = getAircraftById(state, aircraftId);
  return Boolean(
    aircraft
    && aircraft.status === "serviceable"
    && !aircraft.repairJobId
    && !aircraft.recoveryJobId
    && aircraft.hiddenCondition < 70
  );
}

export function getAircraftReadinessSummary(state: SaveState, aircraftId: string): {
  airframe: string;
  crew: string;
  tasking: string;
  primaryReason: string;
  optionalMaintenance: boolean;
} {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return {
      airframe: "unknown",
      crew: "unknown",
      tasking: "unavailable",
      primaryReason: "Aircraft record missing.",
      optionalMaintenance: false
    };
  }

  const availability = getAircraftAvailability(state, aircraftId);
  const manifest = getCrewMembersForAircraft(state, aircraftId);
  const coverageProblems = getRoleCoverageProblems(state, aircraftId);
  const tiredCount = manifest.filter((member) => member.fatigue === "tired" || member.fatigue === "exhausted").length;
  const replacementKeyCrew = manifest.filter((member) =>
    member.isReplacement && ["pilot", "copilot", "navigator", "bombardier"].includes(member.currentAssignmentRole ?? "")
  ).length;

  let airframe = "Sound";
  if (aircraft.status === "lost") {
    airframe = "Lost";
  } else if (aircraft.status === "under_repair" || aircraft.repairJobId) {
    airframe = "Under repair";
  } else if (aircraft.status === "diverted" || aircraft.recoveryJobId) {
    airframe = "Away after diversion";
  } else if (aircraft.status === "damaged") {
    airframe = "Damaged / repair required";
  } else if (aircraft.hiddenCondition < 70) {
    airframe = "Serviceable but worn / optional inspection";
  } else if (aircraft.hiddenCondition < 80) {
    airframe = "Usable with concern";
  }

  let crew = "Fully covered";
  if (coverageProblems.length > 0) {
    const problem = coverageProblems[0]!;
    crew = problem.hasConflict
      ? `${roleLabel(problem.role)} assignment conflict`
      : `Missing required ${roleLabel(problem.role)}`;
  } else if (manifest.some((member) => member.status === "seriously_wounded")) {
    const wounded = manifest.find((member) => member.status === "seriously_wounded")!;
    crew = `Required crew member unfit: ${roleLabel(wounded.currentAssignmentRole ?? wounded.role as CrewRole)}`;
  } else if (replacementKeyCrew > 0) {
    crew = "Replacement coverage";
  } else if (tiredCount >= 3) {
    crew = "Fatigued";
  }

  let tasking = "Available";
  if (aircraft.status === "under_repair" || aircraft.repairJobId) {
    tasking = "Unavailable";
  } else if (aircraft.status === "lost") {
    tasking = "Unavailable";
  } else if (aircraft.status === "diverted" || aircraft.recoveryJobId) {
    tasking = "Unavailable";
  } else if (state.campaign.activeMissionId && state.missions.some((mission) => mission.status !== "complete" && mission.plan.assignedAircraftIds.includes(aircraftId))) {
    tasking = "Airborne";
  } else if (availability.level === "marginal") {
    tasking = "Marginal";
  } else if (availability.level === "unavailable") {
    tasking = "Unavailable";
  }

  return {
    airframe,
    crew,
    tasking,
    primaryReason: `${availability.label} - ${availability.reason}.`,
    optionalMaintenance: isOptionalInspectionCandidate(state, aircraftId)
  };
}

function countMissingGunners(state: SaveState, aircraftId: string): number {
  return [
    "ball_turret",
    "left_waist",
    "right_waist",
    "tail_gunner"
  ].filter((role) => {
    const member = getEffectiveRoleOccupant(state, aircraftId, role as CrewRole);
    return !member || !canRoleFly(member);
  }).length;
}

export function getAircraftAvailability(state: SaveState, aircraftId: string): AvailabilityReport {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft record missing", warnings: [] };
  }
  if (aircraft.status === "under_repair" || aircraft.repairJobId) {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft under repair", warnings: [] };
  }
  if (aircraft.recoveryJobId) {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft still returning from diversion", warnings: [] };
  }
  if (aircraft.status === "lost") {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft lost", warnings: [] };
  }
  if (aircraft.status === "diverted") {
    return { level: "unavailable", label: "Unavailable", reason: "Aircraft not yet back on station", warnings: [] };
  }

  const warnings: string[] = [];
  for (const role of REQUIRED_ROLES) {
    const coverage = getEffectiveRoleCoverage(state, aircraftId).find((entry) => entry.role === role)!;
    const member = coverage.occupant;
    if (!member) {
      return { level: "unavailable", label: "Unavailable", reason: `No ${roleLabel(role)} assigned`, warnings: [] };
    }
    if (member.status === "seriously_wounded") {
      return { level: "unavailable", label: "Unavailable", reason: `${roleLabel(role)} seriously wounded`, warnings: [] };
    }
    if (member.status === "missing" || member.status === "kia" || member.status === "pow") {
      return { level: "unavailable", label: "Unavailable", reason: `${roleLabel(role)} unavailable`, warnings: [] };
    }
    if (!canRoleFly(member)) {
      return { level: "unavailable", label: "Unavailable", reason: `No fit ${roleLabel(role)}`, warnings: [] };
    }
    if (member.isReplacement) {
      warnings.push(`Replacement ${roleLabel(role)} assigned.`);
    }
    if (coverage.hasConflict) {
      warnings.push(`${roleLabel(role)} station has duplicate occupants and needs sorting out.`);
    }
  }

  const engineer = getEffectiveRoleOccupant(state, aircraftId, "engineer_top_turret");
  if (!engineer || engineer.isReplacement || !canRoleFly(engineer)) {
    warnings.push("Engineer coverage is compromised.");
  }
  const missingGunners = countMissingGunners(state, aircraftId);
  if (missingGunners >= 2) {
    warnings.push(`${missingGunners} gunner positions are compromised.`);
  }
  if (aircraft.status === "damaged") {
    warnings.push("Maintenance considers the aircraft only marginally fit.");
  } else if (isOptionalInspectionCandidate(state, aircraftId)) {
    warnings.push("Airframe is worn enough to benefit from optional inspection.");
  }
  const manifest = getCrewMembersForAircraft(state, aircraftId);
  const tiredCount = manifest.filter((member) => member.fatigue === "tired" || member.fatigue === "exhausted").length;
  if (tiredCount >= 3) {
    warnings.push("Several crew members are tired or exhausted.");
  }
  if (aircraft.crewCohesion.includes("strained") || aircraft.crewCohesion.includes("reduced")) {
    warnings.push("Crew cohesion is reduced.");
  }
  return warnings.length > 0
    ? { level: "marginal", label: "Marginal", reason: warnings[0]!, warnings }
    : { level: "available", label: "Available", reason: "Full crew fit enough for tasking", warnings: [] };
}

function crewReadinessSummary(state: SaveState): string {
  const fit = state.crewMembers.filter((member) => member.status === "fit").length;
  const light = state.crewMembers.filter((member) => member.status === "lightly_wounded").length;
  const serious = state.crewMembers.filter((member) => member.status === "seriously_wounded").length;
  const reserve = getReplacementPool(state).length;
  if (serious > 0) {
    return `${serious} crew member${serious === 1 ? "" : "s"} are seriously wounded. ${reserve} replacements remain in reserve.`;
  }
  if (light > 0) {
    return `${light} crew member${light === 1 ? "" : "s"} are lightly wounded, while ${fit} remain fit enough for tasking.`;
  }
  return `${fit} crew member${fit === 1 ? "" : "s"} appear fit. ${reserve} replacements remain in reserve.`;
}

function operationTypeLabel(operationType: OperationType): string {
  return operationType.replaceAll("_", " ");
}

function doctrineLabel(doctrine: AttackDoctrine): string {
  return doctrine.replaceAll("_", " ");
}

export function getSecondaryTargetOptions(state: SaveState, primaryTargetId: string): Target[] {
  const primary = getTargetById(state, primaryTargetId);
  if (!primary) {
    return [];
  }
  const connected = primary.connectedTargetIds
    .map((id) => getTargetById(state, id))
    .filter((target): target is Target => target !== undefined && target.id !== primary.id);
  if (connected.length > 0) {
    return connected;
  }
  return state.targets.filter((target) => target.id !== primary.id && target.region === primary.region);
}

export function getLeadAircraftAssessment(state: SaveState, aircraftId: string | null): {
  label: string;
  summary: string;
  warnings: string[];
} {
  if (!aircraftId) {
    return {
      label: "No lead selected",
      summary: "Operations has not yet named a lead aircraft for this order.",
      warnings: ["No lead aircraft selected."]
    };
  }
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return {
      label: "Unavailable",
      summary: "The nominated lead aircraft cannot be found on the board.",
      warnings: ["Lead aircraft record missing."]
    };
  }
  const pilot = getEffectiveRoleOccupant(state, aircraftId, "pilot");
  const navigator = getEffectiveRoleOccupant(state, aircraftId, "navigator");
  const warnings: string[] = [];
  let score = 0;
  if (pilot?.experience === "veteran") {
    score += 2;
  } else if (pilot?.experience === "green") {
    score -= 2;
    warnings.push("Pilot is still green for a formation lead.");
  }
  if (pilot?.fatigue === "exhausted") {
    score -= 2;
    warnings.push("Pilot is badly fatigued.");
  } else if (pilot?.fatigue === "tired") {
    score -= 1;
    warnings.push("Pilot is experienced but tired.");
  }
  if (aircraft.hiddenCondition >= 80) {
    score += 1;
  } else if (aircraft.hiddenCondition < 66) {
    score -= 1;
    warnings.push("Maintenance still considers the aircraft worn.");
  }
  if (aircraft.crewCohesion.includes("strained") || aircraft.crewCohesion.includes("reduced")) {
    score -= 1;
    warnings.push("Crew cohesion is reduced.");
  }
  if (navigator?.isReplacement) {
    score -= 1;
    warnings.push("Replacement navigator makes this a questionable lead choice.");
  }
  const keyReplacements = getCrewMembersForAircraft(state, aircraftId).filter((member) =>
    member.isReplacement && ["pilot", "copilot", "navigator", "bombardier"].includes(member.currentAssignmentRole ?? "")
  ).length;
  if (keyReplacements >= 2) {
    score -= 2;
    warnings.push("Several key crew stations are filled by replacements.");
  }
  if (score >= 2) {
    return {
      label: "Trusted lead",
      summary: "Operations trusts this crew as lead.",
      warnings
    };
  }
  if (score >= 0) {
    return {
      label: "Workable lead",
      summary: warnings[0] ?? "This lead choice is workable, though not ideal.",
      warnings
    };
  }
  return {
    label: "Questionable lead",
    summary: warnings[0] ?? "Operations doubts this aircraft should carry the lead.",
    warnings
  };
}

function operationTypeCommandCredit(operationType: OperationType, target: Target): string {
  switch (operationType) {
    case "main_strike":
      return target.directiveRelevance === "high"
        ? "Command would likely regard a useful result here as meaningful progress."
        : "Command will expect a clear return if the group commits a full main strike.";
    case "reduced_strike":
      return "Command may accept this as prudent, but it will credit the result cautiously.";
    case "support_raid":
      return "Command will view this as setup work unless it clearly enables a later direct strike.";
    case "follow_up_attack":
      return "Command will value this more if the earlier damage was real and worth exploiting.";
    case "harassment_diversion":
      return "Command sees this as a stopgap rather than a decisive answer.";
    default:
      return "Command interest remains qualified.";
  }
}

export function getPlanningStaffPreview(state: SaveState): {
  warnings: string[];
  operations: string;
  intelligence: string;
  engineering: string;
  personnel: string;
  command: string;
} {
  const target = getTargetById(state, state.planning.selectedTargetId);
  const selectedAircraft = state.planning.assignedAircraftIds
    .map((id) => ({ aircraft: getAircraftById(state, id), availability: getAircraftAvailability(state, id) }))
    .filter((entry) => entry.aircraft);
  const lead = getLeadAircraftAssessment(state, state.planning.leadAircraftId);
  const marginalCount = selectedAircraft.filter((entry) => entry.availability.level === "marginal").length;
  const unavailableCount = selectedAircraft.filter((entry) => entry.availability.level === "unavailable").length;
  const intelAge = target ? getTargetIntelAgeLabel(state, target.id) : "unknown";
  const warnings = [
    ...(lead.warnings),
    ...selectedAircraft.flatMap((entry) => entry.availability.warnings.slice(0, 1))
  ].filter((warning, index, array) => array.indexOf(warning) === index).slice(0, 5);

  const operations = !target
    ? "Operations cannot frame the order until a primary target is chosen."
    : state.planning.operationType === "reduced_strike"
      ? "Operations considers this package suitable for a reduced strike if expectations stay modest."
      : state.planning.operationType === "support_raid"
        ? "Operations sees this as a support action intended to shape the next larger effort."
        : state.planning.operationType === "follow_up_attack"
          ? "Operations believes this order is trying to exploit earlier disruption before the enemy settles."
          : state.planning.operationType === "harassment_diversion"
            ? "Operations reads this as a crisis option meant to keep pressure on without staking the whole group."
            : "Operations considers this a direct strike order and will expect the formation to behave like one.";

  const intelligence = !target
    ? "Intelligence has no target file in front of it."
    : intelAge === "stale"
      ? "Intelligence warns that the target file is stale and should not be treated as firm."
      : intelAge === "aging"
        ? "Intelligence considers the file usable, but it is already beginning to age."
        : "Intelligence considers the latest file serviceable for planning, though not exact.";

  const engineering = unavailableCount > 0
    ? "Engineering warns that not every selected aircraft is truly ready for the order as written."
    : marginalCount >= 2
      ? "Engineering notes that several aircraft are serviceable but worn."
      : "Engineering does not object strongly, though it still distrusts some airframes.";

  const personnel = lead.summary.includes("Replacement navigator")
    ? "Personnel warns the nominated lead crew contains a replacement in a key station."
    : lead.label === "Questionable lead"
      ? `Personnel shares Operations' concern: ${lead.summary}`
      : "Personnel sees no overwhelming crew objection beyond the usual fatigue concerns.";

  const command = !target
    ? "Command cannot judge the value of the order without a target."
    : operationTypeCommandCredit(state.planning.operationType, target);

  return { warnings, operations, intelligence, engineering, personnel, command };
}

function updateVisibleTargetAssessment(target: Target, assessment: string, evidence: string[], sourceLabel: string, recommendation?: string, at?: number): void {
  target.assessedCondition = assessment;
  target.assessedDefense = buildVisibleDefenseAssessment(target, assessment, sourceLabel);
  target.latestIntelNote = `${sourceLabel}: ${assessment}`;
  target.latestIntelSource = sourceLabel;
  target.latestIntelRecommendation = recommendation ?? null;
  target.latestIntelUpdatedAt = at ?? Date.now();
  for (const evidenceText of evidence) {
    if (!target.evidence.includes(evidenceText)) {
      target.evidence.unshift(evidenceText);
    }
  }
}

function snapshotAircraftCrew(state: SaveState, aircraftId: string): MissionAircraftCrewSnapshot {
  const members = CREW_ROLES.map((role) => {
    const assigned = getEffectiveRoleOccupant(state, aircraftId, role);
    if (!assigned) {
      return null;
    }
    const replacementStatusAtLaunch: MissionCrewSnapshotMember["replacementStatusAtLaunch"] =
      assigned.isReplacement
        ? assigned.isPermanentReplacement
          ? "permanent_replacement"
          : "temporary_replacement"
        : "original";
    return {
      crewMemberId: assigned.id,
      roleAtLaunch: role,
      replacementStatusAtLaunch
    };
  }).filter((item): item is MissionCrewSnapshotMember => item !== null);

  return {
    aircraftId,
    crewMemberIds: members.map((member) => member.crewMemberId),
    members
  };
}

function defaultCrewEffect(member: CrewMember, roleAtLaunch: CrewRole): MissionCrewEffect {
  return {
    crewMemberId: member.id,
    roleAtLaunch,
    status: member.status === "fit" ? "resting" : member.status,
    fatigue: shiftFatigue(member.fatigue, 1),
    morale: member.morale,
    injurySeverity: member.injurySeverity,
    recoveryAvailableAt: member.recoveryAvailableAt,
    note: `${member.name} returned without confirmed major incident.`
  };
}

function crewDamageBias(role: CrewRole): number {
  if (role === "pilot" || role === "copilot") {
    return 0.75;
  }
  if (role === "navigator" || role === "bombardier") {
    return 0.85;
  }
  return 1.1;
}

function chooseCrewCasualtyBudget(
  snapshot: MissionAircraftCrewSnapshot,
  participation: Mission["hiddenOutcome"]["aircraftOutcomes"][number]["participation"],
  outcomeRisk: number
): Array<{ crewMemberId: string; severity: "light" | "serious" | "loss" }> {
  if (participation === "lost") {
    return snapshot.members.map((member) => ({ crewMemberId: member.crewMemberId, severity: "loss" }));
  }

  let slots = 0;
  let seriousSlots = 0;
  if (participation === "diverted") {
    slots = chance(0.22) ? 1 : 0;
  } else if (outcomeRisk >= 0.92) {
    slots = chance(0.7) ? 2 : 1;
    seriousSlots = chance(0.35) ? 1 : 0;
  } else if (outcomeRisk >= 0.72) {
    slots = chance(0.55) ? 1 : 0;
    seriousSlots = chance(0.18) && slots > 0 ? 1 : 0;
  } else if (outcomeRisk >= 0.5) {
    slots = chance(0.28) ? 1 : 0;
  } else {
    slots = chance(0.08) ? 1 : 0;
  }

  const candidates = snapshot.members
    .map((member) => ({
      crewMemberId: member.crewMemberId,
      weight: crewDamageBias(member.roleAtLaunch)
    }))
    .sort((left, right) => right.weight - left.weight);

  const chosen: Array<{ crewMemberId: string; severity: "light" | "serious" | "loss" }> = [];
  for (const candidate of candidates) {
    if (chosen.length >= slots) {
      break;
    }
    if (chance(Math.min(0.85, candidate.weight / 1.15))) {
      const severity: "light" | "serious" = seriousSlots > 0 ? "serious" : "light";
      if (seriousSlots > 0) {
        seriousSlots -= 1;
      }
      chosen.push({ crewMemberId: candidate.crewMemberId, severity });
    }
  }
  if (slots > 0 && chosen.length === 0 && candidates.length > 0) {
    chosen.push({ crewMemberId: candidates[0]!.crewMemberId, severity: seriousSlots > 0 ? "serious" : "light" });
  }
  return chosen;
}

function createCrewEffectsForOutcome(
  state: SaveState,
  snapshot: MissionAircraftCrewSnapshot,
  participation: Mission["hiddenOutcome"]["aircraftOutcomes"][number]["participation"],
  outcomeRisk: number,
  now: number
): { effects: MissionCrewEffect[]; casualtySummary: string[] } {
  const effects: MissionCrewEffect[] = [];
  const summary: string[] = [];
  const casualtyBudget = chooseCrewCasualtyBudget(snapshot, participation, outcomeRisk);
  const casualtyMap = new Map(casualtyBudget.map((entry) => [entry.crewMemberId, entry.severity]));
  for (const memberSnapshot of snapshot.members) {
    const member = getCrewMemberById(state, memberSnapshot.crewMemberId);
    if (!member) {
      continue;
    }
    const effect = defaultCrewEffect(member, memberSnapshot.roleAtLaunch);
    effect.note = `${member.name} returned tired but available for debrief.`;

    const severity = casualtyMap.get(member.id);

    if (severity === "loss") {
      const rolled = Math.random();
      effect.status = rolled < 0.25 ? "kia" : rolled < 0.55 ? "pow" : "missing";
      effect.injurySeverity = "permanent";
      effect.fatigue = "exhausted";
      effect.morale = lowerMorale(effect.morale);
      effect.recoveryAvailableAt = null;
      effect.note = `${member.name} is now listed as ${effect.status.replaceAll("_", " ")} after the aircraft failed to return.`;
      summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} ${effect.status.replaceAll("_", " ")}.`);
    } else if (severity === "serious") {
      effect.status = "seriously_wounded";
      effect.injurySeverity = "serious";
      effect.fatigue = "exhausted";
      effect.morale = lowerMorale(effect.morale);
      effect.recoveryAvailableAt = null;
      effect.note = `${member.name} was seriously wounded during the mission and is not expected back during this operation cycle.`;
      summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} seriously wounded.`);
    } else if (severity === "light") {
      effect.status = "lightly_wounded";
      effect.injurySeverity = "light";
      effect.fatigue = "tired";
      effect.morale = lowerMorale(effect.morale);
      effect.recoveryAvailableAt = now + LIGHT_WOUND_RECOVERY_MS;
      effect.note = `${member.name} returned lightly wounded and will need brief medical recovery.`;
      summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} lightly wounded.`);
    } else if (participation === "diverted") {
      effect.status = chance(0.18) ? "lightly_wounded" : "resting";
      effect.injurySeverity = effect.status === "lightly_wounded" ? "light" : "none";
      effect.fatigue = "exhausted";
      effect.recoveryAvailableAt = effect.status === "lightly_wounded" ? now + LIGHT_WOUND_RECOVERY_MS : null;
      effect.note = effect.status === "lightly_wounded"
        ? `${member.name} returned from the diversion lightly wounded.`
        : `${member.name} returned from the diversion badly fatigued.`;
      if (effect.status === "lightly_wounded") {
        summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} lightly wounded on diversion.`);
      }
    }

    effects.push(effect);
  }
  return { effects, casualtySummary: summary };
}

function degradeConfidence(confidence: MissionEvent["confidence"]): MissionEvent["confidence"] {
  switch (confidence) {
    case "confirmed":
      return "probable";
    case "probable":
      return "estimated";
    case "estimated":
      return "fragmentary";
    default:
      return confidence;
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
  const secondaryTarget = state.planning.secondaryTargetId ? getTargetById(state, state.planning.secondaryTargetId) : undefined;
  const assignedAircraftIds = [...state.planning.assignedAircraftIds];
  if (assignedAircraftIds.length === 0) {
    return null;
  }
  if (!state.planning.leadAircraftId || !assignedAircraftIds.includes(state.planning.leadAircraftId)) {
    return null;
  }
  const leadAircraftId = state.planning.leadAircraftId;
  const leadAssessment = getLeadAircraftAssessment(state, leadAircraftId);
  const staffPreview = getPlanningStaffPreview(state);
  const campaignContext = buildMissionCampaignContext(state, target, state.planning.operationType, state.planning.routeRisk);

  const launchTime = state.planning.launchMode === "schedule" ? now + state.planning.scheduleDelayMs : now;
  const duration = missionDurationForTarget(target);
  const stageTimes = {
    takeoff: launchTime,
    assembly: launchTime + duration * 0.14,
    outbound: launchTime + duration * 0.34,
    target_area: launchTime + duration * 0.56,
    withdrawal: launchTime + duration * 0.72,
    recovery: launchTime + duration * 0.9,
    debrief_ready: launchTime + duration
  };
  const doctrineVisibilityMod =
    state.planning.attackDoctrine === "abort_unless_visual" ? 8
      : state.planning.attackDoctrine === "bomb_through_cloud" ? -6
        : 0;
  const visibility = chance((target.hiddenWeatherRisk + (state.planning.standingOrders.useSecondaryIfObscured ? -5 : 5) + doctrineVisibilityMod) / 100)
    ? "obscured"
    : chance(0.45)
      ? "broken"
      : "clear";
  const avgCondition = assignedAircraftIds.reduce((sum, aircraftId) => sum + (getAircraftById(state, aircraftId)?.hiddenCondition ?? 70), 0) / assignedAircraftIds.length;
  const avgFatigue = assignedAircraftIds.reduce((sum, aircraftId) => {
    const manifest = getCrewMembersForAircraft(state, aircraftId);
    return sum + manifest.reduce((inner, member) => inner + (member.fatigue === "exhausted" ? 2 : member.fatigue === "tired" ? 1 : 0), 0) / Math.max(1, manifest.length);
  }, 0) / assignedAircraftIds.length;
  const doctrineRisk =
    state.planning.attackDoctrine === "repeat_if_needed" ? 8
      : state.planning.attackDoctrine === "abort_unless_visual" ? -6
        : state.planning.attackDoctrine === "bomb_through_cloud" ? 3
          : 0;
  const operationRisk =
    state.planning.operationType === "main_strike" ? 4
      : state.planning.operationType === "reduced_strike" ? -3
        : state.planning.operationType === "support_raid" ? -2
          : state.planning.operationType === "follow_up_attack" ? 2
            : -4;
  const leadRisk = leadAssessment.label === "Trusted lead" ? -5 : leadAssessment.label === "Questionable lead" ? 7 : 0;
  const riskBase = target.hiddenDefenseLevel
    + (state.planning.routeRisk === "cautious" ? -9 : state.planning.routeRisk === "direct" ? 11 : 0)
    + (100 - avgCondition) * 0.35
    + avgFatigue * 7
    + doctrineRisk
    + operationRisk
    + leadRisk
    + missionContextRiskTotal(campaignContext);

  const launchCrewManifests = assignedAircraftIds.map((aircraftId) => snapshotAircraftCrew(state, aircraftId));
  const outcomes: Mission["hiddenOutcome"]["aircraftOutcomes"] = [];
  let contributed = 0;

  for (const aircraftId of assignedAircraftIds) {
    const aircraft = getAircraftById(state, aircraftId);
    if (!aircraft) {
      continue;
    }
    const snapshot = launchCrewManifests.find((entry) => entry.aircraftId === aircraftId);
    if (!snapshot) {
      continue;
    }
    const pilotSnapshot = snapshot.members.find((member) => member.roleAtLaunch === "pilot");
    const pilot = pilotSnapshot ? getCrewMemberById(state, pilotSnapshot.crewMemberId) : undefined;
    const outcomeRisk = clamp(
      (riskBase + (100 - aircraft.hiddenCondition) * 0.45 + fatigueRisk(pilot?.fatigue ?? "rested") + experienceMod(pilot?.experience ?? "regular")) / 100,
      0.1,
      0.96
    );
    const abortChance = clamp((68 - aircraft.hiddenCondition) / 180 + (pilot?.fatigue === "exhausted" ? 0.08 : 0), 0, 0.35);
    let participation: Mission["hiddenOutcome"]["aircraftOutcomes"][number]["participation"] = "full";
    let finalStatus: Aircraft["status"] = "serviceable";
    let damageDelta = Math.round(4 + outcomeRisk * 18 + Math.random() * 12);
    let note = "Returned without confirmed major incident.";
    let contributedToStrike = true;

    if (chance(abortChance)) {
      participation = "aborted";
      finalStatus = "damaged";
      damageDelta = Math.round(8 + Math.random() * 8);
      note = "Dropped out before the main attack after mechanical trouble was reported.";
      contributedToStrike = false;
    } else if (chance(outcomeRisk * 0.14)) {
      participation = "lost";
      finalStatus = "lost";
      damageDelta = 100;
      note = "Failed to return and is now listed as missing after the operation.";
    } else if (chance(outcomeRisk * 0.24)) {
      participation = "diverted";
      finalStatus = chance(0.45) ? "diverted" : "damaged";
      damageDelta = Math.round(18 + Math.random() * 16);
      note = finalStatus === "diverted"
        ? "Reported down at an outlying strip after a rough return."
        : "Returned damaged and will require more than a quick patch.";
    } else if (chance(outcomeRisk * 0.44)) {
      finalStatus = "damaged";
      damageDelta = Math.round(10 + Math.random() * 12);
      note = "Returned with visible damage and several uncertain maintenance complaints.";
    } else {
      damageDelta = Math.round(3 + Math.random() * 6);
      note = visibility === "obscured"
        ? "Returned safely, though the crew remains unsure of the bombing result."
        : "Returned safely and reports a reasonably orderly run.";
    }

    const { effects, casualtySummary } = createCrewEffectsForOutcome(state, snapshot, participation, outcomeRisk, stageTimes.debrief_ready);
    outcomes.push({
      aircraftId,
      participation,
      damageDelta,
      finalStatus,
      conditionSummary: note,
      note,
      contributedToStrike,
      launchManifest: snapshot,
      crewEffects: effects,
      casualtySummary
    });
    if (contributedToStrike) {
      contributed += 1;
    }
  }

  const visibilityPenalty = visibility === "obscured" ? 0.45 : visibility === "broken" ? 0.72 : 1;
  const doctrineDamageMod =
    state.planning.attackDoctrine === "repeat_if_needed" ? 1.18
      : state.planning.attackDoctrine === "abort_unless_visual" ? 0.78
        : state.planning.attackDoctrine === "bomb_through_cloud" ? 0.92
          : 1;
  const leadDamageMod = leadAssessment.label === "Trusted lead" ? 1.08 : leadAssessment.label === "Questionable lead" ? 0.88 : 1;
  const operationDamageMod =
    state.planning.operationType === "main_strike" ? 1.14
      : state.planning.operationType === "reduced_strike" ? 0.85
        : state.planning.operationType === "support_raid" ? 0.76
          : state.planning.operationType === "follow_up_attack"
            ? (target.lastDebriefAt || target.lastMissionAt ? 1.12 : 0.96)
            : 0.62;
  const secondaryShift = Boolean(
    secondaryTarget
    && visibility === "obscured"
    && state.planning.standingOrders.useSecondaryIfObscured
    && state.planning.attackDoctrine !== "abort_unless_visual"
  );
  const noEffectiveAttack = visibility === "obscured" && state.planning.attackDoctrine === "abort_unless_visual";
  const attackedTarget = secondaryShift ? (secondaryTarget ?? target) : target;
  const repairOpportunityBoost = campaignContext?.reportModifiers.some((modifier) => modifier.key === "repair_network_slowed") ? 1.08 : 1;
  const computedDamage = Math.round(contributed * (8 + Math.random() * 5) * visibilityPenalty * doctrineDamageMod * leadDamageMod * operationDamageMod * repairOpportunityBoost);
  const targetDamage = noEffectiveAttack || contributed === 0 ? 0 : clamp(computedDamage, 1, 42);
  const targetAssessment =
    noEffectiveAttack
      ? "Crews report that cloud and visibility denied any attack the force could trust."
      : secondaryShift
        ? `Crews believe the primary was obscured and that the force turned its effort toward ${attackedTarget.name}, though the result remains hazy.`
        : visibility === "obscured"
          ? "Crews report fires near the objective, but smoke and cloud make useful damage difficult to confirm."
          : targetDamage >= 24
            ? "Several crews believe the aiming area was struck with probable effect."
            : "Bombing was carried out, though the visible operational effect remains uncertain.";
  const targetEvidence = noEffectiveAttack
    ? [
        "Lead crews report the target never presented clearly enough for a trusted attack.",
        "Returning aircraft disagree on whether any bombs were released effectively."
      ]
    : secondaryShift
      ? [
          `Crews report the primary was obscured and that bombs were redirected toward ${attackedTarget.name}.`,
          "Exact impact points remain difficult to confirm from the returning accounts."
        ]
      : visibility === "obscured"
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
  const doctrineNote =
    state.planning.attackDoctrine === "repeat_if_needed"
      ? "Doctrine allowed repeated effort where crews thought it necessary, increasing exposure in return for a firmer strike."
      : state.planning.attackDoctrine === "abort_unless_visual"
        ? "Doctrine required a clear view before committing to the attack."
        : state.planning.attackDoctrine === "bomb_through_cloud"
          ? "Doctrine favored preserving tempo through cloud, even at the cost of certainty."
          : "Doctrine favored a single disciplined pass over the target.";
  const leadOutcome = leadAircraftId ? outcomes.find((outcome) => outcome.aircraftId === leadAircraftId) : undefined;
  const leadNote =
    !leadAircraftId
      ? "No separate lead aircraft was logged for this order."
      : leadOutcome?.participation === "lost" || leadOutcome?.participation === "diverted"
        ? "Trouble to the lead aircraft appears to have contributed to formation confusion."
        : leadAssessment.label === "Trusted lead"
          ? "The lead aircraft appears to have held the formation together reasonably well."
          : leadAssessment.label === "Questionable lead"
            ? "Lead-aircraft quality may have contributed to a more uncertain run."
            : "Lead influence appears mixed rather than decisive.";
  const commandAssessment =
    state.planning.operationType === "main_strike"
      ? targetDamage >= 18 ? "Command is likely to regard this as a meaningful main effort if later evidence holds up." : "Command will probably judge the main effort harshly unless later evidence improves."
      : state.planning.operationType === "support_raid"
        ? targetDamage >= 12 ? "Command may accept this as useful setup work, though not as a decisive answer." : "Command is unlikely to find this support action satisfying by itself."
        : state.planning.operationType === "reduced_strike"
          ? targetDamage >= 12 ? "Command may see this as prudent limited progress." : "Command will likely see this as cautious but thin."
          : state.planning.operationType === "follow_up_attack"
            ? targetDamage >= 14 ? "Command may view the follow-up as a worthwhile exploitation of earlier disruption." : "Command may doubt that the follow-up justified the effort."
            : targetDamage >= 8
              ? "Command may accept the diversion as buying time, though not solving the directive."
              : "Command is unlikely to see the diversion as more than a temporary gesture.";

  const stages: Array<"takeoff" | "assembly" | "outbound" | "target_area" | "withdrawal" | "recovery" | "debrief_ready"> = [
    "takeoff",
    "assembly",
    "outbound",
    "target_area",
    "withdrawal",
    "recovery",
    "debrief_ready"
  ];
  const riskWord = defenseText(target.hiddenDefenseLevel);
  const hasLossRisk = outcomes.some((outcome) => outcome.finalStatus === "lost");
  const hasDiversionRisk = outcomes.some((outcome) => outcome.finalStatus === "diverted");
  const timelineEvents: MissionEvent[] = stages.map((stage) => {
    const report = stageReport(stage, target, riskWord, visibility, {
      operationType: state.planning.operationType,
      weather: state.campaign.stationWeather,
      targetType: target.type,
      leadLabel: leadAssessment.label,
      aircraftCount: state.planning.assignedAircraftIds.length,
      hasLossRisk,
      hasDiversionRisk,
      missionContext: campaignContext
    });
    const hiddenEffects: HiddenEffect[] = [];
    if (stage === "assembly") {
      outcomes.forEach((outcome, index) => {
        if (outcome.participation === "aborted") {
          hiddenEffects.push({ kind: "apply_aircraft_outcome", aircraftId: outcome.aircraftId, outcomeIndex: index });
        }
      });
    }
    if (stage === "target_area") {
      hiddenEffects.push({ kind: "apply_target_damage", targetId: attackedTarget.id });
    }
    if (stage === "recovery") {
      outcomes.forEach((outcome, index) => {
        if (outcome.participation !== "aborted") {
          hiddenEffects.push({ kind: "apply_aircraft_outcome", aircraftId: outcome.aircraftId, outcomeIndex: index });
        }
      });
      hiddenEffects.push({ kind: "set_campaign_phase", phaseText: "Recovery reports are in. Debrief should follow shortly." });
    }
    if (stage === "debrief_ready") {
      outcomes.forEach((outcome, index) => {
        hiddenEffects.push({ kind: "apply_crew_outcome", aircraftId: outcome.aircraftId, outcomeIndex: index });
      });
      hiddenEffects.push({ kind: "generate_debrief" });
      hiddenEffects.push({ kind: "mark_mission_complete" });
    }
    return {
      id: nextId(state, "mission-event"),
      time: Math.round(stageTimes[stage]),
      stage,
      type: stage,
      targetId: target.id,
      severity: stage === "target_area" || stage === "recovery" ? "heavy" : "moderate",
      hiddenEffects,
      publicReportText:
        stage === "target_area" && secondaryShift
          ? `${report.text} Some crews believe a secondary objective was used instead.`
          : stage === "target_area" && noEffectiveAttack
            ? `${report.text} Lead reports suggest the force may have withheld a confident attack.`
            : report.text,
      confidence: leadAssessment.label === "Questionable lead" && (stage === "assembly" || stage === "target_area")
        ? degradeConfidence(report.confidence)
        : report.confidence,
      source: report.source,
      applied: false,
      revealed: false
    };
  });

  return {
    id: nextId(state, "mission"),
    plan: {
      targetId: target.id,
      operationType: state.planning.operationType,
      secondaryTargetId: state.planning.secondaryTargetId,
      leadAircraftId,
      assignedAircraftIds,
      scheduledLaunchTime: launchTime,
      routeRisk: state.planning.routeRisk,
      attackDoctrine: state.planning.attackDoctrine,
      standingOrders: { ...state.planning.standingOrders },
      status: launchTime > now ? "scheduled" : "launched",
      launchCrewManifests,
      staffWarningsAtLaunch: staffPreview.warnings
    },
    campaignContext,
    stage: launchTime > now ? "scheduled" : "takeoff",
    timelineEvents,
    generatedEvents: timelineEvents,
    reports: [],
    resultSummary: "",
    debrief: "",
    debriefCasualtyLines: [],
    status: launchTime > now ? "scheduled" : "launched",
    debriefGenerated: false,
    hiddenOutcome: {
      targetDamage,
      visibility,
      targetAssessment,
      targetEvidence,
      attackedTargetId: attackedTarget.id,
      attackedTargetName: attackedTarget.name,
      attackedSecondary: secondaryShift,
      doctrineNote,
      leadNote,
      commandAssessment,
      targetSuspectedEffects:
        noEffectiveAttack
          ? "Little strategic effect is presently expected from the mission."
          : targetDamage >= 24
          ? "Staff believes the target may be materially hindered for a time."
          : "Some disruption is possible, though the operational effect is still uncertain.",
      aircraftOutcomes: outcomes
    }
  };
}

function updateMissionParticipantsOnLaunch(state: SaveState, mission: Mission): void {
  for (const snapshot of mission.plan.launchCrewManifests) {
    for (const memberId of snapshot.crewMemberIds) {
      const member = getCrewMemberById(state, memberId);
      if (!member) {
        continue;
      }
      member.missionsFlown += 1;
      member.notes = "Aircrew is currently away on operation.";
    }
  }
}

export function launchMission(state: SaveState, now: number): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  const mission = buildMission(state, now);
  if (!mission) {
    return "Mission could not be created.";
  }
  markSelectedOpportunitiesExploited(state, mission, now);
  state.missions.unshift(mission);
  state.campaign.activeMissionId = mission.id;
  state.campaign.campaignPhase = mission.plan.status === "scheduled"
    ? "An operation has been scheduled. Reports will accumulate as time passes."
    : "An operation is now under way.";
  state.campaign.commandStanding = "High command expects a useful result, but the details will remain uncertain for some time.";
  state.campaign.pendingDecisions = ["Await timed reports and the returning crews."];
  syncPendingDecisionNotes(state);
  setSelectedTab(state, "current-operation");
  const target = getTargetById(state, mission.plan.targetId);
  addLog(
    state,
    `mission-launch-${mission.id}`,
    now,
    "operations",
    `A ${operationTypeLabel(mission.plan.operationType)} has been ordered against ${target?.name ?? "the selected target"} with ${mission.plan.assignedAircraftIds.length} aircraft.${mission.plan.leadAircraftId ? ` ${getAircraftById(state, mission.plan.leadAircraftId)?.name ?? "Lead aircraft"} is marked as lead.` : ""}`
  );
  for (const aircraftId of mission.plan.assignedAircraftIds) {
    const aircraft = getAircraftById(state, aircraftId);
    if (aircraft) {
      aircraft.missionCount += 1;
      aircraft.lastOutcomeNote = "Committed to the current operation.";
    }
  }
  updateMissionParticipantsOnLaunch(state, mission);
  syncDerivedCrews(state);
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
  if (!aircraft) {
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
  aircraft.lastOutcomeNote = aircraft.status === "lost"
    ? `${outcome.note} No replacement aircraft are available in this prototype slice.`
    : outcome.note;
  if (outcome.damageDelta > 0 && !aircraft.damageHistory.includes(outcome.note)) {
    aircraft.damageHistory.unshift(outcome.note);
  }
  if (aircraft.status === "damaged" || aircraft.status === "diverted") {
    aircraft.repairJobId = null;
  }
  if (aircraft.status === "lost") {
    addLog(state, `aircraft-lost-${mission.id}-${aircraft.id}`, state.lastReconciledAt, "operations", `${aircraft.name} is now listed as lost. ${aircraft.lastOutcomeNote}`);
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
  for (const effect of outcome.crewEffects) {
    const member = getCrewMemberById(state, effect.crewMemberId);
    if (!member) {
      continue;
    }
    member.status = effect.status;
    member.fatigue = effect.fatigue;
    member.morale = effect.morale;
    member.injurySeverity = effect.injurySeverity;
    member.recoveryAvailableAt = effect.recoveryAvailableAt;
    member.notes = effect.note;
    normalizeSeriousWoundMember(member);
  }
  updateAllDerivedCrewState(state);
}

function generateDebrief(state: SaveState, mission: Mission, beatTracker?: { count: number }): void {
  if (mission.debriefGenerated) {
    return;
  }
  const target = getTargetById(state, mission.plan.targetId);
  if (!target) {
    return;
  }
  const attackedTarget = getTargetById(state, mission.hiddenOutcome.attackedTargetId) ?? target;
  const lostCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "lost").length;
  const damagedCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "damaged").length;
  const divertedCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "diverted").length;
  mission.resultSummary = mission.hiddenOutcome.targetDamage <= 0
    ? `${operationTypeLabel(mission.plan.operationType)} produced no clearly effective attack; ${damagedCount} damaged, ${divertedCount} diverted, ${lostCount} missing or lost.`
    : `${severityFromDamage(mission.hiddenOutcome.targetDamage)} ${operationTypeLabel(mission.plan.operationType)} effect reported against ${attackedTarget.name}; ${damagedCount} damaged, ${divertedCount} diverted, ${lostCount} missing or lost.`;
  mission.debriefCasualtyLines = mission.hiddenOutcome.aircraftOutcomes.flatMap((outcome) => {
    const aircraft = getAircraftById(state, outcome.aircraftId);
    return outcome.casualtySummary.map((line) => `${aircraft?.name ?? outcome.aircraftId}: ${line}`);
  });
  mission.debrief = [
    `Operation order called for a ${operationTypeLabel(mission.plan.operationType)} against ${target.name}${mission.plan.secondaryTargetId ? ` with ${getTargetById(state, mission.plan.secondaryTargetId)?.name ?? "a secondary target"} held in reserve` : ""}.`,
    mission.hiddenOutcome.attackedSecondary
      ? `Crews believe the primary was obscured and that the effort shifted toward ${attackedTarget.name}.`
      : mission.hiddenOutcome.targetDamage <= 0
        ? "Crews do not agree that any clearly effective attack was made."
        : `Crews believe the main effort fell against ${attackedTarget.name}.`,
    `Crews report ${mission.hiddenOutcome.targetAssessment}`,
    `Aircraft accounting remains imperfect, but current reports indicate ${damagedCount} damaged return${damagedCount === 1 ? "" : "s"}, ${divertedCount} diverted, and ${lostCount} missing or lost.`,
    mission.hiddenOutcome.doctrineNote,
    mission.hiddenOutcome.leadNote,
    mission.hiddenOutcome.commandAssessment,
    ...selectRelevantHooks(state, { targetId: attackedTarget.id, allowEvidenceUnknown: true, limit: 1 }).map((hook) => hookFlavorLine(hook)),
    target.suspectedEffects
  ].join(" ");
  mission.debriefGenerated = true;
  mission.status = "complete";
  mission.stage = "complete";
  registerOperationalBeat(state, beatTracker);

  applyStrategicDirectiveEffects(state, mission, attackedTarget, state.lastReconciledAt);
  applyMissionCampaignConsequences(state, mission, attackedTarget, state.lastReconciledAt);

  if (attackedTarget.id !== target.id) {
    updateVisibleTargetAssessment(
      attackedTarget,
      mission.hiddenOutcome.targetAssessment,
      mission.hiddenOutcome.targetEvidence,
      "Debrief assessment",
      "Staff recommends weighing a reattack against fresh reconnaissance.",
      state.lastReconciledAt
    );
    updateVisibleTargetAssessment(
      target,
      "Primary target remained obscured. No reliable strike assessment could be filed.",
      ["Returning crews report the primary target stayed obscured during the attack run."],
      "Debrief note",
      "Staff recommends fresh reconnaissance before relying on the primary target file again.",
      state.lastReconciledAt
    );
  } else {
    updateVisibleTargetAssessment(
      target,
      mission.hiddenOutcome.targetAssessment,
      mission.hiddenOutcome.targetEvidence,
      "Debrief assessment",
      "Staff recommends weighing a reattack against fresh reconnaissance.",
      state.lastReconciledAt
    );
  }
  attackedTarget.suspectedEffects = mission.hiddenOutcome.targetSuspectedEffects;
  attackedTarget.lastMissionSummary = mission.resultSummary;
  attackedTarget.lastMissionAt = state.lastReconciledAt;
  attackedTarget.lastDebriefSummary = mission.debrief;
  attackedTarget.lastDebriefAt = state.lastReconciledAt;
  if (attackedTarget.id !== target.id) {
    target.lastMissionSummary = `Primary target obscured during ${operationTypeLabel(mission.plan.operationType)}; crews report the effort shifted elsewhere.`;
    target.lastMissionAt = state.lastReconciledAt;
    target.lastDebriefSummary = mission.debrief;
    target.lastDebriefAt = state.lastReconciledAt;
  }

  state.campaign.activeMissionId = null;
  state.campaign.lastDebriefMissionId = mission.id;
  state.campaign.campaignPhase = "Debrief filed. Engineering and intelligence await your next order.";
  state.campaign.commandStanding = getDirectiveProgressSummary(state).patience.replace("Command patience: ", "");
  state.campaign.pendingDecisions = ["Review damage, start repairs, or order recon."];
  syncPendingDecisionNotes(state);
  state.campaign.stationWeather = createStationWeather(state.campaign.currentDay + mission.hiddenOutcome.targetDamage % 3);
  buildMissionLedgerEntry(state, mission, target);
  addLog(state, `debrief-${mission.id}`, state.lastReconciledAt, "debrief", mission.debrief);
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

function applyTargetDamage(state: SaveState, mission: Mission): void {
  const target = getTargetById(state, mission.hiddenOutcome.attackedTargetId);
  if (!target) {
    return;
  }
  const newCondition = clamp(target.hiddenActualCondition - mission.hiddenOutcome.targetDamage, 0, 100);
  if (newCondition === target.hiddenActualCondition) {
    return;
  }
  target.hiddenActualCondition = newCondition;
  if (target.alertLevel === "low") {
    target.alertLevel = "elevated";
  } else if (chance(0.35)) {
    target.alertLevel = "high";
  }
}

function applyMissionEffect(state: SaveState, mission: Mission, effect: HiddenEffect, beatTracker?: { count: number }): void {
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
      generateDebrief(state, mission, beatTracker);
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

function applyMissionEvent(state: SaveState, mission: Mission, event: MissionEvent, beatTracker?: { count: number }): void {
  if (!event.revealed) {
    event.revealed = true;
    mission.reports.push(event.publicReportText);
    addLog(state, `report-${event.id}`, event.time, "report", event.publicReportText);
    addNotification(
      state,
      `toast-report-${event.id}`,
      event.stage === "debrief_ready" ? "debrief" : "report",
      event.stage === "debrief_ready" ? "Debrief ready" : `New report received: ${event.stage.replaceAll("_", " ")}`,
      event.time
    );
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
    applyMissionEffect(state, mission, effect, beatTracker);
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
  addNotification(state, `toast-repair-${job.id}`, "maintenance", `Maintenance complete: ${aircraft.name}`, job.completesAt);
}

function completeRecovery(state: SaveState, job: RecoveryJob): void {
  if (job.completionApplied) {
    return;
  }
  const aircraft = getAircraftById(state, job.aircraftId);
  if (!aircraft) {
    return;
  }
  aircraft.hiddenCondition = job.hiddenNewCondition;
  aircraft.status = job.hiddenReturnStatus;
  aircraft.conditionSummary = job.hiddenConditionSummary;
  aircraft.recoveryJobId = null;
  aircraft.lastOutcomeNote = job.resultText;
  if (!aircraft.damageHistory.includes(job.hiddenDamageNote)) {
    aircraft.damageHistory.unshift(job.hiddenDamageNote);
  }
  for (const update of job.hiddenCrewUpdates) {
    const member = getCrewMemberById(state, update.crewMemberId);
    if (!member) {
      continue;
    }
    member.status = update.status;
    member.fatigue = update.fatigue;
    member.injurySeverity = update.injurySeverity;
    member.recoveryAvailableAt = update.recoveryAvailableAt;
    member.notes = update.note;
  }
  job.status = "complete";
  job.completionApplied = true;
  updateAllDerivedCrewState(state);
  addLog(state, `recovery-${job.id}`, job.completesAt, "operations", job.resultText);
  addNotification(state, `toast-recovery-${job.id}`, "operations", `${aircraft.name} has returned from diversion`, job.completesAt);
}

function completeRecon(state: SaveState, recon: ReconMission, beatTracker?: { count: number }): void {
  if (recon.completionApplied) {
    return;
  }
  const target = getTargetById(state, recon.targetId);
  if (!target) {
    return;
  }
  target.intelConfidence = raiseConfidence(target.intelConfidence);
  target.lastReconDay = state.campaign.currentDay;
  target.lastReconAt = recon.interpretedAt;
  target.lastReconSummary = recon.resultText;
  target.alertLevel = recon.enemyAlertEffect;
  updateVisibleTargetAssessment(
    target,
    recon.hiddenAssessment,
    [recon.hiddenEvidence],
    "Recon interpretation",
    recon.recommendation,
    recon.interpretedAt
  );
  recon.status = "complete";
  recon.completionApplied = true;
  state.campaign.activeReconId = null;
  registerOperationalBeat(state, beatTracker);
  state.campaign.latestIntelUpdate = {
    reconId: recon.id,
    targetId: target.id,
    targetName: target.name,
    resultQuality: recon.resultQuality,
    assessment: recon.hiddenAssessment,
    evidence: recon.hiddenEvidence,
    recommendation: recon.recommendation,
    alertLevel: recon.enemyAlertEffect,
    updatedAt: recon.interpretedAt
  };
  applyReconCampaignConsequences(state, recon, target, recon.interpretedAt);
  buildReconLedgerEntry(state, recon, target);
  deliverStrategicIntelDrip(state, recon.interpretedAt, recon.targetId);
  addLog(state, `recon-${recon.id}`, recon.interpretedAt, "recon", recon.resultText);
  addNotification(state, `toast-recon-${recon.id}`, "recon", "Recon interpretation filed", recon.interpretedAt);
}

function applyFatigueRecovery(state: SaveState, elapsedMs: number, now: number): boolean {
  const steps = Math.floor(elapsedMs / FATIGUE_RECOVERY_MS);
  let changed = false;
  const recoveredMembers: CrewMember[] = [];
  for (const member of state.crewMembers) {
    const previousFatigue = member.fatigue;
    const previousStatus = member.status;
    if (steps > 0) {
      member.fatigue = recoverFatigue(member.fatigue, steps);
      if (member.status === "resting" && member.fatigue === "rested") {
        member.status = "fit";
      }
    }
    if (member.status === "lightly_wounded" && member.recoveryAvailableAt && member.recoveryAvailableAt <= now) {
      member.status = member.assignedAircraftId ? "fit" : "unassigned";
      member.injurySeverity = "none";
      member.recoveryAvailableAt = null;
      member.notes = "Recovered from light wounds and returned to duty.";
      recoveredMembers.push(member);
    }
    normalizeSeriousWoundMember(member);
    if (previousFatigue !== member.fatigue || previousStatus !== member.status) {
      changed = true;
    }
  }
  if (changed) {
    updateAllDerivedCrewState(state);
    for (const member of recoveredMembers) {
      maybeCreateRecoveredOriginalDecision(state, member, now);
    }
  }
  return changed;
}

function nudgeTargetRepairs(state: SaveState, elapsedMs: number): boolean {
  const daySteps = elapsedMs / DAY_MS;
  if (daySteps <= 0) {
    return false;
  }
  let changed = false;
  const repairScale = clamp(
    (state.campaign.directiveState.regionalRepairCapacity / 70) * state.campaign.profile.enemyResponse.repairBias,
    0.35,
    1.3
  );
  for (const target of state.targets) {
    const previous = target.hiddenActualCondition;
    const profileRepairMod = state.campaign.profile.applicationMode === "drift_only"
      ? getCampaignProfileTargetMod(state.campaign.profile, target.id, "repair")
      : 1;
    const slowingOpportunity = getActiveOpportunityBenefitsForTarget(state, target.id).some((opportunity) => opportunity.kind === "repair_network_slowed");
    const repairLift = Math.max(
      1,
      Math.round(target.hiddenRepairRate * repairScale * daySteps * profileRepairMod * (slowingOpportunity ? 0.72 : 1))
    );
    target.hiddenActualCondition = clamp(target.hiddenActualCondition + repairLift, 0, 100);
    if (previous !== target.hiddenActualCondition) {
      changed = true;
    }
  }
  return changed;
}

function hasActiveTimedWork(state: SaveState): boolean {
  return Boolean(getActiveMission(state))
    || state.repairJobs.some((job) => !job.completionApplied)
    || state.recoveryJobs.some((job) => !job.completionApplied)
    || state.reconMissions.some((recon) => !recon.completionApplied);
}

export function reconcileState(state: SaveState, now: number): boolean {
  if (state.campaign.frozenFinalState) {
    state.campaign.pendingTimeAdvanceKind = null;
    return pruneExpiredNotifications(state, now);
  }
  const previous = state.lastReconciledAt;
  const previousBeat = state.campaign.operationalBeat;
  const cause = state.campaign.pendingTimeAdvanceKind ?? "passive";
  const beatTracker = { count: 0 };
  if (cause === "passive" && !hasActiveTimedWork(state)) {
    now = previous;
  }
  let changed = false;
  let completedStationSideWork = false;
  for (const mission of state.missions) {
    const dueEvents = mission.timelineEvents
      .filter((event) => event.time <= now && (!event.applied || !event.revealed))
      .sort((left, right) => left.time - right.time);
    for (const event of dueEvents) {
      applyMissionEvent(state, mission, event, beatTracker);
      changed = true;
    }
  }
  for (const job of state.repairJobs) {
    if (job.status !== "complete" && job.completesAt <= now) {
      completeRepair(state, job);
      completedStationSideWork = true;
      changed = true;
    }
  }
  for (const job of state.recoveryJobs) {
    if (job.status !== "complete" && job.completesAt <= now) {
      completeRecovery(state, job);
      completedStationSideWork = true;
      changed = true;
    }
  }
  for (const recon of state.reconMissions) {
    if (!recon.completionApplied && recon.interpretedAt <= now) {
      completeRecon(state, recon, beatTracker);
      changed = true;
    } else if (recon.status === "airborne" && recon.returnsAt <= now) {
      recon.status = "awaiting_interpretation";
      changed = true;
    }
  }
  const elapsedMs = Math.max(0, now - previous);
  if (elapsedMs > 0) {
    changed = applyOperationalDrift(state, elapsedMs, now, cause) || changed;
  }
  if (cause === "let_work_finish" && completedStationSideWork) {
    registerOperationalBeat(state, beatTracker);
  }
  const beatDelta = state.campaign.operationalBeat - previousBeat;
  const dayAdvanced = cause === "stand_down" || cause === "day_advance";
  if (state.campaign.directiveState.commandPatience < 32) {
    createOrRefreshHook(state, {
      hookType: "command_pressure",
      sourceId: "command",
      relatedTargetId: null,
      createdDay: state.campaign.currentDay,
      createdAt: now,
      state: "active",
      fadingStartsDay: null,
      fadingStartsBeat: state.campaign.operationalBeat + 1,
      fadesAfterDay: null,
      fadesAfterBeat: state.campaign.operationalBeat + 2,
      evidenceKnown: true,
      consumedById: null,
      summary: "Higher command is increasingly impatient with further preparation."
    });
  }
  updateHookLifecycle(state, now, beatDelta, dayAdvanced);
  updateOpportunityStates(state, now, beatDelta, dayAdvanced);
  setCampaignPhase(state, computeCampaignPhase(state), now);
  maybeFinalizeCampaign(state, now);
  const waitNote = buildWaitResultNote(state, cause, elapsedMs);
  if (waitNote && waitNote !== state.campaign.latestWaitNote) {
    state.campaign.latestWaitNote = waitNote;
    addLog(state, `wait-note-${now}`, now, "command", waitNote);
    changed = true;
  }
  changed = pruneExpiredNotifications(state, now) || changed;
  changed = cleanupPlanningState(state) || changed;
  changed = evaluateTutorial(state) || changed;
  state.campaign.pendingTimeAdvanceKind = null;
  state.lastReconciledAt = now;
  return changed;
}

export function startRepair(state: SaveState, aircraftId: string, tier: RepairTier, now: number): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return "Aircraft not found.";
  }
  if (aircraft.repairJobId) {
    return "Aircraft already under repair.";
  }
  if (aircraft.status === "lost") {
    return "Lost aircraft cannot be repaired.";
  }
  if (aircraft.status === "diverted" || aircraft.recoveryJobId) {
    return "Aircraft away after diversion must be recovered before maintenance begins.";
  }
  if (state.campaign.activeMissionId && state.missions.some((mission) => mission.status !== "complete" && mission.plan.assignedAircraftIds.includes(aircraftId))) {
    return "Airborne aircraft cannot begin maintenance.";
  }
  const optionalInspection = isOptionalInspectionCandidate(state, aircraftId);
  if (aircraft.status !== "damaged" && !optionalInspection) {
    return "This aircraft does not currently require repair or optional inspection.";
  }
  if (optionalInspection && tier !== "thorough") {
    return "Optional preventive inspection only allows the thorough inspection setting.";
  }
  const groundCrew = getGroundCrewById(state, aircraft.assignedGroundCrewId);
  if (!groundCrew) {
    return "Ground crew not found.";
  }
  if (getActiveFieldJobForGroundCrew(state, groundCrew.id)) {
    return `${groundCrew.chiefName}'s crew is already occupied and cannot take another field job yet.`;
  }
  const speedBonus = groundCrew.specialty === "quick_patch" && tier === "patch"
    ? -60 * 1000
    : groundCrew.specialty === "careful_inspection" && tier === "thorough"
      ? -90 * 1000
      : 0;
  const baseDuration = tier === "patch" ? 2.5 * 60 * 1000 : tier === "standard" ? 5 * 60 * 1000 : 7.5 * 60 * 1000;
  const duration = Math.max(60 * 1000, baseDuration + speedBonus);
  const hiddenNewCondition = clamp(aircraft.hiddenCondition + (tier === "patch" ? 13 : tier === "standard" ? 22 : 30), 36, 96);
  const hiddenNewStatus: Aircraft["status"] = hiddenNewCondition >= 72 ? "serviceable" : "damaged";
  const resultText =
    optionalInspection
      ? `${aircraft.name} has completed optional preventive inspection work and is considered steadier than before.`
      : tier === "patch"
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
      optionalInspection
        ? "Optional preventive work. The aircraft may still have flown, but engineering will tie up the crew to steady it before the next order."
        : tier === "patch"
        ? "Fastest option. A patch may return the aircraft sooner, but engineering will not call it fully trusted."
        : tier === "standard"
          ? "Balanced turnround. This will occupy the ground crew for the normal field cycle."
          : "Safest field option. The aircraft will miss any immediate operation while the crew stays tied up longer.",
    resultText,
    completionApplied: false,
    hiddenNewCondition,
    hiddenNewStatus,
    hiddenConditionSummary: conditionSummary(hiddenNewCondition, hiddenNewStatus),
    hiddenDamageNote:
      optionalInspection
        ? "Optional preventive inspection completed on a worn but serviceable aircraft."
        : tier === "patch"
        ? "Quick patch completed; maintenance still distrusts the deeper structure."
        : tier === "standard"
          ? "Standard repair completed after post-mission damage."
          : "Thorough inspection completed and cleared the aircraft more carefully."
  };
  aircraft.status = "under_repair";
  aircraft.repairJobId = job.id;
  state.repairJobs.unshift(job);
  addLog(state, `repair-start-${job.id}`, now, "maintenance", `${groundCrew.chiefName} has started ${optionalInspection ? "optional preventive inspection" : tier} work on ${aircraft.name}.`);
  return null;
}

export function startRecovery(state: SaveState, aircraftId: string, now: number): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return "Aircraft not found.";
  }
  if (aircraft.status !== "diverted") {
    return "Aircraft is not currently away from station.";
  }
  if (aircraft.recoveryJobId) {
    return "Recovery from diversion is already under way.";
  }
  const groundCrew = getGroundCrewById(state, aircraft.assignedGroundCrewId);
  if (!groundCrew) {
    return "Ground crew not found.";
  }
  if (getActiveFieldJobForGroundCrew(state, groundCrew.id)) {
    return `${groundCrew.chiefName}'s crew is already occupied and cannot arrange the recovery yet.`;
  }
  const manifest = getCrewMembersForAircraft(state, aircraft.id);
  const hiddenCrewUpdates: RecoveryCrewUpdate[] = manifest.map((member) => {
    const wounded = chance(0.15);
    return {
      crewMemberId: member.id,
      status: wounded ? "lightly_wounded" : "resting",
      fatigue: "exhausted",
      injurySeverity: wounded ? "light" : "none",
      recoveryAvailableAt: wounded ? now + LIGHT_WOUND_RECOVERY_MS : null,
      note: wounded
        ? `${member.name} returned from diversion lightly wounded.`
        : `${member.name} has finally returned from the diversion and looks spent.`
    };
  });
  const rolled = Math.random();
  const hiddenNewCondition = clamp(aircraft.hiddenCondition + (rolled < 0.33 ? 12 : rolled < 0.72 ? 6 : 0), 24, 84);
  const hiddenReturnStatus: Aircraft["status"] = rolled < 0.33 ? "serviceable" : "damaged";
  const resultText =
    hiddenReturnStatus === "serviceable"
      ? `${aircraft.name} has returned from diversion. It is back on station, though engineering still wants a closer look.`
      : `${aircraft.name} has returned from diversion and now requires inspection before further use.`;
  const job: RecoveryJob = {
    id: nextId(state, "recovery"),
    aircraftId,
    groundCrewId: groundCrew.id,
    startedAt: now,
    completesAt: now + Math.round((groundCrew.specialty === "quick_patch" ? 3 : 4.5) * 60 * 1000),
    status: "in_progress",
    summary: `${aircraft.name} is down at an outlying field. Ferry arrangements are being made.`,
    resultText,
    completionApplied: false,
    hiddenNewCondition,
    hiddenReturnStatus,
    hiddenConditionSummary: conditionSummary(hiddenNewCondition, hiddenReturnStatus),
    hiddenDamageNote:
      hiddenReturnStatus === "serviceable"
        ? "Returned from diversion worn but usable after a careful ferry flight."
        : "Returned from diversion needing engineering attention before another operation.",
    hiddenCrewUpdates
  };
  aircraft.recoveryJobId = job.id;
  aircraft.lastOutcomeNote = "Recovery from diversion is being arranged.";
  state.recoveryJobs.unshift(job);
  addLog(state, `recovery-start-${job.id}`, now, "operations", `Recovery from diversion has been ordered for ${aircraft.name}.`);
  return null;
}

export function startRecon(state: SaveState, targetId: string, type: ReconType, now: number): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  if (state.campaign.activeReconId) {
    return "Recon section already occupied.";
  }
  const target = getTargetById(state, targetId);
  if (!target) {
    return "Target not found.";
  }
  const duration =
    type === "focused_followup" ? 4.5 * 60 * 1000
      : type === "post_strike" ? 3.5 * 60 * 1000
        : 2.5 * 60 * 1000;
  const resultQuality: ReconResultQuality =
    type === "weather_route"
      ? target.hiddenWeatherRisk < 35 ? "clear" : target.hiddenWeatherRisk < 65 ? "partial" : "inconclusive"
      : target.hiddenActualCondition < 45 ? "clear" : target.hiddenActualCondition < 72 ? "partial" : "inconclusive";
  const enemyAlertEffect: AlertLevel =
    type === "weather_route"
      ? target.alertLevel
      : type === "post_strike"
        ? (target.alertLevel === "high" ? "high" : chance(0.2) ? "high" : "elevated")
        : type === "focused_followup"
          ? (target.alertLevel === "low" ? "elevated" : target.alertLevel)
          : (target.alertLevel === "high" ? "high" : chance(0.45) ? "high" : "elevated");
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
        : type === "weather_route"
          ? `Weather and route reconnaissance around ${target.name} has returned with a preliminary flying picture for the current window.`
          : type === "focused_followup"
            ? `A focused follow-up run on ${target.name} is being read against one unresolved question from earlier reporting.`
            : `Pre-strike reconnaissance over ${target.name} has returned with a fresh but incomplete look at target activity and approach conditions.`,
    confidenceChange: raiseConfidence(target.intelConfidence),
    enemyAlertEffect,
    completionApplied: false,
    hiddenAssessment:
      type === "weather_route"
        ? target.hiddenWeatherRisk < 35
          ? "Weather and approach conditions appear workable for a deliberate strike."
          : target.hiddenWeatherRisk < 65
            ? "Weather appears usable but imperfect, and staff expects a hazier attack picture."
            : "Weather and approach conditions argue for caution or a doctrine that tolerates poor visibility."
        : target.hiddenActualCondition < 45
          ? "Recon reports visible damage and probable interruption to operations."
          : target.hiddenActualCondition < 72
            ? "Recon suggests useful disturbance, though parts of the target remain hard to judge."
            : type === "pre_strike"
              ? "Recon finds the target active and still worth striking, though not complacent."
              : "Recon finds the target still appears largely operational.",
    hiddenEvidence:
      type === "weather_route"
        ? target.hiddenWeatherRisk < 35
          ? "Route observers report more reliable visibility than the older file implied."
          : target.hiddenWeatherRisk < 65
            ? "Cloud breaks and route reporting remain inconsistent but usable."
            : "Cloud and route reporting remain poor enough to complicate visual bombing."
        : target.hiddenActualCondition < 45
          ? "Fresh photography shows obvious disturbance in the target area."
          : target.hiddenActualCondition < 72
            ? "Recon photographs provide partial but usable new evidence."
            : "Fresh reconnaissance still finds the target operating with only limited visible disturbance.",
    resultQuality,
    recommendation:
      type === "weather_route"
        ? resultQuality === "clear"
          ? "Weather argues this is still a workable window for action."
          : resultQuality === "partial"
            ? "Weather is usable, but staff recommends a cautious route or doctrine."
            : "Weather argues for caution; further haste may buy tempo at the cost of certainty."
        : resultQuality === "clear"
          ? type === "post_strike"
            ? "Staff believes this result is useful enough to act on without demanding another look immediately."
            : "This target is worth striking now if the rest of the board can support it."
          : resultQuality === "partial"
            ? type === "focused_followup"
              ? "Damage remains unresolved; staff recommends deciding whether another look would truly help."
              : "Staff recommends weighing a follow-up attack against the value of more observation."
            : type === "post_strike"
              ? "Follow-up attack may be wasted unless other evidence improves the file."
              : "The latest run did not settle the question. Staff recommends caution."
  };
  state.reconMissions.unshift(recon);
  state.campaign.activeReconId = recon.id;
  addLog(state, `recon-start-${recon.id}`, now, "recon", `A ${type.replaceAll("_", " ")} recon sortie has been dispatched against ${target.name}.`);
  return null;
}

export function advanceCampaignDay(state: SaveState): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  setPendingTimeAdvance(state, "day_advance");
  state.campaign.currentDay += 1;
  state.debug.clockOffsetMs += DAY_MS;
  state.campaign.commandStanding = getDirectiveProgressSummary(state).patience.replace("Command patience: ", "");
  state.campaign.stationWeather = createStationWeather(state.campaign.currentDay);
  deliverStrategicIntelDrip(state, getEffectiveNow(state));
  addLog(state, `day-${state.campaign.currentDay}`, getEffectiveNow(state), "command", `Campaign day ${state.campaign.currentDay} has begun. Routine rest and repair time have accrued.`);
  syncPendingDecisionNotes(state);
  registerOperationalBeat(state);
  return null;
}

export function skipToNextReport(state: SaveState, now: number): string | null {
  const mission = getActiveMission(state);
  if (!mission) {
    return "No active mission.";
  }
  const nextEvent = mission.timelineEvents.filter((event) => !event.revealed).sort((a, b) => a.time - b.time)[0];
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
  const event = mission.timelineEvents.find((entry) => entry.stage === "debrief_ready");
  if (!event) {
    return "Debrief not ready.";
  }
  state.debug.clockOffsetMs += Math.max(0, event.time - now + 1000);
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
  const repairJobs = state.repairJobs.filter((job) => !job.completionApplied);
  const recoveryJobs = state.recoveryJobs.filter((job) => !job.completionApplied);
  if (repairJobs.length === 0 && recoveryJobs.length === 0) {
    return "No active repairs.";
  }
  for (const job of repairJobs) {
    job.completesAt = now - 1000;
  }
  for (const job of recoveryJobs) {
    job.completesAt = now - 1000;
  }
  return null;
}

function setPendingTimeAdvance(state: SaveState, kind: TimeAdvanceKind): void {
  state.campaign.pendingTimeAdvanceKind = kind;
}

function getLatestPendingTime(state: SaveState): number | null {
  const candidates: number[] = [];
  for (const mission of state.missions) {
    for (const event of mission.timelineEvents) {
      if (!event.revealed || !event.applied) {
        candidates.push(event.time);
      }
    }
  }
  for (const job of state.repairJobs) {
    if (!job.completionApplied) {
      candidates.push(job.completesAt);
    }
  }
  for (const job of state.recoveryJobs) {
    if (!job.completionApplied) {
      candidates.push(job.completesAt);
    }
  }
  for (const recon of state.reconMissions) {
    if (!recon.completionApplied) {
      candidates.push(recon.interpretedAt);
    }
  }
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function getBoundedOperationalNow(state: SaveState, now: number): number {
  const hasActiveWork = Boolean(getActiveMission(state))
    || state.repairJobs.some((job) => !job.completionApplied)
    || state.recoveryJobs.some((job) => !job.completionApplied)
    || state.reconMissions.some((recon) => !recon.completionApplied);
  if (!hasActiveWork) {
    return state.lastReconciledAt;
  }
  const latestPending = getLatestPendingTime(state);
  if (latestPending === null) {
    return state.lastReconciledAt;
  }
  return Math.min(now, latestPending);
}

function activeTargetNames(state: SaveState): string[] {
  return state.targets
    .filter((target) => target.hiddenActualCondition < 100)
    .map((target) => target.name);
}

function applyDailyStrategicDrift(state: SaveState, elapsedMs: number, now: number): boolean {
  const daySteps = Math.max(1, Math.floor(elapsedMs / DAY_MS));
  let changed = false;
  for (let step = 0; step < daySteps; step += 1) {
    changed = nudgeTargetRepairs(state, DAY_MS * 0.5) || changed;
    const directive = state.campaign.directiveState;
    directive.commandPatience = clamp(directive.commandPatience - 2, 0, 100);
    if (chance(0.35)) {
      deliverStrategicIntelDrip(state, now);
      changed = true;
    }
  }
  return changed;
}

function applyOperationalDrift(state: SaveState, elapsedMs: number, now: number, cause: TimeAdvanceKind): boolean {
  let changed = false;
  changed = applyFatigueRecovery(state, elapsedMs, now) || changed;
  if (cause === "stand_down" || cause === "day_advance") {
    changed = applyDailyStrategicDrift(state, elapsedMs, now) || changed;
    state.campaign.stationWeather = createStationWeather(state.campaign.currentDay);
    return changed;
  }
  if ((cause === "wait_next_event" || cause === "let_work_finish") && elapsedMs >= SHORT_WAIT_DRIFT_THRESHOLD_MS) {
    changed = nudgeTargetRepairs(state, Math.round(elapsedMs * 0.08)) || changed;
  }
  return changed;
}

function buildWaitResultNote(state: SaveState, cause: TimeAdvanceKind, elapsedMs: number): string | null {
  if (cause === "passive") {
    return null;
  }
  const activeTargets = activeTargetNames(state);
  const targetText = activeTargets.length > 0
    ? `${activeTargets[0]} still appears disrupted, though enemy repair activity may be slowly resuming.`
    : "No fresh target effect has yet become obvious from the pause.";
  if (cause === "wait_next_event") {
    if (getActiveMission(state)) {
      return "The board was held until the next report arrived. Staff is working from a little more evidence, but not the full picture yet.";
    }
    if (state.campaign.activeReconId) {
      return "Recon is still in motion. The pause bought interpretation time, but not a settled answer yet.";
    }
    return "Time was allowed to move to the next operational beat. Minor recovery continued while the broader picture remained largely unchanged.";
  }
  if (cause === "let_work_finish") {
    return state.repairJobs.some((job) => job.status === "complete" && job.completionApplied)
      ? `Current station work has caught up. Repairs and recovery advanced, and ${targetText.toLowerCase()}`
      : `Recon and station work were allowed to finish. ${targetText}`;
  }
  if (cause === "offline_return") {
    return "Work already under way has been carried through to its natural stopping point. The campaign has paused again at the next decision window.";
  }
  if (cause === "stand_down" || cause === "day_advance") {
    return `The group stood down into the next morning. Crews steadied, weather shifted, and ${targetText.toLowerCase()}`;
  }
  return null;
}

function roleLossText(state: SaveState): string {
  const lostAircraft = state.aircraft.filter((aircraft) => aircraft.status === "lost").length;
  return lostAircraft > 0
    ? `${lostAircraft} aircraft ${lostAircraft === 1 ? "has" : "have"} been struck off after recent losses.`
    : "No aircraft have yet been struck off outright.";
}

function buildGroupConditionText(state: SaveState): string {
  const available = countAvailableAircraft(state);
  const wounded = state.crewMembers.filter((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded").length;
  const lostAircraft = state.aircraft.filter((aircraft) => aircraft.status === "lost").length;
  if (available <= 2 || lostAircraft >= 2 || wounded >= 6) {
    return "Group condition: near breaking after recent strain and losses.";
  }
  if (available <= 3 || wounded >= 3 || state.repairJobs.some((job) => !job.completionApplied)) {
    return "Group condition: strained, but still capable of a limited effort.";
  }
  if (state.crewMembers.filter((member) => member.fatigue === "tired" || member.fatigue === "exhausted").length >= 6) {
    return "Group condition: brittle in stamina, though not yet in outright crisis.";
  }
  return "Group condition: strong enough for deliberate action if staff chooses its moment.";
}

function buildCampaignMomentumText(state: SaveState): string {
  const directive = state.campaign.directiveState;
  if (directive.directiveProgress >= 65 && directive.commandPatience >= 50) {
    return "Campaign momentum: promising, with some signs the wider pressure is beginning to tell.";
  }
  if (directive.directiveProgress >= 40) {
    return "Campaign momentum: improving, though the campaign still lacks a decisive answer.";
  }
  if (directive.commandPatience < 45) {
    return "Campaign momentum: slipping, with command asking harder questions than the evidence comfortably answers.";
  }
  return "Campaign momentum: holding, but the gains remain incomplete and reversible.";
}

function buildDirectiveStateText(state: SaveState): string {
  const value = state.campaign.directiveState.directiveProgress;
  if (value >= 70) {
    return "Directive state: nearing satisfaction, though staff would not call the sector settled yet.";
  }
  if (value >= 45) {
    return "Directive state: meaningful pressure achieved, but not enough to end the Bremen problem.";
  }
  if (value >= 20) {
    return "Directive state: partial progress only; staff sees signs of pressure, not resolution.";
  }
  return "Directive state: unresolved. Command still lacks a persuasive answer in the sector.";
}

function strategicBand(value: number, high: string, mid: string, low: string): string {
  if (value >= 70) {
    return high;
  }
  if (value >= 45) {
    return mid;
  }
  return low;
}

function targetStrategicRoleText(target: Target): string {
  switch (target.type) {
    case "factory":
      return "direct aviation progress";
    case "airfield":
      return "immediate fighter suppression";
    case "rail":
      return "slows repairs and reinforcement";
    case "radar":
      return "weakens warning and interception coordination";
    case "defense":
      return "support target for future Bremen approaches";
    default:
      return "supporting pressure against the sector";
  }
}

function targetCommandValueText(target: Target): string {
  switch (target.type) {
    case "factory":
      return "High command regards this as decisive if the strike is effective.";
    case "airfield":
      return "Command values this as useful near-term pressure, though not the full answer.";
    case "rail":
      return "Command sees this as indirect unless it clearly supports later aviation strikes.";
    case "radar":
      return "Command treats this as a useful setup target, but not a headline result.";
    case "defense":
      return "Command values this only if it visibly helps a later Bremen attack.";
    default:
      return "Command interest remains qualified.";
  }
}

function targetOperationalEffectText(target: Target): string {
  switch (target.type) {
    case "factory":
      return "Success here may weaken longer-term fighter replacement rather than immediate response.";
    case "airfield":
      return "Success here may soften fighter response on the next operation or two.";
    case "rail":
      return "Success here may make earlier target damage stick by slowing repair movement.";
    case "radar":
      return "Success here may leave later interceptions and warnings less coordinated.";
    case "defense":
      return "Success here may slightly ease the approach to deeper Bremen targets.";
    default:
      return "Operational effect is likely indirect and difficult to read quickly.";
  }
}

export function getTargetStrategicContext(state: SaveState, targetId: string): {
  strategicRole: string;
  commandValue: string;
  operationalEffect: string;
  connections: string;
} {
  const target = getTargetById(state, targetId);
  if (!target) {
    return {
      strategicRole: "Strategic Role: unknown",
      commandValue: "Likely Command Value: unknown",
      operationalEffect: "Likely Operational Effect: unknown",
      connections: "Connections: none filed"
    };
  }
  const connectedNames = target.connectedTargetIds
    .map((id) => getTargetById(state, id)?.name)
    .filter((name): name is string => Boolean(name));
  return {
    strategicRole: `Strategic Role: ${targetStrategicRoleText(target)}`,
    commandValue: `Likely Command Value: ${targetCommandValueText(target)}`,
    operationalEffect: `Likely Operational Effect: ${targetOperationalEffectText(target)}`,
    connections: connectedNames.length > 0
      ? `Connections: likely linked to ${connectedNames.join(", ")}.`
      : "Connections: no clear supporting links are filed."
  };
}

function strategicEffectVisibleHint(category: StrategicEffectCategory, target: Target): string {
  switch (category) {
    case "fighter_pressure":
      return `${target.name} may have softened immediate fighter pressure, though the effect is still being judged.`;
    case "replacement_flow":
      return `${target.name} may have disturbed longer-term fighter production more than immediate response.`;
    case "repair_capacity":
      return `${target.name} may have slowed repair and movement around the Bremen network.`;
    case "warning_coordination":
      return `${target.name} may have unsettled warning and interception coordination on later routes.`;
    case "approach_danger":
      return `${target.name} may have made a later Bremen approach somewhat easier to force through.`;
    case "directive_progress":
      return `Staff believes the strike on ${target.name} contributed at least some real directive progress.`;
    case "command_patience":
      return "Command has registered the latest operation, though its enthusiasm remains qualified.";
    default:
      return "Staff is still sorting the wider effect of the latest operation.";
  }
}

function appendStrategicEffect(
  state: SaveState,
  target: Target,
  at: number,
  category: StrategicEffectCategory,
  summary: string
): void {
  const id = `strategic-${target.id}-${category}-${state.campaign.directiveState.operationsElapsed}`;
  if (state.campaign.directiveState.recentStrategicEffects.some((effect) => effect.id === id)) {
    return;
  }
  state.campaign.directiveState.recentStrategicEffects.unshift({
    id,
    at,
    targetId: target.id,
    category,
    summary,
    visibleHint: strategicEffectVisibleHint(category, target),
    followUpPending: true,
    followUpDeliveredAt: null
  });
  state.campaign.directiveState.recentStrategicEffects = state.campaign.directiveState.recentStrategicEffects.slice(0, 8);
}

function applyStrategicDirectiveEffects(state: SaveState, mission: Mission, target: Target, at: number): void {
  const directive = state.campaign.directiveState;
  directive.operationsElapsed += 1;
  const severity = mission.hiddenOutcome.targetDamage >= 26 ? "serious" : mission.hiddenOutcome.targetDamage >= 14 ? "useful" : mission.hiddenOutcome.targetDamage > 0 ? "limited" : "poor";
  const baseImpact = mission.hiddenOutcome.targetDamage >= 26 ? 16 : mission.hiddenOutcome.targetDamage >= 14 ? 10 : mission.hiddenOutcome.targetDamage > 0 ? 5 : 1;
  const targetPriorityMod = getCampaignProfileTargetMod(state.campaign.profile, target.id, "priority");
  const impactMod =
    mission.plan.operationType === "main_strike" ? 1.18
      : mission.plan.operationType === "reduced_strike" ? 0.82
        : mission.plan.operationType === "support_raid" ? 0.72
          : mission.plan.operationType === "follow_up_attack" ? 1.1
            : 0.58;
  const impact = Math.max(1, Math.round(baseImpact * impactMod * targetPriorityMod));
  const costly = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "lost").length > 0;

  if (severity === "poor") {
    directive.commandPatience = clamp(directive.commandPatience - (mission.plan.operationType === "main_strike" ? 10 : 7), 0, 100);
    appendStrategicEffect(state, target, at, "command_patience", `The strike on ${target.name} appears to have yielded little strategic value.`);
    return;
  }

  switch (target.type) {
    case "factory":
      directive.fighterReplacementFlow = clamp(directive.fighterReplacementFlow - impact, 0, 100);
      directive.directiveProgress = clamp(directive.directiveProgress + impact + (mission.plan.operationType === "main_strike" ? 6 : 3), 0, 100);
      appendStrategicEffect(state, target, at, "replacement_flow", `${target.name} is thought to have disrupted fighter replacement flow in a way that may matter later.`);
      appendStrategicEffect(state, target, at, "directive_progress", `Staff judges the attack on ${target.name} as ${severity} direct progress against the Bremen directive.`);
      break;
    case "airfield":
      directive.fighterPressure = clamp(directive.fighterPressure - (impact + 5), 0, 100);
      directive.directiveProgress = clamp(directive.directiveProgress + impact + (mission.plan.operationType === "reduced_strike" ? -1 : 1), 0, 100);
      appendStrategicEffect(state, target, at, "fighter_pressure", `${target.name} is believed to have reduced near-term fighter pressure around the sector.`);
      break;
    case "rail":
      directive.regionalRepairCapacity = clamp(directive.regionalRepairCapacity - Math.round((impact + 3) * state.campaign.profile.enemyResponse.railLeverage), 0, 100);
      directive.directiveProgress = clamp(directive.directiveProgress + Math.max(2, impact - 1), 0, 100);
      appendStrategicEffect(state, target, at, "repair_capacity", `${target.name} may have slowed the repair tempo supporting connected Bremen targets.`);
      break;
    case "radar":
      directive.warningCoordination = clamp(directive.warningCoordination - Math.round((impact + 2) * state.campaign.profile.enemyResponse.radarLeverage), 0, 100);
      directive.directiveProgress = clamp(directive.directiveProgress + Math.max(1, impact - 2), 0, 100);
      for (const connectedId of target.connectedTargetIds) {
        const connected = getTargetById(state, connectedId);
        if (!connected) {
          continue;
        }
        connected.hiddenDefenseLevel = clamp(connected.hiddenDefenseLevel - 4, 18, 100);
      }
      appendStrategicEffect(state, target, at, "warning_coordination", `${target.name} may have weakened warning coordination along related approach routes.`);
      break;
    case "defense":
      directive.approachDanger = clamp(directive.approachDanger - (impact + 1), 0, 100);
      directive.directiveProgress = clamp(directive.directiveProgress + Math.max(1, impact - 2), 0, 100);
      for (const connectedId of target.connectedTargetIds) {
        const connected = getTargetById(state, connectedId);
        if (!connected) {
          continue;
        }
        connected.hiddenDefenseLevel = clamp(connected.hiddenDefenseLevel - 3, 18, 100);
      }
      appendStrategicEffect(state, target, at, "approach_danger", `${target.name} may have eased the approach to connected Bremen objectives.`);
      break;
    default:
      directive.directiveProgress = clamp(directive.directiveProgress + impact, 0, 100);
      appendStrategicEffect(state, target, at, "directive_progress", `${target.name} may have contributed some indirect pressure in the sector.`);
      break;
  }

  if (mission.plan.operationType === "harassment_diversion") {
    directive.commandPatience = clamp(directive.commandPatience - 5, 0, 100);
  } else if (mission.plan.operationType === "support_raid" && target.directiveRelevance !== "high") {
    directive.commandPatience = clamp(directive.commandPatience - 3, 0, 100);
  } else if (target.type !== "factory" && target.directiveRelevance === "low") {
    directive.commandPatience = clamp(directive.commandPatience - 4, 0, 100);
  } else {
    directive.commandPatience = clamp(
      directive.commandPatience + (severity === "serious" ? 5 : 2) - (costly ? 5 : 0) + (mission.plan.operationType === "main_strike" ? 1 : 0),
      0,
      100
    );
  }
}

function createStrategicIntelFollowUp(state: SaveState, effect: StrategicEffectRecord): string {
  const target = getTargetById(state, effect.targetId);
  const targetName = target?.name ?? "the latest target";
  switch (effect.category) {
    case "fighter_pressure":
      return `Later intelligence suggests fighter activity around ${targetName} may be softer than before, though the picture is not yet settled.`;
    case "replacement_flow":
      return `Staff believes repair and production around ${targetName} may be recovering more slowly than expected.`;
    case "repair_capacity":
      return `Rail and workshop traffic linked to ${targetName} appears slower than before, though not fully stopped.`;
    case "warning_coordination":
      return `Interception along the northern route may be less coordinated after the disturbance around ${targetName}.`;
    case "approach_danger":
      return `Approach reporting suggests the belt around ${targetName} may be less cohesive than earlier estimates implied.`;
    case "directive_progress":
      return `Command believes the latest strike may have added some real pressure in the Bremen sector, even if the full effect remains uncertain.`;
    case "command_patience":
      return "Command is not yet convinced the latest effort materially advanced the directive.";
    default:
      return "Later intelligence remains cautious and does not fully settle the strategic picture.";
  }
}

function deliverStrategicIntelDrip(state: SaveState, now: number, preferredTargetId?: string): void {
  const pending = state.campaign.directiveState.recentStrategicEffects.find((effect) =>
    effect.followUpPending && (!preferredTargetId || effect.targetId === preferredTargetId)
  ) ?? state.campaign.directiveState.recentStrategicEffects.find((effect) => effect.followUpPending);
  if (!pending) {
    return;
  }
  pending.followUpPending = false;
  pending.followUpDeliveredAt = now;
  const text = createStrategicIntelFollowUp(state, pending);
  state.campaign.latestStrategicIntelNote = text;
  const target = getTargetById(state, pending.targetId);
  if (target) {
    target.assessedDefense = buildVisibleDefenseAssessment(target, target.assessedCondition, "Strategic follow-up");
  }
  addLog(state, `strategic-intel-${pending.id}`, now, "command", text);
}

export function getDirectiveProgressSummary(state: SaveState): {
  progress: string;
  patience: string;
  nextNeed: string;
  recentEffects: string[];
  latestIntel: string | null;
  momentum: string;
  directiveState: string;
  groupCondition: string;
  commandView: string;
} {
  const directive = state.campaign.directiveState;
  const progress = strategicBand(
    directive.directiveProgress,
    "Progress: meaningful. Staff believes fighter pressure in the sector is beginning to bend.",
    "Progress: limited. Staff sees some useful disruption, but not a solved Bremen problem.",
    "Progress: slight. Staff does not yet believe the sector has been materially eased."
  );
  const patience = strategicBand(
    directive.commandPatience,
    "Command patience: still serviceable. Headquarters sees enough to remain patient for now.",
    "Command patience: narrowing. Another indirect result may draw sharper questions.",
    "Command patience: strained. Command is pressing for clearer direct progress."
  );
  let nextNeed = "Suggested next need: keep the target file current and prepare a useful follow-on strike.";
  if (directive.fighterReplacementFlow >= 65) {
    nextNeed = "Suggested next need: confirm the factory picture or prepare a direct aviation strike.";
  } else if (directive.fighterPressure >= 65) {
    nextNeed = "Suggested next need: soften near-term fighter pressure before attempting a deeper effort.";
  } else if (directive.approachDanger >= 65 || directive.warningCoordination >= 65) {
    nextNeed = "Suggested next need: reduce route danger or warning cohesion before committing the whole group.";
  }
  return {
    progress,
    patience,
    nextNeed,
    recentEffects: state.campaign.directiveState.recentStrategicEffects.slice(0, 3).map((effect) => effect.visibleHint),
    latestIntel: state.campaign.latestStrategicIntelNote,
    momentum: buildCampaignMomentumText(state),
    directiveState: buildDirectiveStateText(state),
    groupCondition: buildGroupConditionText(state),
    commandView: directive.commandPatience < 45
      ? "Command view: useful progress must soon become visible progress."
      : directive.directiveProgress >= 40
        ? "Command view: useful progress is visible, but not enough to stop pressing."
        : "Command view: the effort remains under judgment rather than credit."
  };
}

function createConsequenceLedgerEntry(state: SaveState, input: Omit<ConsequenceLedgerEntry, "id" | "day">): void {
  const entry: ConsequenceLedgerEntry = {
    id: `${input.missionId ?? input.reconId ?? input.targetId ?? "ledger"}-${input.createdAt}`,
    day: state.campaign.currentDay,
    ...input
  };
  if (state.campaign.consequenceLedger.some((existing) => existing.id === entry.id)) {
    return;
  }
  state.campaign.consequenceLedger.unshift(entry);
}

function buildMissionLedgerEntry(state: SaveState, mission: Mission, target: Target): void {
  const attackedTarget = getTargetById(state, mission.hiddenOutcome.attackedTargetId) ?? target;
  const lostCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "lost").length;
  const damagedCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "damaged").length;
  const divertedCount = mission.hiddenOutcome.aircraftOutcomes.filter((outcome) => outcome.finalStatus === "diverted").length;
  const posture =
    lostCount > 0 || damagedCount >= 2
      ? "Staff recommends recovery or only a reduced follow-up."
      : mission.hiddenOutcome.targetDamage >= 20
        ? "Staff recommends exploiting the apparent disruption before it fades."
        : mission.hiddenOutcome.targetDamage > 0
          ? "Staff recommends confirming the result or preparing a limited follow-up."
          : "Staff recommends reconfirming the picture before asking for another major effort.";
  createConsequenceLedgerEntry(state, {
    createdAt: state.lastReconciledAt,
    missionId: mission.id,
    reconId: null,
    targetId: attackedTarget.id,
    title: `After ${attackedTarget.name}`,
    staffRead: mission.hiddenOutcome.targetDamage >= 20
      ? "Crews believe the strike caused useful disruption, though staff will not call the problem settled."
      : mission.hiddenOutcome.targetDamage > 0
        ? "Crews believe some disruption was caused, but staff regards the effect as incomplete."
        : "Staff does not believe the operation produced a clearly trusted result.",
    commandRead: mission.hiddenOutcome.commandAssessment,
    targetRead: attackedTarget.id !== target.id
      ? `${target.name} remained obscured. Crews believe the effective blow shifted toward ${attackedTarget.name}.`
      : attackedTarget.suspectedEffects,
    groupCost: `${damagedCount} damaged, ${divertedCount} diverted, ${lostCount} lost or missing. ${roleLossText(state)}`,
    strategicConsequence: state.campaign.directiveState.recentStrategicEffects[0]?.visibleHint
      ?? "The wider strategic effect remains under review.",
    recommendedPosture: posture
  });
}

function buildReconLedgerEntry(state: SaveState, recon: ReconMission, target: Target): void {
  createConsequenceLedgerEntry(state, {
    createdAt: recon.interpretedAt,
    missionId: null,
    reconId: recon.id,
    targetId: target.id,
    title: `Recon read on ${target.name}`,
    staffRead: recon.resultText,
    commandRead: recon.type === "post_strike"
      ? "Command will treat this as support for judgment, not judgment by itself."
      : "Command values the file only insofar as it sharpens the next operational choice.",
    targetRead: recon.hiddenAssessment,
    groupCost: recon.type === "focused_followup"
      ? "The reconnaissance effort cost time and attention, but not a major operational commitment."
      : "The reconnaissance effort was light, though it still consumed operational time.",
    strategicConsequence: recon.recommendation,
    recommendedPosture: recon.resultQuality === "clear"
      ? "Staff recommends acting on the clearer picture while it remains timely."
      : "Staff recommends weighing whether more information would truly help, or whether it is time to act."
  });
}

export function getOperationalRhythm(state: SaveState): { id: string; label: string } {
  if (state.campaign.finalSummaryMode) {
    return { id: "final_summary", label: "Final Summary" };
  }
  if (state.campaign.resolutionState === "pending") {
    return { id: "resolution_pending", label: "Resolution Pending" };
  }
  const mission = getActiveMission(state);
  const recon = getActiveRecon(state);
  if (mission) {
    return { id: "operation_underway", label: "Operation Underway" };
  }
  if (state.campaign.lastDebriefMissionId && state.campaign.pendingDecisions.some((line) => /review|repair|recon/i.test(line))) {
    return { id: "debrief_window", label: "Debrief Window" };
  }
  if (recon || state.repairJobs.some((job) => !job.completionApplied) || state.recoveryJobs.some((job) => !job.completionApplied)) {
    return { id: "evening_assessment", label: "Evening Assessment" };
  }
  if (state.campaign.currentDay === 1 && state.missions.length === 0) {
    return { id: "morning_conference", label: "Morning Conference" };
  }
  if (state.campaign.personnelDecisions.some((entry) => !entry.resolved)) {
    return { id: "stand_down", label: "Stand Down" };
  }
  return { id: "planning_window", label: "Planning Window" };
}

export function getTargetOperationalSummary(target: Target): string {
  return `${target.assessedCondition} ${target.assessedDefense} Alert appears ${alertText(target.alertLevel)}, and intelligence is ${target.intelConfidence}.`;
}

export function getAircraftAttentionState(state: SaveState, aircraftId: string): {
  needsAttention: boolean;
  shouldStartOpen: boolean;
  reasons: string[];
} {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return { needsAttention: false, shouldStartOpen: false, reasons: [] };
  }
  const manifest = getCrewMembersForAircraft(state, aircraftId);
  const reasons: string[] = [];
  if (aircraft.status !== "serviceable" || aircraft.repairJobId || aircraft.recoveryJobId) {
    reasons.push("Aircraft status needs attention.");
  }
  if (manifest.some((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded")) {
    reasons.push("Crew recovery still in progress.");
  }
  if (manifest.some((member) => member.isReplacement && member.currentAssignmentRole)) {
    reasons.push("Replacement crew are covering active stations.");
  }
  if (getRoleCoverageProblems(state, aircraftId).length > 0) {
    reasons.push("Crew role coverage is incomplete.");
  }
  if (getPersonnelDecisionsForAircraft(state, aircraftId).length > 0) {
    reasons.push("Recovered-original personnel decision pending.");
  }
  return {
    needsAttention: reasons.length > 0,
    shouldStartOpen: reasons.length > 0,
    reasons
  };
}

function getNextMissionEventTime(state: SaveState): number | null {
  const mission = getActiveMission(state);
  if (!mission) {
    return null;
  }
  const nextEvent = mission.timelineEvents.filter((event) => !event.revealed).sort((a, b) => a.time - b.time)[0];
  return nextEvent?.time ?? null;
}

function getNextNonMissionCompletionTime(state: SaveState): number | null {
  const candidates: number[] = [];
  for (const job of state.repairJobs) {
    if (!job.completionApplied) {
      candidates.push(job.completesAt);
    }
  }
  for (const job of state.recoveryJobs) {
    if (!job.completionApplied) {
      candidates.push(job.completesAt);
    }
  }
  for (const recon of state.reconMissions) {
    if (!recon.completionApplied) {
      candidates.push(recon.interpretedAt);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  return Math.min(...candidates);
}

function advanceClockTo(state: SaveState, now: number, targetTime: number): void {
  state.debug.clockOffsetMs += Math.max(0, targetTime - now + 1000);
}

export function waitUntilNextEvent(state: SaveState, now: number): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  const candidates = [
    getNextMissionEventTime(state),
    getNextNonMissionCompletionTime(state),
    ...state.reconMissions
      .filter((recon) => !recon.completionApplied && recon.status === "airborne")
      .map((recon) => recon.returnsAt)
  ].filter((value): value is number => value !== null);
  if (candidates.length === 0) {
    return "No timed event is currently pending.";
  }
  setPendingTimeAdvance(state, "wait_next_event");
  advanceClockTo(state, now, Math.min(...candidates));
  return null;
}

export function letCurrentWorkFinish(state: SaveState, now: number): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  const targetTime = getNextNonMissionCompletionTime(state);
  if (!targetTime) {
    return "No station-side work is currently pending.";
  }
  setPendingTimeAdvance(state, "let_work_finish");
  advanceClockTo(state, now, targetTime);
  return null;
}

export function standDownUntilMorning(state: SaveState, now: number): string | null {
  const closedMessage = getCampaignClosedOrderMessage(state);
  if (closedMessage) {
    return closedMessage;
  }
  const targetTime = now + DAY_MS;
  setPendingTimeAdvance(state, "stand_down");
  state.campaign.currentDay += 1;
  advanceClockTo(state, now, targetTime);
  addLog(state, `day-${state.campaign.currentDay}`, targetTime, "command", `Campaign day ${state.campaign.currentDay} has begun. Routine rest and repair time have accrued.`);
  registerOperationalBeat(state);
  return null;
}

export function getAircraftHistorySummary(state: SaveState, aircraftId: string): string[] {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return [];
  }
  const history = [
    `${aircraft.name} has flown ${aircraft.missionCount} logged operation${aircraft.missionCount === 1 ? "" : "s"}.`,
    aircraft.lastOutcomeNote,
    aircraft.conditionSummary
  ];
  if (aircraft.damageHistory.length > 0) {
    history.push(...aircraft.damageHistory.slice(0, 3));
  }
  return history;
}

export function getCrewHistorySummary(state: SaveState, crewMemberId: string): string[] {
  const member = getCrewMemberById(state, crewMemberId);
  if (!member) {
    return [];
  }
  const lines = [
    `${member.name} has flown ${member.missionsFlown} mission${member.missionsFlown === 1 ? "" : "s"}.`,
    `Current status: ${member.status.replaceAll("_", " ")}.`,
    `Replacement status: ${member.isReplacement ? member.isPermanentReplacement ? "permanent replacement" : "temporary replacement" : "original crew"}.`,
    member.notes
  ];
  if (member.injurySeverity !== "none") {
    lines.push(`Injury note: ${member.injurySeverity} injury record remains on file.`);
  }
  if (getActiveMissionCrewIds(state).includes(member.id)) {
    lines.push("This crew member is airborne with the current operation snapshot.");
  }
  return lines;
}

export function getTargetContextSummary(state: SaveState, targetId: string): {
  lastRecon: string;
  lastDebrief: string;
  lastMission: string;
  intelAge: string;
} {
  const target = getTargetById(state, targetId);
  if (!target) {
    return {
      lastRecon: "Last recon: none",
      lastDebrief: "Last debrief: none",
      lastMission: "Last mission: none",
      intelAge: "Intel age: unknown"
    };
  }
  return {
    lastRecon: target.lastReconSummary ? `Last recon: ${target.lastReconSummary}` : "Last recon: none",
    lastDebrief: target.lastDebriefSummary ? `Last debrief: ${target.lastDebriefSummary}` : "Last debrief: none",
    lastMission: target.lastMissionSummary ? `Last mission: ${target.lastMissionSummary}` : "Last mission: none",
    intelAge: `Intel age: ${currentIntelAge(state, target)}`
  };
}

export function getCurrentOperationSummary(state: SaveState): string {
  const mission = getActiveMission(state);
  if (!mission) {
    return "No active mission. The operations board is quiet for now.";
  }
  const next = mission.timelineEvents.filter((event) => !event.revealed).sort((a, b) => a.time - b.time)[0];
  if (!next) {
    return "All known mission reports have arrived. Debrief should be reviewed.";
  }
  return `Current stage is ${mission.stage.replaceAll("_", " ")}. Next report is expected after some delay.`;
}

export function getRecentConsequenceLedger(state: SaveState): ConsequenceLedgerEntry[] {
  return state.campaign.consequenceLedger.slice(0, 3);
}

export function getStaffActionLabel(recommendation: StaffRecommendation): string {
  switch (recommendation.relatedActionType) {
    case "go_debrief":
      return "Review Debrief";
    case "go_maintenance":
      return "Open Maintenance";
    case "go_aircraft_crews":
      return "Resolve Crew Issue";
    case "go_recon":
      return "Go to Recon";
    case "go_target_board":
      return "Review Target Board";
    case "go_mission_planning":
      return "Prepare Recommended Order";
    case "start_recon":
      return "Start Recon";
    case "wait_next_event":
      return "Wait for Next Report";
    case "stand_down_morning":
      return "Stand Down Until Morning";
    case "let_work_finish":
      return "Let Current Work Finish";
    default:
      return "Use Recommended Plan";
  }
}

function getStaffRecommendationExpectedOutcome(recommendation: StaffRecommendation, state: SaveState): string {
  const target = recommendation.relatedTargetId ? getTargetById(state, recommendation.relatedTargetId) : null;
  switch (recommendation.relatedActionType) {
    case "go_debrief":
      return "Reviewing the debrief should settle what the last operation changed before you commit again.";
    case "go_maintenance":
      return "Opening maintenance should show which aircraft can be recovered quickly and which cannot.";
    case "go_aircraft_crews":
      return "Resolving the crew issue should restore a usable package or clarify that the group must pause.";
    case "go_recon":
    case "start_recon":
      return target ? `Fresh intelligence on ${target.name} should sharpen the next decision.` : "Fresh intelligence should sharpen the next decision.";
    case "wait_next_event":
      return "Waiting should bring the next meaningful report instead of forcing a premature response.";
    case "stand_down_morning":
      return "Standing down should recover fatigue and let station-side work progress, though the wider situation will keep moving.";
    case "let_work_finish":
      return "Letting work finish should return the current repair, recovery, or interpretation result to the board.";
    case "go_mission_planning":
    default:
      return target ? `The group will have a viable order prepared for ${target.name} rather than starting from scratch.` : "The group will have a viable order prepared instead of starting from scratch.";
  }
}

function getStaffRecommendationCost(recommendation: StaffRecommendation, conference: StaffConference, state: SaveState): string {
  if (conference.riskIfIgnored) {
    return conference.riskIfIgnored;
  }
  switch (recommendation.relatedActionType) {
    case "wait_next_event":
      return "You will not influence the situation until the next filing arrives.";
    case "stand_down_morning":
      return "You are knowingly allowing time and possible enemy recovery to pass.";
    case "start_recon":
    case "go_recon":
      return "Recon consumes time and may raise alertness without solving the larger problem by itself.";
    case "go_maintenance":
      return "Time spent recovering the line does not directly pressure the directive.";
    case "go_mission_planning":
      return state.campaign.directiveState.commandPatience < 45
        ? "The order may still rely on imperfect evidence, but Command wants visible progress soon."
        : "The order will still carry uncertainty and any aircraft concerns already on file.";
    default:
      return "Some uncertainty will remain even after this step.";
  }
}

export function getOperationalStatusLabel(state: SaveState): string {
  if (state.campaign.finalSummaryMode) {
    return "Campaign Concluded";
  }
  if (getLatestDebriefMission(state)?.debriefGenerated && state.uiReadState.lastViewedDebriefMissionId !== getLatestDebriefMission(state)?.id) {
    return "Debrief Ready";
  }
  if (getActiveMission(state)) {
    return "Operation Underway";
  }
  if (getActiveRecon(state)) {
    return "Recon In Progress";
  }
  if (state.aircraft.some((aircraft) => aircraft.status === "damaged" && !aircraft.repairJobId)) {
    return "Repair Required";
  }
  if (state.aircraft.some((aircraft) => {
    const readiness = getAircraftReadinessSummary(state, aircraft.id);
    return readiness.crew !== "Fully covered" && readiness.tasking === "Unavailable" && aircraft.status !== "lost";
  })) {
    return "Crew Issue";
  }
  if (state.aircraft.some((aircraft) => aircraft.status === "diverted" && !aircraft.recoveryJobId)) {
    return "Recovery Required";
  }
  return getOperationalRhythm(state).label;
}

function getDecisionQuestion(state: SaveState, conference: StaffConference): string {
  if (getActiveMission(state)) {
    return "Do we wait for the next report before changing the plan?";
  }
  const latestDebrief = getLatestDebriefMission(state);
  if (latestDebrief?.debriefGenerated && state.uiReadState.lastViewedDebriefMissionId !== latestDebrief.id) {
    return "What did the last operation change, and what should follow it?";
  }
  switch (conference.phaseId) {
    case "opening":
      return "Do we soften fighter resistance at Jever first, or strike directly at Bremen?";
    case "opportunity":
      return "Do we exploit the temporary opening, confirm it, or let it pass?";
    case "crisis":
      return "Do we recover the group now, or accept the risk of another operation?";
    case "commitment":
      return "Do we strike Bremen now, or spend another turn preparing?";
    case "pressure":
      return "Do we soften fighter resistance first, or accept the risk of a direct strike?";
    default:
      return conference.summary;
  }
}

export function getCommandDeltaCards(state: SaveState): CommandBriefDelta[] {
  const deltas: CommandBriefDelta[] = [];
  const seenReconIds = new Set<string>();
  const seenMissionIds = new Set<string>();
  const unreadLedger = state.campaign.consequenceLedger
    .filter((entry) => entry.createdAt > (state.uiReadState.lastViewedCommandUpdateAt ?? 0))
    .sort((left, right) => right.createdAt - left.createdAt);
  for (const entry of unreadLedger) {
    if (entry.reconId && seenReconIds.has(entry.reconId)) {
      continue;
    }
    if (entry.missionId && seenMissionIds.has(entry.missionId)) {
      continue;
    }
    if (entry.reconId) {
      seenReconIds.add(entry.reconId);
    }
    if (entry.missionId) {
      seenMissionIds.add(entry.missionId);
    }
    deltas.push({
      id: entry.id,
      title: entry.title,
      location: getTargetById(state, entry.targetId ?? "")?.name ?? "Campaign board",
      filedAt: entry.createdAt,
      filedLabel: getQualitativeAgeLabel(state, entry.createdAt),
      whyItMatters: entry.recommendedPosture
    });
    if (deltas.length >= 3) {
      return deltas;
    }
  }
  const latestIntel = state.campaign.latestIntelUpdate;
  if (latestIntel && latestIntel.updatedAt > (state.uiReadState.lastViewedCommandUpdateAt ?? 0) && !seenReconIds.has(latestIntel.reconId)) {
    seenReconIds.add(latestIntel.reconId);
    deltas.push({
      id: latestIntel.reconId,
      title: `New intelligence on ${latestIntel.targetName}`,
      location: latestIntel.targetName,
      filedAt: latestIntel.updatedAt,
      filedLabel: getQualitativeAgeLabel(state, latestIntel.updatedAt),
      whyItMatters: latestIntel.recommendation
    });
  }
  const latestEvent = state.campaign.events[0];
  const distinctEvent = latestEvent
    && !/offline return/i.test(latestEvent.body)
    && (!unreadLedger[0] || latestEvent.relatedTargetId !== unreadLedger[0].targetId || /(opportunity|phase|command)/i.test(latestEvent.kind));
  if (latestEvent && latestEvent.createdAt > (state.uiReadState.lastViewedCommandUpdateAt ?? 0) && distinctEvent) {
    deltas.push({
      id: latestEvent.id,
      title: latestEvent.title,
      location: getTargetById(state, latestEvent.relatedTargetId ?? "")?.name ?? "Campaign record",
      filedAt: latestEvent.createdAt,
      filedLabel: getQualitativeAgeLabel(state, latestEvent.createdAt),
      whyItMatters: latestEvent.body
    });
  }
  return deltas.slice(0, 3);
}

function createActionRequiredItems(state: SaveState): CommandBriefAction[] {
  const items: CommandBriefAction[] = [];
  const seenAircraft = new Set<string>();
  const aircraftWithPersonnelDecision = new Set(
    state.campaign.personnelDecisions.filter((entry) => !entry.resolved).map((entry) => entry.aircraftId)
  );
  const latestDebrief = getLatestDebriefMission(state);
  if (latestDebrief?.debriefGenerated && state.uiReadState.lastViewedDebriefMissionId !== latestDebrief.id) {
    items.push({
      id: `debrief-${latestDebrief.id}`,
      title: "Debrief awaiting review",
      detail: `Debrief from ${getTargetById(state, latestDebrief.plan.targetId)?.name ?? "the last operation"} is ready.`,
      whyItMatters: "It may change the next recommendation.",
      buttonLabel: "Review Debrief",
      actionType: "go_debrief",
      actionPayload: null
    });
  }
  const latestRecon = getLatestCompletedRecon(state);
  if (latestRecon && state.uiReadState.lastViewedReconId !== latestRecon.id) {
    items.push({
      id: `recon-${latestRecon.id}`,
      title: "Recon interpretation available",
      detail: `${getTargetById(state, latestRecon.targetId)?.name ?? "Target"} has a fresh interpretation on file.`,
      whyItMatters: "It may change whether staff wants to exploit, confirm, or redirect.",
      buttonLabel: "Review Recon",
      actionType: "go_recon",
      actionPayload: null
    });
  }
  for (const aircraft of state.aircraft) {
    if (aircraft.status === "lost" || seenAircraft.has(aircraft.id)) {
      continue;
    }
    const readiness = getAircraftReadinessSummary(state, aircraft.id);
    const roleProblems = getRoleCoverageProblems(state, aircraft.id);
    const requiredRoleProblem = roleProblems.some((problem) => REQUIRED_ROLES.includes(problem.role));
    const seriousRequiredOccupant = getCrewMembersForAircraft(state, aircraft.id).some((member) =>
      member.status === "seriously_wounded" && REQUIRED_ROLES.includes((member.currentAssignmentRole ?? member.role) as CrewRole)
    );
    const crewCause = readiness.tasking === "Unavailable"
      && aircraft.status === "serviceable"
      && !aircraft.repairJobId
      && !aircraft.recoveryJobId
      && !aircraftWithPersonnelDecision.has(aircraft.id)
      && (requiredRoleProblem || seriousRequiredOccupant);
    const maintenanceCause = (aircraft.status === "damaged" && !aircraft.repairJobId) || (aircraft.status === "diverted" && !aircraft.recoveryJobId);
    if (crewCause || maintenanceCause) {
      seenAircraft.add(aircraft.id);
      items.push({
        id: `aircraft-${aircraft.id}`,
        title: crewCause
          ? `${aircraft.name} cannot currently fly`
          : aircraft.status === "diverted"
            ? `${aircraft.name} remains away after diversion`
            : `Repair required - ${aircraft.name}`,
        detail: crewCause
          ? `${readiness.primaryReason} Airframe: ${readiness.airframe}. Crew: ${readiness.crew}.`
          : aircraft.status === "diverted"
            ? `${aircraft.name} must be recovered before it can return to tasking. ${readiness.primaryReason}`
            : `${aircraft.name} remains marginally available, but repair is still required before the line can fully trust it. ${readiness.primaryReason}`,
        whyItMatters: "The next package cannot rely on this aircraft until the blocker is resolved.",
        buttonLabel: crewCause ? "Resolve Crew Issue" : "Open Maintenance",
        actionType: crewCause ? "go_aircraft_crews" : "go_maintenance",
        actionPayload: null
      });
    }
  }
  for (const decision of state.campaign.personnelDecisions.filter((entry) => !entry.resolved)) {
    const aircraft = getAircraftById(state, decision.aircraftId);
    items.push({
      id: decision.id,
      title: "Personnel decision pending",
      detail: `${aircraft?.name ?? "One aircraft"} has a recovered original and replacement overlap in the ${roleLabel(decision.role)} seat.`,
      whyItMatters: "The seat can still function, but the roster decision should be settled before the next commitment grows.",
      buttonLabel: "Resolve Personnel",
      actionType: "go_aircraft_crews",
      actionPayload: null
    });
  }
  return items.slice(0, 6);
}

export function getCommandBrief(state: SaveState): CommandBrief {
  const conference = getStaffConference(state);
  const recommended = conference.recommendedAction;
  const nextDecision: CommandBriefDecision = {
    question: getDecisionQuestion(state, conference),
    recommendedAction: recommended.title,
    whyRecommended: recommended.body,
    expectedOutcome: getStaffRecommendationExpectedOutcome(recommended, state),
    unresolvedCost: getStaffRecommendationCost(recommended, conference, state),
    primaryButtonLabel: getStaffActionLabel(recommended),
    recommendation: recommended
  };

  const strongestSupport = conference.operationsComment || conference.intelligenceComment || conference.engineeringComment;
  const strongestObjection = conference.commandComment && conference.commandComment !== strongestSupport
    ? conference.commandComment
    : conference.riskIfIgnored;

  return {
    nextDecision,
    newSinceLastDecision: getCommandDeltaCards(state),
    actionRequired: createActionRequiredItems(state),
    details: {
      executiveConclusion: conference.executiveComment,
      strongestSupport,
      strongestObjection: strongestObjection ?? null,
      conference,
      campaignSituation: getOperationsDeskSummary(state),
      campaignRecord: state.campaign.events.slice(0, 6).map((event) => `${event.title}: ${event.body}`)
    }
  };
}

export function getNextStepGuidance(state: SaveState): { title: string; reason: string; buttonLabel: string; recommendation: StaffRecommendation } | null {
  if (state.selectedTab === "debug" || state.selectedTab === "command" || state.campaign.finalSummaryMode) {
    return null;
  }
  const brief = getCommandBrief(state);
  return {
    title: `Next: ${brief.nextDecision.recommendedAction}.`,
    reason: brief.nextDecision.whyRecommended,
    buttonLabel: brief.nextDecision.primaryButtonLabel,
    recommendation: brief.nextDecision.recommendation
  };
}

export function getTargetCardLatestChange(state: SaveState, target: Target): { text: string; updatedAt: number | null } | null {
  if (target.latestIntelNote && target.latestIntelUpdatedAt) {
    return { text: target.latestIntelNote, updatedAt: target.latestIntelUpdatedAt };
  }
  if (target.lastDebriefSummary && target.lastDebriefAt) {
    return { text: target.lastDebriefSummary, updatedAt: target.lastDebriefAt };
  }
  if (target.lastMissionSummary && target.lastMissionAt) {
    return { text: target.lastMissionSummary, updatedAt: target.lastMissionAt };
  }
  return null;
}

export function getReconDeltaSummary(state: SaveState): {
  targetName: string;
  filedAt: number;
  filedLabel: string;
  changes: string[];
  conclusion: string;
  isUnread: boolean;
} | null {
  const latest = state.campaign.latestIntelUpdate;
  if (!latest) {
    return null;
  }
  const changes: string[] = [];
  changes.push(latest.resultQuality === "clear" ? "Recon result was clear." : latest.resultQuality === "partial" ? "Recon result was partial." : "Interpretation was inconclusive.");
  changes.push(`Alertness now reads ${latest.alertLevel}.`);
  changes.push(latest.assessment);
  return {
    targetName: latest.targetName,
    filedAt: latest.updatedAt,
    filedLabel: getQualitativeAgeLabel(state, latest.updatedAt),
    changes: changes.slice(0, 4),
    conclusion: latest.recommendation,
    isUnread: state.uiReadState.lastViewedReconId !== latest.reconId
  };
}

export function getNavAttention(state: SaveState, tab: CampaignTab): string | null {
  switch (tab) {
    case "debrief": {
      const latestDebrief = getLatestDebriefMission(state);
      return latestDebrief?.debriefGenerated && state.uiReadState.lastViewedDebriefMissionId !== latestDebrief.id ? "NEW" : null;
    }
    case "recon": {
      if (getActiveRecon(state)) {
        return "ACTIVE";
      }
      const latestRecon = getLatestCompletedRecon(state);
      return latestRecon && state.uiReadState.lastViewedReconId !== latestRecon.id ? "NEW" : null;
    }
    case "maintenance": {
      const urgentCount = state.aircraft.filter((aircraft) =>
        (aircraft.status === "damaged" && !aircraft.repairJobId)
        || (aircraft.status === "diverted" && !aircraft.recoveryJobId)
      ).length;
      const completedCount = state.repairJobs.filter((job) => job.completionApplied && job.completesAt > (state.uiReadState.lastViewedMaintenanceAt ?? 0)).length
        + state.recoveryJobs.filter((job) => job.completionApplied && job.completesAt > (state.uiReadState.lastViewedMaintenanceAt ?? 0)).length;
      if (urgentCount > 0) {
        return `ACTION ${urgentCount}`;
      }
      if (completedCount > 0) {
        return "NEW";
      }
      return null;
    }
    case "aircraft-crews": {
      const count = state.campaign.personnelDecisions.filter((entry) => !entry.resolved).length
        + state.aircraft.filter((aircraft) => getRoleCoverageProblems(state, aircraft.id).length > 0).length;
      return count > 0 ? `ACTION ${count}` : null;
    }
    case "current-operation":
      return getActiveMission(state) ? "ACTIVE" : null;
    case "target-board": {
      const latest = Math.max(...state.targets.map((target) => target.latestIntelUpdatedAt ?? target.lastDebriefAt ?? target.lastMissionAt ?? 0), 0);
      return latest > (state.uiReadState.lastViewedTargetChangeAt ?? 0) ? "NEW" : null;
    }
    default:
      return null;
  }
}

export function getOperationsDeskSummary(state: SaveState): string[] {
  const now = getEffectiveNow(state);
  const exact = state.debug.showHiddenValues;
  const lines: string[] = [];
  const rhythm = getOperationalRhythm(state);
  const mission = getActiveMission(state);
  const recon = getActiveRecon(state);
  const activeRepairs = state.repairJobs.filter((job) => !job.completionApplied);
  const activeRecoveries = state.recoveryJobs.filter((job) => !job.completionApplied);
  const diverted = state.aircraft.filter((aircraft) => aircraft.status === "diverted" && !aircraft.recoveryJobId);
  lines.push(`Operational posture: ${rhythm.label}.`);
  if (mission) {
    const target = getTargetById(state, mission.plan.targetId);
    const next = mission.timelineEvents.filter((event) => !event.revealed).sort((a, b) => a.time - b.time)[0];
    lines.push(`Current mission: ${target?.name ?? "Selected target"} remains under way. The next word is expected ${fuzzyTimeUntil(now, next?.time ?? now, exact)}.`);
  } else if (state.campaign.lastDebriefMissionId) {
    lines.push("Current mission: no operation is airborne. Staff is working from the latest debrief.");
  } else {
    lines.push("Current mission: no operation is airborne. The board is waiting on your next order.");
  }
  if (recon) {
    const target = getTargetById(state, recon.targetId);
    const nextStep = recon.status === "airborne" ? recon.returnsAt : recon.interpretedAt;
    lines.push(`Recon: ${target?.name ?? "Target"} is still being checked. Interpretation is expected ${fuzzyTimeUntil(now, nextStep, exact)}.`);
  } else if (state.campaign.latestIntelUpdate) {
    lines.push(`Recon: latest intelligence concerns ${state.campaign.latestIntelUpdate.targetName} and remains ${state.campaign.latestIntelUpdate.resultQuality}.`);
  } else {
    lines.push("Recon: no active sortie is out. Existing assessments are aging in place.");
  }
  if (activeRepairs.length > 0) {
    const nextRepair = activeRepairs.slice().sort((a, b) => a.completesAt - b.completesAt)[0]!;
    const aircraft = getAircraftById(state, nextRepair.aircraftId);
    lines.push(`Repairs: ${activeRepairs.length} field job${activeRepairs.length === 1 ? "" : "s"} active. ${aircraft?.name ?? "An aircraft"} is due back ${fuzzyTimeUntil(now, nextRepair.completesAt, exact)}.`);
  } else {
    lines.push("Repairs: no current field work is open on station.");
  }
  if (activeRecoveries.length > 0) {
    lines.push(`Diversions: ${activeRecoveries.length} recovery arrangement${activeRecoveries.length === 1 ? " is" : "s are"} in progress away from station.`);
  } else if (diverted.length > 0) {
    lines.push(`Diversions: ${diverted.length} aircraft ${diverted.length === 1 ? "is" : "are"} still away at outlying fields and awaiting recovery orders.`);
  } else {
    lines.push("Diversions: all accounted aircraft are either on station or already lost.");
  }
  lines.push(`Crew readiness: ${crewReadinessSummary(state)}`);
  lines.push(`Weather outlook: ${state.campaign.stationWeather}`);
  if (state.campaign.latestWaitNote) {
    lines.push(`Latest time note: ${state.campaign.latestWaitNote}`);
  }
  return lines;
}

function phaseLabel(phase: CampaignSpinePhase): string {
  switch (phase) {
    case "opening_assessment":
      return "Opening Assessment";
    case "fighter_pressure":
      return "Fighter Pressure";
    case "bremen_preparation":
      return "Bremen Preparation";
    case "direct_strike_pressure":
      return "Direct Strike Pressure";
    case "assessment_followup":
      return "Assessment Follow-Up";
    case "crisis_recovery":
      return "Crisis Recovery";
    default:
      return "Campaign Assessment";
  }
}

function hasCompletedFirstLoop(state: SaveState): boolean {
  return state.tutorial.firstLoopCompleted
    || (state.missions.some((mission) => mission.debriefGenerated) && (state.reconMissions.length > 0 || state.repairJobs.length > 0 || state.recoveryJobs.length > 0));
}

function countAvailableAircraft(state: SaveState): number {
  return state.aircraft.filter((aircraft) => getAircraftAvailability(state, aircraft.id).level === "available").length;
}

function countMarginalAircraft(state: SaveState): number {
  return state.aircraft.filter((aircraft) => getAircraftAvailability(state, aircraft.id).level === "marginal").length;
}

function hasReadinessCrisis(state: SaveState): boolean {
  const available = countAvailableAircraft(state);
  const keyRoleProblems = state.aircraft.filter((aircraft) => getAircraftAvailability(state, aircraft.id).level === "unavailable").length;
  const activeFieldWork = state.repairJobs.filter((job) => !job.completionApplied).length + state.recoveryJobs.filter((job) => !job.completionApplied).length;
  const wounded = state.crewMembers.filter((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded").length;
  const tired = state.crewMembers.filter((member) => member.fatigue === "tired" || member.fatigue === "exhausted").length;
  const unresolvedPersonnel = state.campaign.personnelDecisions.filter((entry) => !entry.resolved).length;
  return available < 3 || keyRoleProblems >= 3 || activeFieldWork >= 2 || wounded >= 3 || tired >= 8 || unresolvedPersonnel >= 2;
}

export function getCampaignSpinePhase(state: SaveState): {
  phaseId: CampaignSpinePhase;
  phaseLabel: string;
} {
  const missionCount = state.missions.length;
  const latestDebrief = getLatestDebriefMission(state);
  const latestRecon = getLatestCompletedRecon(state);
  const directive = state.campaign.directiveState;
  if (hasReadinessCrisis(state)) {
    return { phaseId: "crisis_recovery", phaseLabel: phaseLabel("crisis_recovery") };
  }
  if (!hasCompletedFirstLoop(state)) {
    return { phaseId: "opening_assessment", phaseLabel: phaseLabel("opening_assessment") };
  }
  if (latestDebrief && (!latestRecon || (state.campaign.latestIntelUpdate && state.campaign.latestIntelUpdate.updatedAt < (latestDebrief.plan.scheduledLaunchTime ?? 0)))) {
    return { phaseId: "assessment_followup", phaseLabel: phaseLabel("assessment_followup") };
  }
  if (directive.commandPatience < 45 || directive.directiveProgress >= 55) {
    return { phaseId: "direct_strike_pressure", phaseLabel: phaseLabel("direct_strike_pressure") };
  }
  if (directive.fighterPressure >= 60) {
    return { phaseId: "fighter_pressure", phaseLabel: phaseLabel("fighter_pressure") };
  }
  if (missionCount >= 1) {
    return { phaseId: "bremen_preparation", phaseLabel: phaseLabel("bremen_preparation") };
  }
  return { phaseId: "opening_assessment", phaseLabel: phaseLabel("opening_assessment") };
}

function findPreferredOperationalTarget(state: SaveState, phase: CampaignPhase): Target | undefined {
  const selected = getTargetById(state, state.planning.selectedTargetId);
  const factory = state.targets.find((target) => target.type === "factory");
  const airfield = state.targets.find((target) => target.type === "airfield");
  const radar = state.targets.find((target) => target.type === "radar");
  const rail = state.targets.find((target) => target.type === "rail");
  const defense = state.targets.find((target) => target.type === "defense");
  const activeOpportunity = getPrimaryUsableOpportunity(state);
  if (activeOpportunity?.beneficiaryTargetIds.length) {
    const beneficiary = activeOpportunity.beneficiaryTargetIds
      .map((targetId) => getTargetById(state, targetId))
      .find((target): target is Target => Boolean(target));
    if (beneficiary) {
      return beneficiary;
    }
  }
  switch (phase) {
    case "opening":
      return airfield ?? factory ?? selected;
    case "pressure":
      return airfield ?? radar ?? selected ?? factory;
    case "opportunity":
      return selected ?? factory ?? airfield;
    case "commitment":
      return factory ?? selected ?? airfield;
    case "crisis":
      return selected ?? airfield ?? factory;
    case "resolution":
      return selected ?? factory ?? airfield;
    default:
      return rail ?? radar ?? defense ?? factory ?? selected;
  }
}

function hasOperationalPackage(state: SaveState): boolean {
  const assigned = state.planning.assignedAircraftIds.filter((aircraftId) => getAircraftAvailability(state, aircraftId).level !== "unavailable");
  return assigned.length > 0;
}

function chooseRecommendedAircraftIds(state: SaveState): string[] {
  const ranked = state.aircraft
    .map((aircraft) => ({
      aircraft,
      availability: getAircraftAvailability(state, aircraft.id),
      lead: getLeadAircraftAssessment(state, aircraft.id)
    }))
    .filter((entry) => entry.availability.level !== "unavailable")
    .sort((left, right) => {
      const availabilityRank = (value: AvailabilityReport["level"]) => value === "available" ? 0 : 1;
      const leadRank = (label: string) => label === "Trusted lead" ? 0 : label === "Workable lead" ? 1 : 2;
      return availabilityRank(left.availability.level) - availabilityRank(right.availability.level)
        || leadRank(left.lead.label) - leadRank(right.lead.label)
        || right.aircraft.hiddenCondition - left.aircraft.hiddenCondition;
    });
  return ranked.slice(0, Math.min(4, ranked.length)).map((entry) => entry.aircraft.id);
}

function chooseRecommendedLeadAircraftId(state: SaveState, aircraftIds: string[]): string | null {
  const ranked = aircraftIds
    .map((aircraftId) => ({
      aircraftId,
      lead: getLeadAircraftAssessment(state, aircraftId),
      availability: getAircraftAvailability(state, aircraftId),
      aircraft: getAircraftById(state, aircraftId)
    }))
    .filter((entry) => entry.aircraft);
  if (ranked.length === 0) {
    return null;
  }
  ranked.sort((left, right) => {
    const availabilityRank = (value: AvailabilityReport["level"]) => value === "available" ? 0 : 1;
    const leadRank = (label: string) => label === "Trusted lead" ? 0 : label === "Workable lead" ? 1 : 2;
    return leadRank(left.lead.label) - leadRank(right.lead.label)
      || availabilityRank(left.availability.level) - availabilityRank(right.availability.level)
      || ((right.aircraft?.hiddenCondition ?? 0) - (left.aircraft?.hiddenCondition ?? 0));
  });
  return ranked[0]!.aircraftId;
}

function createOperationalRecommendation(
  state: SaveState,
  title: string,
  body: string,
  urgency: StaffRecommendation["urgency"],
  target: Target | undefined,
  operationType: OperationType,
  routeRisk: RouteRisk,
  attackDoctrine: AttackDoctrine,
  secondaryTargetId: string | null = null
): StaffRecommendation {
  return createStaffRecommendation({
    sourceOfficer: "Operations Officer",
    title,
    body,
    urgency,
    relatedActionType: "go_mission_planning",
    relatedTargetId: target?.id ?? null,
    relatedAircraftId: null,
    relatedCrewMemberId: null,
    planOperationType: operationType,
    planRouteRisk: routeRisk,
    planAttackDoctrine: attackDoctrine,
    planSecondaryTargetId: secondaryTargetId
  });
}

function buildOpportunityRecommendation(
  state: SaveState,
  opportunity: CampaignOpportunity
): {
  recommended: StaffRecommendation;
  alternates: StaffRecommendation[];
  riskIfIgnored: string | null;
} | null {
  const operationType = opportunity.eligibleOperationTypes[0] ?? "follow_up_attack";
  const routeRisk = opportunity.eligibleRouteRisks[0] ?? "standard";
  const beneficiary = opportunity.beneficiaryTargetIds
    .map((targetId) => getTargetById(state, targetId))
    .filter((target): target is Target => Boolean(target))
    .find((target) => doesOperationExploitOpportunity(state, opportunity, target.id, operationType, routeRisk));
  if (!beneficiary) {
    return null;
  }
  const title = opportunity.kind === "fighter_response_softened"
    ? `Exploit the opening against ${beneficiary.name}`
    : opportunity.kind === "repair_network_slowed"
      ? `Follow through before repairs settle at ${beneficiary.name}`
      : `Use the route opening toward ${beneficiary.name}`;
  const body = opportunity.kind === "fighter_response_softened"
    ? "Operations believes the softened fighter picture can cover one more meaningful strike before the enemy restores it."
    : opportunity.kind === "repair_network_slowed"
      ? "Operations believes the repair slowdown only matters if the next strike lands on damaged connected works before recovery catches up."
      : routeRisk === "direct"
        ? "Operations believes warning coordination is loose enough to justify a more direct route while the opening still exists."
        : "Operations believes route warning remains unsettled for a short while longer.";
  const riskIfIgnored = opportunity.kind === "fighter_response_softened"
    ? "If the group waits, the fighter picture may harden again before another meaningful strike can be launched."
    : opportunity.kind === "repair_network_slowed"
      ? "If the group waits, the repair network may catch up and erase the benefit of the earlier rail disruption."
      : "If the group waits, warning coordination may recover and the route advantage will disappear.";
  return {
    recommended: createOperationalRecommendation(
      state,
      title,
      body,
      "normal",
      beneficiary,
      operationType,
      routeRisk,
      operationType === "main_strike" ? "single_pass" : "repeat_if_needed"
    ),
    alternates: [
      createAdministrativeRecommendation("Intelligence Officer", "Review the target folders", "Intelligence would compare the current opening against the rest of the board before the group commits.", "low", "go_target_board"),
      createOperationalRecommendation(state, "Commit directly to Bremen", "Command Liaison would still accept a direct Bremen effort if the board wants progress more than a shaped opening.", "low", state.targets.find((entry) => entry.type === "factory"), "main_strike", "standard", "single_pass")
    ],
    riskIfIgnored
  };
}

function createAdministrativeRecommendation(
  sourceOfficer: StaffRecommendation["sourceOfficer"],
  title: string,
  body: string,
  urgency: StaffRecommendation["urgency"],
  action: StaffRecommendation["relatedActionType"],
  targetId: string | null = null,
  aircraftId: string | null = null
): StaffRecommendation {
  return createStaffRecommendation({
    sourceOfficer,
    title,
    body,
    urgency,
    relatedActionType: action,
    relatedTargetId: targetId,
    relatedAircraftId: aircraftId,
    relatedCrewMemberId: null
  });
}

function chooseConferenceRecommendations(state: SaveState, phase: CampaignPhase): {
  recommended: StaffRecommendation;
  alternates: StaffRecommendation[];
  riskIfIgnored: string | null;
} {
  const target = findPreferredOperationalTarget(state, phase);
  const selected = getTargetById(state, state.planning.selectedTargetId);
  const mission = getActiveMission(state);
  const activeRepairs = state.repairJobs.filter((job) => !job.completionApplied);
  const activeRecon = getActiveRecon(state);
  const latestDebrief = getLatestDebriefMission(state);
  const staleIntel = target ? getTargetIntelAgeLabel(state, target.id) === "stale" : false;
  const noPackage = !hasOperationalPackage(state);
  const unresolvedPersonnel = state.campaign.personnelDecisions.some((entry) => !entry.resolved);

  if (mission) {
    return {
      recommended: createAdministrativeRecommendation("Executive Officer", "Wait for the next report", "The operation is still under way. Staff recommends letting the next report arrive before changing the board again.", "normal", "wait_next_event", mission.plan.targetId),
      alternates: [
        createAdministrativeRecommendation("Executive Officer", "Review Command", "Use the pause to review what each department is worried about before the crews return.", "low", "go_target_board", mission.plan.targetId),
        createAdministrativeRecommendation("Engineering Officer", "Prepare the line quietly", "Engineering would use the wait to review likely repair priorities without committing new work yet.", "low", "go_maintenance")
      ],
      riskIfIgnored: "Trying to plan around partial reports risks reacting to noise instead of the mission that is still unfolding."
    };
  }

  if (activeRecon) {
    return {
      recommended: createAdministrativeRecommendation("Intelligence Officer", "Let recon finish", "Intelligence is already gathering the next clue. Staff recommends waiting for interpretation before hardening the next plan.", "normal", "let_work_finish", activeRecon.targetId),
      alternates: [
        createAdministrativeRecommendation("Executive Officer", "Review the board", "Use the pause to review the broader target picture while the latest run is interpreted.", "low", "go_target_board", activeRecon.targetId),
        createAdministrativeRecommendation("Engineering Officer", "Inspect the line", "Engineering would use the pause to clear low-level maintenance concerns before the next order.", "low", "go_maintenance")
      ],
      riskIfIgnored: "Moving before the recon is interpreted wastes the very clarity the sortie was sent to buy."
    };
  }

  if (phase === "crisis") {
    const recommended = activeRepairs.length > 0
      ? createAdministrativeRecommendation("Engineering Officer", "Let the line settle", "Engineering recommends letting current work finish before risking another major operation.", "urgent", "let_work_finish")
      : createAdministrativeRecommendation("Medical/Personnel Officer", "Stand down until morning", "Personnel and engineering both argue the group needs recovery time before another full effort.", "urgent", "stand_down_morning");
    return {
      recommended,
      alternates: [
        createAdministrativeRecommendation("Medical/Personnel Officer", "Resolve personnel strains", "Recovered originals and replacements should be sorted before the next operation.", "normal", "go_aircraft_crews"),
        createAdministrativeRecommendation("Engineering Officer", "Go to Maintenance", "Review damaged aircraft and ground-crew bottlenecks before asking for more tempo.", "normal", "go_maintenance"),
        createOperationalRecommendation(state, "Consider a reduced strike later", "Operations sees only a reduced or support effort as sensible once the group steadies.", "low", target, "reduced_strike", "cautious", "abort_unless_visual")
      ],
      riskIfIgnored: "Trying to force a full operation now risks compounding crew strain and grounding more aircraft."
    };
  }

  if (!hasCompletedFirstLoop(state)) {
    const recommended = createOperationalRecommendation(
      state,
      target?.type === "airfield" ? "Open with Jever Airfield" : "Open with Bremen",
      target?.type === "airfield"
        ? "Staff sees Jever as the cleaner opening move: it may soften immediate fighter pressure without staking everything on uncertain factory results."
        : "Staff sees Bremen as the decisive target, but warns that the first run may be hard to interpret cleanly.",
      "normal",
      target,
      "reduced_strike",
      "standard",
      "single_pass"
    );
    return {
      recommended,
      alternates: [
        createOperationalRecommendation(state, "Open aggressively", "Operations would accept an early direct commitment against Bremen if command pressure matters more than caution.", "low", state.targets.find((entry) => entry.type === "factory"), "main_strike", "direct", "single_pass"),
        createAdministrativeRecommendation("Executive Officer", "Review the target board", "Executive staff recommends comparing the first objective files before committing the group.", "low", "go_target_board")
      ],
      riskIfIgnored: "Delaying too long leaves the board directionless, but rushing blind may waste the first useful effort."
    };
  }

  if (latestDebrief && latestDebrief.debriefGenerated && !activeRecon && staleIntel) {
    return {
      recommended: {
        ...createAdministrativeRecommendation("Intelligence Officer", "Order post-strike recon", "Intelligence recommends fresh photography before treating the latest strike assessment as settled.", "urgent", "start_recon", target?.id ?? selected?.id ?? null),
        planReconType: "post_strike"
      },
      alternates: [
        createAdministrativeRecommendation("Engineering Officer", "Review repairs first", "Engineering would use the pause to clear aircraft damage before the next commitment.", "normal", "go_maintenance"),
        createOperationalRecommendation(state, "Prepare a follow-up strike", "Operations would begin shaping a second effort now, though Intelligence will object to stale evidence.", "low", target, "follow_up_attack", "standard", "repeat_if_needed")
      ],
      riskIfIgnored: "Reattacking without fresher evidence risks chasing a result crews only half understand."
    };
  }

  if (unresolvedPersonnel) {
    return {
      recommended: createAdministrativeRecommendation("Medical/Personnel Officer", "Resolve personnel decisions", "Recovered originals and temporary replacements are beginning to complicate the next roster decisions.", "normal", "go_aircraft_crews"),
      alternates: [
        createAdministrativeRecommendation("Engineering Officer", "Let current work finish", "Engineering would accept a brief pause while the line and roster settle.", "low", "let_work_finish"),
        createOperationalRecommendation(state, "Fly a cautious reduced strike", "Operations believes a reduced effort is still possible if the personnel strain is accepted for one more turn.", "low", target, "reduced_strike", "cautious", "abort_unless_visual")
      ],
      riskIfIgnored: "Leaving crew-seat questions to drift will not stop flight immediately, but it will steadily erode confidence and cohesion."
    };
  }

  if (noPackage) {
    return {
      recommended: createAdministrativeRecommendation("Engineering Officer", "Restore the package first", "There is no credible aircraft package on hand for the recommendation staff would otherwise make.", "urgent", activeRepairs.length > 0 ? "go_maintenance" : "go_aircraft_crews"),
      alternates: [
        createAdministrativeRecommendation("Executive Officer", "Review the board", "Executive staff recommends reassessing targets while the squadron is put back together.", "low", "go_target_board"),
        createAdministrativeRecommendation("Command Liaison", "Hold Command's patience", "Command will tolerate a pause more readily if the next package looks real rather than improvised.", "low", "go_mission_planning")
      ],
      riskIfIgnored: "Pretending a package exists when it does not will only create another false start."
    };
  }

  if (phase === "pressure") {
    return {
      recommended: createOperationalRecommendation(state, "Prepare a reduced strike against Jever", "Operations recommends an airfield effort to soften immediate fighter response before committing to a deeper Bremen problem.", "normal", state.targets.find((entry) => entry.type === "airfield"), "reduced_strike", "standard", "single_pass"),
      alternates: [
        createOperationalRecommendation(state, "Probe with support raid", "A lighter radar or defense attack could shape the route picture without demanding a full commitment.", "low", state.targets.find((entry) => entry.type === "radar") ?? state.targets.find((entry) => entry.type === "defense"), "support_raid", "cautious", "abort_unless_visual"),
        createOperationalRecommendation(state, "Push directly at Bremen", "Command Liaison would accept a direct Bremen effort sooner than the rest of staff prefers.", "low", state.targets.find((entry) => entry.type === "factory"), "main_strike", "direct", "single_pass")
      ],
      riskIfIgnored: "Ignoring the fighter picture may leave the next direct strike paying full price on the route and over the target."
    };
  }

  if (phase === "opportunity") {
    const usableOpportunity = getPrimaryUsableOpportunity(state);
    const recommendation = usableOpportunity ? buildOpportunityRecommendation(state, usableOpportunity) : null;
    if (recommendation) {
      return recommendation;
    }
  }

  if (phase === "commitment") {
    return {
      recommended: createOperationalRecommendation(state, "Commit to Bremen", "Command patience is narrowing. Staff believes the next useful move should show direct pressure on the aviation target itself.", "urgent", state.targets.find((entry) => entry.type === "factory"), "main_strike", "standard", "single_pass"),
      alternates: [
        createOperationalRecommendation(state, "Use a reduced direct strike", "A smaller direct effort may satisfy command better than another purely indirect move.", "normal", state.targets.find((entry) => entry.type === "factory"), "reduced_strike", "standard", "bomb_through_cloud"),
        createAdministrativeRecommendation("Engineering Officer", "Stand down only if necessary", "Engineering would still prefer repairs first, though it understands command pressure is tightening.", "low", "stand_down_morning")
      ],
      riskIfIgnored: "Another indirect turn may deepen command dissatisfaction even if it is tactically sensible."
    };
  }

  return {
    recommended: createOperationalRecommendation(state, "Review and follow up", "Staff recommends weighing the latest damage, recon confidence, and readiness before deciding whether to reattack or shift focus.", "normal", target ?? selected, "follow_up_attack", "standard", "repeat_if_needed"),
    alternates: [
        createAdministrativeRecommendation("Intelligence Officer", "Go to Recon", "Intelligence would rather settle the target picture before another major commitment.", "normal", "go_recon"),
      createAdministrativeRecommendation("Engineering Officer", "Go to Maintenance", "Engineering prefers using the pause to recover the line before another large effort.", "low", "go_maintenance"),
      createOperationalRecommendation(state, "Shift to a support target", "Operations could redirect effort to a support target if the latest evidence on the main objective remains thin.", "low", state.targets.find((entry) => entry.type === "rail") ?? state.targets.find((entry) => entry.type === "radar"), "support_raid", "cautious", "abort_unless_visual")
    ],
    riskIfIgnored: "Acting without settling what the last operation achieved may waste either the opening or the recovery window."
  };
}

function sanitizeConferenceRecommendation(state: SaveState, recommendation: StaffRecommendation): StaffRecommendation {
  if (!recommendation.relatedTargetId && recommendation.relatedActionType === "go_target_board") {
    return recommendation;
  }
  if (recommendation.relatedTargetId && !getTargetById(state, recommendation.relatedTargetId)) {
    return createAdministrativeRecommendation("Executive Officer", "Review the board", "The specific objective staff had in mind is no longer current. Recheck the Command and target folders before acting.", "normal", "go_target_board");
  }
  if (recommendation.relatedAircraftId && !getAircraftById(state, recommendation.relatedAircraftId)) {
    return createAdministrativeRecommendation("Executive Officer", "Resolve the situation first", "The aircraft staff had in mind is no longer available to discuss directly.", "normal", "go_aircraft_crews");
  }
  return recommendation;
}

export function getStaffConference(state: SaveState): StaffConference {
  if (state.campaign.finalSummaryMode && state.campaign.evaluation) {
    const evaluation = state.campaign.evaluation;
    return {
      phaseId: "resolution",
      phaseLabel: "Campaign Summary",
      summary: "The campaign has concluded and the final judgment is now fixed.",
      executiveComment: evaluation.staffJudgment,
      operationsComment: evaluation.directiveAssessment,
      intelligenceComment: evaluation.notableChains[0] ?? "The final intelligence picture remains incomplete in places.",
      engineeringComment: evaluation.groupAssessment,
      personnelComment: evaluation.lossesAssessment,
      commandComment: evaluation.commandJudgment,
      recommendedAction: createAdministrativeRecommendation("Executive Officer", "Review campaign record", "The campaign has concluded. Staff recommends reviewing the final record or starting a new campaign.", "low", "go_target_board"),
      alternateActions: [],
      riskIfIgnored: null
    };
  }
  if (state.campaign.resolutionState === "pending") {
    const pending = getResolutionPendingWorkSummary(state);
    return {
      phaseId: "resolution",
      phaseLabel: "Resolution Pending",
      summary: "An end condition has been reached. No new operational orders may be issued while already-committed work finishes.",
      executiveComment: pending.length > 0
        ? `Staff is waiting on ${pending.join(", ")} already in motion before the campaign is judged.`
        : "Staff is waiting on the final consequential paperwork before the campaign is judged.",
      operationsComment: "Operations is no longer proposing fresh sorties.",
      intelligenceComment: "Intelligence will file what is already airborne, but will not ask for new collection.",
      engineeringComment: "Engineering can finish current work, but no new maintenance commitment should begin.",
      personnelComment: "Personnel matters may still be reviewed while the final picture settles.",
      commandComment: "Higher command is awaiting the final accounting rather than another plan.",
      recommendedAction: createAdministrativeRecommendation("Executive Officer", "Review the current record", "Use the remaining time to review the latest debriefs, aircraft state, and campaign record while committed work settles.", "normal", "go_debrief"),
      alternateActions: [
        createAdministrativeRecommendation("Engineering Officer", "Review Maintenance", "Inspect ongoing repair and recovery work already in train.", "low", "go_maintenance"),
        createAdministrativeRecommendation("Intelligence Officer", "Review Recon", "Track the last intelligence already committed to the air.", "low", "go_recon")
      ],
      riskIfIgnored: null
    };
  }
  const phaseId = state.campaign.campaignPhaseId;
  const phaseLabel = getCampaignPhaseLabel(phaseId);
  const directive = state.campaign.directiveState;
  const target = findPreferredOperationalTarget(state, phaseId);
  const latestDebrief = getLatestDebriefMission(state);
  const activeRecon = getActiveRecon(state);
  const available = countAvailableAircraft(state);
  const marginal = countMarginalAircraft(state);
  const crisis = hasReadinessCrisis(state);
  const latestLedger = state.campaign.consequenceLedger[0] ?? null;
  const recs = chooseConferenceRecommendations(state, phaseId);
  const recommended = sanitizeConferenceRecommendation(state, recs.recommended);
  const alternates = recs.alternates.map((entry) => sanitizeConferenceRecommendation(state, entry)).slice(0, 3);
  const summary =
    phaseId === "opening"
      ? "The group is still finding its footing. Staff wants the first operation to teach something useful without squandering the squadron."
      : phaseId === "crisis"
        ? "Readiness has become the main story. Staff is arguing about how much risk the group can absorb before it starts breaking itself."
        : phaseId === "pressure"
          ? "The immediate fighter picture still shapes every larger decision. Staff is weighing whether to soften that problem before anything ambitious."
        : phaseId === "opportunity"
            ? "Staff believes a temporary opening exists. The question is whether to exploit it now, confirm it, or let it pass."
          : phaseId === "commitment"
              ? "Command wants clearer direct progress now, even if some departments would rather keep shaping the problem."
              : latestLedger
                ? `${latestLedger.staffRead} ${latestLedger.recommendedPosture}`
                : "Staff is in follow-up mode, trying to decide whether the latest evidence argues for recon, reattack, or a shift in focus.";

  const executiveComment = latestLedger
    ? `So basically: ${latestLedger.staffRead.toLowerCase()} ${latestLedger.groupCost}`
    : latestDebrief && latestDebrief.debriefGenerated
      ? `So basically: the last operation gave us ${latestDebrief.resultSummary.toLowerCase()}, and the next decision matters more than the last headline.`
    : "So basically: we need a sane next move that matches what the squadron can actually sustain.";
  const operationsComment = crisis
    ? "Operations can still sketch reduced options, but it does not believe the group is ready for a confident full effort."
    : phaseId === "commitment"
      ? "Operations believes a direct strike can be flown if the board accepts the remaining uncertainty."
      : phaseId === "opportunity"
        ? "Operations believes the board should exploit the current opening before the enemy restores the old pattern."
      : latestLedger
        ? `Operations reads the present posture this way: ${latestLedger.recommendedPosture.toLowerCase()}`
      : target
        ? `Operations reads ${target.name} as the next practical objective, though it is not pretending the route or picture are clean.`
        : "Operations wants a target chosen before it starts talking as if a real order exists.";
  const intelligenceComment = activeRecon
    ? "Intelligence is already waiting on fresh interpretation and does not want the next big decision to outrun the evidence."
    : latestLedger
      ? `${latestLedger.targetRead} Intelligence is tracking the file as ${target ? getTargetIntelAgeLabel(state, target.id) : "aging"}.`
    : target
      ? `${target.name} still sits under a ${getTargetIntelAgeLabel(state, target.id)} file. Intelligence is willing to advise, but not to pretend certainty.`
      : "Intelligence has no target file in front of it worth pretending is settled.";
  const engineeringComment = state.repairJobs.some((job) => !job.completionApplied) || state.recoveryJobs.some((job) => !job.completionApplied)
    ? "Engineering would like the current queue cleared before anyone starts speaking as if the line is fresh again."
    : state.aircraft.some((aircraft) => aircraft.status === "lost")
      ? "Engineering has written off at least one aircraft entirely and wants the board to stop talking as if every loss is repairable."
    : marginal > 0
      ? "Engineering can support another effort, but it does not endorse acting as if every aircraft is equally trustworthy."
      : "Engineering has fewer objections than usual, which it takes as permission for caution rather than bravado.";
  const personnelComment = state.campaign.personnelDecisions.some((entry) => !entry.resolved)
    ? "Personnel notes that recovered originals and temporary replacements are now creating real seat-friction even where the manifest still functions."
    : state.crewMembers.some((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded")
      ? "Personnel is tracking wounded and fatigue carefully and does not want the next order to assume the roster is whole when it is not."
      : "Personnel sees a workable roster, but not one that should be pushed carelessly just because it still looks functional on paper.";
  const commandComment = directive.commandPatience < 45
    ? "Command Liaison is blunt: headquarters wants visible progress soon and may not admire another purely preparatory answer."
    : latestLedger
      ? latestLedger.commandRead
    : directive.commandPatience < 60
      ? "Command Liaison says patience is narrowing, though not yet gone."
      : "Command Liaison says the board still has room to choose the next move deliberately, provided it looks purposeful.";

  return {
    phaseId,
    phaseLabel,
    summary,
    executiveComment,
    operationsComment,
    intelligenceComment,
    engineeringComment,
    personnelComment,
    commandComment,
    recommendedAction: recommended,
    alternateActions: alternates,
    riskIfIgnored: recs.riskIfIgnored
  };
}

export function applyRecommendedPlan(state: SaveState, now: number): string | null {
  const conference = getStaffConference(state);
  const recommendation = conference.recommendedAction;
  switch (recommendation.relatedActionType) {
    case "go_target_board":
      if (recommendation.relatedTargetId && getTargetById(state, recommendation.relatedTargetId)) {
        setPlanningTarget(state, recommendation.relatedTargetId);
      }
      setSelectedTab(state, "target-board");
      return null;
    case "go_aircraft_crews":
      setSelectedTab(state, "aircraft-crews");
      return null;
    case "go_maintenance":
      setSelectedTab(state, "maintenance");
      return null;
    case "go_debrief":
      setSelectedTab(state, "debrief");
      return null;
    case "start_recon":
      if (!recommendation.relatedTargetId || !getTargetById(state, recommendation.relatedTargetId)) {
        setSelectedTab(state, "target-board");
        return null;
      }
      setPlanningTarget(state, recommendation.relatedTargetId);
      setSelectedTab(state, "recon");
      return startRecon(state, recommendation.relatedTargetId, recommendation.planReconType ?? "pre_strike", now);
    case "wait_next_event":
      return waitUntilNextEvent(state, now);
    case "stand_down_morning":
      return standDownUntilMorning(state, now);
    case "let_work_finish":
      return letCurrentWorkFinish(state, now);
    case "go_mission_planning":
    default: {
      if (!recommendation.relatedTargetId || !getTargetById(state, recommendation.relatedTargetId)) {
        setSelectedTab(state, state.repairJobs.some((job) => !job.completionApplied) ? "maintenance" : "aircraft-crews");
        return null;
      }
      setPlanningTarget(state, recommendation.relatedTargetId);
      const plan = recommendation as StaffRecommendation & {
        planOperationType?: OperationType;
        planRouteRisk?: RouteRisk;
        planAttackDoctrine?: AttackDoctrine;
        planSecondaryTargetId?: string | null;
      };
      if (plan.planOperationType) {
        setOperationType(state, plan.planOperationType);
      }
      if (plan.planRouteRisk) {
        setRouteRisk(state, plan.planRouteRisk);
      }
      if (plan.planAttackDoctrine) {
        setAttackDoctrine(state, plan.planAttackDoctrine);
      }
      const validSecondary = plan.planSecondaryTargetId && getSecondaryTargetOptions(state, recommendation.relatedTargetId).some((target) => target.id === plan.planSecondaryTargetId)
        ? plan.planSecondaryTargetId
        : null;
      setSecondaryTarget(state, validSecondary);
      state.planning.assignedAircraftIds = chooseRecommendedAircraftIds(state);
      state.planning.leadAircraftId = chooseRecommendedLeadAircraftId(state, state.planning.assignedAircraftIds);
      cleanupPlanningState(state);
      setSelectedTab(state, "mission-planning");
      return null;
    }
  }
}

function staffUrgencyRank(urgency: StaffRecommendation["urgency"]): number {
  switch (urgency) {
    case "urgent":
      return 0;
    case "normal":
      return 1;
    default:
      return 2;
  }
}

function createStaffRecommendation(input: Omit<StaffRecommendation, "id">): StaffRecommendation {
  return {
    id: [
      input.sourceOfficer,
      input.title,
      input.relatedTargetId ?? "",
      input.relatedAircraftId ?? "",
      input.relatedCrewMemberId ?? ""
    ].join(":").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
    ...input
  };
}

export function getStaffBriefingRecommendations(state: SaveState): StaffRecommendation[] {
  const recommendations: StaffRecommendation[] = [];
  const mission = getActiveMission(state);
  const latestDebrief = getLatestDebriefMission(state);
  const recon = getActiveRecon(state);
  const selectedTarget = getTargetById(state, state.planning.selectedTargetId);
  const directive = state.campaign.directiveState;
  const assignedAvailability = state.planning.assignedAircraftIds.map((aircraftId) => ({
    aircraft: getAircraftById(state, aircraftId),
    availability: getAircraftAvailability(state, aircraftId)
  })).filter((entry) => entry.aircraft);
  const availableAssigned = assignedAvailability.filter((entry) => entry.availability.level === "available").length;
  const marginalAssigned = assignedAvailability.filter((entry) => entry.availability.level === "marginal");
  const unavailableAssigned = assignedAvailability.filter((entry) => entry.availability.level === "unavailable");
  const waitingDamagedAircraft = state.aircraft.filter((aircraft) =>
    aircraft.status === "damaged" && !aircraft.repairJobId
  );
  const activeRepairs = state.repairJobs.filter((job) => !job.completionApplied);
  const divertedAwaitingRecovery = state.aircraft.filter((aircraft) =>
    aircraft.status === "diverted" && !aircraft.recoveryJobId
  );
  const unfitAssignedCrew = state.crewMembers.find((member) =>
    member.assignedAircraftId
    && member.currentAssignmentRole
    && REQUIRED_ROLES.includes(member.currentAssignmentRole)
    && !canRoleFly(member)
  );
  const tiredCrewCount = state.crewMembers.filter((member) => member.fatigue === "tired" || member.fatigue === "exhausted").length;
  const lightlyWoundedCount = state.crewMembers.filter((member) => member.status === "lightly_wounded").length;
  const seriouslyWoundedCount = state.crewMembers.filter((member) => member.status === "seriously_wounded").length;
  const replacementPool = getReplacementPool(state);
  const launchDisabledReason = getDisabledReasonForLaunch(state);

  if (latestDebrief && latestDebrief.debriefGenerated && !mission && state.campaign.pendingDecisions.some((entry) => /review/i.test(entry))) {
    const target = getTargetById(state, latestDebrief.plan.targetId);
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Executive Officer",
      title: "Debrief awaiting your attention",
      body: `Debrief is ready from ${target?.name ?? "the last operation"}. The staff would rather review the crews' account before setting the next task.`,
      urgency: "urgent",
      relatedActionType: "go_debrief",
      relatedTargetId: target?.id ?? null,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  }

  if (mission) {
    const target = getTargetById(state, mission.plan.targetId);
    const nextReport = mission.timelineEvents.some((event) => !event.revealed);
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Executive Officer",
      title: "Operation still under way",
      body: nextReport
        ? `${target?.name ?? "The assigned target"} is still under attack. Staff advises holding major new decisions until the next report arrives.`
        : "All known mission reports have arrived. Staff is waiting on the crews' debrief before drawing firmer conclusions.",
      urgency: "normal",
      relatedActionType: null,
      relatedTargetId: mission.plan.targetId,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  } else if (launchDisabledReason) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Operations Officer",
      title: "Operation board not yet ready",
      body: launchDisabledReason === LEAD_INVALID_WARNING
        ? "The nominated lead aircraft is no longer valid for the current package. Operations needs a new lead named before the order can stand."
        : launchDisabledReason === "No aircraft assigned"
        ? "No aircraft are currently committed to the board. Operations recommends building a tentative package before the next decision window passes."
        : launchDisabledReason === "No target selected"
          ? "No target is selected for the next operation. Operations wants a clear objective before crews are held on readiness."
          : "Operations is already committed elsewhere. The board should remain focused on the running task.",
      urgency: launchDisabledReason === "Operation already in progress" ? "normal" : "urgent",
      relatedActionType: launchDisabledReason === "No target selected" ? "go_target_board" : "go_mission_planning",
      relatedTargetId: selectedTarget?.id ?? null,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  } else if (unavailableAssigned.length > 0) {
    const blocked = unavailableAssigned[0]!;
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Operations Officer",
      title: "Assigned aircraft cannot launch as planned",
      body: `${blocked.aircraft?.name ?? "One aircraft"} is presently unavailable. Operations recommends replacing it or correcting the crew problem before relying on the current package.`,
      urgency: "urgent",
      relatedActionType: "go_aircraft_crews",
      relatedTargetId: selectedTarget?.id ?? null,
      relatedAircraftId: blocked.aircraft?.id ?? null,
      relatedCrewMemberId: null
    }));
  } else if (marginalAssigned.length > 0) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Operations Officer",
      title: "Current strike package is only marginal",
      body: availableAssigned >= 2
        ? "Enough aircraft appear available for a reduced operation, but a full strike would lean on tired crews or shaky crew arrangements."
        : "The present package could be flown only with clear compromises. Operations advises caution before ordering a major effort.",
      urgency: "normal",
      relatedActionType: "go_mission_planning",
      relatedTargetId: selectedTarget?.id ?? null,
      relatedAircraftId: marginalAssigned[0]?.aircraft?.id ?? null,
      relatedCrewMemberId: null
    }));
  } else if (selectedTarget) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Operations Officer",
      title: "A workable package is on hand",
      body: selectedTarget.type === "factory" && (directive.fighterPressure >= 65 || directive.approachDanger >= 65)
        ? "Operations believes a direct factory effort is possible, but the route and fighter picture still argue for caution."
        : selectedTarget.type === "airfield"
          ? "Operations believes an airfield strike could reduce near-term fighter pressure before a deeper Bremen effort."
          : "Operations believes the current board can support another strike, provided intelligence is acceptable and engineering does not raise fresh objections.",
      urgency: "low",
      relatedActionType: "go_mission_planning",
      relatedTargetId: selectedTarget.id,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  }

  if (recon) {
    const reconTarget = getTargetById(state, recon.targetId);
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Intelligence Officer",
      title: "Recon interpretation in progress",
      body: `${reconTarget?.name ?? "The assigned target"} is already under review. Intelligence prefers to finish reading the latest run before urging another reconnaissance effort.`,
      urgency: "normal",
      relatedActionType: "go_target_board",
      relatedTargetId: recon.targetId,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  } else if (selectedTarget && getTargetIntelAgeLabel(state, selectedTarget.id) === "stale") {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Intelligence Officer",
      title: "Selected target file is going stale",
      body: selectedTarget.type === "factory"
        ? `The factory remains the decisive aviation target, but the file on ${selectedTarget.name} is aging. Intelligence advises recon before committing veteran crews.`
        : `The picture on ${selectedTarget.name} is aging and still rests on incomplete evidence. Intelligence advises another look before a major strike.`,
      urgency: "urgent",
      relatedActionType: "start_recon",
      relatedTargetId: selectedTarget.id,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  } else if (selectedTarget && state.campaign.latestIntelUpdate && state.campaign.latestIntelUpdate.targetId === selectedTarget.id) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Intelligence Officer",
      title: "Latest assessment remains qualified",
      body: `The latest file on ${selectedTarget.name} is still only ${state.campaign.latestIntelUpdate.resultQuality}. Intelligence recommends treating the evidence as useful but not final.`,
      urgency: state.campaign.latestIntelUpdate.resultQuality === "inconclusive" ? "normal" : "low",
      relatedActionType: "go_target_board",
      relatedTargetId: selectedTarget.id,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  } else if (selectedTarget && state.campaign.latestStrategicIntelNote) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Intelligence Officer",
      title: "Strategic reading remains incomplete",
      body: state.campaign.latestStrategicIntelNote,
      urgency: "low",
      relatedActionType: "go_target_board",
      relatedTargetId: selectedTarget.id,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  }

  if (waitingDamagedAircraft.length > 0) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Engineering Officer",
      title: "Damaged aircraft are waiting on the line",
      body: `${waitingDamagedAircraft[0]!.name} and other aircraft still need attention. Engineering recommends opening repair work before more tasks accumulate.`,
      urgency: "urgent",
      relatedActionType: "go_maintenance",
      relatedTargetId: null,
      relatedAircraftId: waitingDamagedAircraft[0]!.id,
      relatedCrewMemberId: null
    }));
  } else if (activeRepairs.length > 0 || divertedAwaitingRecovery.length > 0) {
    const bottleneckCount = activeRepairs.length + divertedAwaitingRecovery.length;
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Engineering Officer",
      title: "Ground crews are carrying a queue",
      body: bottleneckCount > 1
        ? "Engineering is already juggling several claims on the ground crews. Slower work now may delay the next useful sortie."
        : "Engineering has a job in hand and recommends letting the line settle before adding more avoidable strain.",
      urgency: "normal",
      relatedActionType: "go_maintenance",
      relatedTargetId: null,
      relatedAircraftId: (divertedAwaitingRecovery[0] ?? getAircraftById(state, activeRepairs[0]?.aircraftId ?? ""))?.id ?? null,
      relatedCrewMemberId: null
    }));
  }

  if (unfitAssignedCrew) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Medical/Personnel Officer",
      title: "A key crew station is not fit",
      body: `${unfitAssignedCrew.name} cannot presently cover the ${roleLabel(unfitAssignedCrew.currentAssignmentRole!)} seat. Personnel recommends assigning a replacement or easing that aircraft off the board.`,
      urgency: "urgent",
      relatedActionType: "go_aircraft_crews",
      relatedTargetId: null,
      relatedAircraftId: unfitAssignedCrew.assignedAircraftId,
      relatedCrewMemberId: unfitAssignedCrew.id
    }));
  } else if (seriouslyWoundedCount > 0 || lightlyWoundedCount > 0 || tiredCrewCount >= 6) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Medical/Personnel Officer",
      title: "Crew strain is building",
      body: seriouslyWoundedCount > 0
        ? "Several men are unlikely to return quickly. Personnel recommends using replacements carefully and not assuming the roster will right itself overnight."
        : lightlyWoundedCount > 0
          ? "Some of the squadron is lightly wounded and recovering. Personnel recommends managing assignments conservatively for the next operation."
          : "Fatigue is beginning to show across multiple crews. Personnel recommends caution before asking for another full effort.",
      urgency: seriouslyWoundedCount > 0 || replacementPool.length === 0 ? "normal" : "low",
      relatedActionType: "go_aircraft_crews",
      relatedTargetId: null,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  }

  if (!mission && !recon && selectedTarget) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Command Liaison",
      title: "Higher command expects visible progress",
      body: directive.commandPatience < 40
        ? "Command is pressing for clearer direct progress. Another indirect support action may be taken badly."
        : selectedTarget.directiveRelevance === "high"
          ? "Command will tolerate setup only briefly and expects visible progress against aviation targets."
          : "Command will tolerate caution, but not drift. Another purely administrative pause may not satisfy the directive for long.",
      urgency: selectedTarget.directiveRelevance === "high" || directive.commandPatience < 40 ? "urgent" : "normal",
      relatedActionType: selectedTarget.directiveRelevance === "high" ? "go_mission_planning" : "go_target_board",
      relatedTargetId: selectedTarget.id,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  }

  if (recommendations.length < 2) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Executive Officer",
      title: "Staff is awaiting your next move",
      body: "No single department is shouting for attention. The desk is ready for either another look at the target folders or a cautious return to planning.",
      urgency: "low",
      relatedActionType: "go_target_board",
      relatedTargetId: selectedTarget?.id ?? null,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  }

  if (!mission && selectedTarget && recommendations.length < 5) {
    recommendations.push(createStaffRecommendation({
      sourceOfficer: "Executive Officer",
      title: "Decide whether to set up or strike now",
      body: directive.fighterReplacementFlow >= 65 && selectedTarget.type !== "factory"
        ? "The executive view is that we still need to decide whether we are setting up the Bremen strike or attempting it directly."
        : "The executive view is that the next order should either exploit the current opening or deliberately prepare a better one.",
      urgency: "normal",
      relatedActionType: selectedTarget.type === "factory" ? "go_mission_planning" : "go_target_board",
      relatedTargetId: selectedTarget.id,
      relatedAircraftId: null,
      relatedCrewMemberId: null
    }));
  }

  return recommendations
    .sort((a, b) => staffUrgencyRank(a.urgency) - staffUrgencyRank(b.urgency))
    .slice(0, 5);
}

export function getGroundCrewPressureNote(state: SaveState, aircraftId: string, tier?: RepairTier): string | null {
  const aircraft = getAircraftById(state, aircraftId);
  if (!aircraft) {
    return null;
  }
  const groundCrew = getGroundCrewById(state, aircraft.assignedGroundCrewId);
  if (!groundCrew) {
    return null;
  }
  const waitingAircraft = state.aircraft.filter((candidate) =>
    candidate.assignedGroundCrewId === groundCrew.id
    && candidate.id !== aircraft.id
    && (candidate.status === "damaged" || candidate.status === "diverted")
    && !candidate.repairJobId
    && !candidate.recoveryJobId
  );
  if (waitingAircraft.length === 0) {
    return tier === "thorough" ? "A thorough inspection is safest, but the aircraft will miss any immediate operation." : null;
  }
  if (tier === "patch") {
    return `This crew still has ${waitingAircraft.length} other aircraft waiting. A patch would return this one sooner, but it will not be fully trusted.`;
  }
  if (tier === "thorough") {
    return `This will occupy ${groundCrew.chiefName}'s crew and may delay ${waitingAircraft.length} other waiting aircraft.`;
  }
  return `${groundCrew.chiefName}'s crew still has ${waitingAircraft.length} other aircraft waiting for attention.`;
}

export function getDisabledReasonForLaunch(state: SaveState): string | null {
  if (state.campaign.activeMissionId) {
    return "Operation already in progress";
  }
  if (state.planning.assignedAircraftIds.length === 0) {
    return "No aircraft assigned";
  }
  const unavailableAssigned = state.planning.assignedAircraftIds.find((aircraftId) => getAircraftAvailability(state, aircraftId).level === "unavailable");
  if (unavailableAssigned) {
    return `${getAircraftById(state, unavailableAssigned)?.name ?? "An assigned aircraft"} is unavailable`;
  }
  if (!state.planning.leadAircraftId || !state.planning.assignedAircraftIds.includes(state.planning.leadAircraftId)) {
    return state.campaign.pendingDecisions.includes(LEAD_INVALID_WARNING) ? LEAD_INVALID_WARNING : "No lead aircraft selected";
  }
  if (getAircraftAvailability(state, state.planning.leadAircraftId).level === "unavailable") {
    return "Selected lead aircraft is unavailable";
  }
  const target = getTargetById(state, state.planning.selectedTargetId);
  if (!target) {
    return "No target selected";
  }
  return null;
}
