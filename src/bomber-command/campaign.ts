import type { Assignment, Report, State } from './types.ts';

/** Slots are zero-based. Milestones use the assignment number printed in the book. */
export interface CampaignMilestone { assignment: number; text: string; }
export interface CampaignIntelligence {
  id: 'stores' | 'inland-route';
  truth: 'occupied' | 'empty' | 'clear' | 'guns';
  knowledge: 'estimated' | 'confirmed';
  confirmedAt: number | null;
}
export type CommitmentKind = 'dispersal-notes' | 'engine-shortage' | 'escort-return' | 'crossing-recovery' | 'component-shortage' | 'rail-escort' | 'stores-shortage';
export interface CampaignCommitment {
  id: string;
  kind: CommitmentKind;
  title: string;
  choiceSlot: number;
  targetSlot: number;
  dueSlot: number;
  expiresSlot: number;
  state: 'pending' | 'ready' | 'active' | 'fulfilled' | 'missed' | 'expired';
  effectsApplied: number[];
  milestones: CampaignMilestone[];
}
export interface CampaignState {
  intelligence: CampaignIntelligence[];
  commitments: CampaignCommitment[];
}
type CampaignHost = State & { campaign?: CampaignState | null; contentVersion?: number };

// Independent, persisted facts do not disturb the flight RNG or redraw on opening a panel.
export function createCampaignState(seed: number): CampaignState {
  let fact = (seed ^ 0x6d2b79f5) >>> 0;
  const draw = () => { fact = (Math.imul(fact, 1664525) + 1013904223) >>> 0; return fact / 4294967296; };
  return { intelligence: [
    { id: 'stores', truth: draw() < .64 ? 'occupied' : 'empty', knowledge: 'estimated', confirmedAt: null },
    { id: 'inland-route', truth: draw() < .55 ? 'clear' : 'guns', knowledge: 'estimated', confirmedAt: null },
  ], commitments: [] };
}

interface CommitmentDefinition {
  title: string;
  dueSlot: number;
  expiresSlot: number;
  opening: string;
}
export const commitmentDefinitions: Record<CommitmentKind, CommitmentDefinition> = {
  'dispersal-notes': { title: 'The cleared sector', dueSlot: 5, expiresSlot: 5, opening: 'If the moving fighters are disrupted, a reconnaissance aircraft can survey the estuary approach for assignment 6. It will identify a shorter bombing run.' },
  'engine-shortage': { title: 'Engines that will not arrive', dueSlot: 6, expiresSlot: 7, opening: 'An effective strike on the engine works will leave fewer replacement fighters over assignments 7 and 8. The effect takes time to reach the front.' },
  'escort-return': { title: 'Group returns the escort', dueSlot: 5, expiresSlot: 5, opening: 'A successful covered sweep lets Group reserve another escort rendezvous for assignment 6. The direct route will meet it.' },
  'crossing-recovery': { title: 'A road back from the forward fields', dueSlot: 9, expiresSlot: 12, opening: 'If the crossing is relieved, its transport party will be available during assignments 10–13. The first diverted aircraft in that period can return twelve hours sooner, without spending station support.' },
  'component-shortage': { title: 'The missing components', dueSlot: 10, expiresSlot: 12, opening: 'Disrupting the inland works deprives the final assembly plant of components. Assignments 11 and 13 face less opposition; assignment 13 will need only two bombers.' },
  'rail-escort': { title: 'Fighters released from the railway', dueSlot: 12, expiresSlot: 12, opening: 'Blocking the confirmed junction frees Group to escort the direct corridor on assignment 13. Known guns today buy cover for the final deep raid.' },
  'stores-shortage': { title: 'An empty assembly line', dueSlot: 12, expiresSlot: 13, opening: 'If the stores are occupied and disrupted, the final assembly plant loses its reserve stock. Assignment 13 will need only two bombers and face less opposition. Group can then move the final coastal strike into a clear weather window with lighter opposition. Empty sheds cannot produce either result.' },
};

