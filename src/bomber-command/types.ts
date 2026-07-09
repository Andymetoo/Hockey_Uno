export type CampaignTab =
  | "command"
  | "target-board"
  | "aircraft-crews"
  | "mission-planning"
  | "current-operation"
  | "debrief"
  | "maintenance"
  | "recon"
  | "event-log"
  | "debug";

export type AircraftStatus = "serviceable" | "damaged" | "under_repair" | "lost" | "diverted";
export type CrewExperience = "green" | "regular" | "veteran";
export type CrewFatigue = "rested" | "tired" | "exhausted";
export type CrewMorale = "steady" | "shaken" | "brittle";
export type CrewStatus = "available" | "wounded" | "missing" | "resting";
export type GroundCrewSpecialty = "engines" | "structure" | "quick_patch" | "careful_inspection";
export type TargetType = "factory" | "airfield" | "rail" | "radar" | "port" | "defense";
export type DirectiveRelevance = "low" | "medium" | "high";
export type IntelConfidence = "poor" | "fair" | "good";
export type AlertLevel = "low" | "elevated" | "high";
export type RouteRisk = "cautious" | "standard" | "direct";
export type MissionPlanStatus = "planned" | "scheduled" | "launched" | "recovering" | "complete";
export type MissionStage =
  | "scheduled"
  | "takeoff"
  | "assembly"
  | "outbound"
  | "target_area"
  | "withdrawal"
  | "recovery"
  | "debrief_ready"
  | "complete";
export type MissionEventSeverity = "low" | "moderate" | "heavy";
export type MissionEventConfidence = "confirmed" | "probable" | "estimated" | "fragmentary" | "unverified";
export type MissionEventSource =
  | "tower"
  | "group_operations"
  | "coastal_observer"
  | "lead_aircraft"
  | "crew_debrief"
  | "strike_camera"
  | "intelligence";
export type RepairTier = "patch" | "standard" | "thorough" | "depot";
export type RepairStatus = "pending" | "in_progress" | "complete";
export type ReconType = "pre_strike" | "post_strike" | "weather_route" | "focused_followup";
export type ReconStatus = "planned" | "airborne" | "awaiting_interpretation" | "complete";
export type AvailabilityLevel = "available" | "marginal" | "unavailable";

export interface CampaignState {
  currentDay: number;
  commandDirective: string;
  commandStanding: string;
  campaignPhase: string;
  activeMissionId: string | null;
  activeReconId: string | null;
  lastDebriefMissionId: string | null;
  logEntries: LogEntry[];
  pendingDecisions: string[];
}

export interface LogEntry {
  id: string;
  at: number;
  category: string;
  text: string;
}

export interface Aircraft {
  id: string;
  name: string;
  status: AircraftStatus;
  conditionSummary: string;
  hiddenCondition: number;
  assignedCrewId: string;
  assignedGroundCrewId: string;
  missionCount: number;
  damageHistory: string[];
  repairJobId: string | null;
  lastOutcomeNote: string;
}

export interface Aircrew {
  id: string;
  pilotName: string;
  experience: CrewExperience;
  fatigue: CrewFatigue;
  morale: CrewMorale;
  status: CrewStatus;
  missionCount: number;
  familiarityAircraftId: string;
  notes: string;
}

export interface GroundCrew {
  id: string;
  chiefName: string;
  specialty: GroundCrewSpecialty;
  fatigue: CrewFatigue;
  assignedAircraftIds: string[];
  notes: string;
}

export interface Target {
  id: string;
  name: string;
  type: TargetType;
  region: string;
  directiveRelevance: DirectiveRelevance;
  hiddenActualCondition: number;
  hiddenDefenseLevel: number;
  hiddenRepairRate: number;
  assessedCondition: string;
  intelConfidence: IntelConfidence;
  lastReconDay: number | null;
  weatherOutlook: string;
  suspectedEffects: string;
  connectedTargetIds: string[];
  alertLevel: AlertLevel;
  evidence: string[];
  hiddenWeatherRisk: number;
}

