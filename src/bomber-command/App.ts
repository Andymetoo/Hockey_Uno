import {
  advanceCampaignDay,
  assignReplacementCrewMember,
  applyRecommendedPlan,
  completeAllRepairs,
  completeCurrentRecon,
  createNewGame,
  dismissActiveTutorialStep,
  formatTimestamp,
  getActiveMission,
  getActiveMissionCrewIds,
  getActiveRecon,
  getAircraftAttentionState,
  getAircraftAvailability,
  getAircraftById,
  getAircraftReadinessSummary,
  acknowledgeVisibleTab,
  getCommandBrief,
  getCrewAircraftLabel,
  getCrewById,
  getCrewMembersForAircraft,
  getCrewSeatLabel,
  getCurrentOperationSummary,
  getActiveTutorialStep,
  getDirectiveProgressSummary,
  getDisabledReasonForLaunch,
  getEffectiveNow,
  getGroundCrewPressureNote,
  getPrimaryUsableOpportunity,
  getHardUnavailablePersonnel,
  getLeadAircraftAssessment,
  getLatestDebriefMission,
  getLatestCompletedRecon,
  getMedicalActionLabel,
  getMedicalRecoveryLabel,
  getMedicalPersonnel,
  getNavAttention,
  getNextStepGuidance,
  getOperationalStatusLabel,
  getOperationalRhythm,
  getPersonnelDecisionsForAircraft,
  getPlanningStaffPreview,
  getQualitativeAgeLabel,
  getRecentConsequenceLedger,
  getReconDeltaSummary,
  getReplacementCoveringMember,
  getReplacementPool,
  getRestingPersonnel,
  getRoleCoverageProblems,
  getSecondaryTargetOptions,
  getStaffActionLabel,
  getStaffConference,
  getTargetById,
  getTargetCardLatestChange,
  getTargetIntelAgeLabel,
  getTargetOperationalSummary,
  getTargetStrategicContext,
  keepReplacementTemporary,
  letCurrentWorkFinish,
  launchMission,
  loadState,
  markReplacementPermanent,
  markReplacementPermanentFromDecision,
  reconcileState,
  restoreOriginalCrewMember,
  removeReplacementCrewMember,
  resetState,
  saveState,
  setAttackDoctrine,
  setLeadAircraft,
  setLaunchMode,
  setOperationType,
  setPlanningTarget,
  setRouteRisk,
  setScheduleDelay,
  setSecondaryTarget,
  setSelectedTab,
  setShowHiddenValues,
  skipToDebrief,
  skipToNextReport,
  startRecovery,
  startRecon,
  startRepair,
  standDownUntilMorning,
  toggleAssignedAircraft,
  toggleStandingOrder,
  waitUntilNextEvent
} from "./game.js";
import type { AttackDoctrine, CampaignTab, CommandBriefAction, CrewMember, CrewRole, OperationType, ReconType, RepairTier, SaveState, StaffConference, StaffRecommendation, Target } from "./types";

type ActionHandler = (action: string, payload: string | null) => void;

const TABS: Array<{ id: CampaignTab; label: string }> = [
  { id: "command", label: "Command" },
  { id: "target-board", label: "Target Board" },
  { id: "aircraft-crews", label: "Aircraft & Crews" },
  { id: "mission-planning", label: "Mission Planning" },
  { id: "current-operation", label: "Current Operation" },
  { id: "debrief", label: "Debrief / Assessment" },
  { id: "maintenance", label: "Maintenance" },
  { id: "recon", label: "Recon / Intelligence" },
  { id: "event-log", label: "Event Log" },
  { id: "debug", label: "Debug" }
];

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function badgeClass(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
}

function renderBadge(label: string, value: string): string {
  return `<span class="badge ${badgeClass(value)}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`;
}

function hiddenBlock(show: boolean, lines: string[]): string {
  if (!show) {
    return "";
  }
  return `<div class="hidden-panel"><strong>Hidden:</strong> ${lines.map((line) => escapeHtml(line)).join(" | ")}</div>`;
}

