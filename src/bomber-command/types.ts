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
export type CrewStatus = "fit" | "resting" | "lightly_wounded" | "seriously_wounded" | "missing" | "kia" | "pow" | "unassigned";
export type InjurySeverity = "none" | "light" | "serious" | "permanent";
export type CrewRole =
  | "pilot"
  | "copilot"
  | "navigator"
  | "bombardier"
  | "engineer_top_turret"
  | "radio_operator"
  | "ball_turret"
  | "left_waist"
  | "right_waist"
  | "tail_gunner";
export type CrewSpecialty = CrewRole | "enlisted_airman";
export type GroundCrewSpecialty = "engines" | "structure" | "quick_patch" | "careful_inspection";
export type TargetType = "factory" | "airfield" | "rail" | "radar" | "port" | "defense";
export type DirectiveRelevance = "low" | "medium" | "high";
export type IntelConfidence = "poor" | "fair" | "good";
export type AlertLevel = "low" | "elevated" | "high";
export type RouteRisk = "cautious" | "standard" | "direct";
export type OperationType = "main_strike" | "reduced_strike" | "support_raid" | "follow_up_attack" | "harassment_diversion";
export type AttackDoctrine = "single_pass" | "repeat_if_needed" | "abort_unless_visual" | "bomb_through_cloud";
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
export type ReconResultQuality = "clear" | "partial" | "inconclusive";
export type NotificationKind = "report" | "debrief" | "recon" | "maintenance" | "operations";
export type ReplacementStatusAtLaunch = "original" | "temporary_replacement" | "permanent_replacement";
export type TutorialStepId =
  | "welcome"
  | "planning-basics"
  | "mission-launched"
  | "mission-reporting"
  | "debrief-review"
  | "maintenance-follow-up"
  | "recon-follow-up"
  | "recon-results"
  | "advance-day"
  | "first-loop-complete"
  | "personnel-decisions"
  | "replacement-crew"
  | "command-patience";
export type StaffOfficer =
  | "Executive Officer"
  | "Operations Officer"
  | "Intelligence Officer"
  | "Engineering Officer"
  | "Medical/Personnel Officer"
  | "Command Liaison";
export type StaffUrgency = "low" | "normal" | "urgent";
export type StaffActionType =
  | "go_debrief"
  | "go_maintenance"
  | "go_aircraft_crews"
  | "go_target_board"
  | "go_mission_planning"
  | "start_recon";

export type PersonnelDecisionAction = "restore_original" | "keep_replacement_temporary" | "mark_replacement_permanent";
export type StrategicEffectCategory =
  | "fighter_pressure"
  | "replacement_flow"
  | "repair_capacity"
  | "warning_coordination"
  | "approach_danger"
  | "directive_progress"
  | "command_patience";

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
  personnelDecisions: PersonnelDecision[];
  stationWeather: string;
  latestIntelUpdate: LatestIntelUpdate | null;
  latestStrategicIntelNote: string | null;
  directiveState: DirectiveState;
}

export interface PersonnelDecision {
  id: string;
  crewMemberId: string;
  replacementCrewMemberId: string;
  aircraftId: string;
  role: CrewRole;
  createdAt: number;
  resolved: boolean;
}

export interface StaffRecommendation {
  id: string;
  sourceOfficer: StaffOfficer;
  title: string;
  body: string;
  urgency: StaffUrgency;
  relatedActionType: StaffActionType | null;
  relatedTargetId: string | null;
  relatedAircraftId: string | null;
  relatedCrewMemberId: string | null;
}

export interface LogEntry {
  id: string;
  at: number;
  category: string;
  text: string;
}

export interface StrategicEffectRecord {
  id: string;
  at: number;
  targetId: string;
  category: StrategicEffectCategory;
  summary: string;
  visibleHint: string;
  followUpPending: boolean;
  followUpDeliveredAt: number | null;
}

export interface DirectiveState {
  fighterPressure: number;
  fighterReplacementFlow: number;
  regionalRepairCapacity: number;
  warningCoordination: number;
  approachDanger: number;
  commandPatience: number;
  directiveProgress: number;
  operationsElapsed: number;
  recentStrategicEffects: StrategicEffectRecord[];
}

export interface Aircraft {
  id: string;
  name: string;
  status: AircraftStatus;
  conditionSummary: string;
  hiddenCondition: number;
  assignedCrewId: string;
  assignedCrewMemberIds: string[];
  assignedGroundCrewId: string;
  missionCount: number;
  damageHistory: string[];
  repairJobId: string | null;
  recoveryJobId: string | null;
  lastOutcomeNote: string;
  crewCohesion: string;
  lastCrewIssueNote: string;
}

export interface Aircrew {
  id: string;
  assignedAircraftId: string;
  pilotName: string;
  experience: CrewExperience;
  fatigue: CrewFatigue;
  morale: CrewMorale;
  status: CrewStatus;
  missionCount: number;
  familiarityAircraftId: string;
  notes: string;
}

export interface CrewMember {
  id: string;
  name: string;
  rank: string;
  role: CrewSpecialty;
  currentAssignmentRole: CrewRole | null;
  status: CrewStatus;
  fatigue: CrewFatigue;
  morale: CrewMorale;
  experience: CrewExperience;
  missionsFlown: number;
  assignedAircraftId: string | null;
  originalAircraftId: string | null;
  isReplacement: boolean;
  isPermanentReplacement: boolean;
  injurySeverity: InjurySeverity;
  recoveryAvailableAt: number | null;
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
  assessedDefense: string;
  intelConfidence: IntelConfidence;
  lastReconDay: number | null;
  lastReconAt: number | null;
  lastReconSummary: string | null;
  weatherOutlook: string;
  suspectedEffects: string;
  connectedTargetIds: string[];
  alertLevel: AlertLevel;
  evidence: string[];
  hiddenWeatherRisk: number;
  latestIntelNote: string | null;
  latestIntelRecommendation: string | null;
  latestIntelSource: string | null;
  latestIntelUpdatedAt: number | null;
  lastMissionSummary: string | null;
  lastMissionAt: number | null;
  lastDebriefSummary: string | null;
  lastDebriefAt: number | null;
}

