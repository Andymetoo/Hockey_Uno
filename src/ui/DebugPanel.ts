import type { AnswerResult, FactTuple } from "../core/types";

function tupleList(items: FactTuple[]): string {
  return items.length === 0 ? "[]" : JSON.stringify(items, null, 2);
}

function list(items: string[]): string {
  return items.length === 0 ? "[]" : JSON.stringify(items, null, 2);
}

export function renderDebugPanel(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "panel debug-panel";
  panel.id = "debug-panel";
  panel.innerHTML = "<h2>Debug</h2><pre id=\"debug-output\">Ask a question to inspect the parser and evaluator.</pre>";
  return panel;
}

export function updateDebugPanel(node: HTMLElement, result: AnswerResult): void {
  const pre = node.querySelector("#debug-output");
  if (!pre) {
    return;
  }

  const content = [
    `normalized question: ${result.debug.normalizedQuestion}`,
    `pattern id: ${result.debug.patternId || "<none>"}`,
    `matched terms: ${list(result.matchedTerms.map((term) => term.term))}`,
    `matched lexicon ids: ${list(result.matchedTerms.map((term) => term.lexiconId))}`,
    `concepts produced: ${JSON.stringify(result.concepts, null, 2)}`,
    `generated claims: ${JSON.stringify(result.claims, null, 2)}`,
    `matched facts: ${tupleList(result.evaluation.matchedFacts)}`,
    `contradicted facts: ${tupleList(result.evaluation.contradictedFacts)}`,
    `unknown/refusal hits: ${tupleList(result.evaluation.unknownFacts)}`,
    `claim evaluations: ${JSON.stringify(result.evaluation.claimEvaluations, null, 2)}`,
    `final answer reason: ${result.debug.reason}`,
    `validation issues: ${list(result.debug.validationIssues)}`
  ].join("\n\n");

  pre.textContent = content;
}
