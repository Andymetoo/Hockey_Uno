// Run explicitly: node src/bomber-command/tests/campaign-audit.mjs
// This is a gameplay audit, not a replacement for assertions or human playtesting.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advance, choose, commit, createCampaign, prepareMorning, proposePlan, tourEvaluation } from '../game.ts';
import { stationEvents } from '../content.ts';
import { threadActive } from '../history.ts';

const START = 1_800_000_000_000;
const samples = Math.max(20, Number(process.env.BOMBER_AUDIT_SEEDS ?? 120));
const pairedSamples = Math.max(15, Number(process.env.BOMBER_AUDIT_PAIRED_SEEDS ?? 40));
const output = resolve(process.env.BOMBER_AUDIT_OUTPUT ?? 'tmp/bomber-browser/campaign-audit');
const policies = ['cautious', 'balanced', 'pressing'];
const branchPolicy = { cautious: { 2: 'escort', 6: 'relief', 9: 'verify' }, balanced: { 2: 'main', 6: 'main', 9: 'junction' }, pressing: { 2: 'mobile', 6: 'recon', 9: 'main' } };
const tally = (rows, field) => Object.fromEntries([...new Set(rows.flatMap(r => r[field]))].sort().map(k => [k, rows.reduce((sum, r) => sum + r[field].filter(x => x === k).length, 0)]));
const mean = (rows, key) => Number((rows.reduce((sum, r) => sum + r[key], 0) / rows.length).toFixed(3));

function desiredChoice(s, e, policy, forced) {
  const choices = e.choices.filter(c => !c.disabled);
  if (!choices.length) return undefined;
  let preference = [];
  if (e.kind === 'branch') preference = [forced?.[s.completed] ?? branchPolicy[policy][s.completed], 'main'];
  else if (e.kind === 'mission') preference = s.completed === 4 ? [policy === 'cautious' ? 'escort' : 'window'] : [policy === 'cautious' ? 'alternate' : 'main'];
  else if (e.kind === 'reinforcement') preference = ['request', 'wait'];
  else if (e.kind === 'inspection') preference = ['bench', 'queue', 'carry'];
  else if (e.kind === 'rush') preference = ['proper', 'rush'];
  else if (e.kind === 'strain') preference = [policy === 'pressing' ? 'debrief' : 'leave', 'debrief', 'duty'];
  else if (e.kind === 'replacement') preference = ['assign', 'wait'];
  else if (e.kind === 'returning') preference = [policy === 'pressing' ? 'retain' : 'restore'];
  else if (e.kind === 'recovery') preference = [policy === 'pressing' ? 'expedite' : 'overhaul', 'wait'];
  else if (e.kind === 'mentor') preference = [policy === 'pressing' ? 'fly' : 'train'];
  else if (e.kind === 'leadership') preference = [policy === 'cautious' ? 'rest' : 'lead', 'rest'];
  else if (e.kind === 'opportunity') preference = ['brief', s.support < 2 ? 'support' : 'bay', 'share', 'support'];
  else if (e.kind === 'story') {
    const a = s.stories.find(a => a.id === e.subject);
    if (a.family === 'confidence') preference = policy === 'pressing' ? ['lead'] : ['check', 'teach', 'lead'];
    if (a.family === 'interpretation') preference = policy === 'pressing' ? ['file', 'local', 'group'] : ['compare', policy === 'cautious' ? 'group' : 'local', 'file', 'group'];
    if (a.family === 'neighbors') preference = policy === 'cautious' ? ['crates', 'workshop', 'send', 'promise'] : ['promise', 'send', 'transport', 'release'];
    if (a.family === 'relief') preference = policy === 'pressing' ? ['extend', 'rest', 'instruct'] : ['promise', 'instruct', 'rest'];
  } else if (e.kind === 'operational' && policy === 'cautious') {
    preference = ['height', 'routine', 'send', 'rail', 'ferry', 'watch', 'exchange', 'reserve', 'wait', 'prepare'];
  }
  return preference.map(id => choices.find(c => c.id === id)).find(Boolean) ?? choices[0];
}