export function campaignChoiceDetail(slot: number, choice: string): string | undefined {
  const details: Record<string, string> = {
    '2:mobile': 'Next: three aircraft, heavy opposition and a short weather opening. Success opens reconnaissance of the estuary for assignment 6: lighter opposition and a clear bombing approach.',
    '2:main': 'Next: three aircraft and very heavy opposition. Success creates an engine shortage: one less opposition level on assignments 7 and 8. No support spent.',
    '2:escort': 'Spend one support. Next: three aircraft, moderate opposition and direct-route escort. Success also reserves direct-route escorts for assignment 6.',
    '6:relief': 'Next: two aircraft, moderate opposition and escort; gain one support now. Success opens a free, twelve-hour faster recovery for the first diversion during assignments 10–13.',
    '6:main': 'Next: four aircraft and very heavy opposition. Success cuts opposition on assignments 11 and 13 and reduces assignment 13 to two bombers by denying the assembly plant its components.',
    '6:recon': 'Spend one support to confirm the inland route. Next: four aircraft; reconnaissance finds either a clear weather opening or a defended approach to avoid. Success earns the same later component shortage as keeping the works.',
    '9:junction': 'Next: three aircraft; confirmed junction, known guns on the direct approach. Success reserves direct-route escort and lowers opposition on assignment 13.',
    '9:main': 'Next: three aircraft against dispersed stores. Intelligence estimates roughly two chances in three that stock remains. If occupied and hit, assignment 13 needs only two bombers with less opposition; assignment 14 gains a clear weather window and lighter opposition. Empty stores earn no transport or disruption.',
    '9:verify': 'Spend one support to confirm whether the stores are occupied. Next: three aircraft on occupied stores, or the junction if empty, using a surveyed approach. Stores success lightens assignment 13 and opens a clear, lighter final coast run; junction success secures assignment 13 escort.',
  };
  return details[`${slot}:${choice}`];
}

function milestone(c: CampaignCommitment, assignment: number, text: string): void {
  c.milestones.push({ assignment, text });
}
function appendFollowup(a: Assignment, text: string): void { a.followup = a.followup ? `${a.followup} ${text}` : text; }
function intel(s: CampaignHost, id: CampaignIntelligence['id']): CampaignIntelligence | undefined { return s.campaign?.intelligence.find(i => i.id === id); }
function confirm(s: CampaignHost, id: CampaignIntelligence['id'], assignment: number): CampaignIntelligence | undefined {
  const finding = intel(s, id);
  if (finding && finding.knowledge !== 'confirmed') { finding.knowledge = 'confirmed'; finding.confirmedAt = assignment; }
  return finding;
}

/** Called after the existing immediate branch change, never from rendering. */
export function recordCampaignChoice(s: CampaignHost, slot: number, choice: string): void {
  if (!s.campaign || s.contentVersion === 0 || s.campaign.commitments.some(c => c.choiceSlot === slot)) return;
  let kind: CommitmentKind;
  if (slot === 2) kind = choice === 'mobile' ? 'dispersal-notes' : choice === 'escort' ? 'escort-return' : 'engine-shortage';
  else if (slot === 6) kind = choice === 'relief' ? 'crossing-recovery' : 'component-shortage';
  else if (slot === 9) kind = choice === 'main' ? 'stores-shortage' : 'rail-escort';
  else return;
  const next = s.assignments[slot + 1];
  let findingText = '';
  if (slot === 6 && choice === 'recon') {
    const route = confirm(s, 'inland-route', slot + 1);
    if (route?.truth === 'clear') {
      next.hazard = 2; next.circumstance = 'window';
      findingText = 'Confirmed reconnaissance: the river approach is clear of the reported gun belt. The direct run can use the short weather opening; opposition is moderate.';
    } else {
      next.hazard = 3; next.circumstance = 'flak';
      findingText = 'Confirmed reconnaissance: the river approach has an active gun belt. The marked dogleg avoids the worst of it; opposition remains heavy.';
    }
    next.why = findingText; next.followup = `Your reconnaissance of the inland route changed the approach. ${findingText}`;
  }
  if (slot === 9 && choice === 'verify') {
    const stores = confirm(s, 'stores', slot + 1);
    if (stores?.truth === 'occupied') {
      kind = 'stores-shortage';
      Object.assign(next, { title: 'The confirmed reserve stores', objective: 'Destroy the occupied component stores before their stock moves.', effect: 'supplies', hazard: 2, requested: 3, circumstance: 'window' });
      findingText = 'Confirmed reconnaissance: loading parties and component crates remain in the stores. The survey has marked a shorter approach.';
    } else {
      kind = 'rail-escort';
      Object.assign(next, { title: 'The surveyed western junction', objective: 'Block the confirmed rail junction after the stores prove empty.', effect: 'rail', hazard: 2, requested: 3, circumstance: 'window' });
      findingText = 'Confirmed reconnaissance: the stores have already been emptied. Operations has kept the junction, with its approach now surveyed.';
    }
    next.why = findingText; next.followup = `You paid to settle the disputed stores report. ${findingText}`;
    const branch = s.branches.find(b => b.slot === slot);
    if (branch) branch.promise = kind === 'stores-shortage' ? 'Disrupt the confirmed stores' : 'Disrupt the junction after checking the stores';
  }
  // The confirmed junction is a rail objective, including its immediate effect.
  if (slot === 9 && choice === 'junction') next.effect = 'rail';
  const definition = commitmentDefinitions[kind];
  const c: CampaignCommitment = { id: `campaign-${slot}`, kind, title: definition.title, choiceSlot: slot, targetSlot: slot + 1, dueSlot: definition.dueSlot, expiresSlot: definition.expiresSlot, state: 'pending', effectsApplied: [], milestones: [{ assignment: slot + 1, text: definition.opening }] };
  if (findingText) milestone(c, slot + 1, findingText);
  s.campaign.commitments.push(c);
}

