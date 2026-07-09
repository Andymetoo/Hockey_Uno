import { mountBomberCommand } from "./App";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root.");
}

mountBomberCommand(root);