function play(seedIndex, policy, forced) {
  const seed = Math.imul(seedIndex, 2654435761) >>> 0;
  const s = createCampaign(seed, START);
  const transcript = [], encountered = [], offered = new Set();
  let quiet = 0, repeated = 0, repeatedRoutine = 0;
  for (let i = 0; i < 14 && s.phase === 'active'; i++) {
    prepareMorning(s);
    const reservation = new Set();
    const first = stationEvents(s); if (!first.length) quiet++;
    transcript.push(`\nAssignment ${s.completed + 1}: ${s.assignments[s.completed].title}`);
    if (s.assignments[s.completed].followup) transcript.push(`Earlier choice: ${s.assignments[s.completed].followup}`);
    for (let n = 0; n < 2; n++) {
      const events = stationEvents(s);
      for (const e of events) {
        const token = `${s.completed}:${e.key}`;
        if (!offered.has(token)) { encountered.push(e.kind === 'operational' ? `operational:${e.subject}` : e.kind === 'story' ? e.subject : e.kind); offered.add(token); }
      }
      const e = events.find(e => e.choices.some(c => !c.disabled));
      if (!e) break;
      const c = desiredChoice(s, e, policy, forced); if (!c) break;
      if (s.decisions.some(d => d.key === e.key)) {
        if (['strain', 'inspection', 'rush'].includes(e.kind) && !s.decisions.some(d => d.key === e.key && s.completed - d.slot < 3)) repeatedRoutine++;
        else repeated++;
      }
      transcript.push(`Decision: ${e.title} -> ${c.label}. ${c.detail}`);
      choose(s, e.key, c.id);
      if ((e.kind === 'inspection' && c.id === 'queue') || (e.kind === 'rush' && c.id === 'proper')) reservation.add(e.subject);
    }
    const p = proposePlan(s); p.priority = s.plan.priority;
    p.flights = p.flights.filter(f => !reservation.has(f.aircraft));
    const task = s.assignments[s.completed];
    p.orders = policy === 'pressing' ? 'press' : 'preserve';
    p.route = policy === 'pressing' || ['escort', 'window', 'fuel'].includes(task.circumstance) ? 'direct' : policy === 'cautious' || task.hazard >= 3 ? 'dogleg' : 'direct';
    transcript.push(`Dispatch: ${p.flights.map(f => `${s.aircraft.find(a => a.id === f.aircraft).name} / ${s.crews.find(c => c.id === f.crew).pilot}`).join('; ') || 'stand down'}. ${p.route}, ${p.orders}.`);
    commit(s, p, !p.flights.length);
    advance(s, s.active.returnsAt);
    const report = s.reports.at(-1);
    transcript.push(`Return: ${report.summary}`);
    for (const result of report.results) transcript.push(`  ${result.note}`);
    transcript.push(...report.notes.map(text => `  ${text}`));
  }
  let guard = 0;
  while (s.jobs.length && guard++ < 200) advance(s, Math.min(...s.jobs.map(j => j.at)));
  if (s.phase !== 'ended' || s.completed !== 14) throw new Error(`Unfinished campaign ${seed}/${policy}: ${s.phase}, ${s.completed}`);
  const evaluation = tourEvaluation(s), stories = s.stories ?? [], threads = s.threads ?? [];
  const row = { seed, seedIndex, policy, ...evaluation, quiet, repeated, repeatedRoutine,
    hits: s.contribution, requested: s.requested, support: s.support,
    decisions: s.decisions.length, standDowns: s.reports.filter(r => r.stoodDown).length,
    diversions: s.reports.flatMap(r => r.results).filter(r => r.outcome === 'divert').length,
    injuries: s.reports.flatMap(r => r.results).filter(r => r.injury).length,
    encountered,
    storyStarted: [...stories.map(a => a.family), ...threads.map(t => t.family)],
    storyResolved: [...stories.filter(a => a.status === 'resolved').map(a => a.family), ...threads.filter(t => t.status === 'resolved').map(t => t.family)],
    storyClosed: [...stories.filter(a => a.status === 'closed').map(a => a.family), ...threads.filter(t => t.status === 'closed').map(t => t.family)],
    storyStranded: [...stories.filter(a => a.status === 'active').map(a => `${a.family}:${a.stage}`), ...threads.filter(threadActive).map(t => `${t.family}:${t.stage}`)],
    operationalSelected: [...(s.operations?.history ?? []).map(h => h.id)],
    operationalResolved: [...(s.operations?.history ?? []).filter(h => h.status === 'resolved').map(h => h.id)],
    operationalExpired: [...(s.operations?.history ?? []).filter(h => h.status === 'expired').map(h => h.id)],
    branchChoices: s.branches.map(b => `${b.slot}:${b.choice}`),
    branchConsequences: (s.campaign?.commitments ?? []).map(c => `${c.kind}:${c.state}`),
    storyEndings: [...stories.map(a => `${a.family}:${a.stage}`), ...threads.map(t => `${t.family}:${t.stage}`)],
  };
  transcript.push('\nStation stories:');
  for (const a of [...stories, ...threads]) {
    transcript.push(`${a.title ?? a.family}: ${a.status ?? a.stage}`);
    for (const m of a.milestones ?? []) transcript.push(`  After ${m.slot}: ${m.text}`);
  }
  transcript.push('\nCampaign commitments:');
  for (const c of s.campaign?.commitments ?? []) { transcript.push(`${c.title}: ${c.state}`); for (const m of c.milestones) transcript.push(`  Assignment ${m.assignment}: ${m.text}`); }
  return { row, transcript: transcript.join('\n') };
}

