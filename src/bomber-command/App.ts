import {
  advanceCampaignDay,
  assignReplacementCrewMember,
  completeAllRepairs,
  completeCurrentRecon,
  createNewGame,
  formatTimestamp,
  getActiveMission,
  getActiveMissionCrewIds,
  getActiveRecon,
  getAircraftAvailability,
  getAircraftById,
  getCrewById,
  getCrewMembersForAircraft,
  getCurrentOperationSummary,
  getDisabledReasonForLaunch,
  getEffectiveNow,
  getGroundCrewPressureNote,
  getLatestDebriefMission,
  getLatestCompletedRecon,
  getOperationsDeskSummary,
  getReplacementPool,
  getStaffBriefingRecommendations,
  getTargetById,
  getTargetContextSummary,
  getTargetIntelAgeLabel,
  getTargetOperationalSummary,
  getUnavailablePersonnel,
  launchMission,
  loadState,
  markReplacementPermanent,
  reconcileState,
  removeReplacementCrewMember,
  resetState,
  saveState,
  setLaunchMode,
  setPlanningTarget,
  setRouteRisk,
  setScheduleDelay,
  setSelectedTab,
  setShowHiddenValues,
  skipToDebrief,
  skipToNextReport,
  startRecovery,
  startRecon,
  startRepair,
  toggleAssignedAircraft,
  toggleStandingOrder
} from "./game.js";
import type { CampaignTab, CrewMember, CrewRole, ReconType, RepairTier, SaveState, StaffRecommendation, Target } from "./types";

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
        <div class="kv"><span class="k">Directive</span><span class="v">${escapeHtml(state.campaign.commandDirective)}</span></div>
        <div class="kv"><span class="k">Campaign Day</span><span class="v">${state.campaign.currentDay}</span></div>
        <div class="kv"><span class="k">Standing</span><span class="v">${escapeHtml(state.campaign.commandStanding)}</span></div>
        <div class="kv"><span class="k">Phase</span><span class="v">${escapeHtml(state.campaign.campaignPhase)}</span></div>
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
    case "go_target_board":
      return `<button data-action="briefing-target-board" data-payload="${escapeHtml(recommendation.relatedTargetId ?? "")}">Go to Target Board</button>`;
    case "go_mission_planning":
      return `<button data-action="briefing-mission-planning" data-payload="${escapeHtml(recommendation.relatedTargetId ?? "")}">Go to Mission Planning</button>`;
    case "start_recon":
      if (!recommendation.relatedTargetId) {
        return "";
      }
      return `<button data-action="briefing-start-recon" data-payload="${escapeHtml(recommendation.relatedTargetId)}">Start Recon</button>`;
    default:
      return "";
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

function renderCommandPanel(state: SaveState): string {
  const opsLines = getOperationsDeskSummary(state);
  const briefing = getStaffBriefingRecommendations(state);
  return `
    <section class="panel stack">
      <h2>Command</h2>
      <p>${escapeHtml(state.campaign.commandDirective)}</p>
      <p>${escapeHtml(state.campaign.commandStanding)}</p>
      <p>${escapeHtml(state.campaign.campaignPhase)}</p>
      <div class="note">
        <strong>Operations Desk</strong>
        <div class="stack compact">
          ${opsLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
      </div>
      <div class="stack">
        <div>
          <strong>Staff Briefing / Commander's Desk</strong>
          <p class="muted">Recommendations are qualitative and occasionally competing. They are meant to frame the next decision, not solve it for you.</p>
        </div>
        <div class="briefing-grid">
          ${briefing.map((recommendation) => renderStaffRecommendation(recommendation)).join("")}
        </div>
      </div>
      <div class="note">
        <strong>Pending:</strong> ${state.campaign.pendingDecisions.length > 0 ? escapeHtml(state.campaign.pendingDecisions.join(" ")) : "No outstanding command note."}
      </div>
    </section>
  `;
}

