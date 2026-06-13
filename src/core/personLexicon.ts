import type { LexiconEntry, PersonProfile } from "./types";

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const term of terms) {
    const normalized = term.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function personProfilesToLexiconEntries(people: PersonProfile[]): LexiconEntry[] {
  return people.map((person) => ({
    id: `lex.generated.${person.id}`,
    terms: uniqueTerms([person.displayName, ...person.aliases]),
    concepts: [["person", person.id]]
  }));
}
