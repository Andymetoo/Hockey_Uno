import "./styles.css";
import { buildGameData } from "./core/loadData";
import type { AnswerPhraseMap, LexiconEntry, QuestionPatternDefinition, RawGameData, SpiritProfile } from "./core/types";
import { mountApp } from "./ui/App";

const LEXICON_PATHS = [
  "/data/lexicon/objects.json",
  "/data/lexicon/biography.json",
  "/data/lexicon/death_causes.json",
  "/data/lexicon/manners.json",
  "/data/lexicon/places.json",
  "/data/lexicon/people.json",
  "/data/lexicon/events.json"
];

const SPIRIT_PATHS = [
  "/data/spirits/mara_kitchen_accident.json",
  "/data/spirits/elias_river_drowning.json",
  "/data/spirits/ruth_natural_illness.json",
  "/data/spirits/caleb_vehicle_accident.json"
];

function getRuntimeScriptSrc(): string {
  const currentScript = document.currentScript;
  if (currentScript instanceof HTMLScriptElement && currentScript.src) {
    return currentScript.src;
  }

  const runtimeScript = document.querySelector<HTMLScriptElement>('script[src$="ouija.js"]');
  return runtimeScript?.src ?? "";
}

function stripFileName(url: string): string {
  return url.replace(/[^/]*$/, "");
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function joinUrl(base: string, relativePath: string): string {
  return `${ensureTrailingSlash(base)}${relativePath.replace(/^\//, "")}`;
}

function candidateDataUrls(path: string): string[] {
  const runtimeScriptSrc = getRuntimeScriptSrc();
  if (runtimeScriptSrc.includes("/src/")) {
    return [path];
  }

  const relativePath = path.replace(/^\//, "");
  const pageBase = stripFileName(window.location.href);
  const runtimeBase = runtimeScriptSrc ? stripFileName(runtimeScriptSrc) : pageBase;
  const siteBase = `${window.location.origin}/`;

  return [
    joinUrl(runtimeBase, relativePath),
    joinUrl(pageBase, relativePath),
    path,
    joinUrl(siteBase, relativePath)
  ];
}

async function readJson<T>(path: string): Promise<T> {
  const attemptedUrls: string[] = [];

  for (const candidate of candidateDataUrls(path)) {
    attemptedUrls.push(candidate);
    const response = await fetch(candidate);
    if (!response.ok) {
      continue;
    }

    return response.json() as Promise<T>;
  }

  if (attemptedUrls.length > 0) {
    throw new Error(`Failed to load ${path}: tried ${attemptedUrls.join(", ")}`);
  }

  throw new Error(`Failed to load ${path}`);
}

async function loadPublicRawGameData(): Promise<RawGameData> {
  // JSON under public/data is the editable source of truth. Built assets are disposable.
  const lexiconGroups = await Promise.all(LEXICON_PATHS.map((path) => readJson<LexiconEntry[]>(path)));
  const spirits = await Promise.all(SPIRIT_PATHS.map((path) => readJson<SpiritProfile>(path)));
  const questionPatterns = await readJson<QuestionPatternDefinition[]>("/data/questionPatterns.json");
  const answerPhrases = await readJson<AnswerPhraseMap>("/data/answerPhrases.json");

  return {
    lexiconEntries: lexiconGroups.flat(),
    spirits,
    questionPatterns,
    answerPhrases
  };
}

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) {
    throw new Error("Missing #app root.");
  }

  root.innerHTML = "<div class=\"loading\">Loading ouija prototype...</div>";

  const rawGameData = await loadPublicRawGameData();
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
