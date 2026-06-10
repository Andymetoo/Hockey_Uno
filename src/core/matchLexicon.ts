import { normalizeText } from "./normalizeText";
import type { LexiconEntry, MatchedTerm } from "./types";

interface LexiconCandidate {
  entry: LexiconEntry;
  normalizedTerm: string;
}

function hasWordBoundary(text: string, index: number, length: number): boolean {
  const left = index === 0 ? " " : text[index - 1];
  const rightIndex = index + length;
  const right = rightIndex >= text.length ? " " : text[rightIndex];
  return left === " " && right === " ";
}

export function matchLexicon(normalizedQuestion: string, entries: LexiconEntry[]): MatchedTerm[] {
  const paddedQuestion = ` ${normalizedQuestion} `;
  const candidates: LexiconCandidate[] = entries.flatMap((entry) =>
    entry.terms.map((term) => ({
      entry,
      normalizedTerm: normalizeText(term)
    }))
  );

  candidates.sort((a, b) => b.normalizedTerm.length - a.normalizedTerm.length);

  const matches: MatchedTerm[] = [];
  const occupied: Array<{ start: number; end: number }> = [];

  for (const candidate of candidates) {
    if (!candidate.normalizedTerm) {
      continue;
    }

    let searchIndex = paddedQuestion.indexOf(` ${candidate.normalizedTerm} `);
    while (searchIndex >= 0) {
      const start = searchIndex;
      const end = start + candidate.normalizedTerm.length;
      const overlaps = occupied.some((range) => !(end <= range.start || start >= range.end));

      if (!overlaps && hasWordBoundary(paddedQuestion, start, candidate.normalizedTerm.length)) {
        matches.push({
          lexiconId: candidate.entry.id,
          term: candidate.normalizedTerm,
          normalizedTerm: candidate.normalizedTerm,
          start,
          end,
          concepts: candidate.entry.concepts
        });
        occupied.push({ start, end });
      }

      searchIndex = paddedQuestion.indexOf(` ${candidate.normalizedTerm} `, searchIndex + 1);
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}
