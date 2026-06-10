export function renderQuestionPanel(initialQuestion: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "panel";

  const label = document.createElement("label");
  label.className = "field-label";
  label.htmlFor = "question-input";
  label.textContent = "Question";

  const input = document.createElement("input");
  input.id = "question-input";
  input.className = "field-input";
  input.type = "text";
  input.value = initialQuestion;
  input.placeholder = "Were you murdered?";

  const button = document.createElement("button");
  button.id = "ask-button";
  button.className = "primary-button";
  button.type = "button";
  button.textContent = "Ask";

  wrapper.append(label, input, button);
  return wrapper;
}