function renderDueTime(state: SaveState, timestamp: number): string {
  if (state.debug.showHiddenValues) {
    return formatTimestamp(state, timestamp);
  }

  const diffMinutes = Math.max(0, Math.round((timestamp - getEffectiveNow(state)) / 60000));
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

function renderNotifications(state: SaveState): string {
  if (state.notifications.length === 0) {
    return "";
  }

  return `
    <section class="toast-stack" aria-live="polite">
      ${state.notifications.slice(0, 4).map((notification) => `
        <div class="toast toast-${badgeClass(notification.kind)}">
          ${escapeHtml(notification.text)}
        </div>
      `).join("")}
    </section>
  `;
}

function renderTutorialModal(state: SaveState): string {
  const step = getActiveTutorialStep(state);
  if (!step) {
    return "";
  }
  const coreSteps = new Set(["welcome", "planning-basics", "mission-launched", "debrief-review", "first-loop-complete"]);
  const goButton = step.suggestedTab && step.suggestedTab !== state.selectedTab
    ? `<button data-action="tutorial-open-tab" data-payload="${step.suggestedTab}">${escapeHtml(step.suggestedTabLabel ? `Go to ${step.suggestedTabLabel}` : "Open Suggested Panel")}</button>`
    : "";
  return `
    <details class="note tutorial-help" ${coreSteps.has(step.id) ? "open" : ""}>
      <summary><strong>Guided Help</strong></summary>
      <p><strong>${escapeHtml(step.title)}</strong></p>
      <p class="muted">${escapeHtml(step.body)}</p>
      <div class="button-row">
        ${goButton}
        <button data-action="tutorial-dismiss" class="active">Got It</button>
      </div>
    </details>
  `;
}

function renderCrewRow(state: SaveState, aircraftId: string, member: CrewMember, airborneIds: Set<string>): string {
  const airborne = airborneIds.has(member.id) ? `<span class="muted">Airborne with current operation</span>` : "";
  const replacementActions = member.isReplacement && member.assignedAircraftId === aircraftId
    ? `
      <div class="button-row">
        <button data-action="mark-permanent" data-payload="${member.id}" ${member.isPermanentReplacement ? "disabled" : ""}>Mark Permanent</button>
        <button data-action="remove-replacement" data-payload="${member.id}">Remove Replacement</button>
      </div>
    `
    : "";
  return `
    <div class="manifest-row">
      <div>
        <strong>${escapeHtml(member.rank)} ${escapeHtml(member.name.replace(`${member.rank} `, ""))}</strong>
        <div class="muted">${escapeHtml(member.currentAssignmentRole ? member.currentAssignmentRole.replaceAll("_", " ") : roleOrSpecialty(member.role))}</div>
        <div class="muted">${escapeHtml(member.notes)}</div>
        ${airborne}
      </div>
      <div class="badge-row">
        ${renderBadge("Status", member.status.replaceAll("_", " "))}
        ${renderBadge("Fatigue", member.fatigue)}
        ${renderBadge("Morale", member.morale)}
        ${renderBadge("Experience", member.experience)}
      </div>
      ${replacementActions}
    </div>
  `;
}

function renderPersonnelStatusRow(state: SaveState, member: CrewMember): string {
  const now = getEffectiveNow(state);
  const covering = getReplacementCoveringMember(state, member);
  return `
    <div class="row-card">
      <div>
        <strong>${escapeHtml(member.name)}</strong>
        <div class="muted">${escapeHtml(getCrewAircraftLabel(state, member))}</div>
        <div class="muted">${escapeHtml(getCrewSeatLabel(member))}</div>
        <div class="muted">${escapeHtml(getMedicalRecoveryLabel(member, now))}</div>
        <div class="muted">${escapeHtml(covering ? `Replacement covering: ${covering.name}` : "Replacement covering: none")}</div>
        <div class="muted">${escapeHtml(getMedicalActionLabel(state, member))}</div>
        <div class="muted">${escapeHtml(member.notes)}</div>
      </div>
      <div class="badge-row">
        ${renderBadge("Status", member.status.replaceAll("_", " "))}
        ${renderBadge("Fatigue", member.fatigue)}
        ${renderBadge("Morale", member.morale)}
      </div>
    </div>
  `;
}

function roleOrSpecialty(role: CrewMember["role"]): string {
  return role.replaceAll("_", " ");
}

function renderHeader(state: SaveState): string {
  return `
    <header class="hero panel">
      <p class="eyebrow">Eighth Air Force Vertical Slice</p>
      <h1>Bomber Command Prototype</h1>
      <p class="subcopy">A text-first prototype focused on one playable operation loop with hazy reports, timed consequences, and save-safe reconciliation.</p>
      <div class="summary-grid">
        <div class="kv"><span class="k">Campaign Day</span><span class="v">${state.campaign.currentDay}</span></div>
        <div class="kv"><span class="k">Directive</span><span class="v">${escapeHtml(state.campaign.commandDirective)}</span></div>
        <div class="kv"><span class="k">Status</span><span class="v">${escapeHtml(getOperationalStatusLabel(state))}</span></div>
      </div>
    </header>
  `;
}

function renderNav(state: SaveState): string {
  return `
    <nav class="tab-row panel">
      ${TABS.map((tab) => `
        <button class="tab-btn ${tab.id === state.selectedTab ? "active" : ""}" data-action="tab" data-payload="${tab.id}">
          ${escapeHtml(tab.label)}
          ${getNavAttention(state, tab.id) ? ` <span class="nav-attention">${escapeHtml(getNavAttention(state, tab.id) ?? "")}</span>` : ""}
        </button>
      `).join("")}
    </nav>
  `;
}

function renderStaffActionButton(recommendation: StaffRecommendation): string {
  switch (recommendation.relatedActionType) {
    case "go_debrief":
      return `<button data-action="tab" data-payload="debrief">Go to Debrief</button>`;
    case "go_maintenance":
      return `<button data-action="tab" data-payload="maintenance">Go to Maintenance</button>`;
    case "go_aircraft_crews":
      return `<button data-action="tab" data-payload="aircraft-crews">Go to Aircraft &amp; Crews</button>`;
    case "go_recon":
      return `<button data-action="tab" data-payload="recon">Go to Recon</button>`;
    case "go_target_board":
      return `<button data-action="briefing-target-board" data-payload="${escapeHtml(recommendation.relatedTargetId ?? "")}">Go to Target Board</button>`;
    case "go_mission_planning":
      return `<button data-action="briefing-mission-planning" data-payload="${escapeHtml(recommendation.relatedTargetId ?? "")}">Go to Mission Planning</button>`;
    case "wait_next_event":
      return `<button data-action="wait-next-event">Wait until next event</button>`;
    case "stand_down_morning":
      return `<button data-action="stand-down-morning">Stand down until morning</button>`;
    case "let_work_finish":
      return `<button data-action="let-work-finish">Let current work finish</button>`;
    case "start_recon":
      if (!recommendation.relatedTargetId) {
        return "";
      }
      return `<button data-action="briefing-start-recon" data-payload="${escapeHtml(`${recommendation.relatedTargetId}:${recommendation.planReconType ?? "pre_strike"}`)}">Start Recon</button>`;
    default:
      return "";
  }
}

function renderBriefActionButton(item: CommandBriefAction): string {
  if (item.actionType === "tab") {
    return `<button data-action="tab" data-payload="${escapeHtml(item.actionPayload ?? "")}">${escapeHtml(item.buttonLabel)}</button>`;
  }
  switch (item.actionType) {
    case "go_debrief":
      return `<button data-action="tab" data-payload="debrief">${escapeHtml(item.buttonLabel)}</button>`;
    case "go_maintenance":
      return `<button data-action="tab" data-payload="maintenance">${escapeHtml(item.buttonLabel)}</button>`;
    case "go_aircraft_crews":
      return `<button data-action="tab" data-payload="aircraft-crews">${escapeHtml(item.buttonLabel)}</button>`;
    case "go_recon":
      return `<button data-action="tab" data-payload="recon">${escapeHtml(item.buttonLabel)}</button>`;
    case "go_target_board":
      return `<button data-action="tab" data-payload="target-board">${escapeHtml(item.buttonLabel)}</button>`;
    case "go_mission_planning":
      return `<button data-action="tab" data-payload="mission-planning">${escapeHtml(item.buttonLabel)}</button>`;
    case "start_recon":
      return `<button data-action="tab" data-payload="recon">${escapeHtml(item.buttonLabel)}</button>`;
    case "wait_next_event":
      return `<button data-action="wait-next-event">${escapeHtml(item.buttonLabel)}</button>`;
    case "stand_down_morning":
      return `<button data-action="stand-down-morning">${escapeHtml(item.buttonLabel)}</button>`;
    case "let_work_finish":
      return `<button data-action="let-work-finish">${escapeHtml(item.buttonLabel)}</button>`;
    default:
      return `<button data-action="tab" data-payload="command">${escapeHtml(item.buttonLabel)}</button>`;
  }
}

function renderStaffRecommendation(recommendation: StaffRecommendation): string {
  return `
    <article class="briefing-card urgency-${recommendation.urgency}">
      <div class="briefing-header">
        <div>
          <p class="eyebrow">${escapeHtml(recommendation.sourceOfficer)}</p>
          <h3>${escapeHtml(recommendation.title)}</h3>
        </div>
        ${renderBadge("Urgency", recommendation.urgency)}
      </div>
      <p>${escapeHtml(recommendation.body)}</p>
      ${recommendation.relatedActionType ? `<div class="button-row briefing-actions">${renderStaffActionButton(recommendation)}</div>` : ""}
    </article>
  `;
}

function renderStaffConference(state: SaveState, conference: StaffConference): string {
  const officerLines = [
    { label: "Operations Officer", text: conference.operationsComment },
    { label: "Intelligence Officer", text: conference.intelligenceComment },
    { label: "Engineering Officer", text: conference.engineeringComment },
    { label: "Medical / Personnel Officer", text: conference.personnelComment },
    { label: "Command Liaison", text: conference.commandComment }
  ].filter((entry) => entry.text.trim().length > 0).slice(0, 4);
  return `
    <section class="note staff-conference-card">
      <div class="briefing-header">
        <div>
          <p class="eyebrow">Staff Conference</p>
          <h3>${escapeHtml(conference.phaseLabel)}</h3>
        </div>
        ${renderBadge("Phase", conference.phaseLabel)}
      </div>
      <p>${escapeHtml(conference.summary)}</p>
      <div class="stack compact conference-comments">
        <p><strong>Executive Officer:</strong> ${escapeHtml(conference.executiveComment)}</p>
        ${officerLines.map((entry) => `<p><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.text)}</p>`).join("")}
      </div>
      <div class="briefing-card urgency-${conference.recommendedAction.urgency}">
        <div class="briefing-header">
          <div>
            <p class="eyebrow">Recommended</p>
            <h3>${escapeHtml(conference.recommendedAction.title)}</h3>
          </div>
          ${renderBadge("Urgency", conference.recommendedAction.urgency)}
        </div>
        <p>${escapeHtml(conference.recommendedAction.body)}</p>
        ${conference.riskIfIgnored ? `<p class="warning">${escapeHtml(conference.riskIfIgnored)}</p>` : ""}
        <div class="button-row briefing-actions">
          <button class="active" data-action="use-recommended-plan">${escapeHtml(getStaffActionLabel(conference.recommendedAction))}</button>
        </div>
      </div>
      <div class="stack compact">
        <strong>Alternatives</strong>
        <div class="briefing-grid">
          ${conference.alternateActions.map((recommendation) => renderStaffRecommendation(recommendation)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderOfficerDiscussion(conference: StaffConference): string {
  const officerLines = [
    { label: "Executive Officer", text: conference.executiveComment },
    { label: "Operations Officer", text: conference.operationsComment },
    { label: "Intelligence Officer", text: conference.intelligenceComment },
    { label: "Engineering Officer", text: conference.engineeringComment },
    { label: "Medical / Personnel Officer", text: conference.personnelComment },
    { label: "Command Liaison", text: conference.commandComment }
  ].filter((entry) => entry.text.trim().length > 0);
  return `
    <div class="stack compact conference-comments">
      ${officerLines.map((entry) => `<p><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.text)}</p>`).join("")}
    </div>
  `;
}

function renderCommandSituation(state: SaveState): string {
  const directive = getDirectiveProgressSummary(state);
  const rhythm = getOperationalRhythm(state);
  const activeOpportunity = getPrimaryUsableOpportunity(state);
  const latestInsightLines = state.campaign.insights
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt || right.evidenceCount - left.evidenceCount)
    .slice(0, 3);
  return `
    <div class="note">
      <strong>Current Command Situation</strong>
      <div class="badge-row">
        ${renderBadge("Phase", state.campaign.finalSummaryMode ? "final summary" : state.campaign.campaignPhaseId)}
        ${renderBadge("Day", String(state.campaign.currentDay))}
        ${renderBadge("Rhythm", rhythm.label)}
      </div>
      <p>${escapeHtml(directive.momentum)}</p>
      <p>${escapeHtml(directive.directiveState)}</p>
      <p>${escapeHtml(directive.groupCondition)}</p>
      <p>${escapeHtml(state.campaign.commandStanding)}</p>
      <p>${escapeHtml(activeOpportunity ? activeOpportunity.description : state.campaign.resolutionState === "pending" ? "Campaign resolution is pending while committed work finishes." : "No major active opening is presently judged decisive.")}</p>
      <p class="muted">${escapeHtml(state.campaign.campaignPhase)}</p>
      ${latestInsightLines.length > 0 ? `
        <div class="stack compact">
          <strong>Latest Insights</strong>
          ${latestInsightLines.map((insight) => `<p class="muted">${escapeHtml(insight.conclusion)}</p>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function buildQualitativeEvaluationSummary(state: SaveState): string {
  const evaluation = state.campaign.evaluation;
  if (!evaluation) {
    const directive = getDirectiveProgressSummary(state).progress.replace("Progress: ", "");
    const group = getDirectiveProgressSummary(state).groupCondition.replace("Group condition: ", "");
    return `Campaign result filed. Directive assessment remained ${directive.toLowerCase()} Group condition ended ${group.toLowerCase()}`;
  }
  const directive = evaluation.directiveAssessment.replace(/^Directive assessment:\s*/i, "");
  const group = evaluation.groupAssessment.replace(/^Group condition:\s*/i, "");
  return `Campaign result filed. Directive assessment remained ${directive.toLowerCase()} Group condition ended ${group.toLowerCase()}`;
}

function sanitizeCampaignSummaryText(state: SaveState, text: string): string {
  const evaluation = state.campaign.evaluation;
  if (!evaluation) {
    return text;
  }
  if (/directive progress at \d+|group effectiveness judged \d+/i.test(text)) {
    return buildQualitativeEvaluationSummary(state);
  }
  return text;
}

function renderWhatChanged(state: SaveState): string {
  const ledger = getRecentConsequenceLedger(state);
  const events = state.campaign.events.slice(0, 2);
  const latest = ledger[0];
  return `
    <div class="note">
      <strong>What Changed</strong>
      ${latest ? `
        <div class="row-card">
          <strong>${escapeHtml(latest.title)}</strong>
          <p>${escapeHtml(latest.staffRead)}</p>
          <p class="muted">${escapeHtml(latest.strategicConsequence)}</p>
        </div>
      ` : `<p class="muted">No formal consequence read has been filed yet.</p>`}
      ${state.campaign.latestWaitNote ? `<p class="muted">${escapeHtml(state.campaign.latestWaitNote)}</p>` : ""}
      ${ledger.slice(1, 3).map((entry) => `
        <p class="muted">${escapeHtml(`${entry.title}: ${entry.recommendedPosture}`)}</p>
      `).join("")}
      ${events.map((event) => `<p class="muted">${escapeHtml(`${event.title}: ${sanitizeCampaignSummaryText(state, event.body)}`)}</p>`).join("")}
    </div>
  `;
}

function renderImmediateDecisions(state: SaveState, conference: StaffConference): string {
  const recommendedType = conference.recommendedAction.relatedActionType;
  const canWait = !state.campaign.finalSummaryMode && state.campaign.resolutionState === "active";
  const buttons: string[] = [];
  if (canWait && recommendedType !== "wait_next_event") {
    buttons.push(`<button data-action="wait-next-event">Wait until next event</button>`);
  }
  if (canWait && recommendedType !== "stand_down_morning") {
    buttons.push(`<button data-action="stand-down-morning">Stand down until morning</button>`);
  }
  if (canWait && recommendedType !== "let_work_finish") {
    buttons.push(`<button data-action="let-work-finish">Let current work finish</button>`);
  }
  if (state.campaign.personnelDecisions.some((entry) => !entry.resolved)) {
    buttons.push(`<button data-action="tab" data-payload="aircraft-crews">Resolve personnel decisions</button>`);
  }
  if (state.aircraft.some((aircraft) => aircraft.status === "damaged" || aircraft.status === "diverted")) {
    buttons.push(`<button data-action="tab" data-payload="maintenance">Review maintenance</button>`);
  }
  if (state.campaign.finalSummaryMode) {
    buttons.push(`<button data-action="start-new-campaign" class="active">Start New Campaign</button>`);
  }
  return `
    <div class="note">
      <strong>Immediate Decisions</strong>
      <p>${escapeHtml(state.campaign.pendingDecisions.length > 0 ? state.campaign.pendingDecisions.join(" ") : "No new operational commitment is pending right now.")}</p>
      <div class="button-row">
        ${buttons.join("")}
      </div>
    </div>
  `;
}

function renderCampaignRecord(state: SaveState): string {
  const insights = state.campaign.insights.slice(0, 6);
  const events = state.campaign.events.slice(0, 6);
  const ledger = state.campaign.consequenceLedger.slice(0, 6);
  return `
    <details class="note">
      <summary><strong>Campaign Record</strong></summary>
      <div class="stack compact">
        ${insights.length > 0 ? `<p><strong>Discovered Insights:</strong> ${escapeHtml(insights.map((insight) => insight.conclusion).join(" "))}</p>` : `<p class="muted">No durable campaign insights have been recorded yet.</p>`}
        ${events.map((event) => `<p class="muted">${escapeHtml(`${event.title}: ${sanitizeCampaignSummaryText(state, event.body)}`)}</p>`).join("")}
        ${ledger.map((entry) => `<p class="muted">${escapeHtml(`${entry.title}: ${entry.staffRead}`)}</p>`).join("")}
      </div>
    </details>
  `;
}

function sanitizeEvaluationSummary(state: SaveState): string {
  return sanitizeCampaignSummaryText(state, state.campaign.evaluation?.summary ?? buildQualitativeEvaluationSummary(state));
}

function renderFinalCampaignSummary(state: SaveState): string {
  const evaluation = state.campaign.evaluation;
  if (!evaluation) {
    return `<section class="panel stack"><h2>Command</h2><p>Campaign summary unavailable.</p></section>`;
  }
  return `
    <section class="panel stack">
      <h2>Command</h2>
      <div class="note">
        <strong>Final Campaign Summary</strong>
        <div class="badge-row">
          ${renderBadge("Result", evaluation.judgment)}
          ${renderBadge("End", evaluation.endCondition.replaceAll("_", " "))}
        </div>
        <p>${escapeHtml(sanitizeEvaluationSummary(state))}</p>
        <p>${escapeHtml(evaluation.commandJudgment)}</p>
        <p>${escapeHtml(evaluation.staffJudgment)}</p>
        <p class="muted">${escapeHtml(evaluation.directiveAssessment)}</p>
        <p class="muted">${escapeHtml(evaluation.groupAssessment)}</p>
        <p class="muted">${escapeHtml(evaluation.lossesAssessment)}</p>
        <p class="muted">${escapeHtml(evaluation.opportunityAssessment)}</p>
        ${evaluation.notableChains.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("")}
      </div>
      ${renderWhatChanged(state)}
      ${renderImmediateDecisions(state, getStaffConference(state))}
      ${renderCampaignRecord(state)}
    </section>
  `;
}

function renderCommandPanel(state: SaveState): string {
  const conference = getStaffConference(state);
  if (state.campaign.finalSummaryMode) {
    return renderFinalCampaignSummary(state);
  }
  const brief = getCommandBrief(state);
  return `
    <section class="panel stack">
      <h2>Command</h2>
      <article class="briefing-card urgency-${conference.recommendedAction.urgency}">
        <p class="eyebrow">Next Decision</p>
        <h3>${escapeHtml(brief.nextDecision.question)}</h3>
        <p><strong>Recommended course:</strong> ${escapeHtml(brief.nextDecision.recommendedAction)}</p>
        <p><strong>Why staff recommends it:</strong> ${escapeHtml(brief.nextDecision.whyRecommended)}</p>
        <p><strong>Expected to accomplish:</strong> ${escapeHtml(brief.nextDecision.expectedOutcome)}</p>
        <p><strong>Cost or unresolved issue:</strong> ${escapeHtml(brief.nextDecision.unresolvedCost)}</p>
        <div class="button-row briefing-actions">
          <button class="active" data-action="use-recommended-plan">${escapeHtml(brief.nextDecision.primaryButtonLabel)}</button>
        </div>
      </article>
      ${brief.newSinceLastDecision.length > 0 ? `
        <section class="stack">
          <h3>New Since Your Last Decision</h3>
          <div class="briefing-grid">
            ${brief.newSinceLastDecision.map((delta) => `
              <article class="row-card">
                <strong>${escapeHtml(delta.title)}</strong>
                <p class="muted">${escapeHtml(delta.location)} • ${escapeHtml(delta.filedLabel)}</p>
                <p>${escapeHtml(delta.whyItMatters)}</p>
              </article>
            `).join("")}
          </div>
        </section>
      ` : ""}
      ${brief.actionRequired.length > 0 ? `
        <section class="stack">
          <h3>Action Required</h3>
          ${brief.actionRequired.map((item) => `
            <article class="row-card">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
              <p class="muted">${escapeHtml(item.whyItMatters)}</p>
              <div class="button-row">${renderBriefActionButton(item)}</div>
            </article>
          `).join("")}
        </section>
      ` : ""}
      <details class="note">
        <summary><strong>Full Staff Discussion</strong></summary>
        <p><strong>Executive conclusion:</strong> ${escapeHtml(brief.details.executiveConclusion)}</p>
        <p><strong>Strongest supporting argument:</strong> ${escapeHtml(brief.details.strongestSupport)}</p>
        ${brief.details.strongestObjection ? `<p><strong>Strongest objection:</strong> ${escapeHtml(brief.details.strongestObjection)}</p>` : ""}
        ${renderOfficerDiscussion(conference)}
      </details>
      <details class="note">
        <summary><strong>Alternative Courses</strong></summary>
        <div class="briefing-grid">
          ${conference.alternateActions.map((recommendation) => renderStaffRecommendation(recommendation)).join("") || "<p class=\"muted\">No major alternate course is presently competing with the main recommendation.</p>"}
        </div>
      </details>
      <details class="note">
        <summary><strong>Detailed Campaign Situation</strong></summary>
        ${brief.details.campaignSituation.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("")}
      </details>
      <details class="note">
        <summary><strong>Campaign Record</strong></summary>
        ${brief.details.campaignRecord.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("") || "<p class=\"muted\">No campaign record entries are on file yet.</p>"}
      </details>
    </section>
  `;
}

function renderTargetCard(state: SaveState, target: Target): string {
  const selected = target.id === state.planning.selectedTargetId;
  const strategic = getTargetStrategicContext(state, target.id);
  const latestChange = getTargetCardLatestChange(state, target);
  const targetUnread = Boolean(latestChange && (latestChange.updatedAt ?? 0) > (state.uiReadState.lastViewedTargetChangeAt ?? 0));
  return `
    <article class="target-card ${selected ? "selected" : ""}">
      <div class="target-header">
        <div>
          <h3>${escapeHtml(target.name)}</h3>
          <p class="muted">${escapeHtml(target.region)} • ${escapeHtml(target.type)} target</p>
        </div>
        <button class="${selected ? "selected-target-button" : ""}" data-action="select-target" data-payload="${target.id}">${selected ? "Plan Target" : "Select / Plan"}</button>
      </div>
      <div class="badge-row">
        ${renderBadge("Condition", target.assessedCondition)}
        ${renderBadge("Intel", getTargetIntelAgeLabel(state, target.id))}
      </div>
      <p><strong>Purpose:</strong> ${escapeHtml(strategic.strategicRole.replace("Strategic Role: ", ""))}</p>
      <p><strong>Likely immediate benefit:</strong> ${escapeHtml(strategic.operationalEffect.replace("Likely Operational Effect: ", ""))}</p>
      ${latestChange ? `<p>${targetUnread ? "<strong>NEW:</strong> " : ""}${escapeHtml(latestChange.text)} <span class="muted">Filed ${escapeHtml(getQualitativeAgeLabel(state, latestChange.updatedAt))}.</span></p>` : ""}
      <details class="note">
        <summary><strong>Full Dossier</strong></summary>
        <p>${escapeHtml(getTargetOperationalSummary(target))}</p>
        <p><strong>Likely Command Value:</strong> ${escapeHtml(strategic.commandValue.replace("Likely Command Value: ", ""))}</p>
        <p><strong>Connections:</strong> ${escapeHtml(strategic.connections.replace("Connections: ", ""))}</p>
        <p><strong>Weather:</strong> ${escapeHtml(target.weatherOutlook)}</p>
        <p><strong>Suspected Effect:</strong> ${escapeHtml(target.suspectedEffects)}</p>
        <p><strong>Evidence Basis:</strong> ${escapeHtml(target.evidence.slice(0, 4).join(" "))}</p>
        ${target.latestIntelNote ? `<p><strong>Latest Intelligence:</strong> ${escapeHtml(target.latestIntelNote)}</p>` : ""}
        ${target.latestIntelRecommendation ? `<p class="muted">${escapeHtml(target.latestIntelRecommendation)}</p>` : ""}
      </details>
      ${hiddenBlock(state.debug.showHiddenValues, [
        `actual condition ${target.hiddenActualCondition}`,
        `defense ${target.hiddenDefenseLevel}`,
        `repair rate ${target.hiddenRepairRate}`,
        `weather risk ${target.hiddenWeatherRisk}`
      ])}
    </article>
  `;
}

function renderTargetBoard(state: SaveState): string {
  return `
    <section class="panel stack">
      <h2>Target Board</h2>
      <p class="muted">Folders are incomplete. Assessments are qualitative and sometimes contradictory, but the board should still be scannable at a glance.</p>
      <div class="target-grid">
        ${state.targets.map((target) => renderTargetCard(state, target)).join("")}
      </div>
    </section>
  `;
}

function renderAircraftCrews(state: SaveState): string {
  const replacementPool = getReplacementPool(state);
  const medicalPersonnel = getMedicalPersonnel(state);
  const restingPersonnel = getRestingPersonnel(state);
  const unavailablePersonnel = getHardUnavailablePersonnel(state);
  const airborneIds = new Set(getActiveMissionCrewIds(state));
  return `
    <section class="panel stack">
      <h2>Aircraft & Crews</h2>
      <div class="stack">
        <h3>Aircraft</h3>
        ${state.aircraft.map((aircraft) => {
          const crew = getCrewById(state, aircraft.assignedCrewId);
          const manifest = getCrewMembersForAircraft(state, aircraft.id);
          const availability = getAircraftAvailability(state, aircraft.id);
          const attention = getAircraftAttentionState(state, aircraft.id);
          const wounded = manifest.filter((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded").length;
          const replacements = manifest.filter((member) => member.isReplacement).length;
          const missing = manifest.filter((member) => member.status === "missing" || member.status === "kia" || member.status === "pow").length;
          const coverageProblems = getRoleCoverageProblems(state, aircraft.id);
          const personnelDecisions = getPersonnelDecisionsForAircraft(state, aircraft.id);
          const isLost = aircraft.status === "lost";
          const readiness = getAircraftReadinessSummary(state, aircraft.id);
          return `
            <details class="row-card aircraft-detail ${attention.needsAttention ? "needs-attention" : ""}" ${attention.shouldStartOpen ? "open" : ""}>
              <summary class="aircraft-summary">
                <div>
                  <strong>${escapeHtml(aircraft.name)}</strong>
                  <div class="muted">${escapeHtml(crew?.pilotName ?? "No pilot assigned")} • ${escapeHtml(readiness.primaryReason)}</div>
                  <div class="muted">${wounded} wounded • ${missing} unavailable • ${replacements} replacements</div>
                  <div class="muted">${escapeHtml(attention.needsAttention ? attention.reasons[0] ?? "Attention required." : "Open for the full crew manifest.")}</div>
                </div>
                <div class="badge-row">
                  ${renderBadge("Status", aircraft.status)}
                  ${renderBadge("Availability", availability.label)}
                </div>
              </summary>
              <div class="stack compact">
                <div class="aircraft-info-block">
                  <strong>Aircraft Status</strong>
                  <p class="muted">${escapeHtml(aircraft.conditionSummary)}</p>
                  <p class="muted">${escapeHtml(`Airframe: ${readiness.airframe}. Crew: ${readiness.crew}. Tasking: ${readiness.tasking}.`)}</p>
                  ${isLost ? `
                    <p class="warning">This aircraft has been struck from the board. No replacement aircraft are available in this prototype slice.</p>
                    <p class="muted">${escapeHtml(aircraft.lastOutcomeNote)}</p>
                  ` : ""}
                  <p class="muted">${escapeHtml(aircraft.crewCohesion)}</p>
                  <p class="muted">Ground crew: ${escapeHtml(aircraft.assignedGroundCrewId)}</p>
                </div>
                <div class="crew-manifest-block">
                  <strong>Crew Manifest</strong>
                  <p class="muted">The following crew are currently assigned to this aircraft.</p>
                  ${manifest.sort((a, b) => (a.currentAssignmentRole ?? "").localeCompare(b.currentAssignmentRole ?? "")).map((member) => renderCrewRow(state, aircraft.id, member, airborneIds)).join("")}
                </div>
                ${personnelDecisions.length > 0 ? `
                  <div class="stack compact crew-problem-block">
                    <strong>Recovered Originals Awaiting Decision</strong>
                    ${personnelDecisions.map((decision) => {
                      const original = state.crewMembers.find((member) => member.id === decision.crewMemberId);
                      const replacement = state.crewMembers.find((member) => member.id === decision.replacementCrewMemberId);
                      return `
                        <div class="manifest-row">
                          <div>
                            <strong>${escapeHtml(decision.role.replaceAll("_", " "))}</strong>
                            <div class="muted">${escapeHtml(original?.name ?? "Original crewman")} has recovered while ${escapeHtml(replacement?.name ?? "the replacement")} is still covering the seat.</div>
                          </div>
                          <div class="button-row">
                            <button data-action="restore-original" data-payload="${decision.id}">Restore original</button>
                            <button data-action="keep-replacement-temporary" data-payload="${decision.id}">Keep replacement temporary</button>
                            <button data-action="resolve-mark-permanent" data-payload="${decision.id}">Mark replacement permanent</button>
                          </div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                ` : ""}
                ${coverageProblems.length > 0 ? `
                  <div class="stack compact crew-problem-block">
                    <strong>Open Crew Problems</strong>
                    ${coverageProblems.map((problem) => `
                      <div class="manifest-row">
                        <div>
                          <strong>${escapeHtml(problem.role.replaceAll("_", " "))}</strong>
                          <div class="muted">${escapeHtml(problem.hasConflict ? "Multiple crew claim this station and the fit occupant needs sorting out." : "No fit crew member currently covers this position.")}</div>
                        </div>
                        <div class="button-row">
                          ${replacementPool
                            .filter((member) =>
                              member.assignedAircraftId === null
                              && ((member.role === "pilot" && (problem.role === "pilot" || problem.role === "copilot"))
                                || (member.role === "copilot" && problem.role === "copilot")
                                || member.role === problem.role
                                || (member.role === "enlisted_airman" && ["engineer_top_turret", "radio_operator", "ball_turret", "left_waist", "right_waist", "tail_gunner"].includes(problem.role)))
                            )
                            .map((member) => `
                              <button data-action="assign-replacement" data-payload="${member.id}:${aircraft.id}:${problem.role}">
                                Assign ${escapeHtml(member.name)}
                              </button>
                            `).join("") || `<span class="disabled-reason">No suitable replacement available.</span>`}
                        </div>
                      </div>
                    `).join("")}
                  </div>
                ` : ""}
                ${hiddenBlock(state.debug.showHiddenValues, [`condition ${aircraft.hiddenCondition}`])}
              </div>
            </details>
          `;
        }).join("")}
      </div>
      <div class="two-col">
        <div class="stack">
          <h3>Replacement Pool</h3>
          ${replacementPool.length === 0 ? `<p class="muted">No replacement crew members are currently unassigned.</p>` : replacementPool.map((member) => `
            ${renderPersonnelStatusRow(state, member)}
          `).join("")}
        </div>
        <div class="stack">
          <h3>Medical Personnel</h3>
          ${medicalPersonnel.length === 0 ? `<p class="muted">No crew members are currently under medical restriction.</p>` : medicalPersonnel.map((member) => `
            ${renderPersonnelStatusRow(state, member)}
          `).join("")}
          <h3>Resting / Recovering</h3>
          ${restingPersonnel.length === 0 ? `<p class="muted">No crew members are currently resting off the flight schedule.</p>` : restingPersonnel.map((member) => `
            ${renderPersonnelStatusRow(state, member)}
          `).join("")}
          <h3>Unavailable / Missing</h3>
          ${unavailablePersonnel.length === 0 ? `<p class="muted">No crew members are currently missing or otherwise hard unavailable.</p>` : unavailablePersonnel.map((member) => `
            ${renderPersonnelStatusRow(state, member)}
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPlanning(state: SaveState): string {
  const selectedTarget = getTargetById(state, state.planning.selectedTargetId);
  const launchDisabled = getDisabledReasonForLaunch(state);
  const secondaryOptions = selectedTarget ? getSecondaryTargetOptions(state, selectedTarget.id) : [];
  const leadAssessment = getLeadAircraftAssessment(state, state.planning.leadAircraftId);
  const staffPreview = getPlanningStaffPreview(state);
  const topWarning = staffPreview.warnings[0] ?? (selectedTarget ? `${selectedTarget.name} remains under a ${getTargetIntelAgeLabel(state, selectedTarget.id)} file.` : "No target selected.");
  return `
    <section class="panel stack">
      <h2>Mission Planning</h2>
      <div class="row-card">
        <strong>Proposed Order</strong>
        <p><strong>Purpose:</strong> ${escapeHtml(staffPreview.operations)}</p>
        <p><strong>Target:</strong> ${escapeHtml(selectedTarget?.name ?? "No target selected")}</p>
        <p><strong>Operation:</strong> ${escapeHtml(state.planning.operationType.replaceAll("_", " "))}</p>
        <p><strong>Route:</strong> ${escapeHtml(state.planning.routeRisk)}</p>
        <p><strong>Doctrine:</strong> ${escapeHtml(state.planning.attackDoctrine.replaceAll("_", " "))}</p>
        <p><strong>Package:</strong> ${state.planning.assignedAircraftIds.length} aircraft assigned</p>
        <p><strong>Lead:</strong> ${escapeHtml(state.planning.leadAircraftId ? (getAircraftById(state, state.planning.leadAircraftId)?.name ?? "No lead selected") : "No lead selected")}</p>
        <p class="warning"><strong>Primary concern:</strong> ${escapeHtml(topWarning)}</p>
      </div>
      <details class="note">
        <summary><strong>Change Mission Profile</strong></summary>
        <div class="control-group">
          <span class="label">Operation Type</span>
          <div class="button-row">
            ${(["main_strike", "reduced_strike", "support_raid", "follow_up_attack", "harassment_diversion"] as const).map((operationType) => `
              <button data-action="operation-type" data-payload="${operationType}" class="${state.planning.operationType === operationType ? "active" : ""}">
                ${escapeHtml(operationType.replaceAll("_", " "))}
              </button>
            `).join("")}
          </div>
        </div>
        <div class="control-group">
          <span class="label">Secondary Target</span>
          <div class="button-row">
            <button data-action="secondary-target" data-payload="" class="${state.planning.secondaryTargetId === null ? "active" : ""}">No Secondary</button>
            ${secondaryOptions.map((target) => `
              <button data-action="secondary-target" data-payload="${target.id}" class="${state.planning.secondaryTargetId === target.id ? "active" : ""}">
                ${escapeHtml(target.name)}
              </button>
            `).join("") || `<span class="disabled-reason">No connected or same-region secondary target is currently suitable.</span>`}
          </div>
        </div>
        <div class="control-group">
          <span class="label">Attack Doctrine</span>
          <div class="button-row">
            ${(["single_pass", "repeat_if_needed", "abort_unless_visual", "bomb_through_cloud"] as const).map((doctrine) => `
              <button data-action="attack-doctrine" data-payload="${doctrine}" class="${state.planning.attackDoctrine === doctrine ? "active" : ""}">
                ${escapeHtml(doctrine.replaceAll("_", " "))}
              </button>
            `).join("")}
          </div>
        </div>
        <div class="control-group">
          <span class="label">Route Risk</span>
          <div class="button-row">
            ${(["cautious", "standard", "direct"] as const).map((route) => `
              <button data-action="route" data-payload="${route}" class="${state.planning.routeRisk === route ? "active" : ""}">
                ${route}
              </button>
            `).join("")}
          </div>
        </div>
        <div class="control-group">
          <span class="label">Standing Orders</span>
          <div class="check-grid">
            ${Object.entries(state.planning.standingOrders).filter(([key]) => key !== "allowRepeatBombRun").map(([key, value]) => `
              <label class="check-row">
                <input type="checkbox" data-action="standing-order" data-payload="${key}" ${value ? "checked" : ""} />
                <span>${escapeHtml(key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()))}</span>
              </label>
            `).join("")}
          </div>
        </div>
        <div class="control-group">
          <span class="label">Launch Timing</span>
          <div class="button-row">
            <button data-action="launch-mode" data-payload="now" class="${state.planning.launchMode === "now" ? "active" : ""}">Launch Now</button>
            <button data-action="launch-mode" data-payload="schedule" class="${state.planning.launchMode === "schedule" ? "active" : ""}">Schedule</button>
            <button data-action="schedule-delay" data-payload="120000" class="${state.planning.scheduleDelayMs === 120000 ? "active" : ""}">+2 min</button>
            <button data-action="schedule-delay" data-payload="300000" class="${state.planning.scheduleDelayMs === 300000 ? "active" : ""}">+5 min</button>
          </div>
        </div>
      </details>
      <details class="note">
        <summary><strong>Change Aircraft Package</strong></summary>
        <div class="assignment-list">
          ${state.aircraft.map((aircraft) => {
            const crew = getCrewById(state, aircraft.assignedCrewId);
            const availability = getAircraftAvailability(state, aircraft.id);
            const readiness = getAircraftReadinessSummary(state, aircraft.id);
            const checked = state.planning.assignedAircraftIds.includes(aircraft.id);
            const leadSelected = state.planning.leadAircraftId === aircraft.id;
            return `
              <div class="assignment-row ${availability.level}">
                <div class="assignment-toggle-row">
                  <input
                    type="checkbox"
                    data-action="toggle-aircraft"
                    data-payload="${aircraft.id}"
                    ${checked ? "checked" : ""}
                    ${availability.level === "unavailable" && !checked ? "disabled" : ""}
                  />
                  <span class="assignment-title">${escapeHtml(aircraft.name)} • ${escapeHtml(crew?.pilotName ?? "Unknown crew")}</span>
                  <button type="button" data-action="lead-aircraft" data-payload="${aircraft.id}" ${checked ? "" : "disabled"} class="${leadSelected ? "active" : ""}">
                    ${leadSelected ? "Lead Aircraft" : "Set Lead"}
                  </button>
                </div>
                <span class="assignment-meta">${escapeHtml(readiness.primaryReason)}</span>
                <span class="assignment-meta">${escapeHtml(`Airframe: ${readiness.airframe}. Crew: ${readiness.crew}. Tasking: ${readiness.tasking}.`)}</span>
              </div>
            `;
          }).join("")}
        </div>
      </details>
      <details class="note">
        <summary><strong>Full Staff Preview</strong></summary>
        <p><strong>Operations:</strong> ${escapeHtml(staffPreview.operations)}</p>
        <p><strong>Intelligence:</strong> ${escapeHtml(staffPreview.intelligence)}</p>
        <p><strong>Engineering:</strong> ${escapeHtml(staffPreview.engineering)}</p>
        <p><strong>Personnel:</strong> ${escapeHtml(staffPreview.personnel)}</p>
        <p><strong>Command:</strong> ${escapeHtml(staffPreview.command)}</p>
        <p><strong>Lead aircraft:</strong> ${escapeHtml(leadAssessment.summary)}</p>
        ${staffPreview.warnings.length > 0 ? staffPreview.warnings.map((line) => `<p class="warning">${escapeHtml(line)}</p>`).join("") : ""}
      </details>
      <div class="button-row">
        <button data-action="launch-mission" ${launchDisabled ? "disabled" : ""}>${state.planning.launchMode === "schedule" ? "Schedule Operation" : "Launch Operation"}</button>
        ${launchDisabled ? `<span class="disabled-reason">${escapeHtml(launchDisabled)}</span>` : ""}
      </div>
    </section>
  `;
}

function renderCurrentOperation(state: SaveState): string {
  const mission = getActiveMission(state);
  if (!mission) {
    return `
      <section class="panel stack">
        <h2>Current Operation</h2>
        <p>No active mission.</p>
        <div class="disabled-reason">No active mission</div>
      </section>
    `;
  }

  const nextReport = mission.timelineEvents.filter((event) => !event.revealed).sort((a, b) => a.time - b.time)[0];
  return `
    <section class="panel stack">
      <h2>Current Operation</h2>
      <p>${escapeHtml(getCurrentOperationSummary(state))}</p>
      <div class="badge-row">
        ${renderBadge("Stage", mission.stage.replaceAll("_", " "))}
        ${renderBadge("Operation", mission.plan.operationType.replaceAll("_", " "))}
        ${renderBadge("Route", mission.plan.routeRisk)}
        ${renderBadge("Doctrine", mission.plan.attackDoctrine.replaceAll("_", " "))}
        ${renderBadge("Assigned", String(mission.plan.assignedAircraftIds.length))}
      </div>
      <p><strong>Target:</strong> ${escapeHtml(getTargetById(state, mission.plan.targetId)?.name ?? "Unknown")}</p>
      ${mission.plan.secondaryTargetId ? `<p><strong>Secondary:</strong> ${escapeHtml(getTargetById(state, mission.plan.secondaryTargetId)?.name ?? "Unknown")}</p>` : ""}
      ${mission.plan.leadAircraftId ? `<p><strong>Lead aircraft:</strong> ${escapeHtml(getAircraftById(state, mission.plan.leadAircraftId)?.name ?? "Unknown")}</p>` : ""}
      <p><strong>Launch:</strong> ${escapeHtml(formatTimestamp(state, mission.plan.scheduledLaunchTime))}</p>
      <p><strong>Next report:</strong> ${nextReport ? escapeHtml(renderDueTime(state, nextReport.time)) : "No further reports pending."}</p>
      <div class="report-list">
        ${mission.timelineEvents.filter((event) => event.revealed).map((event) => `
          <div class="report-item">
            <strong>${escapeHtml(event.stage.replaceAll("_", " "))}</strong>
            <span class="muted">${escapeHtml(event.confidence)} • ${escapeHtml(event.source)}</span>
            <p>${escapeHtml(event.publicReportText)}</p>
          </div>
        `).join("") || "<p class=\"muted\">No reports have arrived yet.</p>"}
      </div>
    </section>
  `;
}

function renderDebrief(state: SaveState): string {
  const mission = getLatestDebriefMission(state);
  if (!mission || !mission.debriefGenerated) {
    return `
      <section class="panel stack">
        <h2>Debrief / Assessment</h2>
        <p>Debrief not ready.</p>
        <div class="disabled-reason">Debrief not ready</div>
      </section>
    `;
  }

  const target = getTargetById(state, mission.plan.targetId);
  const attackedTarget = getTargetById(state, mission.hiddenOutcome.attackedTargetId) ?? target;
  const ledger = getRecentConsequenceLedger(state).find((entry) => entry.missionId === mission.id);
  return `
    <section class="panel stack">
      <p class="eyebrow">Debrief Target</p>
      <h2>Debrief: ${escapeHtml(target?.name ?? "Unknown target")}</h2>
      <div class="row-card">
        <strong>Top Summary</strong>
        <p><strong>What happened:</strong> ${escapeHtml(mission.resultSummary)}</p>
        <p><strong>What changed:</strong> ${escapeHtml(ledger?.strategicConsequence ?? attackedTarget?.assessedCondition ?? "No settled change filed.")}</p>
        <p><strong>What it cost:</strong> ${escapeHtml(ledger?.groupCost ?? "No detailed group-cost summary filed.")}</p>
        <p><strong>What remains uncertain:</strong> ${escapeHtml(attackedTarget?.suspectedEffects ?? "The full target effect remains uncertain.")}</p>
        <p><strong>What staff recommends next:</strong> ${escapeHtml(ledger?.recommendedPosture ?? getStaffConference(state).recommendedAction.title)}</p>
      </div>
      <div class="badge-row">
        ${renderBadge("Operation", mission.plan.operationType.replaceAll("_", " "))}
        ${renderBadge("Doctrine", mission.plan.attackDoctrine.replaceAll("_", " "))}
      </div>
      <p><strong>Filed:</strong> ${escapeHtml(getQualitativeAgeLabel(state, mission.plan.scheduledLaunchTime))}</p>
      <p><strong>Planned primary:</strong> ${escapeHtml(target?.name ?? "Unknown target")}</p>
      ${mission.plan.secondaryTargetId ? `<p><strong>Planned secondary:</strong> ${escapeHtml(getTargetById(state, mission.plan.secondaryTargetId)?.name ?? "Unknown")}</p>` : ""}
      ${mission.plan.leadAircraftId ? `<p><strong>Lead aircraft:</strong> ${escapeHtml(getAircraftById(state, mission.plan.leadAircraftId)?.name ?? "Unknown")}</p>` : ""}
      <p><strong>Attack result:</strong> ${escapeHtml(mission.hiddenOutcome.targetDamage <= 0 ? "No clearly effective attack confirmed." : mission.hiddenOutcome.attackedSecondary ? `Crews believe the attack shifted to ${attackedTarget?.name ?? "the secondary target"}.` : `Crews believe the main effort hit ${attackedTarget?.name ?? "the primary target"}.`)}</p>
      <p><strong>Mission summary:</strong> ${escapeHtml(mission.resultSummary)}</p>
      <p>${escapeHtml(mission.debrief)}</p>
      ${mission.plan.staffWarningsAtLaunch.length > 0 ? `
        <div class="stack compact">
          <strong>Staff Warnings At Launch</strong>
          ${mission.plan.staffWarningsAtLaunch.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("")}
        </div>
      ` : ""}
      ${mission.debriefCasualtyLines.length > 0 ? `
        <div class="stack compact">
          <strong>Crew Consequences</strong>
          ${mission.debriefCasualtyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
      ` : `<p class="muted">No specific crew casualties have been filed beyond fatigue and strain.</p>`}
      ${ledger ? `
        <div class="note">
          <strong>Post-Operation Consequence Ledger</strong>
          <p><strong>Staff read:</strong> ${escapeHtml(ledger.staffRead)}</p>
          <p><strong>Command read:</strong> ${escapeHtml(ledger.commandRead)}</p>
          <p><strong>Target read:</strong> ${escapeHtml(ledger.targetRead)}</p>
          <p><strong>Group cost:</strong> ${escapeHtml(ledger.groupCost)}</p>
          <p><strong>Strategic consequence:</strong> ${escapeHtml(ledger.strategicConsequence)}</p>
          <p><strong>Recommended posture:</strong> ${escapeHtml(ledger.recommendedPosture)}</p>
        </div>
      ` : ""}
      <p><strong>Target assessment:</strong> ${escapeHtml(attackedTarget?.assessedCondition ?? "No reliable assessment.")}</p>
      <p><strong>Evidence:</strong> ${escapeHtml(attackedTarget?.evidence.slice(0, 4).join(" ") ?? "No evidence filed.")}</p>
      <div class="button-row">
        <button data-action="quick-recon" data-payload="${attackedTarget?.id ?? target?.id ?? ""}" ${state.campaign.activeReconId ? "disabled" : ""}>Order Post-Strike Recon</button>
        ${state.campaign.activeReconId ? `<span class="disabled-reason">Recon section already occupied</span>` : ""}
      </div>
    </section>
  `;
}

function renderMaintenance(state: SaveState): string {
  const damagedAircraft = state.aircraft.filter((aircraft) => aircraft.status === "damaged" || aircraft.status === "under_repair");
  const divertedAircraft = state.aircraft.filter((aircraft) => aircraft.status === "diverted" || aircraft.recoveryJobId);
  const optionalAircraft = state.aircraft.filter((aircraft) => getAircraftReadinessSummary(state, aircraft.id).optionalMaintenance);
  const activeRepairs = state.repairJobs.filter((job) => !job.completionApplied);
  const activeRecoveries = state.recoveryJobs.filter((job) => !job.completionApplied);
  const recentCompletedRepairs = state.repairJobs.filter((job) => job.completionApplied && job.completesAt > (state.uiReadState.lastViewedMaintenanceAt ?? 0));
  const recentCompletedRecoveries = state.recoveryJobs.filter((job) => job.completionApplied && job.completesAt > (state.uiReadState.lastViewedMaintenanceAt ?? 0));
  return `
    <section class="panel stack">
      <h2>Maintenance</h2>
      <div class="stack">
        <h3>Recently Completed</h3>
        ${recentCompletedRepairs.length === 0 && recentCompletedRecoveries.length === 0 ? `<p class="muted">No unread maintenance completions are on file.</p>` : ""}
        ${recentCompletedRepairs.map((job) => {
          const aircraft = getAircraftById(state, job.aircraftId);
          const readiness = getAircraftReadinessSummary(state, job.aircraftId);
          return `<div class="row-card"><strong>${escapeHtml(aircraft?.name ?? "Aircraft")}</strong><p><strong>Repair:</strong> ${escapeHtml(job.repairTier)}</p><p>${escapeHtml(job.resultText)}</p><p class="muted">${escapeHtml(`Current readiness: ${readiness.primaryReason}`)}</p><p class="muted">${escapeHtml(getQualitativeAgeLabel(state, job.completesAt))}</p></div>`;
        }).join("")}
        ${recentCompletedRecoveries.map((job) => {
          const aircraft = getAircraftById(state, job.aircraftId);
          const readiness = getAircraftReadinessSummary(state, job.aircraftId);
          return `<div class="row-card"><strong>${escapeHtml(aircraft?.name ?? "Aircraft")}</strong><p><strong>Recovery:</strong> diversion return</p><p>${escapeHtml(job.resultText)}</p><p class="muted">${escapeHtml(`Current readiness: ${readiness.primaryReason}`)}</p><p class="muted">${escapeHtml(getQualitativeAgeLabel(state, job.completesAt))}</p></div>`;
        }).join("")}
      </div>
      <div class="stack">
        <h3>Repair Required</h3>
        ${damagedAircraft.length === 0 ? `<p class="muted">No aircraft currently require mandatory repair.</p>` : damagedAircraft.map((aircraft) => {
        const activeJob = state.repairJobs.find((job) => job.aircraftId === aircraft.id && !job.completionApplied);
        const pressureNote = getGroundCrewPressureNote(state, aircraft.id, activeJob?.repairTier);
        return `
          <div class="row-card">
            <div>
              <strong>${escapeHtml(aircraft.name)}</strong>
              <div class="muted">${escapeHtml(aircraft.conditionSummary)}</div>
              <div class="muted">${escapeHtml(aircraft.lastOutcomeNote)}</div>
            </div>
            ${activeJob ? `
              <div class="stack compact">
                ${renderBadge("Repair", activeJob.repairTier)}
                <span class="muted">Due ${escapeHtml(renderDueTime(state, activeJob.completesAt))}</span>
                <span class="muted">${escapeHtml(activeJob.riskNote)}</span>
              </div>
            ` : `
              <div class="button-row">
                <button data-action="repair" data-payload="${aircraft.id}:patch">Patch Repair</button>
                <button data-action="repair" data-payload="${aircraft.id}:standard">Standard Repair</button>
                <button data-action="repair" data-payload="${aircraft.id}:thorough">Thorough Inspection</button>
              </div>
            `}
            ${pressureNote ? `<div class="warning">${escapeHtml(pressureNote)}</div>` : ""}
            ${hiddenBlock(state.debug.showHiddenValues, [`condition ${aircraft.hiddenCondition}`])}
          </div>
        `;
      }).join("")}
      </div>
      <div class="stack">
        <h3>Active Work</h3>
        ${activeRepairs.length === 0 && activeRecoveries.length === 0 ? `<p class="muted">No repair or recovery work is currently in progress.</p>` : ""}
        ${activeRepairs.map((job) => `<div class="row-card"><strong>${escapeHtml(getAircraftById(state, job.aircraftId)?.name ?? "Aircraft")}</strong><p>${escapeHtml(job.riskNote)}</p><p class="muted">Due ${escapeHtml(renderDueTime(state, job.completesAt))}</p></div>`).join("")}
        ${activeRecoveries.map((job) => `<div class="row-card"><strong>${escapeHtml(getAircraftById(state, job.aircraftId)?.name ?? "Aircraft")}</strong><p>${escapeHtml(job.summary)}</p><p class="muted">Due ${escapeHtml(renderDueTime(state, job.completesAt))}</p></div>`).join("")}
      </div>
      <div class="stack">
        <h3>Away After Diversion</h3>
        ${divertedAircraft.length === 0 ? `
          <p class="muted">No aircraft are currently away at another field.</p>
        ` : divertedAircraft.map((aircraft) => {
          const activeRecovery = state.recoveryJobs.find((job) => job.aircraftId === aircraft.id && !job.completionApplied);
          const pressureNote = getGroundCrewPressureNote(state, aircraft.id);
          return `
            <div class="row-card">
              <div>
                <strong>${escapeHtml(aircraft.name)}</strong>
                <div class="muted">${escapeHtml(aircraft.conditionSummary)}</div>
                <div class="muted">${escapeHtml(aircraft.lastOutcomeNote)}</div>
              </div>
              ${activeRecovery ? `
                <div class="stack compact">
                  ${renderBadge("Status", "recovering")}
                  <span class="muted">${escapeHtml(activeRecovery.summary)}</span>
                  <span class="muted">Due ${escapeHtml(renderDueTime(state, activeRecovery.completesAt))}</span>
                </div>
              ` : `
                <div class="button-row">
                  <button data-action="recover-aircraft" data-payload="${aircraft.id}">Recover from diversion</button>
                </div>
              `}
              ${pressureNote ? `<div class="warning">${escapeHtml(pressureNote)}</div>` : ""}
              ${hiddenBlock(state.debug.showHiddenValues, [`condition ${aircraft.hiddenCondition}`])}
            </div>
          `;
        }).join("")}
      </div>
      <div class="stack">
        <h3>Optional Inspection / Preventive Work</h3>
        ${optionalAircraft.length === 0 ? `<p class="muted">No aircraft currently require maintenance or optional inspection.</p>` : optionalAircraft.map((aircraft) => `
          <div class="row-card">
            <strong>${escapeHtml(aircraft.name)}</strong>
            <p>${escapeHtml(aircraft.conditionSummary)}</p>
            <p class="muted">${escapeHtml(getAircraftReadinessSummary(state, aircraft.id).primaryReason)}</p>
            <div class="button-row">
              <button data-action="repair" data-payload="${aircraft.id}:thorough">Open Optional Inspection</button>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderRecon(state: SaveState): string {
  const activeRecon = getActiveRecon(state);
  const latestIntel = state.campaign.latestIntelUpdate;
  const selectedTarget = getTargetById(state, state.planning.selectedTargetId);
  const activeReconTarget = activeRecon ? getTargetById(state, activeRecon.targetId) : null;
  const delta = getReconDeltaSummary(state);
  return `
    <section class="panel stack">
      <h2>Recon / Intelligence</h2>
      ${activeRecon ? `
        <p><strong>Active recon target:</strong> ${escapeHtml(activeReconTarget?.name ?? "Unknown target")}</p>
        ${activeReconTarget ? `<p class="muted">${escapeHtml(activeReconTarget.assessedCondition)} • file is ${escapeHtml(getTargetIntelAgeLabel(state, activeReconTarget.id))}</p>` : ""}
      ` : `
        <p><strong>Selected target for recon:</strong> ${escapeHtml(selectedTarget?.name ?? "No target selected")}</p>
        ${selectedTarget ? `<p class="muted">${escapeHtml(selectedTarget.assessedCondition)} • file is ${escapeHtml(getTargetIntelAgeLabel(state, selectedTarget.id))}</p>` : ""}
      `}
      <p class="muted">Recon section can service one group priority at a time. Other theater reconnaissance continues outside your direct control.</p>
      ${delta ?? latestIntel ? `
        <div class="row-card">
          <strong>${escapeHtml((delta?.isUnread ?? false) ? "New Intelligence" : "Latest Intelligence")} - ${escapeHtml(delta?.targetName ?? latestIntel?.targetName ?? "Target")}</strong>
          <div class="badge-row">
            ${latestIntel ? renderBadge("Result", latestIntel.resultQuality) : ""}
            ${latestIntel ? renderBadge("Alert", latestIntel.alertLevel) : ""}
          </div>
          <p class="muted">Filed ${escapeHtml(delta?.filedLabel ?? (latestIntel ? getQualitativeAgeLabel(state, latestIntel.updatedAt) : "no recent filing"))}.</p>
          ${delta ? delta.changes.map((line) => `<p>${escapeHtml(line)}</p>`).join("") : latestIntel ? `<p>${escapeHtml(latestIntel.assessment)}</p>` : ""}
          ${latestIntel ? `
            <details class="note">
              <summary><strong>Full Interpretation</strong></summary>
              <p><strong>Assessment:</strong> ${escapeHtml(latestIntel.assessment)}</p>
              <p><strong>Evidence:</strong> ${escapeHtml(latestIntel.evidence)}</p>
              <p><strong>Current file freshness:</strong> ${escapeHtml(getTargetIntelAgeLabel(state, latestIntel.targetId))}</p>
            </details>
          ` : ""}
          <p><strong>Staff conclusion:</strong> ${escapeHtml(delta?.conclusion ?? latestIntel?.recommendation ?? "No fresh conclusion filed.")}</p>
        </div>
      ` : ""}
      ${!latestIntel ? `<p class="muted">No recent intelligence update has been filed yet.</p>` : ""}
      ${activeRecon ? `
        <p>${escapeHtml(activeRecon.resultText)}</p>
        <div class="badge-row">
          ${renderBadge("Status", activeRecon.status)}
          ${renderBadge("Type", activeRecon.type.replaceAll("_", " "))}
        </div>
        <p><strong>Recon operation:</strong> ${escapeHtml(activeReconTarget?.name ?? "Unknown target")}</p>
        <p><strong>Interpretation due:</strong> ${escapeHtml(renderDueTime(state, activeRecon.interpretedAt))}</p>
      ` : `
        <p>No active recon.</p>
        <div class="button-row">
          <button data-action="recon" data-payload="${selectedTarget?.id ?? ""}:pre_strike" ${selectedTarget ? "" : "disabled"}>Pre-Strike Recon</button>
          <button data-action="recon" data-payload="${selectedTarget?.id ?? ""}:weather_route" ${selectedTarget ? "" : "disabled"}>Weather / Route Recon</button>
          <button data-action="recon" data-payload="${selectedTarget?.id ?? ""}:focused_followup" ${selectedTarget ? "" : "disabled"}>Focused Follow-Up</button>
        </div>
        <div class="stack compact">
          <p class="muted">Pre-strike recon checks target activity and worth, but is more likely to stir alertness.</p>
          <p class="muted">Weather / route recon favors flying conditions and doctrine advice with less target-alert risk.</p>
          <p class="muted">Focused follow-up is slower, but aims at one unresolved question rather than a general look.</p>
        </div>
      `}
    </section>
  `;
}

function renderEventLog(state: SaveState): string {
  return `
    <section class="panel stack">
      <h2>Event Log</h2>
      <div class="log-list">
        ${state.campaign.logEntries.map((entry) => `
          <div class="log-item">
            <span class="muted">${escapeHtml(entry.category)}</span>
            <p>${escapeHtml(sanitizeCampaignSummaryText(state, entry.text))}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderNextStepStrip(state: SaveState): string {
  const guidance = getNextStepGuidance(state);
  if (!guidance) {
    return "";
  }
  return `
    <section class="panel next-step-strip">
      <div>
        <p class="eyebrow">Recommended Next Step</p>
        <strong>${escapeHtml(guidance.title)}</strong>
        <p class="muted">${escapeHtml(guidance.reason)}</p>
      </div>
      <div class="button-row">
        <button class="active" data-action="use-recommended-plan">${escapeHtml(guidance.buttonLabel)}</button>
      </div>
    </section>
  `;
}

function renderGlobalTutorialHelp(state: SaveState): string {
  return renderTutorialModal(state);
}

function renderDebug(state: SaveState): string {
  return `
    <section class="panel stack">
      <h2>Debug</h2>
      <div class="button-row">
        <button data-action="save-now">Save Now</button>
        <button data-action="skip-report">Skip To Next Report</button>
        <button data-action="skip-debrief">Skip To Debrief</button>
        <button data-action="complete-recon">Complete Current Recon</button>
        <button data-action="complete-repairs">Complete All Repairs</button>
        <button data-action="advance-day">Advance Campaign Day</button>
        <button data-action="reset-save" class="danger">Reset Save</button>
      </div>
      <label class="check-row">
        <input type="checkbox" data-action="toggle-hidden" ${state.debug.showHiddenValues ? "checked" : ""} />
        <span>Show hidden values</span>
      </label>
      <div class="note">
        <strong>Clock offset:</strong> ${Math.round(state.debug.clockOffsetMs / 60000)} minutes advanced for testing.
      </div>
      <div class="note">
        <strong>Simulation audit:</strong> Mission stage timing is fixed by target type. Mission, recon, repair, and diversion-recovery outcomes are generated when they begin and then stored. Aircraft outcomes still depend on hidden condition, fatigue, defenses, route risk, visibility, and randomness.
      </div>
    </section>
  `;
}

function renderActivePanel(state: SaveState): string {
  switch (state.selectedTab) {
    case "command":
      return renderCommandPanel(state);
    case "target-board":
      return renderTargetBoard(state);
    case "aircraft-crews":
      return renderAircraftCrews(state);
    case "mission-planning":
      return renderPlanning(state);
    case "current-operation":
      return renderCurrentOperation(state);
    case "debrief":
      return renderDebrief(state);
    case "maintenance":
      return renderMaintenance(state);
    case "recon":
      return renderRecon(state);
    case "event-log":
      return renderEventLog(state);
    case "debug":
      return renderDebug(state);
    default:
      return renderCommandPanel(state);
  }
}

function parsePayload(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}

export function mountBomberCommand(root: HTMLElement): void {
  let state = loadState() ?? createNewGame(Date.now());

  const sync = (forceRender = false) => {
    const now = getEffectiveNow(state);
    const changed = reconcileState(state, now);
    if (changed || forceRender) {
      render();
    }
    saveState(state);
  };

  const performAction: ActionHandler = (action, payload) => {
    const now = getEffectiveNow(state);
    let error: string | null = null;

    switch (action) {
      case "tab":
        if (payload) {
          setSelectedTab(state, payload as CampaignTab);
        }
        break;
      case "select-target":
        if (payload) {
          setPlanningTarget(state, payload);
          setSelectedTab(state, "mission-planning");
        }
        break;
      case "briefing-target-board":
        if (payload) {
          setPlanningTarget(state, payload);
        }
        setSelectedTab(state, "target-board");
        break;
      case "briefing-mission-planning":
        if (payload) {
          setPlanningTarget(state, payload);
        }
        setSelectedTab(state, "mission-planning");
        break;
      case "briefing-start-recon":
        if (payload) {
          const [targetId, type] = payload.split(":");
          setPlanningTarget(state, targetId);
          error = startRecon(state, targetId, (type ?? "pre_strike") as ReconType, now);
          if (!error) {
            setSelectedTab(state, "recon");
          }
        }
        break;
      case "toggle-aircraft":
        if (payload) {
          toggleAssignedAircraft(state, payload);
        }
        break;
      case "route":
        if (payload === "cautious" || payload === "standard" || payload === "direct") {
          setRouteRisk(state, payload);
        }
        break;
      case "operation-type":
        if (payload) {
          setOperationType(state, payload as OperationType);
        }
        break;
      case "secondary-target":
        setSecondaryTarget(state, payload);
        break;
      case "lead-aircraft":
        if (payload) {
          setLeadAircraft(state, payload);
        }
        break;
      case "attack-doctrine":
        if (payload) {
          setAttackDoctrine(state, payload as AttackDoctrine);
        }
        break;
      case "standing-order":
        if (payload) {
          toggleStandingOrder(state, payload as keyof SaveState["planning"]["standingOrders"]);
        }
        break;
      case "launch-mode":
        if (payload === "now" || payload === "schedule") {
          setLaunchMode(state, payload);
        }
        break;
      case "schedule-delay":
        if (payload) {
          setScheduleDelay(state, Number(payload));
        }
        break;
      case "launch-mission":
        error = launchMission(state, now);
        break;
      case "repair":
        if (payload) {
          const [aircraftId, tier] = payload.split(":");
          error = startRepair(state, aircraftId ?? "", (tier ?? "standard") as RepairTier, now);
        }
        break;
      case "assign-replacement":
        if (payload) {
          const [crewMemberId, aircraftId, role] = payload.split(":");
          error = assignReplacementCrewMember(state, crewMemberId ?? "", aircraftId ?? "", (role ?? "pilot") as CrewRole);
        }
        break;
      case "remove-replacement":
        if (payload) {
          error = removeReplacementCrewMember(state, payload);
        }
        break;
      case "mark-permanent":
        if (payload) {
          error = markReplacementPermanent(state, payload);
        }
        break;
      case "recover-aircraft":
        if (payload) {
          error = startRecovery(state, payload, now);
        }
        break;
      case "recon":
        if (payload) {
          const [targetId, type] = payload.split(":");
          error = startRecon(state, targetId ?? "", (type ?? "pre_strike") as ReconType, now);
        }
        break;
      case "quick-recon":
        if (payload) {
          error = startRecon(state, payload, "post_strike", now);
        }
        break;
      case "use-recommended-plan":
        error = applyRecommendedPlan(state, now);
        break;
      case "wait-next-event":
        error = waitUntilNextEvent(state, now);
        break;
      case "stand-down-morning":
        error = standDownUntilMorning(state, now);
        break;
      case "let-work-finish":
        error = letCurrentWorkFinish(state, now);
        break;
      case "restore-original":
        if (payload) {
          error = restoreOriginalCrewMember(state, payload);
        }
        break;
      case "keep-replacement-temporary":
        if (payload) {
          error = keepReplacementTemporary(state, payload);
        }
        break;
      case "resolve-mark-permanent":
        if (payload) {
          error = markReplacementPermanentFromDecision(state, payload);
        }
        break;
      case "save-now":
        saveState(state);
        break;
      case "skip-report":
        error = skipToNextReport(state, now);
        break;
      case "skip-debrief":
        error = skipToDebrief(state, now);
        break;
      case "complete-recon":
        error = completeCurrentRecon(state, now);
        break;
      case "complete-repairs":
        error = completeAllRepairs(state, now);
        break;
      case "advance-day":
        error = advanceCampaignDay(state);
        break;
      case "toggle-hidden":
        setShowHiddenValues(state, !state.debug.showHiddenValues);
        break;
      case "reset-save":
        resetState();
        state = createNewGame(Date.now());
        break;
      case "start-new-campaign":
        resetState();
        state = createNewGame(Date.now());
        break;
      case "tutorial-dismiss":
        dismissActiveTutorialStep(state);
        break;
      case "tutorial-open-tab":
        if (payload) {
          setSelectedTab(state, payload as CampaignTab);
        }
        break;
    }

    if (error) {
      state.campaign.logEntries.unshift({
        id: `ui-error-${Date.now()}`,
        at: now,
        category: "system",
        text: error
      });
    }

    sync(true);
  };

  const bind = () => {
    root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      if (element instanceof HTMLInputElement && element.type === "checkbox") {
        element.addEventListener("change", () => {
          performAction(element.dataset.action ?? "", parsePayload(element.dataset.payload ?? null));
        });
        return;
      }

      element.addEventListener("click", () => {
        performAction(element.dataset.action ?? "", parsePayload(element.dataset.payload ?? null));
      });
    });
  };

  const render = () => {
    root.innerHTML = `
      <main class="bomber-shell">
        ${renderHeader(state)}
        ${renderNotifications(state)}
        ${renderNav(state)}
        ${renderNextStepStrip(state)}
        ${renderGlobalTutorialHelp(state)}
        ${renderActivePanel(state)}
      </main>
    `;
    bind();
    acknowledgeVisibleTab(state, state.selectedTab);
  };

  render();
  saveState(state);
  window.setInterval(() => {
    sync(false);
  }, 1000);
}