/** Physical concentrations remain in reports even if their presumed stores were empty. */
export function campaignObjective(s: CampaignHost, report: Report): { effective: boolean; assessment?: string } {
  const sufficient = !report.stoodDown && report.hits >= Math.ceil(report.requested * .65);
  const commitment = s.campaign?.commitments.find(c => c.targetSlot === report.slot - 1 && c.kind === 'stores-shortage');
  if (commitment && intel(s, 'stores')?.truth === 'empty' && !report.stoodDown) return { effective: false, assessment: `Return photographs confirm the stores had been emptied before the raid. ${report.hits} concentration${report.hits === 1 ? '' : 's'} fell on the buildings, but no reserve stock was disrupted. No transport or later relief follows from this raid; other recorded commitments still stand.` };
  return { effective: sufficient };
}

function applyEffect(s: CampaignHost, c: CampaignCommitment, report: Report): void {
  const slot = s.completed;
  if (c.effectsApplied.includes(slot)) return;
  const task = s.assignments[slot];
  if (!task) return;
  let text = '';
  switch (c.kind) {
    case 'dispersal-notes':
      if (slot !== 5) return;
      task.hazard = Math.max(1, task.hazard - 1); task.weather = 'clear'; task.circumstance = 'window';
      text = 'The moving-fighter raid cleared a reconnaissance corridor. Its new estuary photographs give assignment 6 a clear, shorter bombing approach and one less opposition level.';
      break;
    case 'engine-shortage':
      if (![6, 7].includes(slot)) return;
      task.hazard = Math.max(1, task.hazard - 1);
      text = `The engine works strike is now affecting replacement deliveries. Assignment ${slot + 1} faces one less opposition level; those missing engines were the reason for accepting the heavier raid.`;
      break;
    case 'escort-return':
      if (slot !== 5) return;
      task.circumstance = 'escort';
      text = 'Group kept its undertaking after the covered sweep: escorts will meet the direct corridor on assignment 6.';
      break;
    case 'component-shortage':
      if (![10, 12].includes(slot)) return;
      task.hazard = Math.max(1, task.hazard - 1);
      if (slot === 12) task.requested = Math.min(task.requested, 2);
      text = slot === 10 ? 'Inland component deliveries remain interrupted. Assignment 11 faces one less opposition level while replacements are held up.' : 'The inland component works never made good their deliveries. Group has reduced assignment 13 to two bombers and one less opposition level: fewer assembly halls are operating.';
      break;
    case 'rail-escort':
      if (slot !== 12) return;
      task.circumstance = 'escort'; task.hazard = Math.max(1, task.hazard - 1);
      text = 'The western junction remains blocked. Fighters released from the railway commitment will escort the direct corridor on assignment 13, which also faces one less opposition level.';
      break;
    case 'stores-shortage':
      if (![12, 13].includes(slot)) return;
      task.hazard = Math.max(1, task.hazard - 1);
      if (slot === 12) {
        task.requested = Math.min(task.requested, 2);
        text = 'The occupied stores were destroyed before their stock could move. Group now requests two bombers for assignment 13; the depleted assembly plant also faces one less opposition level.';
      } else {
        task.weather = 'clear'; task.circumstance = 'window';
        text = 'With the reserve stock destroyed, the coastal freight is no longer urgent. Group can hold assignment 14 for a confirmed clear weather window; opposition is one level lighter. The final request remains two bombers.';
      }
      break;
    case 'crossing-recovery': return;
  }
  appendFollowup(task, text); report.notes.push(text); milestone(c, slot + 1, text); c.effectsApplied.push(slot);
  c.state = slot >= c.expiresSlot ? 'fulfilled' : 'active';
}

