import type { FactTuple, LexiconEntry, QuestionPatternDefinition, RawGameData, SpiritProfile } from "./types";

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
  for (const pattern of patterns) {
    if (!pattern.id || !pattern.intent) {
      issues.push(`Question pattern ${pattern.id || "<unknown>"} is missing an id or intent.`);
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
    }
  }
}

export function validateData(data: RawGameData): string[] {
  const issues: string[] = [];
  const seenSpiritIds = new Set<string>();

  validateLexicon(data.lexiconEntries, issues);
  validatePatterns(data.questionPatterns, issues);

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
