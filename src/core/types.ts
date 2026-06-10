export type AnswerType = "yes" | "no" | "unknown" | "partial";

export type FactTuple = [string, string];
export type ConceptTuple = [string, string];

export interface LexiconEntry {
  id: string;
  terms: string[];
  concepts: ConceptTuple[];
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
  questionPatterns: QuestionPatternDefinition[];
  answerPhrases: AnswerPhraseMap;
}
