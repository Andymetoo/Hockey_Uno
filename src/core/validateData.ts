import { personProfilesToLexiconEntries } from "./personLexicon";
import type {
  FactTuple,
  LexiconEntry,
  PersonProfile,
  QuestionPatternDefinition,
  RawGameData,
  RelationshipRecord,
  SpiritProfile
} from "./types";

function isValidTuple(tuple: unknown): tuple is FactTuple {
  return Array.isArray(tuple)
    && tuple.length === 2
    && typeof tuple[0] === "string"
    && typeof tuple[1] === "string"
    && tuple[0].length > 0
    && tuple[1].length > 0;
}

function validateLexicon(entries: LexiconEntry[], issues: string[]): void {
  const seenTerms = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.id) {
      issues.push("Lexicon entry is missing an id.");
    }

    if (!Array.isArray(entry.terms) || entry.terms.length === 0) {
      issues.push(`Lexicon entry ${entry.id || "<unknown>"} has an empty terms array.`);
    }

    for (const term of entry.terms ?? []) {
      const normalized = term.trim().toLowerCase();
      if (seenTerms.has(normalized)) {
        issues.push(`Duplicate lexicon term "${normalized}" found in ${seenTerms.get(normalized)} and ${entry.id}.`);
      } else {
        seenTerms.set(normalized, entry.id);
      }
    }

    if (!Array.isArray(entry.concepts) || entry.concepts.some((concept) => !isValidTuple(concept))) {
      issues.push(`Lexicon entry ${entry.id} has malformed concepts.`);
    }
  }
}

function validatePeople(people: PersonProfile[], issues: string[]): void {
  const seenIds = new Set<string>();

  for (const person of people) {
    if (!person.id) {
      issues.push("Person profile is missing an id.");
      continue;
    }

    if (seenIds.has(person.id)) {
      issues.push(`Duplicate person id "${person.id}".`);
    }
    seenIds.add(person.id);

    if (!person.displayName) {
      issues.push(`Person ${person.id} is missing a displayName.`);
    }

    if (!Array.isArray(person.aliases)) {
      issues.push(`Person ${person.id} has malformed aliases.`);
    }
  }
}

function validateRelationships(relationships: RelationshipRecord[], people: PersonProfile[], issues: string[]): void {
  const personIds = new Set(people.map((person) => person.id));

  for (const relationship of relationships) {
    if (!personIds.has(relationship.fromPersonId)) {
      issues.push(`Relationship references missing fromPersonId "${relationship.fromPersonId}".`);
    }

    if (!personIds.has(relationship.toPersonId)) {
      issues.push(`Relationship references missing toPersonId "${relationship.toPersonId}".`);
    }
  }
}

function validateSpirit(spirit: SpiritProfile, issues: string[]): void {
  if (!spirit.id) {
    issues.push("Spirit is missing an id.");
  }

  if (!Array.isArray(spirit.facts) || spirit.facts.some((fact) => !isValidTuple(fact))) {
    issues.push(`Spirit ${spirit.id || "<unknown>"} has malformed facts.`);
  }

  if (!Array.isArray(spirit.unknowns) || spirit.unknowns.some((fact) => !isValidTuple(fact))) {
    issues.push(`Spirit ${spirit.id || "<unknown>"} has malformed unknowns.`);
  }

  if (!Array.isArray(spirit.refusals) || spirit.refusals.some((fact) => !isValidTuple(fact))) {
    issues.push(`Spirit ${spirit.id || "<unknown>"} has malformed refusals.`);
  }
}

function validatePatterns(patterns: QuestionPatternDefinition[], issues: string[]): void {
  const regexPriorityMap = new Map<string, string>();

  for (const pattern of patterns) {
    if (!pattern.id || !pattern.intent) {
      issues.push(`Question pattern ${pattern.id || "<unknown>"} is missing an id or intent.`);
    }

    if (typeof pattern.priority !== "number" || !Number.isFinite(pattern.priority)) {
      issues.push(`Question pattern ${pattern.id || "<unknown>"} is missing a valid priority.`);
    }

    if (!Array.isArray(pattern.regexes) || pattern.regexes.length === 0) {
      issues.push(`Question pattern ${pattern.id || "<unknown>"} has no regexes.`);
      continue;
    }

    for (const regexText of pattern.regexes) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(regexText);
      } catch {
        issues.push(`Question pattern ${pattern.id} has malformed regex "${regexText}".`);
      }

      const key = `${pattern.priority}::${regexText}`;
      if (regexPriorityMap.has(key)) {
        issues.push(`Question patterns ${regexPriorityMap.get(key)} and ${pattern.id} share regex "${regexText}" at priority ${pattern.priority}.`);
      } else {
        regexPriorityMap.set(key, pattern.id);
      }
    }
  }
}

export function validateData(data: RawGameData): string[] {
  const issues: string[] = [];
  const seenSpiritIds = new Set<string>();
  const people = data.people ?? [];
  const relationships = data.relationships ?? [];
  const generatedPersonLexicon = personProfilesToLexiconEntries(people);
  const lexiconAdditions = data.lexiconAdditions ?? [];
  const mergedLexicon = [...data.lexiconEntries, ...generatedPersonLexicon, ...lexiconAdditions];

  validateLexicon(mergedLexicon, issues);
  validatePatterns(data.questionPatterns, issues);
  validatePeople(people, issues);
  validateRelationships(relationships, people, issues);

  for (const spirit of data.spirits) {
    validateSpirit(spirit, issues);
    if (!spirit.id) {
      issues.push("A spirit entry is missing its id.");
      continue;
    }

    if (seenSpiritIds.has(spirit.id)) {
      issues.push(`Duplicate spirit id "${spirit.id}".`);
    }
    seenSpiritIds.add(spirit.id);
  }

  return issues;
}
