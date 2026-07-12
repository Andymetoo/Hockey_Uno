import type {
  Aircraft,
  Aircrew,
  AlertLevel,
  AvailabilityReport,
  AttackDoctrine,
  CampaignTab,
  CrewExperience,
  CrewFatigue,
  CrewMember,
  CrewMorale,
  CrewRole,
  CrewSpecialty,
  CrewStatus,
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
  Target,
  TargetType,
  TutorialStepDisplay,
  TutorialStepId,
  UiNotification
} from "./types";

export const SAVE_KEY = "bomber-command-save-v1";
export const SAVE_VERSION = 7;

const SHORT_MISSION_MS = 5 * 60 * 1000;
const MAJOR_MISSION_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FATIGUE_RECOVERY_MS = 6 * 60 * 1000;
const LIGHT_WOUND_RECOVERY_MS = 12 * 60 * 60 * 1000;
const TOAST_LIFETIME_MS = 12 * 1000;

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
    title: "Welcome to the First Operation",
    body: "Start on Command, then move to Target Board and Mission Planning. Pick one target, assign serviceable aircraft, and launch a first strike so the operation loop can begin.",
    suggestedTab: "command",
    trigger: (state) => state.missions.length === 0 && state.campaign.currentDay === 1
  },
  {
    id: "planning-basics",
    title: "Build a Mission Plan",
    body: "On Mission Planning, confirm target, route risk, doctrine, and lead aircraft. Lead quality and route choice strongly affect the hidden mission risk profile.",
    suggestedTab: "mission-planning",
    prerequisites: ["welcome"],
    trigger: (state) => state.missions.length === 0 && state.campaign.activeMissionId === null
  },
  {
    id: "mission-launched",
    title: "Operation Launched",
    body: "Reports now arrive over time. Use Current Operation to watch stage updates, or use wait controls to jump to the next report when testing.",
    suggestedTab: "current-operation",
    prerequisites: ["planning-basics"],
    trigger: (state) => Boolean(getActiveMission(state))
  },
  {
    id: "mission-reporting",
    title: "Read Incoming Reports",
    body: "Mission events are revealed in sequence. Early reports can be fragmentary, so wait for debrief before committing to major follow-up decisions.",
    suggestedTab: "current-operation",
    prerequisites: ["mission-launched"],
    trigger: (state) => {
      const mission = getActiveMission(state);
      return Boolean(mission && mission.reports.length > 0);
    }
  },
  {
    id: "debrief-review",
    title: "Debrief Is Ready",
    body: "Review Debrief / Assessment now. This is where target effect, aircraft status, and crew casualties are consolidated for your next order.",
    suggestedTab: "debrief",
    prerequisites: ["mission-reporting"],
    trigger: (state) => state.campaign.lastDebriefMissionId !== null
  },
  {
    id: "maintenance-follow-up",
    title: "Follow Up with Maintenance",
    body: "After each debrief, inspect Maintenance for damaged or diverted aircraft. Start repairs quickly to restore sortie capacity for the next operation.",
    suggestedTab: "maintenance",
    prerequisites: ["debrief-review"],
    trigger: (state) => state.aircraft.some((aircraft) => aircraft.status === "damaged" || aircraft.status === "diverted")
  },
  {
    id: "recon-follow-up",
    title: "Order Post-Strike Recon",
    body: "A follow-up recon helps confirm target condition and updates confidence. Recon is valuable before committing to another strike on the same target.",
    suggestedTab: "recon",
    prerequisites: ["debrief-review"],
    trigger: (state) => state.campaign.lastDebriefMissionId !== null && state.reconMissions.length === 0 && !state.campaign.activeReconId
  },
  {
    id: "recon-results",
    title: "Use Recon Interpretation",
    body: "Recon interpretation is now filed. Re-check target confidence, defense outlook, and alert level before selecting your next operation profile.",
    suggestedTab: "target-board",
    prerequisites: ["recon-follow-up"],
    trigger: (state) => state.campaign.latestIntelUpdate !== null
  },
  {
    id: "advance-day",
    title: "Advance the Campaign Day",
    body: "When no immediate action is pending, advance day to accrue rest and continue campaign tempo. Avoid long idle gaps if command patience is slipping.",
    suggestedTab: "command",
    prerequisites: ["debrief-review"],
    trigger: (state) => state.campaign.lastDebriefMissionId !== null && state.campaign.currentDay === 1 && !state.campaign.activeMissionId
  },
  {
    id: "first-loop-complete",
    title: "First Loop Complete",
    body: "You have completed the core loop: plan, launch, debrief, and follow-up decisions. Continue cycling missions while balancing fatigue, repairs, recon, and directive pressure.",
    suggestedTab: "command",
    prerequisites: ["advance-day"],
    trigger: (state) => state.campaign.currentDay > 1 && state.missions.some((mission) => mission.debriefGenerated)
  },
  {
    id: "personnel-decisions",
    title: "Personnel Decision Pending",
    body: "A recovered original crew member can reclaim a seat from a temporary replacement. Resolve the personnel decision to stabilize crew cohesion.",
    suggestedTab: "aircraft-crews",
    prerequisites: ["debrief-review"],
    trigger: (state) => state.campaign.personnelDecisions.some((decision) => !decision.resolved)
  },
  {
    id: "replacement-crew",
    title: "Replacement Crew in Use",
    body: "Replacements keep aircraft flying, but too many substitutions can strain cohesion. Keep an eye on role coverage and fatigue before launch.",
    suggestedTab: "aircraft-crews",
    prerequisites: ["debrief-review"],
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
    firstLoopCompleted: false
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
  const shouldBeComplete = state.campaign.currentDay > 1 && state.missions.some((mission) => mission.debriefGenerated);
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
  visibility: string
): { text: string; source: MissionEvent["source"]; confidence: MissionEvent["confidence"] } {
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
      activeMissionId: null,
      activeReconId: null,
      lastDebriefMissionId: null,
      logEntries: [],
      pendingDecisions: ["Choose the first operation target."],
      personnelDecisions: [],
      stationWeather: createStationWeather(1),
      latestIntelUpdate: null,
      latestStrategicIntelNote: null,
      directiveState: createInitialDirectiveState()
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
  state.campaign.personnelDecisions ??= [];
  state.campaign.directiveState ??= createInitialDirectiveState();
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
  }
  for (const mission of state.missions ?? []) {
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
  state.planning.operationType ??= "main_strike";
  state.planning.secondaryTargetId ??= null;
  state.planning.leadAircraftId ??= state.planning.assignedAircraftIds?.[0] ?? state.aircraft[0]?.id ?? null;
  state.planning.attackDoctrine ??= state.planning.standingOrders?.allowRepeatBombRun ? "repeat_if_needed" : "single_pass";
  state.tutorial ??= createInitialTutorialState();
  state.tutorial.enabled ??= true;
  state.tutorial.activeStepId ??= null;
  state.tutorial.completedStepIds ??= [];
  state.tutorial.firstLoopCompleted ??= false;
  state.tutorial.completedStepIds = state.tutorial.completedStepIds.filter((stepId) => TUTORIAL_STEP_MAP.has(stepId));
  if (state.tutorial.activeStepId && !TUTORIAL_STEP_MAP.has(state.tutorial.activeStepId)) {
    state.tutorial.activeStepId = null;
  }
  for (const recon of state.reconMissions ?? []) {
    recon.resultQuality ??= "partial";
    recon.recommendation ??= "Staff recommends treating the result cautiously.";
  }
  ensureAircraftRoleAssignments(state);
  for (const aircraft of state.aircraft) {
    aircraft.lastCrewIssueNote = buildAircraftIssueNote(state, aircraft);
  }
  syncDerivedCrews(state);
  syncPendingDecisionNotes(state);
  evaluateTutorial(state);
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
    return migrateLegacyState(parsed);
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

export function setSelectedTab(state: SaveState, tab: CampaignTab): void {
  state.selectedTab = tab;
}

export function setPlanningTarget(state: SaveState, targetId: string): void {
  state.planning.selectedTargetId = targetId;
  const secondaryOptions = getSecondaryTargetOptions(state, targetId);
  if (state.planning.secondaryTargetId && !secondaryOptions.some((target) => target.id === state.planning.secondaryTargetId)) {
    state.planning.secondaryTargetId = null;
  }
}

export function toggleAssignedAircraft(state: SaveState, aircraftId: string): void {
  const availability = getAircraftAvailability(state, aircraftId);
  if (availability.level === "unavailable") {
    return;
  }
  if (state.planning.assignedAircraftIds.includes(aircraftId)) {
    state.planning.assignedAircraftIds = state.planning.assignedAircraftIds.filter((id) => id !== aircraftId);
    if (state.planning.leadAircraftId === aircraftId) {
      state.planning.leadAircraftId = state.planning.assignedAircraftIds[0] ?? null;
    }
    return;
  }
  state.planning.assignedAircraftIds = [...state.planning.assignedAircraftIds, aircraftId];
  if (!state.planning.leadAircraftId) {
    state.planning.leadAircraftId = aircraftId;
  }
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
    occupant.notes = `${occupant.name} is no longer covering ${roleLabel(role)} while unfit for duty.`;
  }
  assignCrewMemberToAircraft(member, aircraftId, role);
  member.notes = `Assigned as ${roleLabel(role)} replacement on ${getAircraftById(state, aircraftId)?.name ?? "the aircraft"}.`;
  updateAllDerivedCrewState(state);
  return null;
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
  member.assignedAircraftId = null;
  member.currentAssignmentRole = null;
  member.status = "unassigned";
  member.notes = "Returned to the replacement pool.";
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
  if (diff < 8 * 60 * 1000) {
    return "current";
  }
  if (diff < 18 * 60 * 1000) {
    return "aging";
  }
  return "stale";
}

