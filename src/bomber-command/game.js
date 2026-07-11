export const SAVE_KEY = "bomber-command-save-v1";
export const SAVE_VERSION = 3;
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
const CREW_ROLES = [
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
const REQUIRED_ROLES = ["pilot", "copilot", "navigator", "bombardier"];
const ENLISTED_ROLE_SET = new Set([
    "engineer_top_turret",
    "radio_operator",
    "ball_turret",
    "left_waist",
    "right_waist",
    "tail_gunner"
]);
const TARGET_DEFS = [
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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
}
function chance(value) {
    return Math.random() < value;
}
function qualitativeBand(value, thresholds, fallback) {
    for (const [threshold, text] of thresholds) {
        if (value >= threshold) {
            return text;
        }
    }
    return fallback;
}
function nextId(state, prefix) {
    const id = `${prefix}-${state.nextId}`;
    state.nextId += 1;
    return id;
}
function addLog(state, id, at, category, text) {
    if (state.campaign.logEntries.some((entry) => entry.id === id)) {
        return;
    }
    state.campaign.logEntries.unshift({ id, at, category, text });
}
function addNotification(state, id, kind, text, now) {
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
function pruneExpiredNotifications(state, now) {
    const next = state.notifications.filter((notification) => notification.expiresAt > now);
    if (next.length === state.notifications.length) {
        return false;
    }
    state.notifications = next;
    return true;
}
function createStationWeather(day) {
    const outlooks = [
        "Station weather: fair, but coastal haze is likely by midday.",
        "Station weather: low cloud is moving in and inland visibility remains uncertain.",
        "Station weather: a clear start is expected, though staff distrusts older target forecasts.",
        "Station weather: broken cloud may complicate recon interpretation later in the day."
    ];
    return outlooks[(day - 1) % outlooks.length];
}
function randomName() {
    return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}
function rankForRole(role) {
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
function roleLabel(role) {
    return role.replaceAll("_", " ");
}
function experienceMod(experience) {
    if (experience === "veteran") {
        return -10;
    }
    if (experience === "green") {
        return 9;
    }
    return 0;
}
function fatigueRisk(fatigue) {
    if (fatigue === "exhausted") {
        return 16;
    }
    if (fatigue === "tired") {
        return 7;
    }
    return 0;
}
function shiftFatigue(fatigue, steps) {
    const ladder = ["rested", "tired", "exhausted"];
    return ladder[clamp(ladder.indexOf(fatigue) + steps, 0, ladder.length - 1)];
}
function recoverFatigue(fatigue, steps) {
    const ladder = ["rested", "tired", "exhausted"];
    return ladder[clamp(ladder.indexOf(fatigue) - steps, 0, ladder.length - 1)];
}
function lowerMorale(morale) {
    if (morale === "steady") {
        return "shaken";
    }
    if (morale === "shaken") {
        return "brittle";
    }
    return "brittle";
}
function raiseConfidence(confidence) {
    if (confidence === "poor") {
        return "fair";
    }
    return "good";
}
function defenseText(level) {
    return qualitativeBand(level, [
        [72, "heavy"],
        [55, "moderate"],
        [40, "noticeable"]
    ], "light");
}
function alertText(level) {
    if (level === "high") {
        return "high";
    }
    if (level === "elevated") {
        return "elevated";
    }
    return "low";
}
function conditionSummary(hiddenCondition, status) {
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
function targetConditionText(target) {
    const actual = target.hiddenActualCondition;
    if (target.intelConfidence === "poor") {
        return qualitativeBand(actual, [
            [80, "Believed largely intact. Reliable strike evidence is lacking."],
            [60, "Possibly disturbed, though useful damage is unconfirmed."],
            [35, "Crews suspect visible damage, but operations has no reliable assessment."]
        ], "The target may be seriously affected, though present information is contradictory.");
    }
    if (target.intelConfidence === "fair") {
        return qualitativeBand(actual, [
            [80, "Believed operational, though some disruption is possible."],
            [60, "Probably affected in places, but likely still working."],
            [35, "Probably damaged with visible interruption to normal activity."]
        ], "Damage appears serious, though the full operational effect remains uncertain.");
    }
    return qualitativeBand(actual, [
        [80, "Recon believes the target remains substantially operational."],
        [60, "Recon judges the target partly impaired."],
        [35, "Recon reports clear and probably effective damage."]
    ], "Recon considers the target heavily affected.");
}
function missionDurationForTarget(target) {
    return target.type === "factory" || target.type === "defense" ? MAJOR_MISSION_MS : SHORT_MISSION_MS;
}
function createPlanningState(targetId) {
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
function stageReport(stage, target, riskWord, visibility) {
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
export function getEffectiveNow(state) {
    return Date.now() + state.debug.clockOffsetMs;
}
export function formatTimestamp(state, timestamp) {
    const display = new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
    return `Day ${state.campaign.currentDay}, ${display}`;
}
function fuzzyTimeUntil(now, timestamp, exact) {
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
function createCrewMember(state, role, assignedAircraftId, originalAircraftId, nameOverride) {
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
function assignCrewMemberToAircraft(member, aircraftId, role) {
    member.assignedAircraftId = aircraftId;
    member.currentAssignmentRole = role;
    member.status = member.status === "unassigned" ? "fit" : member.status;
    member.notes = member.isReplacement
        ? "Assigned from the replacement pool and still settling with the crew."
        : member.notes;
}
function ensureAircraftRoleAssignments(state) {
    for (const aircraft of state.aircraft) {
        aircraft.assignedCrewMemberIds = state.crewMembers
            .filter((member) => member.assignedAircraftId === aircraft.id)
            .map((member) => member.id);
    }
}
function deriveCrewSummaryForAircraft(state, aircraft) {
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
    const status = missingCount > 0
        ? "missing"
        : woundedCount > 0
            ? "lightly_wounded"
            : fatigueScore > 6
                ? "resting"
                : "fit";
    const fatigue = fatigueScore >= 8 ? "exhausted" : fatigueScore >= 3 ? "tired" : "rested";
    const morale = manifest.some((member) => member.morale === "brittle")
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
function syncDerivedCrews(state) {
    state.crews = state.aircraft.map((aircraft) => deriveCrewSummaryForAircraft(state, aircraft));
}
function createInitialCrewManifest(state, aircraftId, pilotName) {
    return CREW_ROLES.map((role, index) => {
        const roleType = role;
        const member = createCrewMember(state, roleType, aircraftId, aircraftId, role === "pilot" ? pilotName : undefined);
        member.experience =
            role === "pilot" && index === 0 ? "veteran" : chance(0.2) ? "green" : "regular";
        return member;
    });
}
function createReplacementPool(state) {
    const roles = [
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
function buildAircraftIssueNote(state, aircraft) {
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
export function createNewGame(now) {
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
            stationWeather: createStationWeather(1),
            latestIntelUpdate: null
        },
        aircraft: [],
        crews: [],
        crewMembers: [],
        groundCrews: [
            {
                id: "ground-1",
                chiefName: GROUND_CREW_NAMES[0],
                specialty: "quick_patch",
                fatigue: "rested",
                assignedAircraftIds: ["aircraft-1", "aircraft-2", "aircraft-3"],
                notes: "Known for getting damaged ships turned around quickly, though not always gently."
            },
            {
                id: "ground-2",
                chiefName: GROUND_CREW_NAMES[1],
                specialty: "careful_inspection",
                fatigue: "rested",
                assignedAircraftIds: ["aircraft-4", "aircraft-5", "aircraft-6"],
                notes: "Slow and methodical. Engineering trusts this crew when a proper look is needed."
            }
        ],
        targets: [],
        missions: [],
        repairJobs: [],
        recoveryJobs: [],
        reconMissions: [],
        notifications: [],
        planning: createPlanningState("target-1"),
        debug: {
            showHiddenValues: false,
            clockOffsetMs: 0
        }
    };
    state.aircraft = AIRCRAFT_NAMES.map((name, index) => ({
        id: `aircraft-${index + 1}`,
        name,
        status: index === 4 ? "damaged" : "serviceable",
        conditionSummary: index === 4
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
    state.targets[0].connectedTargetIds = ["target-2", "target-5"];
    state.targets[1].connectedTargetIds = ["target-1", "target-3"];
    state.targets[2].connectedTargetIds = ["target-1"];
    state.targets[3].connectedTargetIds = ["target-5"];
    state.targets[4].connectedTargetIds = ["target-1", "target-4"];
    for (const aircraft of state.aircraft) {
        const pilotName = aircraft.id === "aircraft-1"
            ? PILOT_NAMES[0]
            : aircraft.id === "aircraft-2"
                ? PILOT_NAMES[1]
                : aircraft.id === "aircraft-3"
                    ? PILOT_NAMES[2]
                    : aircraft.id === "aircraft-4"
                        ? PILOT_NAMES[3]
                        : aircraft.id === "aircraft-5"
                            ? PILOT_NAMES[4]
                            : PILOT_NAMES[5];
        const manifest = createInitialCrewManifest(state, aircraft.id, pilotName);
        state.crewMembers.push(...manifest);
    }
    state.crewMembers.push(...createReplacementPool(state));
    ensureAircraftRoleAssignments(state);
    for (const aircraft of state.aircraft) {
        aircraft.lastCrewIssueNote = buildAircraftIssueNote(state, aircraft);
    }
    syncDerivedCrews(state);
    state.planning = createPlanningState(state.targets[0].id);
    addLog(state, "boot-directive", now, "command", "Group Headquarters has received a directive to ease fighter pressure around Bremen.");
    addLog(state, "boot-warning", now, "operations", "Intelligence reminds staff that current target folders are incomplete and should not be treated as exact.");
    return state;
}
function migrateLegacyState(parsed) {
    const baseline = createNewGame(Date.now());
    const state = parsed;
    state.version = SAVE_VERSION;
    state.campaign ||= baseline.campaign;
    state.campaign.stationWeather ||= createStationWeather(state.campaign.currentDay ?? 1);
    state.campaign.latestIntelUpdate ??= null;
    state.notifications ??= [];
    state.recoveryJobs ??= [];
    state.targets ??= baseline.targets;
    for (const target of state.targets) {
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
                    const legacyStatus = legacyCrew.status;
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
        member.currentAssignmentRole ??= member.role === "enlisted_airman" ? null : member.role;
    }
    for (const mission of state.missions ?? []) {
        mission.debriefCasualtyLines ??= [];
        mission.plan.launchCrewManifests ??= [];
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
    for (const recon of state.reconMissions ?? []) {
        recon.resultQuality ??= "partial";
        recon.recommendation ??= "Staff recommends treating the result cautiously.";
    }
    ensureAircraftRoleAssignments(state);
    for (const aircraft of state.aircraft) {
        aircraft.lastCrewIssueNote = buildAircraftIssueNote(state, aircraft);
    }
    syncDerivedCrews(state);
    return state;
}
export function loadState() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        return migrateLegacyState(parsed);
    }
    catch (error) {
        console.warn("Failed to load bomber command save", error);
        return null;
    }
}
export function saveState(state) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
export function resetState() {
    localStorage.removeItem(SAVE_KEY);
}
export function getTargetById(state, targetId) {
    return state.targets.find((target) => target.id === targetId);
}
export function getCrewById(state, crewId) {
    return state.crews.find((crew) => crew.id === crewId);
}
export function getAircraftById(state, aircraftId) {
    return state.aircraft.find((aircraft) => aircraft.id === aircraftId);
}
export function getCrewMemberById(state, crewMemberId) {
    return state.crewMembers.find((member) => member.id === crewMemberId);
}
function getGroundCrewById(state, groundCrewId) {
    return state.groundCrews.find((crew) => crew.id === groundCrewId);
}
export function getCrewMembersForAircraft(state, aircraftId) {
    return state.crewMembers.filter((member) => member.assignedAircraftId === aircraftId);
}
export function getReplacementPool(state) {
    return state.crewMembers.filter((member) => member.isReplacement && member.assignedAircraftId === null);
}
export function getUnavailablePersonnel(state) {
    return state.crewMembers.filter((member) => member.status !== "fit" && member.status !== "unassigned");
}
function canRoleFly(member) {
    return member.status === "fit" || member.status === "resting";
}
function isRoleCompatible(member, role) {
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
function getMemberAssignedToRole(state, aircraftId, role) {
    return getCrewMembersForAircraft(state, aircraftId).find((member) => member.currentAssignmentRole === role);
}
function getMissingRoles(state, aircraftId) {
    return CREW_ROLES.filter((role) => {
        const member = getMemberAssignedToRole(state, aircraftId, role);
        return !member || !canRoleFly(member);
    });
}
function getCompatibleReplacements(state, role) {
    return getReplacementPool(state).filter((member) => isRoleCompatible(member, role) && member.status === "unassigned");
}
function syncAircraftCrewNotes(state, aircraftId) {
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
function updateAllDerivedCrewState(state) {
    for (const aircraft of state.aircraft) {
        syncAircraftCrewNotes(state, aircraft.id);
    }
    syncDerivedCrews(state);
}
export function getActiveMission(state) {
    if (!state.campaign.activeMissionId) {
        return undefined;
    }
    return state.missions.find((mission) => mission.id === state.campaign.activeMissionId);
}
export function getLatestDebriefMission(state) {
    if (!state.campaign.lastDebriefMissionId) {
        return undefined;
    }
    return state.missions.find((mission) => mission.id === state.campaign.lastDebriefMissionId);
}
export function getActiveRecon(state) {
    if (!state.campaign.activeReconId) {
        return undefined;
    }
    return state.reconMissions.find((recon) => recon.id === state.campaign.activeReconId);
}
export function getLatestCompletedRecon(state) {
    return state.reconMissions.find((recon) => recon.completionApplied);
}
export function getActiveMissionCrewIds(state) {
    const mission = getActiveMission(state);
    if (!mission) {
        return [];
    }
    return mission.plan.launchCrewManifests.flatMap((snapshot) => snapshot.crewMemberIds);
}
function getActiveFieldJobForGroundCrew(state, groundCrewId) {
    return state.repairJobs.find((job) => job.groundCrewId === groundCrewId && !job.completionApplied)
        ?? state.recoveryJobs.find((job) => job.groundCrewId === groundCrewId && !job.completionApplied);
}
export function setSelectedTab(state, tab) {
    state.selectedTab = tab;
}
export function setPlanningTarget(state, targetId) {
    state.planning.selectedTargetId = targetId;
}
export function toggleAssignedAircraft(state, aircraftId) {
    const availability = getAircraftAvailability(state, aircraftId);
    if (availability.level === "unavailable") {
        return;
    }
    if (state.planning.assignedAircraftIds.includes(aircraftId)) {
        state.planning.assignedAircraftIds = state.planning.assignedAircraftIds.filter((id) => id !== aircraftId);
        return;
    }
    state.planning.assignedAircraftIds = [...state.planning.assignedAircraftIds, aircraftId];
}
export function setRouteRisk(state, routeRisk) {
    state.planning.routeRisk = routeRisk;
}
export function toggleStandingOrder(state, key) {
    state.planning.standingOrders[key] = !state.planning.standingOrders[key];
}
export function setLaunchMode(state, mode) {
    state.planning.launchMode = mode;
}
export function setScheduleDelay(state, delayMs) {
    state.planning.scheduleDelayMs = delayMs;
}
export function setShowHiddenValues(state, show) {
    state.debug.showHiddenValues = show;
}
export function assignReplacementCrewMember(state, crewMemberId, aircraftId, role) {
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
    const existing = getMemberAssignedToRole(state, aircraftId, role);
    if (existing && canRoleFly(existing) && existing.status !== "unassigned") {
        return `${roleLabel(role)} is already covered on this aircraft.`;
    }
    assignCrewMemberToAircraft(member, aircraftId, role);
    member.notes = `Assigned as ${roleLabel(role)} replacement on ${getAircraftById(state, aircraftId)?.name ?? "the aircraft"}.`;
    updateAllDerivedCrewState(state);
    return null;
}
export function removeReplacementCrewMember(state, crewMemberId) {
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
export function markReplacementPermanent(state, crewMemberId) {
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
function currentIntelAge(state, target) {
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
export function getTargetIntelAgeLabel(state, targetId) {
    const target = getTargetById(state, targetId);
    return target ? currentIntelAge(state, target) : "unknown";
}
function countMissingGunners(state, aircraftId) {
    return [
        "ball_turret",
        "left_waist",
        "right_waist",
        "tail_gunner"
    ].filter((role) => {
        const member = getMemberAssignedToRole(state, aircraftId, role);
        return !member || !canRoleFly(member);
    }).length;
}
export function getAircraftAvailability(state, aircraftId) {
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
    const warnings = [];
    for (const role of REQUIRED_ROLES) {
        const member = getMemberAssignedToRole(state, aircraftId, role);
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
    }
    const engineer = getMemberAssignedToRole(state, aircraftId, "engineer_top_turret");
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
        ? { level: "marginal", label: "Marginal", reason: warnings[0], warnings }
        : { level: "available", label: "Available", reason: "Full crew fit enough for tasking", warnings: [] };
}
function crewReadinessSummary(state) {
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
function updateVisibleTargetAssessment(target, assessment, evidence, sourceLabel, recommendation, at) {
    target.assessedCondition = assessment;
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
function snapshotAircraftCrew(state, aircraftId) {
    const members = CREW_ROLES.map((role) => {
        const assigned = getMemberAssignedToRole(state, aircraftId, role);
        if (!assigned) {
            return null;
        }
        const replacementStatusAtLaunch = assigned.isReplacement
            ? assigned.isPermanentReplacement
                ? "permanent_replacement"
                : "temporary_replacement"
            : "original";
        return {
            crewMemberId: assigned.id,
            roleAtLaunch: role,
            replacementStatusAtLaunch
        };
    }).filter((item) => item !== null);
    return {
        aircraftId,
        crewMemberIds: members.map((member) => member.crewMemberId),
        members
    };
}
function defaultCrewEffect(member, roleAtLaunch) {
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
function crewDamageBias(role) {
    if (role === "pilot" || role === "copilot") {
        return 0.75;
    }
    if (role === "navigator" || role === "bombardier") {
        return 0.85;
    }
    return 1.1;
}
function createCrewEffectsForOutcome(state, snapshot, participation, outcomeRisk, now) {
    const effects = [];
    const summary = [];
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
        }
        else if (chance(outcomeRisk * 0.1 * crewDamageBias(memberSnapshot.roleAtLaunch))) {
            effect.status = "seriously_wounded";
            effect.injurySeverity = "serious";
            effect.fatigue = "exhausted";
            effect.morale = lowerMorale(effect.morale);
            effect.recoveryAvailableAt = now + LIGHT_WOUND_RECOVERY_MS * 4;
            effect.note = `${member.name} was seriously wounded during the mission.`;
            summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} seriously wounded.`);
        }
        else if (chance(outcomeRisk * 0.18 * crewDamageBias(memberSnapshot.roleAtLaunch))) {
            effect.status = "lightly_wounded";
            effect.injurySeverity = "light";
            effect.fatigue = "tired";
            effect.morale = lowerMorale(effect.morale);
            effect.recoveryAvailableAt = now + LIGHT_WOUND_RECOVERY_MS;
            effect.note = `${member.name} returned lightly wounded and will need brief medical recovery.`;
            summary.push(`${roleLabel(memberSnapshot.roleAtLaunch)} ${member.name} lightly wounded.`);
        }
        else if (participation === "diverted") {
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
function buildMission(state, now) {
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
    const stageTimes = {
        takeoff: launchTime,
        assembly: launchTime + duration * 0.14,
        outbound: launchTime + duration * 0.34,
        target_area: launchTime + duration * 0.56,
        withdrawal: launchTime + duration * 0.72,
        recovery: launchTime + duration * 0.9,
        debrief_ready: launchTime + duration
    };
    const visibility = chance((target.hiddenWeatherRisk + (state.planning.standingOrders.useSecondaryIfObscured ? -5 : 5)) / 100)
        ? "obscured"
        : chance(0.45)
            ? "broken"
            : "clear";
    const avgCondition = assignedAircraftIds.reduce((sum, aircraftId) => sum + (getAircraftById(state, aircraftId)?.hiddenCondition ?? 70), 0) / assignedAircraftIds.length;
    const avgFatigue = assignedAircraftIds.reduce((sum, aircraftId) => {
        const manifest = getCrewMembersForAircraft(state, aircraftId);
        return sum + manifest.reduce((inner, member) => inner + (member.fatigue === "exhausted" ? 2 : member.fatigue === "tired" ? 1 : 0), 0) / Math.max(1, manifest.length);
    }, 0) / assignedAircraftIds.length;
    const riskBase = target.hiddenDefenseLevel + (state.planning.routeRisk === "cautious" ? -9 : state.planning.routeRisk === "direct" ? 11 : 0) + (100 - avgCondition) * 0.35 + avgFatigue * 7;
    const launchCrewManifests = assignedAircraftIds.map((aircraftId) => snapshotAircraftCrew(state, aircraftId));
    const outcomes = [];
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
        const outcomeRisk = clamp((riskBase + (100 - aircraft.hiddenCondition) * 0.45 + fatigueRisk(pilot?.fatigue ?? "rested") + experienceMod(pilot?.experience ?? "regular")) / 100, 0.1, 0.96);
        const abortChance = clamp((68 - aircraft.hiddenCondition) / 180 + (pilot?.fatigue === "exhausted" ? 0.08 : 0), 0, 0.35);
        let participation = "full";
        let finalStatus = "serviceable";
        let damageDelta = Math.round(4 + outcomeRisk * 18 + Math.random() * 12);
        let note = "Returned without confirmed major incident.";
        let contributedToStrike = true;
        if (chance(abortChance)) {
            participation = "aborted";
            finalStatus = "damaged";
            damageDelta = Math.round(8 + Math.random() * 8);
            note = "Dropped out before the main attack after mechanical trouble was reported.";
            contributedToStrike = false;
        }
        else if (chance(outcomeRisk * 0.14)) {
            participation = "lost";
            finalStatus = "lost";
            damageDelta = 100;
            note = "Failed to return and is now listed as missing after the operation.";
        }
        else if (chance(outcomeRisk * 0.24)) {
            participation = "diverted";
            finalStatus = chance(0.45) ? "diverted" : "damaged";
            damageDelta = Math.round(18 + Math.random() * 16);
            note = finalStatus === "diverted"
                ? "Reported down at an outlying strip after a rough return."
                : "Returned damaged and will require more than a quick patch.";
        }
        else if (chance(outcomeRisk * 0.44)) {
            finalStatus = "damaged";
            damageDelta = Math.round(10 + Math.random() * 12);
            note = "Returned with visible damage and several uncertain maintenance complaints.";
        }
        else {
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
    const targetDamage = clamp(Math.round(contributed * (8 + Math.random() * 5) * visibilityPenalty), 6, 42);
    const targetAssessment = visibility === "obscured"
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
    const stages = [
        "takeoff",
        "assembly",
        "outbound",
        "target_area",
        "withdrawal",
        "recovery",
        "debrief_ready"
    ];
    const riskWord = defenseText(target.hiddenDefenseLevel);
    const timelineEvents = stages.map((stage) => {
        const report = stageReport(stage, target, riskWord, visibility);
        const hiddenEffects = [];
        if (stage === "assembly") {
            outcomes.forEach((outcome, index) => {
                if (outcome.participation === "aborted") {
                    hiddenEffects.push({ kind: "apply_aircraft_outcome", aircraftId: outcome.aircraftId, outcomeIndex: index });
                }
            });
        }
        if (stage === "target_area") {
            hiddenEffects.push({ kind: "apply_target_damage", targetId: target.id });
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
            publicReportText: report.text,
            confidence: report.confidence,
            source: report.source,
            applied: false,
            revealed: false
        };
    });
    return {
        id: nextId(state, "mission"),
        plan: {
            targetId: target.id,
            assignedAircraftIds,
            scheduledLaunchTime: launchTime,
            routeRisk: state.planning.routeRisk,
            standingOrders: { ...state.planning.standingOrders },
            status: launchTime > now ? "scheduled" : "launched",
            launchCrewManifests
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
            targetSuspectedEffects: targetDamage >= 24
                ? "Staff believes the target may be materially hindered for a time."
                : "Some disruption is possible, though the operational effect is still uncertain.",
            aircraftOutcomes: outcomes
        }
    };
}
function updateMissionParticipantsOnLaunch(state, mission) {
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
export function launchMission(state, now) {
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
    addLog(state, `mission-launch-${mission.id}`, now, "operations", `A strike has been ordered against ${target?.name ?? "the selected target"} with ${mission.plan.assignedAircraftIds.length} aircraft.`);
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
function applyAircraftOutcome(state, mission, outcomeIndex) {
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
    }
    else {
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
function applyCrewOutcome(state, mission, outcomeIndex) {
    if (outcomeIndex === undefined) {
        return;
    }
    const outcome = mission.hiddenOutcome.aircraftOutcomes[outcomeIndex];
    if (!outcome) {
        return;
    }
    for (const effect of outcome.crewEffects) {
        const member = getCrewMemberById(state, effect.crewMemberId);
        if (!member || member.notes === effect.note) {
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
function generateDebrief(state, mission) {
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
    mission.debriefCasualtyLines = mission.hiddenOutcome.aircraftOutcomes.flatMap((outcome) => {
        const aircraft = getAircraftById(state, outcome.aircraftId);
        return outcome.casualtySummary.map((line) => `${aircraft?.name ?? outcome.aircraftId}: ${line}`);
    });
    mission.debrief = [
        `Crews report ${mission.hiddenOutcome.targetAssessment}`,
        `Aircraft accounting remains imperfect, but current reports indicate ${damagedCount} damaged return${damagedCount === 1 ? "" : "s"}, ${divertedCount} diverted, and ${lostCount} missing or lost.`,
        target.suspectedEffects
    ].join(" ");
    mission.debriefGenerated = true;
    mission.status = "complete";
    mission.stage = "complete";
    updateVisibleTargetAssessment(target, mission.hiddenOutcome.targetAssessment, mission.hiddenOutcome.targetEvidence, "Debrief assessment", "Staff recommends weighing a reattack against fresh reconnaissance.", state.lastReconciledAt);
    target.suspectedEffects = mission.hiddenOutcome.targetSuspectedEffects;
    target.lastMissionSummary = mission.resultSummary;
    target.lastMissionAt = state.lastReconciledAt;
    target.lastDebriefSummary = mission.debrief;
    target.lastDebriefAt = state.lastReconciledAt;
    state.campaign.activeMissionId = null;
    state.campaign.lastDebriefMissionId = mission.id;
    state.campaign.campaignPhase = "Debrief filed. Engineering and intelligence await your next order.";
    state.campaign.commandStanding = "Staff recommends weighing the debrief against the temptation to strike again immediately.";
    state.campaign.pendingDecisions = ["Review damage, start repairs, or order recon."];
    state.campaign.stationWeather = createStationWeather(state.campaign.currentDay + mission.hiddenOutcome.targetDamage % 3);
    addLog(state, `debrief-${mission.id}`, state.lastReconciledAt, "debrief", mission.debrief);
}
function severityFromDamage(damage) {
    if (damage >= 26) {
        return "serious";
    }
    if (damage >= 14) {
        return "useful";
    }
    return "limited";
}
function applyTargetDamage(state, mission) {
    const target = getTargetById(state, mission.plan.targetId);
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
    }
    else if (chance(0.35)) {
        target.alertLevel = "high";
    }
}
function applyMissionEffect(state, mission, effect) {
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
function applyMissionEvent(state, mission, event) {
    if (!event.revealed) {
        event.revealed = true;
        mission.reports.push(event.publicReportText);
        addLog(state, `report-${event.id}`, event.time, "report", event.publicReportText);
        addNotification(state, `toast-report-${event.id}`, event.stage === "debrief_ready" ? "debrief" : "report", event.stage === "debrief_ready" ? "Debrief ready" : `New report received: ${event.stage.replaceAll("_", " ")}`, event.time);
    }
    if (event.applied) {
        return;
    }
    mission.stage = event.stage;
    if (event.stage === "recovery") {
        mission.status = "recovering";
    }
    else if (event.stage === "debrief_ready") {
        mission.status = "complete";
    }
    else if (event.stage !== "scheduled") {
        mission.status = "launched";
    }
    for (const effect of event.hiddenEffects) {
        applyMissionEffect(state, mission, effect);
    }
    event.applied = true;
}
function completeRepair(state, job) {
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
function completeRecovery(state, job) {
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
function completeRecon(state, recon) {
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
    updateVisibleTargetAssessment(target, recon.hiddenAssessment, [recon.hiddenEvidence], "Recon interpretation", recon.recommendation, recon.interpretedAt);
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
    addLog(state, `recon-${recon.id}`, recon.interpretedAt, "recon", recon.resultText);
    addNotification(state, `toast-recon-${recon.id}`, "recon", "Recon interpretation filed", recon.interpretedAt);
}
function applyFatigueRecovery(state, elapsedMs, now) {
    const steps = Math.floor(elapsedMs / FATIGUE_RECOVERY_MS);
    let changed = false;
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
        }
        if (previousFatigue !== member.fatigue || previousStatus !== member.status) {
            changed = true;
        }
    }
    if (changed) {
        updateAllDerivedCrewState(state);
    }
    return changed;
}
function nudgeTargetRepairs(state, elapsedMs) {
    const daySteps = Math.floor(elapsedMs / DAY_MS);
    if (daySteps <= 0) {
        return false;
    }
    let changed = false;
    for (const target of state.targets) {
        const previous = target.hiddenActualCondition;
        target.hiddenActualCondition = clamp(target.hiddenActualCondition + target.hiddenRepairRate * daySteps, 0, 100);
        if (previous !== target.hiddenActualCondition) {
            changed = true;
        }
    }
    return changed;
}
export function reconcileState(state, now) {
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
        }
        else if (recon.status === "airborne" && recon.returnsAt <= now) {
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
    state.lastReconciledAt = now;
    return changed;
}
export function startRepair(state, aircraftId, tier, now) {
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
    const hiddenNewStatus = hiddenNewCondition >= 72 ? "serviceable" : "damaged";
    const resultText = tier === "patch"
        ? `${aircraft.name} has received a quick patch. Maintenance will allow it back only with reservations.`
        : tier === "standard"
            ? `${aircraft.name} has completed a standard repair cycle and is believed fit enough for use.`
            : `${aircraft.name} has undergone a thorough inspection and is considered steadier than before.`;
    const job = {
        id: nextId(state, "repair"),
        aircraftId,
        groundCrewId: groundCrew.id,
        repairTier: tier,
        startedAt: now,
        completesAt: Math.round(now + duration),
        status: "in_progress",
        riskNote: tier === "patch"
            ? "Fastest option. A patch may return the aircraft sooner, but engineering will not call it fully trusted."
            : tier === "standard"
                ? "Balanced turnround. This will occupy the ground crew for the normal field cycle."
                : "Safest field option. The aircraft will miss any immediate operation while the crew stays tied up longer.",
        resultText,
        completionApplied: false,
        hiddenNewCondition,
        hiddenNewStatus,
        hiddenConditionSummary: conditionSummary(hiddenNewCondition, hiddenNewStatus),
        hiddenDamageNote: tier === "patch"
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
export function startRecovery(state, aircraftId, now) {
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
    const hiddenCrewUpdates = manifest.map((member) => ({
        crewMemberId: member.id,
        status: chance(0.15) ? "lightly_wounded" : "resting",
        fatigue: "exhausted",
        injurySeverity: chance(0.15) ? "light" : "none",
        recoveryAvailableAt: chance(0.15) ? now + LIGHT_WOUND_RECOVERY_MS : null,
        note: chance(0.15)
            ? `${member.name} returned from diversion lightly wounded.`
            : `${member.name} has finally returned from the diversion and looks spent.`
    }));
    const rolled = Math.random();
    const hiddenNewCondition = clamp(aircraft.hiddenCondition + (rolled < 0.33 ? 12 : rolled < 0.72 ? 6 : 0), 24, 84);
    const hiddenReturnStatus = rolled < 0.33 ? "serviceable" : "damaged";
    const resultText = hiddenReturnStatus === "serviceable"
        ? `${aircraft.name} has returned from diversion. It is back on station, though engineering still wants a closer look.`
        : `${aircraft.name} has returned from diversion and now requires inspection before further use.`;
    const job = {
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
        hiddenDamageNote: hiddenReturnStatus === "serviceable"
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
export function startRecon(state, targetId, type, now) {
    if (state.campaign.activeReconId) {
        return "Recon section already occupied.";
    }
    const target = getTargetById(state, targetId);
    if (!target) {
        return "Target not found.";
    }
    const duration = type === "post_strike" ? 3.5 * 60 * 1000 : 2.5 * 60 * 1000;
    const resultQuality = target.hiddenActualCondition < 45 ? "clear" : target.hiddenActualCondition < 72 ? "partial" : "inconclusive";
    const recon = {
        id: nextId(state, "recon"),
        targetId,
        type,
        launchedAt: now,
        returnsAt: Math.round(now + duration * 0.6),
        interpretedAt: Math.round(now + duration),
        status: "airborne",
        resultText: type === "post_strike"
            ? `Recon photography over ${target.name} suggests ${target.hiddenActualCondition < 70 ? "some visible disturbance" : "only partial evidence"}, though complete interpretation remains uncertain.`
            : `Recon sortie over ${target.name} has returned with partial weather and route observations.`,
        confidenceChange: raiseConfidence(target.intelConfidence),
        enemyAlertEffect: target.alertLevel === "high" ? "high" : chance(0.4) ? "high" : "elevated",
        completionApplied: false,
        hiddenAssessment: target.hiddenActualCondition < 45
            ? "Recon reports visible damage and probable interruption to operations."
            : target.hiddenActualCondition < 72
                ? "Recon suggests useful disturbance, though parts of the target remain hard to judge."
                : "Recon finds the target still appears largely operational.",
        hiddenEvidence: target.hiddenActualCondition < 45
            ? "Fresh photography shows obvious disturbance in the target area."
            : "Recon photographs provide partial but usable new evidence.",
        resultQuality,
        recommendation: resultQuality === "clear"
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
export function advanceCampaignDay(state) {
    state.campaign.currentDay += 1;
    state.debug.clockOffsetMs += DAY_MS;
    state.campaign.commandStanding = "A new day of pressure has begun. Staff believes the enemy has had some time to recover its balance.";
    state.campaign.stationWeather = createStationWeather(state.campaign.currentDay);
    addLog(state, `day-${state.campaign.currentDay}`, getEffectiveNow(state), "command", `Campaign day ${state.campaign.currentDay} has begun. Routine rest and repair time have accrued.`);
}
export function skipToNextReport(state, now) {
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
export function skipToDebrief(state, now) {
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
export function completeCurrentRecon(state, now) {
    const recon = getActiveRecon(state);
    if (!recon) {
        return "Recon section already clear.";
    }
    recon.returnsAt = now - 1000;
    recon.interpretedAt = now - 500;
    return null;
}
export function completeAllRepairs(state, now) {
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
export function getTargetOperationalSummary(target) {
    return `${target.assessedCondition} Defense is believed ${defenseText(target.hiddenDefenseLevel)}, alert appears ${alertText(target.alertLevel)}, and intelligence is ${target.intelConfidence}.`;
}
export function getTargetContextSummary(state, targetId) {
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
export function getCurrentOperationSummary(state) {
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
export function getOperationsDeskSummary(state) {
    const now = getEffectiveNow(state);
    const exact = state.debug.showHiddenValues;
    const lines = [];
    const mission = getActiveMission(state);
    const recon = getActiveRecon(state);
    const activeRepairs = state.repairJobs.filter((job) => !job.completionApplied);
    const activeRecoveries = state.recoveryJobs.filter((job) => !job.completionApplied);
    const diverted = state.aircraft.filter((aircraft) => aircraft.status === "diverted" && !aircraft.recoveryJobId);
    if (mission) {
        const target = getTargetById(state, mission.plan.targetId);
        const next = mission.timelineEvents.filter((event) => !event.revealed).sort((a, b) => a.time - b.time)[0];
        lines.push(`Current mission: ${target?.name ?? "Selected target"} remains under way. The next word is expected ${fuzzyTimeUntil(now, next?.time ?? now, exact)}.`);
    }
    else if (state.campaign.lastDebriefMissionId) {
        lines.push("Current mission: no operation is airborne. Staff is working from the latest debrief.");
    }
    else {
        lines.push("Current mission: no operation is airborne. The board is waiting on your next order.");
    }
    if (recon) {
        const target = getTargetById(state, recon.targetId);
        const nextStep = recon.status === "airborne" ? recon.returnsAt : recon.interpretedAt;
        lines.push(`Recon: ${target?.name ?? "Target"} is still being checked. Interpretation is expected ${fuzzyTimeUntil(now, nextStep, exact)}.`);
    }
    else if (state.campaign.latestIntelUpdate) {
        lines.push(`Recon: latest intelligence concerns ${state.campaign.latestIntelUpdate.targetName} and remains ${state.campaign.latestIntelUpdate.resultQuality}.`);
    }
    else {
        lines.push("Recon: no active sortie is out. Existing assessments are aging in place.");
    }
    if (activeRepairs.length > 0) {
        const nextRepair = activeRepairs.slice().sort((a, b) => a.completesAt - b.completesAt)[0];
        const aircraft = getAircraftById(state, nextRepair.aircraftId);
        lines.push(`Repairs: ${activeRepairs.length} field job${activeRepairs.length === 1 ? "" : "s"} active. ${aircraft?.name ?? "An aircraft"} is due back ${fuzzyTimeUntil(now, nextRepair.completesAt, exact)}.`);
    }
    else {
        lines.push("Repairs: no current field work is open on station.");
    }
    if (activeRecoveries.length > 0) {
        lines.push(`Diversions: ${activeRecoveries.length} recovery arrangement${activeRecoveries.length === 1 ? " is" : "s are"} in progress away from station.`);
    }
    else if (diverted.length > 0) {
        lines.push(`Diversions: ${diverted.length} aircraft ${diverted.length === 1 ? "is" : "are"} still away at outlying fields and awaiting recovery orders.`);
    }
    else {
        lines.push("Diversions: all accounted aircraft are either on station or already lost.");
    }
    lines.push(`Crew readiness: ${crewReadinessSummary(state)}`);
    lines.push(`Weather outlook: ${state.campaign.stationWeather}`);
    return lines;
}
function staffUrgencyRank(urgency) {
    switch (urgency) {
        case "urgent":
            return 0;
        case "normal":
            return 1;
        default:
            return 2;
    }
}
function createStaffRecommendation(input) {
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
export function getStaffBriefingRecommendations(state) {
    const recommendations = [];
    const mission = getActiveMission(state);
    const latestDebrief = getLatestDebriefMission(state);
    const recon = getActiveRecon(state);
    const selectedTarget = getTargetById(state, state.planning.selectedTargetId);
    const assignedAvailability = state.planning.assignedAircraftIds.map((aircraftId) => ({
        aircraft: getAircraftById(state, aircraftId),
        availability: getAircraftAvailability(state, aircraftId)
    })).filter((entry) => entry.aircraft);
    const availableAssigned = assignedAvailability.filter((entry) => entry.availability.level === "available").length;
    const marginalAssigned = assignedAvailability.filter((entry) => entry.availability.level === "marginal");
    const unavailableAssigned = assignedAvailability.filter((entry) => entry.availability.level === "unavailable");
    const waitingDamagedAircraft = state.aircraft.filter((aircraft) => aircraft.status === "damaged" && !aircraft.repairJobId);
    const activeRepairs = state.repairJobs.filter((job) => !job.completionApplied);
    const divertedAwaitingRecovery = state.aircraft.filter((aircraft) => aircraft.status === "diverted" && !aircraft.recoveryJobId);
    const unfitAssignedCrew = state.crewMembers.find((member) => member.assignedAircraftId
        && member.currentAssignmentRole
        && REQUIRED_ROLES.includes(member.currentAssignmentRole)
        && !canRoleFly(member));
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
    }
    else if (launchDisabledReason) {
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
    }
    else if (unavailableAssigned.length > 0) {
        const blocked = unavailableAssigned[0];
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
    }
    else if (marginalAssigned.length > 0) {
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
    }
    else if (selectedTarget) {
        recommendations.push(createStaffRecommendation({
            sourceOfficer: "Operations Officer",
            title: "A workable package is on hand",
            body: "Operations believes the current board can support another strike, provided intelligence is acceptable and engineering does not raise fresh objections.",
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
    }
    else if (selectedTarget && getTargetIntelAgeLabel(state, selectedTarget.id) === "stale") {
        recommendations.push(createStaffRecommendation({
            sourceOfficer: "Intelligence Officer",
            title: "Selected target file is going stale",
            body: `The picture on ${selectedTarget.name} is aging and still rests on incomplete evidence. Intelligence advises another look before a major strike.`,
            urgency: "urgent",
            relatedActionType: "start_recon",
            relatedTargetId: selectedTarget.id,
            relatedAircraftId: null,
            relatedCrewMemberId: null
        }));
    }
    else if (selectedTarget && state.campaign.latestIntelUpdate && state.campaign.latestIntelUpdate.targetId === selectedTarget.id) {
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
    }
    if (waitingDamagedAircraft.length > 0) {
        recommendations.push(createStaffRecommendation({
            sourceOfficer: "Engineering Officer",
            title: "Damaged aircraft are waiting on the line",
            body: `${waitingDamagedAircraft[0].name} and other aircraft still need attention. Engineering recommends opening repair work before more tasks accumulate.`,
            urgency: "urgent",
            relatedActionType: "go_maintenance",
            relatedTargetId: null,
            relatedAircraftId: waitingDamagedAircraft[0].id,
            relatedCrewMemberId: null
        }));
    }
    else if (activeRepairs.length > 0 || divertedAwaitingRecovery.length > 0) {
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
            body: `${unfitAssignedCrew.name} cannot presently cover the ${roleLabel(unfitAssignedCrew.currentAssignmentRole)} seat. Personnel recommends assigning a replacement or easing that aircraft off the board.`,
            urgency: "urgent",
            relatedActionType: "go_aircraft_crews",
            relatedTargetId: null,
            relatedAircraftId: unfitAssignedCrew.assignedAircraftId,
            relatedCrewMemberId: unfitAssignedCrew.id
        }));
    }
    else if (seriouslyWoundedCount > 0 || lightlyWoundedCount > 0 || tiredCrewCount >= 6) {
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
            body: "Command will tolerate caution, but not drift. Another purely administrative pause may not satisfy the directive for long.",
            urgency: selectedTarget.directiveRelevance === "high" ? "urgent" : "normal",
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
    return recommendations
        .sort((a, b) => staffUrgencyRank(a.urgency) - staffUrgencyRank(b.urgency))
        .slice(0, 5);
}
export function getGroundCrewPressureNote(state, aircraftId, tier) {
    const aircraft = getAircraftById(state, aircraftId);
    if (!aircraft) {
        return null;
    }
    const groundCrew = getGroundCrewById(state, aircraft.assignedGroundCrewId);
    if (!groundCrew) {
        return null;
    }
    const waitingAircraft = state.aircraft.filter((candidate) => candidate.assignedGroundCrewId === groundCrew.id
        && candidate.id !== aircraft.id
        && (candidate.status === "damaged" || candidate.status === "diverted")
        && !candidate.repairJobId
        && !candidate.recoveryJobId);
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
export function getDisabledReasonForLaunch(state) {
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