/** Called once per completed report, after the report is entered and completed increases. */
export function finishCampaignOperation(s: CampaignHost, report: Report): void {
  if (!s.campaign) return;
  for (const c of s.campaign.commitments) {
    if (c.state === 'pending' && c.targetSlot === report.slot - 1) {
      if (c.kind === 'stores-shortage' && !report.stoodDown) confirm(s, 'stores', report.slot);
      const outcome = campaignObjective(s, report);
      c.state = outcome.effective ? 'ready' : 'missed';
      const text = outcome.effective ? `${c.title}: the required objective was disrupted. Operations has entered the later arrangement for assignment ${c.dueSlot + 1}.` : outcome.assessment ?? `${c.title}: the required objective was not disrupted. No later arrangement is released from this objective; other recorded commitments still stand.`;
      milestone(c, report.slot, text); report.notes.push(text);
    }
    if (!['ready', 'active'].includes(c.state)) continue;
    if (c.kind === 'crossing-recovery') {
      // A benefit opened before assignment 10 stays available through assignment 13's return.
      const reportSlot = report.slot - 1;
      if (reportSlot >= c.dueSlot && reportSlot <= c.expiresSlot) {
        const diverted = report.results.find(r => r.outcome === 'divert' && s.jobs.some(j => j.kind === 'recovery' && j.subject === r.aircraft));
        const job = diverted && s.jobs.find(j => j.kind === 'recovery' && j.subject === diverted.aircraft);
        if (job && diverted) {
          const originalAt = job.at;
          job.at = Math.min(originalAt, Math.max(s.now + 3_600_000, originalAt - 12 * 3_600_000));
          const savedHours = (originalAt - job.at) / 3_600_000;
          const aircraft = s.aircraft.find(a => a.id === diverted.aircraft)?.name ?? 'The diverted aircraft';
          const crew = s.crews.find(p => p.id === diverted.crew)?.pilot ?? 'Its pilot';
          const timing = savedHours === 12 ? 'twelve hours earlier' : savedHours > 0 ? `${Number(savedHours.toFixed(1))} hours earlier, at the earliest safe departure` : 'already imminent; the party keeps that earlier departure';
          const text = `The crossing transport party has collected ${crew}'s crew and spares for ${aircraft}. Your relief raid opened that road; recovery is ${timing} and costs no station support.`;
          report.notes.push(text); milestone(c, report.slot, text); c.effectsApplied.push(reportSlot); c.state = 'fulfilled';
          continue;
        }
      }
      if (s.completed === c.dueSlot && c.state === 'ready') {
        c.state = 'active';
        const text = 'The crossing transport party is in position for assignments 10–13. It can bring the first diverted aircraft back twelve hours sooner, at no support cost.';
        report.notes.push(text); milestone(c, s.completed + 1, text);
      }
      if (s.completed > c.expiresSlot) {
        c.state = 'expired';
        const text = 'No aircraft needed the crossing transport party during its posting. Operations released the party after assignment 13; the relief raid remains recorded as completed.';
        report.notes.push(text); milestone(c, report.slot, text);
      }
    } else applyEffect(s, c, report);
  }
}

export function campaignToday(s: CampaignHost): string[] {
  if (!s.campaign) return [];
  return s.campaign.commitments.filter(c => ['pending', 'ready', 'active'].includes(c.state)).map(c => {
    if (c.kind === 'crossing-recovery' && c.state === 'active') return `${c.title}: free recovery transport remains available through assignment 13.`;
    return `${c.title}: ${c.state === 'pending' ? `depends on the result of assignment ${c.targetSlot + 1}` : `arranged for assignment ${c.dueSlot + 1}${c.expiresSlot !== c.dueSlot ? `–${c.expiresSlot + 1}` : ''}`}.`;
  });
}

export function campaignResolutionNotes(s: CampaignHost): string[] {
  return s.campaign?.commitments.map(c => c.milestones.at(-1)?.text ?? c.title) ?? [];
}
