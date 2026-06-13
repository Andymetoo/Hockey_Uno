import { matchLexicon } from "./matchLexicon";
import { normalizeText } from "./normalizeText";
import type {
  Claim,
  ConceptMatch,
  FactTuple,
  GameData,
  MatchedTerm,
  PatternMatchDebug,
  ParsedQuestion,
  QuestionPatternDefinition
} from "./types";

interface PatternMatch {
  definition: QuestionPatternDefinition;
  captures: Record<string, string>;
}

interface RankedPatternMatch {
  match: PatternMatch;
  relevantTerms: MatchedTerm[];
  concepts: ConceptMatch[];
  claims: Claim[];
  score: number;
  index: number;
}

function matchPatternDefinition(question: string, definition: QuestionPatternDefinition): PatternMatch | null {
  for (const regexText of definition.regexes) {
    const regex = new RegExp(regexText);
    const result = regex.exec(question);
    if (!result) {
      continue;
    }

    return {
      definition,
      captures: Object.fromEntries(Object.entries(result.groups ?? {}).map(([key, value]) => [key, value ?? ""]))
    };
  }

  return null;
}

function getCapturedTerms(captures: Record<string, string>, matchedTerms: MatchedTerm[]): MatchedTerm[] {
  const values = Object.values(captures).filter(Boolean);
  if (values.length === 0) {
    return matchedTerms;
  }

  return matchedTerms.filter((term) => values.some((value) => value.includes(term.normalizedTerm)));
}

function expandConcepts(matchedTerms: MatchedTerm[]): ConceptMatch[] {
  return matchedTerms.flatMap((term) =>
    term.concepts.map(([conceptType, conceptValue]) => ({
      lexiconId: term.lexiconId,
      term: term.term,
      conceptType,
      conceptValue
    }))
  );
}

function selectEntityConcepts(concepts: ConceptMatch[]): ConceptMatch[] {
  const grouped = new Map<string, ConceptMatch[]>();

  for (const concept of concepts) {
    const group = grouped.get(concept.lexiconId) ?? [];
    group.push(concept);
    grouped.set(concept.lexiconId, group);
  }

  const selected: ConceptMatch[] = [];

  for (const group of grouped.values()) {
    const objectConcept = group.find((concept) => concept.conceptType === "object");
    if (objectConcept) {
      selected.push(objectConcept);
      continue;
    }

    const placeConcept = group.find((concept) => concept.conceptType === "place");
    if (placeConcept) {
      selected.push(placeConcept);
      continue;
    }

    const personConcept = group.find((concept) => concept.conceptType === "person");
    if (personConcept) {
      selected.push(personConcept);
      continue;
    }

    selected.push(...group);
  }

  return selected;
}

function factOptionsForConcept(intent: string, concept: ConceptMatch): FactTuple[] {
  switch (intent) {
    case "was_it_subject":
    case "was_there_subject":
    case "was_subject_important":
      return factOptionsForEntityConcept(concept);
    case "were_you_subject":
    case "were_you_state":
    case "did_you_state":
    case "did_you_die_from":
      return factOptionsForStateConcept(concept);
    case "were_you_killed_by":
      return factOptionsForFatalMechanismConcept(concept);
    case "were_you_in_place":
      return concept.conceptType === "place"
        ? [["location.death", concept.conceptValue], ["location.important", concept.conceptValue]]
        : [];
    case "did_person_know_you":
    case "did_you_know_person":
      return concept.conceptType === "person" ? [["person.known", concept.conceptValue]] : [];
    case "did_person_kill_you":
      return concept.conceptType === "person"
        ? [["person.killer", concept.conceptValue], ["death.manner", "homicide"]]
        : [];
    case "did_someone_kill_you":
      return [["death.manner", "homicide"]];
    case "did_you_have_family_member":
      return concept.conceptType === "family.member" && concept.conceptValue === "child"
        ? [["family.has_children", "yes"]]
        : [];
    case "did_you_work_as_role":
      return concept.conceptType === "occupation.role"
        ? [["occupation.role", concept.conceptValue]]
        : [];
    default:
      return [];
  }
}

function factOptionsForFatalMechanismConcept(concept: ConceptMatch): FactTuple[] {
  switch (concept.conceptType) {
    case "object":
      return [["object.fatal", concept.conceptValue]];
    case "death.cause":
      return [["death.cause", concept.conceptValue]];
    case "death.directCause":
      return [["death.directCause", concept.conceptValue]];
    case "tag":
      return [["tag", concept.conceptValue]];
    case "state":
      return [["state", concept.conceptValue]];
    default:
      return [];
  }
}

