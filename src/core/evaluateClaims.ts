import type { Claim, ClaimEvaluation, FactTuple, SpiritProfile } from "./types";

function matchesUnknown(unknown: FactTuple, claimFact: FactTuple): boolean {
  return unknown[0] === claimFact[0] && (unknown[1] === "*" || unknown[1] === claimFact[1]);
}

function evaluateClaim(claim: Claim, spirit: SpiritProfile): ClaimEvaluation {
  const matchedFacts: FactTuple[] = [];
  const contradictedFacts: FactTuple[] = [];
  const unknownFacts: FactTuple[] = [];
  const unresolvedFacts: FactTuple[] = [];

  for (const candidate of claim.candidateFacts) {
    const exactMatches = spirit.facts.filter((fact) => fact[0] === candidate[0] && fact[1] === candidate[1]);
    if (exactMatches.length > 0) {
      matchedFacts.push(...exactMatches);
      continue;
    }

    const sameKeyFacts = spirit.facts.filter((fact) => fact[0] === candidate[0] && fact[1] !== candidate[1]);
    if (sameKeyFacts.length > 0) {
      contradictedFacts.push(...sameKeyFacts);
      continue;
    }

    const unknownHits = spirit.unknowns.filter((fact) => matchesUnknown(fact, candidate));
    if (unknownHits.length > 0) {
      unknownFacts.push(...unknownHits);
      continue;
    }

    unresolvedFacts.push(candidate);
  }

  const outcome = matchedFacts.length > 0
    ? "matched"
    : unknownFacts.length > 0 && contradictedFacts.length === 0
      ? "unknown"
      : contradictedFacts.length > 0
        ? "contradicted"
        : "unresolved";

  return {
    claimId: claim.id,
    label: claim.label,
    matchedFacts,
    contradictedFacts,
    unknownFacts,
    unresolvedFacts,
    outcome
  };
}

export function evaluateClaims(claims: Claim[], spirit: SpiritProfile) {
  const claimEvaluations = claims.map((claim) => evaluateClaim(claim, spirit));
  const matchedFacts = claimEvaluations.flatMap((item) => item.matchedFacts);
  const contradictedFacts = claimEvaluations.flatMap((item) => item.contradictedFacts);
  const unknownFacts = claimEvaluations.flatMap((item) => item.unknownFacts);

  return {
    claimEvaluations,
    matchedFacts,
    contradictedFacts,
    unknownFacts
  };
}
