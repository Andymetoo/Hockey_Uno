import { evaluateClaims } from "./evaluateClaims";
import { parseQuestion } from "./parseQuestion";
import type { AnswerResult, AskRequest, GameData } from "./types";

function getDisplay(gameData: GameData, answer: AnswerResult["answer"]) {
  return gameData.answerPhrases[answer]?.default ?? {
    displayKey: `ouija.${answer}.default`,
    text: answer.toUpperCase()
  };
}

function describeIntent(intent: string): string {
  if (intent === "were_you_killed_by") {
    return "This intent checks the fatal mechanism or direct cause, not whether the death was homicide.";
  }

  return "";
}

export function askQuestion(
  gameData: GameData,
  request: AskRequest,
  validationIssues: string[] = []
): AnswerResult {
  const spirit = gameData.spiritsById[request.spiritId];
  if (!spirit) {
    const display = getDisplay(gameData, "unknown");
    return {
      answer: "unknown",
      displayKey: display.displayKey,
      displayText: display.text,
      matchedTerms: [],
      concepts: [],
      claims: [],
      evaluation: {
        matchedFacts: [],
        contradictedFacts: [],
        unknownFacts: [],
        claimEvaluations: []
      },
      debug: {
        normalizedQuestion: request.questionText,
        patternId: "",
        intent: "",
        reason: `Spirit "${request.spiritId}" was not found.`,
        validationIssues
      }
    };
  }

  const parsed = parseQuestion(gameData, request.questionText);
  if (!parsed.patternId || parsed.claims.length === 0) {
    const display = getDisplay(gameData, "unknown");
    const reason = !parsed.patternId
      ? "The question did not match a supported pattern strongly enough to evaluate."
      : parsed.matchedTerms.length === 0
        ? "The question pattern was recognized, but no lexicon terms were matched strongly enough to produce claims."
        : "The question pattern was recognized, but the matched terms did not map to any supported claim type.";

    return {
      answer: "unknown",
      displayKey: display.displayKey,
      displayText: display.text,
      matchedTerms: parsed.matchedTerms,
      concepts: parsed.concepts,
      claims: parsed.claims,
      evaluation: {
        matchedFacts: [],
        contradictedFacts: [],
        unknownFacts: [],
        claimEvaluations: []
      },
      debug: {
        normalizedQuestion: parsed.normalizedQuestion,
        patternId: parsed.patternId,
        intent: parsed.intent,
        reason,
        validationIssues
      }
    };
  }

  const evaluation = evaluateClaims(parsed.claims, spirit);
  const matchedCount = evaluation.claimEvaluations.filter((item) => item.outcome === "matched").length;
  const unknownCount = evaluation.claimEvaluations.filter((item) => item.outcome === "unknown").length;
  const contradictedCount = evaluation.claimEvaluations.filter((item) => item.outcome === "contradicted").length;
  const unresolvedCount = evaluation.claimEvaluations.filter((item) => item.outcome === "unresolved").length;

  let answer: AnswerResult["answer"];
  let reason: string;

  if (matchedCount > 0 && contradictedCount === 0 && unknownCount === 0 && unresolvedCount === 0) {
    answer = "yes";
    reason = "Every generated claim matched known spirit facts.";
  } else if (matchedCount > 0) {
    answer = "partial";
    reason = "Some generated claims matched, but at least one claim stayed unknown, contradicted, or unresolved.";
  } else if (unknownCount > 0 && contradictedCount === 0) {
    answer = "unknown";
    reason = "The question parsed, but the spirit marks at least one required fact as unknown.";
  } else {
    answer = "no";
    reason = contradictedCount > 0
      ? "Known spirit facts contradicted the generated claim set."
      : "No generated claims matched known spirit facts.";
  }

  const intentNote = describeIntent(parsed.intent);
  if (intentNote) {
    reason = `${reason} ${intentNote}`;
  }

  const display = getDisplay(gameData, answer);

  return {
    answer,
    displayKey: display.displayKey,
    displayText: display.text,
    matchedTerms: parsed.matchedTerms,
    concepts: parsed.concepts,
    claims: parsed.claims,
    evaluation,
    debug: {
      normalizedQuestion: parsed.normalizedQuestion,
      patternId: parsed.patternId,
      intent: parsed.intent,
      reason,
      validationIssues
    }
  };
}
