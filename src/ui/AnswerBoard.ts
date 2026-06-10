import type { AnswerResult } from "../core/types";

export function renderAnswerBoard(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "answer-board";
  wrapper.id = "answer-board";
  wrapper.textContent = "ASK A QUESTION";
  return wrapper;
}

export function updateAnswerBoard(node: HTMLElement, result: AnswerResult): void {
  node.textContent = result.displayText;
  node.setAttribute("data-answer", result.answer);
}
