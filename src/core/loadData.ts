import type {
  GameData,
  LexiconAddition,
  PersonProfile,
  RawGameData,
  RelationshipRecord
} from "./types";
import { personProfilesToLexiconEntries } from "./personLexicon";
import { validateData } from "./validateData";

export interface LoadedGameData {
  gameData: GameData;
  validationIssues: string[];
}

function mergeLexiconEntries(rawData: RawGameData) {
  const generatedPersonLexicon = personProfilesToLexiconEntries(rawData.people ?? []);
  const lexiconAdditions: LexiconAddition[] = rawData.lexiconAdditions ?? [];

  return [
    ...rawData.lexiconEntries,
    ...generatedPersonLexicon,
    ...lexiconAdditions
  ];
}

export function buildGameData(rawData: RawGameData): LoadedGameData {
  const validationIssues = validateData(rawData);
  const people: PersonProfile[] = rawData.people ?? [];
  const relationships: RelationshipRecord[] = rawData.relationships ?? [];
  const spiritsById = Object.fromEntries(rawData.spirits.map((spirit) => [spirit.id, spirit]));
  const peopleById = Object.fromEntries(people.map((person) => [person.id, person]));

  return {
    gameData: {
      lexiconEntries: mergeLexiconEntries(rawData),
      spirits: rawData.spirits,
      spiritsById,
      people,
      peopleById,
      relationships,
      questionPatterns: rawData.questionPatterns,
      answerPhrases: rawData.answerPhrases
    },
    validationIssues
  };
}
