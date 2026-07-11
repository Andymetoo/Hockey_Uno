import { mountBomberCommand } from "./App.js";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

mountBomberCommand(root);