export function getTargetIntelAgeLabel(state: SaveState, targetId: string): string {
  const target = getTargetById(state, targetId);
  return target ? currentIntelAge(state, target) : "unknown";
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
  if (aircraft.hiddenCondition < 70 || aircraft.status === "damaged") {
    warnings.push("Maintenance considers the aircraft only marginally fit.");
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

function createCrewEffectsForOutcome(
  state: SaveState,
  snapshot: MissionAircraftCrewSnapshot,
  participation: Mission["hiddenOutcome"]["aircraftOutcomes"][number]["participation"],
  outcomeRisk: number,
  now: number
): { effects: MissionCrewEffect[]; casualtySummary: string[] } {
  const effects: MissionCrewEffect[] = [];
  const summary: string[] = [];
  for (const memberSnapshot of snapshot.members) {
    const member = getCrewMemberById(state, memberSnapshot.crewMemberId);
    if (!member) {
      continue;
    }
    const effect = defaultCrewEffect(member, memberSnapshot.roleAtLaunch);
    effect.note = `${member.name} returned tired but available for debrief.`;

    if (participation === "lost") {
      const rolled = Math.random();
      effect.status = rolled < 0.25 ? "kia" : rolled < 0.55 ? "pow" : "missing";
      effect.injurySeverity = "permanent";
      effect.fatigue = "exhausted";
      effect.morale = lowerMorale(effect.morale);
      effect.recoveryAvailableAt = null;
      effect.note = `${member.name} is now listed as ${effect.status.replaceAll("_", " ")} after the aircraft failed to return.`;
      summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} ${effect.status.replaceAll("_", " ")}.`);
    } else if (chance(outcomeRisk * 0.1 * crewDamageBias(memberSnapshot.roleAtLaunch))) {
      effect.status = "seriously_wounded";
      effect.injurySeverity = "serious";
      effect.fatigue = "exhausted";
      effect.morale = lowerMorale(effect.morale);
      effect.recoveryAvailableAt = now + LIGHT_WOUND_RECOVERY_MS * 4;
      effect.note = `${member.name} was seriously wounded during the mission.`;
      summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} seriously wounded.`);
    } else if (chance(outcomeRisk * 0.18 * crewDamageBias(memberSnapshot.roleAtLaunch))) {
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
    + leadRisk;

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
  const computedDamage = Math.round(contributed * (8 + Math.random() * 5) * visibilityPenalty * doctrineDamageMod * leadDamageMod * operationDamageMod);
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
  const timelineEvents: MissionEvent[] = stages.map((stage) => {
    const report = stageReport(stage, target, riskWord, visibility);
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
  syncPendingDecisionNotes(state);
  state.selectedTab = "current-operation";
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
  aircraft.lastOutcomeNote = outcome.note;
  if (outcome.damageDelta > 0 && !aircraft.damageHistory.includes(outcome.note)) {
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
  }
  updateAllDerivedCrewState(state);
}

function generateDebrief(state: SaveState, mission: Mission): void {
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
    target.suspectedEffects
  ].join(" ");
  mission.debriefGenerated = true;
  mission.status = "complete";
  mission.stage = "complete";

  applyStrategicDirectiveEffects(state, mission, attackedTarget, state.lastReconciledAt);

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

function completeRecon(state: SaveState, recon: ReconMission): void {
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
  const daySteps = Math.floor(elapsedMs / DAY_MS);
  if (daySteps <= 0) {
    return false;
  }
  let changed = false;
  const repairScale = clamp(state.campaign.directiveState.regionalRepairCapacity / 70, 0.4, 1.15);
  for (const target of state.targets) {
    const previous = target.hiddenActualCondition;
    const repairLift = Math.max(1, Math.round(target.hiddenRepairRate * repairScale));
    target.hiddenActualCondition = clamp(target.hiddenActualCondition + repairLift * daySteps, 0, 100);
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
  for (const job of state.recoveryJobs) {
    if (job.status !== "complete" && job.completesAt <= now) {
      completeRecovery(state, job);
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
    changed = applyFatigueRecovery(state, elapsedMs, now) || changed;
    changed = nudgeTargetRepairs(state, elapsedMs) || changed;
  }
  changed = pruneExpiredNotifications(state, now) || changed;
  changed = evaluateTutorial(state) || changed;
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

export function startRecovery(state: SaveState, aircraftId: string, now: number): string | null {
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
  if (state.campaign.activeReconId) {
    return "Recon section already occupied.";
  }
  const target = getTargetById(state, targetId);
  if (!target) {
    return "Target not found.";
  }
  const duration = type === "post_strike" ? 3.5 * 60 * 1000 : 2.5 * 60 * 1000;
  const resultQuality: ReconResultQuality =
    target.hiddenActualCondition < 45 ? "clear" : target.hiddenActualCondition < 72 ? "partial" : "inconclusive";
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
        : "Recon photographs provide partial but usable new evidence.",
    resultQuality,
    recommendation:
      resultQuality === "clear"
        ? "Staff recommends either exploiting the damage or shifting attention elsewhere."
        : resultQuality === "partial"
          ? "Staff recommends weighing a follow-up attack against the value of more observation."
          : "Staff recommends caution. The latest run did not settle the question."
  };
  state.reconMissions.unshift(recon);
  state.campaign.activeReconId = recon.id;
  addLog(state, `recon-start-${recon.id}`, now, "recon", `A ${type.replaceAll("_", " ")} recon sortie has been dispatched against ${target.name}.`);
  return null;
}

export function advanceCampaignDay(state: SaveState): void {
  state.campaign.currentDay += 1;
  state.debug.clockOffsetMs += DAY_MS;
  state.campaign.commandStanding = getDirectiveProgressSummary(state).patience.replace("Command patience: ", "");
  state.campaign.stationWeather = createStationWeather(state.campaign.currentDay);
  deliverStrategicIntelDrip(state, getEffectiveNow(state));
  addLog(state, `day-${state.campaign.currentDay}`, getEffectiveNow(state), "command", `Campaign day ${state.campaign.currentDay} has begun. Routine rest and repair time have accrued.`);
  syncPendingDecisionNotes(state);
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
  const impactMod =
    mission.plan.operationType === "main_strike" ? 1.18
      : mission.plan.operationType === "reduced_strike" ? 0.82
        : mission.plan.operationType === "support_raid" ? 0.72
          : mission.plan.operationType === "follow_up_attack" ? 1.1
            : 0.58;
  const impact = Math.max(1, Math.round(baseImpact * impactMod));
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
      directive.regionalRepairCapacity = clamp(directive.regionalRepairCapacity - (impact + 3), 0, 100);
      directive.directiveProgress = clamp(directive.directiveProgress + Math.max(2, impact - 1), 0, 100);
      for (const connectedId of target.connectedTargetIds) {
        const connected = getTargetById(state, connectedId);
        if (!connected) {
          continue;
        }
        connected.hiddenRepairRate = clamp(connected.hiddenRepairRate - (severity === "serious" ? 3 : 2), 2, 20);
      }
      appendStrategicEffect(state, target, at, "repair_capacity", `${target.name} may have slowed the repair tempo supporting connected Bremen targets.`);
      break;
    case "radar":
      directive.warningCoordination = clamp(directive.warningCoordination - (impact + 2), 0, 100);
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
    latestIntel: state.campaign.latestStrategicIntelNote
  };
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
  advanceClockTo(state, now, Math.min(...candidates));
  return null;
}

export function letCurrentWorkFinish(state: SaveState, now: number): string | null {
  const targetTime = getNextNonMissionCompletionTime(state);
  if (!targetTime) {
    return "No station-side work is currently pending.";
  }
  advanceClockTo(state, now, targetTime);
  return null;
}

export function standDownUntilMorning(state: SaveState, now: number): string | null {
  const targetTime = now + DAY_MS;
  reconcileState(state, targetTime);
  state.campaign.currentDay += 1;
  state.debug.clockOffsetMs += DAY_MS;
  state.campaign.commandStanding = getDirectiveProgressSummary(state).patience.replace("Command patience: ", "");
  state.campaign.stationWeather = createStationWeather(state.campaign.currentDay);
  deliverStrategicIntelDrip(state, getEffectiveNow(state));
  addLog(state, `day-${state.campaign.currentDay}`, getEffectiveNow(state), "command", `Campaign day ${state.campaign.currentDay} has begun. Routine rest and repair time have accrued.`);
  syncPendingDecisionNotes(state);
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

export function getOperationsDeskSummary(state: SaveState): string[] {
  const now = getEffectiveNow(state);
  const exact = state.debug.showHiddenValues;
  const lines: string[] = [];
  const mission = getActiveMission(state);
  const recon = getActiveRecon(state);
  const activeRepairs = state.repairJobs.filter((job) => !job.completionApplied);
  const activeRecoveries = state.recoveryJobs.filter((job) => !job.completionApplied);
  const diverted = state.aircraft.filter((aircraft) => aircraft.status === "diverted" && !aircraft.recoveryJobId);
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
  return lines;
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
      body: launchDisabledReason === "No aircraft assigned"
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
    return "No lead aircraft selected";
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