function renderTargetCard(state: SaveState, target: Target): string {
  const selected = target.id === state.planning.selectedTargetId;
  const context = getTargetContextSummary(state, target.id);
  return `
    <article class="target-card ${selected ? "selected" : ""}">
      <div class="target-header">
        <div>
          <h3>${escapeHtml(target.name)}</h3>
          <p class="muted">${escapeHtml(target.region)} • ${escapeHtml(target.type)} target</p>
        </div>
        <button data-action="select-target" data-payload="${target.id}">${selected ? "Selected" : "Select Target"}</button>
      </div>
      <div class="badge-row">
        ${renderBadge("Directive", target.directiveRelevance)}
        ${renderBadge("Intel", target.intelConfidence)}
        ${renderBadge("Alert", target.alertLevel)}
      </div>
      <p>${escapeHtml(getTargetOperationalSummary(target))}</p>
      <p><strong>Weather:</strong> ${escapeHtml(target.weatherOutlook)}</p>
      <p><strong>Suspected Effect:</strong> ${escapeHtml(target.suspectedEffects)}</p>
      <p><strong>Evidence Basis:</strong> ${escapeHtml(target.evidence.slice(0, 2).join(" "))}</p>
      <p class="muted">${escapeHtml(context.lastRecon)}</p>
      <p class="muted">${escapeHtml(context.lastMission)}</p>
      <p class="muted">${escapeHtml(context.lastDebrief)}</p>
      <p class="muted">${escapeHtml(context.intelAge)}</p>
      ${target.latestIntelNote ? `<p><strong>Latest Intelligence:</strong> ${escapeHtml(target.latestIntelNote)}</p>` : ""}
      ${target.latestIntelRecommendation ? `<p class="muted">${escapeHtml(target.latestIntelRecommendation)}</p>` : ""}
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
      <p class="muted">Folders are incomplete. Assessments are qualitative and sometimes contradictory.</p>
      <div class="target-grid">
        ${state.targets.map((target) => renderTargetCard(state, target)).join("")}
      </div>
    </section>
  `;
}

