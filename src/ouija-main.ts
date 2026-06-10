import "./styles.css";
import { buildGameData } from "./core/loadData";
import { rawGameData } from "./data";
import { mountApp } from "./ui/App";

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) {
    throw new Error("Missing #app root.");
  }

  root.innerHTML = "<div class=\"loading\">Loading ouija prototype...</div>";

  const { gameData, validationIssues } = buildGameData(rawGameData);
  root.innerHTML = "";
  mountApp(root, gameData, validationIssues);
}

bootstrap().catch((error) => {
  const root = document.querySelector<HTMLElement>("#app");
  if (root) {
    root.innerHTML = `<pre class="error-panel">${String(error)}</pre>`;
  }
  console.error(error);
});