export interface MissionPlan {
  targetId: string;
  assignedAircraftIds: string[];
  scheduledLaunchTime: number;
  routeRisk: RouteRisk;
  standingOrders: {
    useSecondaryIfObscured: boolean;
    abortIfFormationBelow: boolean;
    damagedAircraftReturnEarly: boolean;
    allowRepeatBombRun: boolean;
  };
  status: MissionPlanStatus;
}

export interface AircraftMissionOutcome {
  aircraftId: string;
  crewId: string;
  participation: "full" | "aborted" | "diverted" | "lost";
  damageDelta: number;
  finalStatus: AircraftStatus;
  conditionSummary: string;
  crewFatigue: CrewFatigue;
  crewMorale: CrewMorale;
  crewStatus: CrewStatus;
  note: string;
  contributedToStrike: boolean;
}

export interface MissionHiddenOutcome {
  targetDamage: number;
  visibility: "clear" | "broken" | "obscured";
  targetAssessment: string;
  targetEvidence: string[];
  targetSuspectedEffects: string;
  aircraftOutcomes: AircraftMissionOutcome[];
}

export interface HiddenEffect {
  kind:
    | "apply_aircraft_outcome"
    | "apply_crew_outcome"
    | "apply_target_damage"
    | "generate_debrief"
    | "set_campaign_phase"
    | "mark_mission_complete";
  aircraftId?: string;
  crewId?: string;
  targetId?: string;
  outcomeIndex?: number;
  phaseText?: string;
}

export interface MissionEvent {
  id: string;
  time: number;
  stage: MissionStage;
  type: string;
  aircraftId?: string;
  crewId?: string;
  targetId?: string;
  severity: MissionEventSeverity;
  hiddenEffects: HiddenEffect[];
  publicReportText: string;
  confidence: MissionEventConfidence;
  source: MissionEventSource;
  applied: boolean;
  revealed: boolean;
}

export interface Mission {
  id: string;
  plan: MissionPlan;
  stage: MissionStage;
  timelineEvents: MissionEvent[];
  generatedEvents: MissionEvent[];
  reports: string[];
  resultSummary: string;
  debrief: string;
  status: MissionPlanStatus;
  debriefGenerated: boolean;
  hiddenOutcome: MissionHiddenOutcome;
}

export interface RepairJob {
  id: string;
  aircraftId: string;
  groundCrewId: string;
  repairTier: RepairTier;
  startedAt: number;
  completesAt: number;
  status: RepairStatus;
  riskNote: string;
  resultText: string;
  completionApplied: boolean;
  hiddenNewCondition: number;
  hiddenNewStatus: AircraftStatus;
  hiddenConditionSummary: string;
  hiddenDamageNote: string;
}

export interface ReconMission {
  id: string;
  targetId: string;
  type: ReconType;
  launchedAt: number;
  returnsAt: number;
  interpretedAt: number;
  status: ReconStatus;
  resultText: string;
  confidenceChange: IntelConfidence;
  enemyAlertEffect: AlertLevel;
  completionApplied: boolean;
  hiddenAssessment: string;
  hiddenEvidence: string;
}

export interface PlanningState {
  selectedTargetId: string;
  assignedAircraftIds: string[];
  routeRisk: RouteRisk;
  standingOrders: MissionPlan["standingOrders"];
  launchMode: "now" | "schedule";
  scheduleDelayMs: number;
}

export interface DebugState {
  showHiddenValues: boolean;
  clockOffsetMs: number;
}

export interface SaveState {
  version: number;
  lastReconciledAt: number;
  nextId: number;
  selectedTab: CampaignTab;
  campaign: CampaignState;
  aircraft: Aircraft[];
  crews: Aircrew[];
  groundCrews: GroundCrew[];
  targets: Target[];
  missions: Mission[];
  repairJobs: RepairJob[];
  reconMissions: ReconMission[];
  planning: PlanningState;
  debug: DebugState;
}

export interface AvailabilityReport {
  level: AvailabilityLevel;
  label: string;
  reason: string;
  warnings: string[];
}