function factOptionsForEntityConcept(concept: ConceptMatch): FactTuple[] {
  switch (concept.conceptType) {
    case "object":
      return [["object.fatal", concept.conceptValue], ["object.important", concept.conceptValue]];
    case "place":
      return [["location.death", concept.conceptValue], ["location.important", concept.conceptValue]];
    case "person":
      return [["person.known", concept.conceptValue], ["person.killer", concept.conceptValue]];
    case "death.cause":
      return [["death.cause", concept.conceptValue]];
    case "death.directCause":
      return [["death.directCause", concept.conceptValue]];
    case "death.manner":
      return [["death.manner", concept.conceptValue]];
    case "tag":
      return [["tag", concept.conceptValue]];
    case "state":
      return [["state", concept.conceptValue]];
    default:
      return [];
  }
}

function factOptionsForStateConcept(concept: ConceptMatch): FactTuple[] {
  switch (concept.conceptType) {
    case "relationship.status":
      return [["relationship.marital_status", concept.conceptValue]];
    case "emotion":
      return [["emotion.baseline", concept.conceptValue], ["emotion.recent", concept.conceptValue]];
    case "trait":
      return [["trait.primary", concept.conceptValue]];
    case "family.role":
      return [["family.role", concept.conceptValue]];
    case "occupation.role":
      return [["occupation.role", concept.conceptValue]];
    case "life.stage":
      return [["life.stage", concept.conceptValue]];
    case "death.cause":
      return [["death.cause", concept.conceptValue]];
    case "death.directCause":
      return [["death.directCause", concept.conceptValue]];
    case "death.manner":
      return [["death.manner", concept.conceptValue]];
    case "tag":
      return [["tag", concept.conceptValue]];
    case "state":
      return [["state", concept.conceptValue]];
    case "place":
      return [["location.death", concept.conceptValue]];
    default:
      return factOptionsForEntityConcept(concept);
  }
}

function conceptAllowed(intent: string, concept: ConceptMatch): boolean {
  switch (intent) {
    case "was_it_subject":
    case "was_there_subject":
    case "was_subject_important":
      return ["object", "place", "person", "death.cause", "death.directCause", "death.manner", "tag"].includes(concept.conceptType);
    case "were_you_subject":
      return [
        "relationship.status",
        "emotion",
        "trait",
        "family.role",
        "occupation.role",
        "life.stage",
        "death.cause",
        "death.directCause",
        "death.manner",
        "tag",
        "state"
      ].includes(concept.conceptType);
    case "were_you_state":
    case "did_you_state":
    case "did_you_die_from":
      return ["death.cause", "death.directCause", "death.manner", "tag", "place", "state"].includes(concept.conceptType);
    case "were_you_killed_by":
      return ["object", "death.cause", "death.directCause", "tag", "state"].includes(concept.conceptType);
    case "were_you_in_place":
      return concept.conceptType === "place";
    case "did_person_know_you":
    case "did_you_know_person":
    case "did_person_kill_you":
      return concept.conceptType === "person";
    case "did_someone_kill_you":
      return concept.conceptType === "event";
    case "did_you_have_family_member":
      return concept.conceptType === "family.member";
    case "did_you_work_as_role":
      return ["occupation.role", "family.role"].includes(concept.conceptType);
    default:
      return false;
  }
}

function scorePatternMatch(
  definition: QuestionPatternDefinition,
  claims: Claim[],
  relevantTerms: MatchedTerm[],
  concepts: ConceptMatch[]
): number {
  return (definition.priority * 1000) + (claims.length * 100) + (relevantTerms.length * 10) + concepts.length;
}

function buildPatternDebug(
  rankedMatch: RankedPatternMatch,
  selected: boolean,
  selectedMatch: RankedPatternMatch
): PatternMatchDebug {
  const reason = selected
    ? "Selected by priority, then claim count, then captured-term coverage, then stable order."
    : rankedMatch.match.definition.priority < selectedMatch.match.definition.priority
      ? `Lost to ${selectedMatch.match.definition.id} on priority.`
      : rankedMatch.claims.length < selectedMatch.claims.length
        ? `Lost to ${selectedMatch.match.definition.id} on claim count.`
        : rankedMatch.relevantTerms.length < selectedMatch.relevantTerms.length
          ? `Lost to ${selectedMatch.match.definition.id} on captured-term coverage.`
          : `Lost to ${selectedMatch.match.definition.id} on stable file order.`;

  return {
    patternId: rankedMatch.match.definition.id,
    intent: rankedMatch.match.definition.intent,
    priority: rankedMatch.match.definition.priority,
    matched: true,
    selected,
    claimCount: rankedMatch.claims.length,
    capturedTermCount: rankedMatch.relevantTerms.length,
    conceptCount: rankedMatch.concepts.length,
    score: rankedMatch.score,
    reason
  };
}