export interface MissionCrewSnapshotMember {
  crewMemberId: string;
  roleAtLaunch: CrewRole;
  replacementStatusAtLaunch: ReplacementStatusAtLaunch;
}

export interface MissionAircraftCrewSnapshot {
  aircraftId: string;
  crewMemberIds: string[];
  members: MissionCrewSnapshotMember[];
}

export interface MissionPlan {
  targetId: string;
  operationType: OperationType;
  secondaryTargetId: string | null;
  leadAircraftId: string | null;
  assignedAircraftIds: string[];
  scheduledLaunchTime: number;
  routeRisk: RouteRisk;
  attackDoctrine: AttackDoctrine;
  standingOrders: {
    useSecondaryIfObscured: boolean;
    abortIfFormationBelow: boolean;
    damagedAircraftReturnEarly: boolean;
    allowRepeatBombRun: boolean;
  };
  status: MissionPlanStatus;
  launchCrewManifests: MissionAircraftCrewSnapshot[];
  staffWarningsAtLaunch: string[];
}

export interface MissionCrewEffect {
  crewMemberId: string;
  roleAtLaunch: CrewRole;
  status: CrewStatus;
  fatigue: CrewFatigue;
  morale: CrewMorale;
  injurySeverity: InjurySeverity;
  recoveryAvailableAt: number | null;
  note: string;
}

export interface AircraftMissionOutcome {
  aircraftId: string;
  participation: "full" | "aborted" | "diverted" | "lost";
  damageDelta: number;
  finalStatus: AircraftStatus;
  conditionSummary: string;
  note: string;
  contributedToStrike: boolean;
  launchManifest: MissionAircraftCrewSnapshot;
  crewEffects: MissionCrewEffect[];
  casualtySummary: string[];
}

export interface MissionHiddenOutcome {
  targetDamage: number;
  visibility: "clear" | "broken" | "obscured";
  targetAssessment: string;
  targetEvidence: string[];
  targetSuspectedEffects: string;
  attackedTargetId: string;
  attackedTargetName: string;
  attackedSecondary: boolean;
  doctrineNote: string;
  leadNote: string;
  commandAssessment: string;
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
  debriefCasualtyLines: string[];
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
  resultQuality: ReconResultQuality;
  recommendation: string;
}

export interface LatestIntelUpdate {
  reconId: string;
  targetId: string;
  targetName: string;
  resultQuality: ReconResultQuality;
  assessment: string;
  evidence: string;
  recommendation: string;
  alertLevel: AlertLevel;
  updatedAt: number;
}

export interface PlanningState {
  selectedTargetId: string;
  operationType: OperationType;
  secondaryTargetId: string | null;
  leadAircraftId: string | null;
  assignedAircraftIds: string[];
  routeRisk: RouteRisk;
  attackDoctrine: AttackDoctrine;
  standingOrders: MissionPlan["standingOrders"];
  launchMode: "now" | "schedule";
  scheduleDelayMs: number;
}

export interface DebugState {
  showHiddenValues: boolean;
  clockOffsetMs: number;
}

export interface TutorialState {
  enabled: boolean;
  activeStepId: TutorialStepId | null;
  completedStepIds: TutorialStepId[];
  firstLoopCompleted: boolean;
}

export interface TutorialStepDisplay {
  id: TutorialStepId;
  title: string;
  body: string;
  suggestedTab: CampaignTab | null;
  suggestedTabLabel: string | null;
}

export interface RecoveryCrewUpdate {
  crewMemberId: string;
  status: CrewStatus;
  fatigue: CrewFatigue;
  injurySeverity: InjurySeverity;
  recoveryAvailableAt: number | null;
  note: string;
}

export interface RecoveryJob {
  id: string;
  aircraftId: string;
  groundCrewId: string;
  startedAt: number;
  completesAt: number;
  status: RepairStatus;
  summary: string;
  resultText: string;
  completionApplied: boolean;
  hiddenNewCondition: number;
  hiddenReturnStatus: AircraftStatus;
  hiddenConditionSummary: string;
  hiddenDamageNote: string;
  hiddenCrewUpdates: RecoveryCrewUpdate[];
}

export interface UiNotification {
  id: string;
  kind: NotificationKind;
  text: string;
  createdAt: number;
  expiresAt: number;
}

export interface SaveState {
  version: number;
  lastReconciledAt: number;
  nextId: number;
  selectedTab: CampaignTab;
  campaign: CampaignState;
  aircraft: Aircraft[];
  crews: Aircrew[];
  crewMembers: CrewMember[];
  groundCrews: GroundCrew[];
  targets: Target[];
  missions: Mission[];
  repairJobs: RepairJob[];
  recoveryJobs: RecoveryJob[];
  reconMissions: ReconMission[];
  notifications: UiNotification[];
  planning: PlanningState;
  tutorial: TutorialState;
  debug: DebugState;
}

export interface AvailabilityReport {
  level: AvailabilityLevel;
  label: string;
  reason: string;
  warnings: string[];
}
