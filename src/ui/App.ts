import { askQuestion } from "../core/askQuestion";
import { runDevTests } from "../core/devTests";
import type { GameData } from "../core/types";
import { renderAnswerBoard, updateAnswerBoard } from "./AnswerBoard";
import { renderDebugPanel, updateDebugPanel } from "./DebugPanel";
import { renderQuestionPanel } from "./QuestionPanel";
import { renderSpiritSelector } from "./SpiritSelector";

export function mountApp(
  root: HTMLElement,
  gameData: GameData,
  validationIssues: string[]
): void {
  const initialSpiritId = gameData.spirits[0]?.id ?? "";
  const shell = document.createElement("main");
  shell.className = "app-shell";

  const header = document.createElement("header");
  header.className = "hero";
  header.innerHTML = `
    <p class="eyebrow">Developer Harness</p>
    <h1>Ouija Simulator Prototype</h1>
    <p class="subcopy">Deterministic question parser and fact evaluator backed by JSON data.</p>
  `;

  const controls = document.createElement("section");
  controls.className = "controls";

  const selector = renderSpiritSelector(gameData.spirits, initialSpiritId);
  const questionPanel = renderQuestionPanel("Was it a knife?");
  const answerBoard = renderAnswerBoard();
  const debugPanel = renderDebugPanel();

  controls.append(selector, questionPanel);
  shell.append(header, controls, answerBoard, debugPanel);
  root.append(shell);

  const spiritSelect = selector.querySelector("select") as HTMLSelectElement;
  const questionInput = questionPanel.querySelector("input") as HTMLInputElement;
  const askButton = questionPanel.querySelector("button") as HTMLButtonElement;

  const submit = () => {
    const result = askQuestion(
      gameData,
      {
        spiritId: spiritSelect.value,
        questionText: questionInput.value
      },
      validationIssues
    );

    updateAnswerBoard(answerBoard, result);
    updateDebugPanel(debugPanel, result);
  };

  askButton.addEventListener("click", submit);
  questionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submit();
    }
  });

  const testFailures = runDevTests(gameData, validationIssues);
  if (testFailures.length > 0) {
    console.warn("Ouija dev test failures", testFailures);
  } else {
    console.info("Ouija dev tests passed");
  }

  submit();
}