function renderAircraftCrews(state: SaveState): string {
  const replacementPool = getReplacementPool(state);
  const unavailablePersonnel = getUnavailablePersonnel(state);
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
          const wounded = manifest.filter((member) => member.status === "lightly_wounded" || member.status === "seriously_wounded").length;
          const replacements = manifest.filter((member) => member.isReplacement).length;
          const missing = manifest.filter((member) => member.status === "missing" || member.status === "kia" || member.status === "pow").length;
          const missingRoles: CrewRole[] = [
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
          ].filter((role) => !manifest.some((member) => member.currentAssignmentRole === role && !["missing", "kia", "pow", "seriously_wounded"].includes(member.status))) as CrewRole[];
          return `
            <details class="row-card aircraft-detail" open>
              <summary class="aircraft-summary">
                <div>
                  <strong>${escapeHtml(aircraft.name)}</strong>
                  <div class="muted">${escapeHtml(crew?.pilotName ?? "No pilot assigned")} • ${escapeHtml(aircraft.lastCrewIssueNote)}</div>
                  <div class="muted">${wounded} wounded • ${missing} unavailable • ${replacements} replacements</div>
                  <div class="muted">Full crew manifest shown below.</div>
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
                  <p class="muted">${escapeHtml(aircraft.crewCohesion)}</p>
                  <p class="muted">Ground crew: ${escapeHtml(aircraft.assignedGroundCrewId)}</p>
                </div>
                <div class="crew-manifest-block">
                  <strong>Crew Manifest</strong>
                  <p class="muted">The following crew are currently assigned to this aircraft.</p>
                  ${manifest.sort((a, b) => (a.currentAssignmentRole ?? "").localeCompare(b.currentAssignmentRole ?? "")).map((member) => renderCrewRow(state, aircraft.id, member, airborneIds)).join("")}
                </div>
                ${missingRoles.length > 0 ? `
                  <div class="stack compact crew-problem-block">
                    <strong>Open Crew Problems</strong>
                    ${missingRoles.map((role) => `
                      <div class="manifest-row">
                        <div>
                          <strong>${escapeHtml(role.replaceAll("_", " "))}</strong>
                          <div class="muted">No fit crew member currently covers this position.</div>
                        </div>
                        <div class="button-row">
                          ${replacementPool
                            .filter((member) =>
                              member.assignedAircraftId === null
                              && ((member.role === "pilot" && (role === "pilot" || role === "copilot"))
                                || (member.role === "copilot" && role === "copilot")
                                || member.role === role
                                || (member.role === "enlisted_airman" && ["engineer_top_turret", "radio_operator", "ball_turret", "left_waist", "right_waist", "tail_gunner"].includes(role)))
                            )
                            .map((member) => `
                              <button data-action="assign-replacement" data-payload="${member.id}:${aircraft.id}:${role}">
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
            <div class="row-card">
              <div>
                <strong>${escapeHtml(member.name)}</strong>
                <div class="muted">${escapeHtml(roleOrSpecialty(member.role))}</div>
                <div class="muted">${escapeHtml(member.notes)}</div>
              </div>
              <div class="badge-row">
                ${renderBadge("Status", member.status.replaceAll("_", " "))}
                ${renderBadge("Experience", member.experience)}
              </div>
            </div>
          `).join("")}
        </div>
        <div class="stack">
          <h3>Medical / Unavailable Personnel</h3>
          ${unavailablePersonnel.length === 0 ? `<p class="muted">No crew members are currently unavailable.</p>` : unavailablePersonnel.map((member) => `
            <div class="row-card">
              <div>
                <strong>${escapeHtml(member.name)}</strong>
                <div class="muted">${escapeHtml(member.currentAssignmentRole ? member.currentAssignmentRole.replaceAll("_", " ") : roleOrSpecialty(member.role))}</div>
                <div class="muted">${escapeHtml(member.notes)}</div>
              </div>
              <div class="badge-row">
                ${renderBadge("Status", member.status.replaceAll("_", " "))}
                ${renderBadge("Fatigue", member.fatigue)}
                ${renderBadge("Morale", member.morale)}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPlanning(state: SaveState): string {
  const selectedTarget = getTargetById(state, state.planning.selectedTargetId);
  const launchDisabled = getDisabledReasonForLaunch(state);
  return `
    <section class="panel stack">
      <h2>Mission Planning</h2>
      <p>${escapeHtml(selectedTarget ? `Selected target: ${selectedTarget.name}. ${selectedTarget.assessedCondition}` : "No target selected.")}</p>
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
          ${Object.entries(state.planning.standingOrders).map(([key, value]) => `
            <label class="check-row">
              <input type="checkbox" data-action="standing-order" data-payload="${key}" ${value ? "checked" : ""} />
              <span>${escapeHtml(key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()))}</span>
            </label>
          `).join("")}
        </div>
      </div>
      <div class="control-group">
        <span class="label">Aircraft Assignment</span>
        <div class="assignment-list">
          ${state.aircraft.map((aircraft) => {
            const crew = getCrewById(state, aircraft.assignedCrewId);
            const availability = getAircraftAvailability(state, aircraft.id);
            const checked = state.planning.assignedAircraftIds.includes(aircraft.id);
            return `
              <label class="assignment-row ${availability.level}">
                <input
                  type="checkbox"
                  data-action="toggle-aircraft"
                  data-payload="${aircraft.id}"
                  ${checked ? "checked" : ""}
                  ${availability.level === "unavailable" ? "disabled" : ""}
                />
                <span class="assignment-title">${escapeHtml(aircraft.name)} • ${escapeHtml(crew?.pilotName ?? "Unknown crew")}</span>
                <span class="assignment-meta">${escapeHtml(availability.reason)}</span>
                <span class="assignment-meta">${escapeHtml(aircraft.crewCohesion)}</span>
                ${availability.warnings.length > 0 ? `<span class="warning">${escapeHtml(availability.warnings.join(" "))}</span>` : ""}
              </label>
            `;
          }).join("")}
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
        ${renderBadge("Route", mission.plan.routeRisk)}
        ${renderBadge("Assigned", String(mission.plan.assignedAircraftIds.length))}
      </div>
      <p><strong>Target:</strong> ${escapeHtml(getTargetById(state, mission.plan.targetId)?.name ?? "Unknown")}</p>
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
  return `
    <section class="panel stack">
      <h2>Debrief: ${escapeHtml(target?.name ?? "Unknown target")}</h2>
      <p><strong>Mission time:</strong> ${escapeHtml(formatTimestamp(state, mission.plan.scheduledLaunchTime))}</p>
      <p><strong>Mission summary:</strong> ${escapeHtml(mission.resultSummary)}</p>
      <p>${escapeHtml(mission.debrief)}</p>
      ${mission.debriefCasualtyLines.length > 0 ? `
        <div class="stack compact">
          <strong>Crew Consequences</strong>
          ${mission.debriefCasualtyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
      ` : `<p class="muted">No specific crew casualties have been filed beyond fatigue and strain.</p>`}
      <p><strong>Target assessment:</strong> ${escapeHtml(target?.assessedCondition ?? "No reliable assessment.")}</p>
      <p><strong>Evidence:</strong> ${escapeHtml(target?.evidence.slice(0, 4).join(" ") ?? "No evidence filed.")}</p>
      <div class="button-row">
        <button data-action="quick-recon" data-payload="${target?.id ?? ""}" ${state.campaign.activeReconId ? "disabled" : ""}>Order Post-Strike Recon</button>
        ${state.campaign.activeReconId ? `<span class="disabled-reason">Recon section already occupied</span>` : ""}
      </div>
    </section>
  `;
}

function renderMaintenance(state: SaveState): string {
  const damagedAircraft = state.aircraft.filter((aircraft) => aircraft.status === "damaged" || aircraft.status === "under_repair");
  const divertedAircraft = state.aircraft.filter((aircraft) => aircraft.status === "diverted" || aircraft.recoveryJobId);
  return `
    <section class="panel stack">
      <h2>Maintenance</h2>
      ${damagedAircraft.length === 0 ? `
        <p>No damaged aircraft selected.</p>
        <div class="disabled-reason">No damaged aircraft selected</div>
      ` : damagedAircraft.map((aircraft) => {
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
      <div class="stack">
        <h3>Away From Station</h3>
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
    </section>
  `;
}

function renderRecon(state: SaveState): string {
  const activeRecon = getActiveRecon(state);
  const latestRecon = getLatestCompletedRecon(state);
  const latestIntel = state.campaign.latestIntelUpdate;
  const selectedTarget = getTargetById(state, state.planning.selectedTargetId);
  return `
    <section class="panel stack">
      <h2>Recon / Intelligence</h2>
      <p><strong>Current recon focus:</strong> ${escapeHtml(selectedTarget?.name ?? "No target selected")}</p>
      ${selectedTarget ? `<p class="muted">${escapeHtml(selectedTarget.assessedCondition)}</p>` : ""}
      <p class="muted">Recon section can service one group priority at a time. Other theater reconnaissance continues outside your direct control.</p>
      ${latestIntel ? `
        <div class="row-card">
          <strong>Latest Intelligence Update</strong>
          <div class="badge-row">
            ${renderBadge("Target", latestIntel.targetName)}
            ${renderBadge("Result", latestIntel.resultQuality)}
            ${renderBadge("Alert", latestIntel.alertLevel)}
          </div>
          <p>${escapeHtml(latestIntel.assessment)}</p>
          <p><strong>Evidence:</strong> ${escapeHtml(latestIntel.evidence)}</p>
          <p class="muted">${escapeHtml(latestIntel.recommendation)}</p>
          ${state.debug.showHiddenValues ? `<p class="muted">Filed ${escapeHtml(formatTimestamp(state, latestIntel.updatedAt))}</p>` : ""}
        </div>
      ` : `<p class="muted">No recent intelligence update has been filed yet.</p>`}
      ${activeRecon ? `
        <p>${escapeHtml(activeRecon.resultText)}</p>
        <div class="badge-row">
          ${renderBadge("Status", activeRecon.status)}
          ${renderBadge("Type", activeRecon.type.replaceAll("_", " "))}
        </div>
        <p><strong>Interpretation due:</strong> ${escapeHtml(renderDueTime(state, activeRecon.interpretedAt))}</p>
      ` : `
        <p>No active recon.</p>
        <div class="button-row">
          <button data-action="recon" data-payload="${selectedTarget?.id ?? ""}:pre_strike" ${selectedTarget ? "" : "disabled"}>Pre-Strike Recon</button>
          <button data-action="recon" data-payload="${selectedTarget?.id ?? ""}:weather_route" ${selectedTarget ? "" : "disabled"}>Weather / Route Recon</button>
          <button data-action="recon" data-payload="${selectedTarget?.id ?? ""}:focused_followup" ${selectedTarget ? "" : "disabled"}>Focused Follow-Up</button>
        </div>
      `}
      ${selectedTarget ? `<p class="muted">Current recon focus: ${escapeHtml(selectedTarget.name)}</p>` : ""}
      ${latestRecon ? `<p class="muted">Latest completed sortie: ${escapeHtml(latestRecon.type.replaceAll("_", " "))}.</p>` : ""}
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
            <p>${escapeHtml(entry.text)}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
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
          state.selectedTab = "mission-planning";
        }
        break;
      case "briefing-target-board":
        if (payload) {
          setPlanningTarget(state, payload);
        }
        state.selectedTab = "target-board";
        break;
      case "briefing-mission-planning":
        if (payload) {
          setPlanningTarget(state, payload);
        }
        state.selectedTab = "mission-planning";
        break;
      case "briefing-start-recon":
        if (payload) {
          setPlanningTarget(state, payload);
          error = startRecon(state, payload, "pre_strike", now);
          if (!error) {
            state.selectedTab = "recon";
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
        advanceCampaignDay(state);
        break;
      case "toggle-hidden":
        setShowHiddenValues(state, !state.debug.showHiddenValues);
        break;
      case "reset-save":
        resetState();
        state = createNewGame(Date.now());
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
        ${renderActivePanel(state)}
      </main>
    `;
    bind();
  };

  render();
  saveState(state);
  window.setInterval(() => {
    sync(false);
  }, 1000);
}
