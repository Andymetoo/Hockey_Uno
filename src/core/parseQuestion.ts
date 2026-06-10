import { matchLexicon } from "./matchLexicon";
import { normalizeText } from "./normalizeText";
import type {
  Claim,
  ConceptMatch,
  FactTuple,
  GameData,
  MatchedTerm,
  ParsedQuestion,
  QuestionPatternDefinition
} from "./types";

interface PatternMatch {
  definition: QuestionPatternDefinition;
  captures: Record<string, string>;
}

function tryMatchPattern(question: string, patterns: QuestionPatternDefinition[]): PatternMatch | null {
  for (const definition of patterns) {
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

function factOptionsForConcept(intent: string, concept: ConceptMatch): FactTuple[] {
  switch (intent) {
    case "was_it_subject":
    case "was_there_subject":
    case "was_subject_important":
      return factOptionsForEntityConcept(concept);
    case "were_you_state":
    case "did_you_state":
    case "did_you_die_from":
      return factOptionsForStateConcept(concept);
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
    default:
      return [];
  }
}

function factOptionsForStateConcept(concept: ConceptMatch): FactTuple[] {
  switch (concept.conceptType) {
    case "death.cause":
      return [["death.cause", concept.conceptValue]];
    case "death.directCause":
      return [["death.directCause", concept.conceptValue]];
    case "death.manner":
      return [["death.manner", concept.conceptValue]];
    case "tag":
      return [["tag", concept.conceptValue]];
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
    case "were_you_state":
    case "did_you_state":
    case "did_you_die_from":
      return ["death.cause", "death.directCause", "death.manner", "tag", "place"].includes(concept.conceptType);
    case "were_you_in_place":
      return concept.conceptType === "place";
    case "did_person_know_you":
    case "did_you_know_person":
    case "did_person_kill_you":
      return concept.conceptType === "person";
    case "did_someone_kill_you":
      return concept.conceptType === "event";
    default:
      return false;
  }
}

function buildClaims(intent: string, concepts: ConceptMatch[]): Claim[] {
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

  return concepts
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
  const patternMatch = tryMatchPattern(normalizedQuestion, gameData.questionPatterns);

  if (!patternMatch) {
    return {
      normalizedQuestion,
      patternId: "",
      intent: "",
      matchedTerms,
      concepts: [],
      claims: [],
      captures: {}
    };
  }

  const relevantTerms = getCapturedTerms(patternMatch.captures, matchedTerms);
  const concepts = expandConcepts(relevantTerms);
  const claims = buildClaims(patternMatch.definition.intent, concepts);

  return {
    normalizedQuestion,
    patternId: patternMatch.definition.id,
    intent: patternMatch.definition.intent,
    matchedTerms,
    concepts,
    claims,
    captures: patternMatch.captures
  };
}
