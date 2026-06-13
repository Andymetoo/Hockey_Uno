export type AnswerType = "yes" | "no" | "unknown" | "partial";

export type FactTuple = [string, string];
export type ConceptTuple = [string, string];

export interface LexiconEntry {
  id: string;
  terms: string[];
  concepts: ConceptTuple[];
}

export interface LexiconAddition extends LexiconEntry {}

export interface PersonProfile {
  id: string;
  displayName: string;
  aliases: string[];
}

export interface RelationshipRecord {
  fromPersonId: string;
  toPersonId: string;
  type: string;
  tags: string[];
}

export interface SpiritProfile {
  id: string;
  name: string;
  aliases: string[];
  facts: FactTuple[];
  unknowns: FactTuple[];
  refusals: FactTuple[];
}

export interface QuestionPatternDefinition {
  id: string;
  intent: string;
  regexes: string[];
  priority: number;
}

export interface AnswerPhrase {
  displayKey: string;
  text: string;
}

export type AnswerPhraseMap = Record<AnswerType, Record<string, AnswerPhrase>>;

export interface GameData {
  lexiconEntries: LexiconEntry[];
  spirits: SpiritProfile[];
  spiritsById: Record<string, SpiritProfile>;
  people: PersonProfile[];
  peopleById: Record<string, PersonProfile>;
  relationships: RelationshipRecord[];
  questionPatterns: QuestionPatternDefinition[];
  answerPhrases: AnswerPhraseMap;
}

export interface MatchedTerm {
  lexiconId: string;
  term: string;
  normalizedTerm: string;
  start: number;
  end: number;
  concepts: ConceptTuple[];
}

export interface ParsedQuestion {
  normalizedQuestion: string;
  patternId: string;
  intent: string;
  matchedTerms: MatchedTerm[];
  concepts: ConceptMatch[];
  claims: Claim[];
  captures: Record<string, string>;
  patternMatches: PatternMatchDebug[];
  selectedPattern: PatternMatchDebug | null;
}

export interface ConceptMatch {
  lexiconId: string;
  term: string;
  conceptType: string;
  conceptValue: string;
}

export interface Claim {
  id: string;
  label: string;
  sourceConcept: ConceptMatch;
  candidateFacts: FactTuple[];
}

export interface ClaimEvaluation {
  claimId: string;
  label: string;
  matchedFacts: FactTuple[];
  contradictedFacts: FactTuple[];
  unknownFacts: FactTuple[];
  unresolvedFacts: FactTuple[];
  outcome: "matched" | "contradicted" | "unknown" | "unresolved";
}

export interface PatternMatchDebug {
  patternId: string;
  intent: string;
  priority: number;
  matched: boolean;
  selected: boolean;
  claimCount: number;
  capturedTermCount: number;
  conceptCount: number;
  score: number;
  reason: string;
}

export interface AnswerResult {
  answer: AnswerType;
  displayKey: string;
  displayText: string;
  matchedTerms: MatchedTerm[];
  concepts: ConceptMatch[];
  claims: Claim[];
  evaluation: {
    matchedFacts: FactTuple[];
    contradictedFacts: FactTuple[];
    unknownFacts: FactTuple[];
    claimEvaluations: ClaimEvaluation[];
  };
  debug: {
    normalizedQuestion: string;
    patternId: string;
    intent: string;
    patternMatches: PatternMatchDebug[];
    selectedPatternId: string;
    selectedPatternPriority: number | null;
    reason: string;
    validationIssues: string[];
  };
}

export interface AskRequest {
  spiritId: string;
  questionText: string;
}

export interface RawGameData {
  lexiconEntries: LexiconEntry[];
  spirits: SpiritProfile[];
  people?: PersonProfile[];
  relationships?: RelationshipRecord[];
  lexiconAdditions?: LexiconAddition[];
  questionPatterns: QuestionPatternDefinition[];
  answerPhrases: AnswerPhraseMap;
}

export interface WorldState {
  people: PersonProfile[];
  relationships: RelationshipRecord[];
  spirits: SpiritProfile[];
  lexiconAdditions: LexiconAddition[];
}

export interface GeneratedWorld extends WorldState {
  seed: number;
}