function summarize(rows) {
  return { campaigns: rows.length, objectives: mean(rows, 'objectives'), losses: mean(rows, 'losses'), hits: mean(rows, 'hits'), requested: mean(rows, 'requested'), decisions: mean(rows, 'decisions'), quietVisits: mean(rows, 'quiet'), diversions: mean(rows, 'diversions'), standDowns: mean(rows, 'standDowns'), invalidRepeatedChoices: rows.reduce((n, r) => n + r.repeated, 0), repeatedRoutineDecisions: rows.reduce((n, r) => n + r.repeatedRoutine, 0), zeroLossTours: rows.filter(r => r.losses === 0).length, storyStarted: tally(rows, 'storyStarted'), storyResolved: tally(rows, 'storyResolved'), storyClosed: tally(rows, 'storyClosed'), storyStranded: tally(rows, 'storyStranded'), storyEndings: tally(rows, 'storyEndings'), operationalSelected: tally(rows, 'operationalSelected'), operationalResolved: tally(rows, 'operationalResolved'), operationalExpired: tally(rows, 'operationalExpired'), branchConsequences: tally(rows, 'branchConsequences') };
}

const runs = [];
for (const policy of policies) for (let seed = 1; seed <= samples; seed++) runs.push(play(seed, policy));
const paired = {};
const pairedRuns = [];
for (const [slot, choices] of [[2, ['mobile', 'main', 'escort']], [6, ['relief', 'main', 'recon']], [9, ['junction', 'main', 'verify']]]) {
  paired[slot] = {};
  for (const choice of choices) {
    const runs = [];
    for (let seed = 1; seed <= pairedSamples; seed++) runs.push(play(seed, 'balanced', { [slot]: choice }));
    paired[slot][choice] = summarize(runs.map(x => x.row));
    pairedRuns.push(...runs);
  }
}
const rows = runs.map(x => x.row);
const summary = { seedPolicy: 'Multiply seed index by 2654435761; matched initial seeds across policies and branches. Decision-dependent later event draws may diverge, so branch comparisons are directional.', totalCampaigns: rows.length + pairedRuns.length, overall: summarize(rows), policies: Object.fromEntries(policies.map(p => [p, summarize(rows.filter(r => r.policy === p))])), pairedBranches: paired };
const quietSuccessful = runs.filter(r => r.row.policy !== 'pressing' && r.row.losses === 0 && r.row.objectives >= 10).sort((a, b) => a.row.injuries + a.row.diversions - b.row.injuries - b.row.diversions || b.row.objectives - a.row.objectives)[0];
const costly = [...runs].sort((a, b) => b.row.losses - a.row.losses || a.row.objectives - b.row.objectives)[0];
const recovery = runs.filter(r => r.row.diversions >= 3).sort((a, b) => b.row.diversions - a.row.diversions || a.row.losses - b.row.losses)[0];
const contrastSeed = quietSuccessful?.row.seedIndex ?? 1;
const examples = [ ['Quiet successful', quietSuccessful], ['Costly', costly], ['Recovery', recovery], ['Crossing branch', play(contrastSeed, 'balanced', { 6: 'relief' })], ['Inland works branch', play(contrastSeed, 'balanced', { 6: 'main' })], ['Surveyed inland branch', play(contrastSeed, 'balanced', { 6: 'recon' })] ];
summary.transcripts = Object.fromEntries(examples.filter(([, run]) => run).map(([name, run]) => [name, run.row]));
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(resolve(output, 'runs.json'), JSON.stringify([...rows, ...pairedRuns.map(x => x.row)], null, 2));
writeFileSync(resolve(output, 'transcripts.md'), examples.filter(([, run]) => run).map(([name, run]) => `# ${name}: seed ${run.row.seed}, ${run.row.policy}\n\n${run.transcript}`).join('\n\n'));
console.log(JSON.stringify({ totalCampaigns: summary.totalCampaigns, policies: Object.fromEntries(Object.entries(summary.policies).map(([p, s]) => [p, { objectives: s.objectives, losses: s.losses, decisions: s.decisions, stranded: s.storyStranded }])), overall: { stories: summary.overall.storyStarted, resolved: summary.overall.storyResolved, closed: summary.overall.storyClosed, stranded: summary.overall.storyStranded, operational: summary.overall.operationalSelected }, paired: Object.fromEntries(Object.entries(paired).map(([slot, variants]) => [slot, Object.fromEntries(Object.entries(variants).map(([choice, s]) => [choice, { objectives: s.objectives, losses: s.losses, hits: s.hits, requested: s.requested }]))])), output }, null, 2));