function buildClaims(intent: string, concepts: ConceptMatch[]): Claim[] {
  if (intent === "did_you_die" || intent === "are_you_dead") {
    return [
      {
        id: "claim.1",
        label: "state:dead",
        sourceConcept: {
          lexiconId: "builtin.state.dead",
          term: "dead",
          conceptType: "state",
          conceptValue: "dead"
        },
        candidateFacts: [["state", "dead"]]
      }
    ];
  }

  if (intent === "did_person_kill_you") {
    return concepts
      .filter((concept) => concept.conceptType === "person")
      .flatMap((concept, index) => ([
        {
          id: `claim.${index + 1}.killer`,
          label: `person.killer:${concept.conceptValue}`,
          sourceConcept: concept,
          candidateFacts: [["person.killer", concept.conceptValue]] as FactTuple[]
        },
        {
          id: `claim.${index + 1}.manner`,
          label: "death.manner:homicide",
          sourceConcept: concept,
          candidateFacts: [["death.manner", "homicide"]] as FactTuple[]
        }
      ]));
  }

  const normalizedConcepts = (
    intent === "was_it_subject"
    || intent === "was_there_subject"
    || intent === "was_subject_important"
  )
    ? selectEntityConcepts(concepts)
    : concepts;

  return normalizedConcepts
    .filter((concept) => conceptAllowed(intent, concept))
    .map((concept, index) => ({
      id: `claim.${index + 1}`,
      label: `${concept.conceptType}:${concept.conceptValue}`,
      sourceConcept: concept,
      candidateFacts: factOptionsForConcept(intent, concept)
    }))
    .filter((claim) => claim.candidateFacts.length > 0);
}

export function parseQuestion(gameData: GameData, questionText: string): ParsedQuestion {
  const normalizedQuestion = normalizeText(questionText);
  const matchedTerms = matchLexicon(normalizedQuestion, gameData.lexiconEntries);
  const rankedMatches: RankedPatternMatch[] = [];

  for (const [index, definition] of gameData.questionPatterns.entries()) {
    const patternMatch = matchPatternDefinition(normalizedQuestion, definition);
    if (!patternMatch) {
      continue;
    }

    const relevantTerms = getCapturedTerms(patternMatch.captures, matchedTerms);
    const concepts = expandConcepts(relevantTerms);
    const claims = buildClaims(patternMatch.definition.intent, concepts);
    rankedMatches.push({
      match: patternMatch,
      relevantTerms,
      concepts,
      claims,
      score: scorePatternMatch(definition, claims, relevantTerms, concepts),
      index
    });
  }

  if (rankedMatches.length === 0) {
    return {
      normalizedQuestion,
      patternId: "",
      intent: "",
      matchedTerms,
      concepts: [],
      claims: [],
      captures: {},
      patternMatches: [],
      selectedPattern: null
    };
  }

  const rankedClaimMatches = rankedMatches.filter((rankedMatch) => rankedMatch.claims.length > 0);
  const matchesToRank = rankedClaimMatches.length > 0 ? rankedClaimMatches : rankedMatches;

  matchesToRank.sort((left, right) =>
    right.match.definition.priority - left.match.definition.priority
    || right.claims.length - left.claims.length
    || right.relevantTerms.length - left.relevantTerms.length
    || right.concepts.length - left.concepts.length
    || left.index - right.index
  );

  const winner = matchesToRank[0];
  const patternMatches = rankedMatches.map((rankedMatch) => buildPatternDebug(rankedMatch, rankedMatch === winner, winner));
  const selectedPattern = patternMatches.find((patternMatch) => patternMatch.selected) ?? null;

  return {
    normalizedQuestion,
    patternId: winner.match.definition.id,
    intent: winner.match.definition.intent,
    matchedTerms,
    concepts: winner.concepts,
    claims: winner.claims,
    captures: winner.match.captures,
    patternMatches,
    selectedPattern
  };
}
