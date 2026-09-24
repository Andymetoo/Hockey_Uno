export type Route = 'direct' | 'dogleg';
export type Orders = 'preserve' | 'press';
export type Defect = 'oil' | 'controls' | 'sight';
export type Circumstance = 'ordinary' | 'escort' | 'window' | 'dispersed' | 'fuel' | 'flak';
export interface Aircraft {
  id: string; name: string; trait: 'rugged' | 'accurate' | 'economical' | 'swift';
  condition: number; defect: boolean; lost: boolean; away: boolean;
  sorties: number; history: string[];
  defectType: Defect | null; certified: number; recovered: boolean;
}
export interface Crew {
  id: string; pilot: string; specialist: string; strength: 'navigation' | 'bombing' | 'engineering' | 'formation';
  experience: number; fatigue: number; lost: boolean; injury: boolean;
  replacement: string | null; returned: boolean; sorties: number; history: string[];
  strain: number; leaveThrough: number; lesson: boolean; replacementSorties: number;
}
export interface Assignment {
  title: string; objective: string; why: string; hazard: number; weather: 'clear' | 'cloud' | 'crosswind';
  requested: number; effect: 'fighters' | 'supplies' | 'rail';
  circumstance: Circumstance;
  followup?: string;
}
export interface Plan { flights: { aircraft: string; crew: string }[]; route: Route; orders: Orders; priority: string; }
export interface FlightResult {
  aircraft: string; crew: string; outcome: 'home' | 'abort' | 'divert' | 'lost';
  damage: number; injury: boolean; hit: boolean; fatigue: number; note: string;
  details?: string[]; newDefect?: Defect | null; strain?: number;
  credits?: ('training' | 'repair' | 'briefing' | 'orders' | 'restraint')[];
}
export interface Report {
  slot: number; title: string; summary: string; requested: number; sent: number; hits: number;
  results: FlightResult[]; notes: string[]; at: number; stoodDown: boolean;
  debrief?: { assessment: string; next: string[] };
}
export interface TutorialProgress { seen: string[]; disabled: boolean; stationAt?: number; }
export interface Operation {
  slot: number; startedAt: number; returnsAt: number; plan: Plan; report: Report;
  messages: string[]; stoodDown: boolean;
}
export type JobKind = 'signal' | 'return' | 'repair' | 'inspection' | 'service' | 'rest' | 'medical' | 'recovery' | 'reinforcement' | 'training';
export interface Job { id: number; at: number; kind: JobKind; subject: string; text?: string; overhaul?: boolean; }
export interface DecisionRecord { key: string; slot: number; text: string; }
export interface State {
  version: 21; seed: number; rng: number; now: number; offset: number; nextId: number;
  station: string; circumstance: string; aircraft: Aircraft[]; crews: Crew[]; assignments: Assignment[];
  completed: number; contribution: number; requested: number; support: number; suppression: number;
  engineeringUsed: number; active: Operation | null; jobs: Job[]; reports: Report[];
  decisions: DecisionRecord[]; notices: string[]; phase: 'active' | 'closing' | 'ended';
  ending: 'tour' | 'losses' | null; plan: Plan;
  briefing: boolean; extraBay: number; planEdited: boolean;
  opportunity: { kind: 'photos' | 'transport'; source: string; slot: number } | null;
  tutorial: TutorialProgress;
}
export interface Choice { id: string; label: string; detail: string; disabled?: boolean; }
export interface StationEvent { key: string; kind: 'returning' | 'replacement' | 'recovery' | 'reinforcement' | 'rush' | 'mentor' | 'inspection' | 'strain' | 'opportunity'; subject: string; title: string; body: string; choices: Choice[]; }
