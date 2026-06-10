import type {
  AnswerPhraseMap,
  GameData,
  LexiconEntry,
  QuestionPatternDefinition,
  RawGameData,
  SpiritProfile
} from "./types";
import { validateData } from "./validateData";

const LEXICON_PATHS = [
  "/data/lexicon/objects.json",
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

export interface JsonReader {
  <T>(path: string): Promise<T>;
}

export interface LoadedGameData {
  gameData: GameData;
  validationIssues: string[];
}

export function buildGameData(rawData: RawGameData): LoadedGameData {
  const validationIssues = validateData(rawData);
  const spiritsById = Object.fromEntries(rawData.spirits.map((spirit) => [spirit.id, spirit]));

  return {
    gameData: {
      lexiconEntries: rawData.lexiconEntries,
      spirits: rawData.spirits,
      spiritsById,
      questionPatterns: rawData.questionPatterns,
      answerPhrases: rawData.answerPhrases
    },
    validationIssues
  };
}

export async function loadData(readJson: JsonReader): Promise<LoadedGameData> {
  const lexiconGroups = await Promise.all(LEXICON_PATHS.map((path) => readJson<LexiconEntry[]>(path)));
  const spirits = await Promise.all(SPIRIT_PATHS.map((path) => readJson<SpiritProfile>(path)));
  const questionPatterns = await readJson<QuestionPatternDefinition[]>("/data/questionPatterns.json");
  const answerPhrases = await readJson<AnswerPhraseMap>("/data/answerPhrases.json");

  return buildGameData({
    lexiconEntries: lexiconGroups.flat(),
    spirits,
    questionPatterns,
    answerPhrases
  });
}
