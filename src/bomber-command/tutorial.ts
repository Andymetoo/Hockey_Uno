import type { State } from './types.ts';

type TutorialEvent = 'view' | 'review' | 'decision' | 'manual';
interface TutorialContext { tab?: string; eventKind?: string; }
interface TutorialStep { id: string; title: string; target: string; body: string; trigger: TutorialEvent; when?: (s: State, context: TutorialContext) => boolean; }

export const tutorialSteps = [
  {
    id: 'intro', title: 'Your operations desk', target: 'briefing', trigger: 'view', when: (s: State) => !s.completed && !s.active,
    body: 'Read HQ’s objective, then handle any station matter, review the staff package, and sign the order. After the crews return, read what changed before planning again.',
  },
  {
    id: 'planning', title: 'Build the package', target: 'package', trigger: 'manual',
    body: 'The staff has selected fit aircraft and rested crews. You can change them, the route, and the standing orders. Sending fewer aircraft protects the roster but leaves part of HQ’s request unfilled.',
  },
  {
    id: 'station', title: 'A station decision', target: 'station', trigger: 'decision',
    body: 'These choices can spend support, use the repair bay, or hold a crew back. Read the cost and timing before choosing. Leaving an optional matter alone is allowed.',
  },
  {
    id: 'dispatch', title: 'Check the commitment', target: 'package', trigger: 'review', when: (s: State) => s.completed === 0,
    body: 'Review the crew-by-crew estimates before signing. The risks are forecasts, not promises. Dispatch saves the outcome; no midflight orders are needed.',
  },
  {
    id: 'underway', title: 'While they are away', target: 'underway', trigger: 'view', when: (s: State) => s.active?.slot === 1,
    body: 'The orders are saved. You can leave and return later, or advance to the report now. The next assignment waits for your decision.',
  },
  {
    id: 'return', title: 'Read the return report', target: 'report', trigger: 'view', when: (s: State) => s.completed >= 1 && !s.active && !!s.reports.length,
    body: 'Start with the assessment and next-assignment notes. Then check each crew and aircraft for damage, fatigue, injury, or diversion before choosing another package.',
  },
  {
    id: 'problem', title: 'Follow the consequence', target: 'station', trigger: 'decision', when: (s: State, context: TutorialContext) => s.completed > (s.tutorial.stationAt ?? -1) && ['rush', 'inspection', 'recovery', 'replacement', 'strain'].includes(context.eventKind ?? ''),
    body: 'This issue can affect future flights. The return report says what happened; this station choice says what you can do about it and when the work finishes.',
  },
] as const satisfies readonly TutorialStep[];

export type TutorialId = (typeof tutorialSteps)[number]['id'];
export function tutorialStep(id: string) { return tutorialSteps.find(step => step.id === id); }
export function hasSeen(s: State, id: TutorialId): boolean { return s.tutorial.seen.includes(id); }
export function nextTutorial(s: State, event: TutorialEvent, context: TutorialContext = {}): TutorialId | null {
  if (s.tutorial.disabled) return null;
  return tutorialSteps.find(step => step.trigger === event && !hasSeen(s, step.id) && (!('when' in step) || step.when(s, context)))?.id ?? null;
}
export function autoTutorial(s: State, tab: string): TutorialId | null {
  return tab === 'today' ? nextTutorial(s, 'view', { tab }) : null;
}
