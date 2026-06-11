import answerPhrases from "./answerPhrases.json";
import questionPatterns from "./questionPatterns.json";
import biography from "./lexicon/biography.json";
import deathCauses from "./lexicon/death_causes.json";
import events from "./lexicon/events.json";
import manners from "./lexicon/manners.json";
import objects from "./lexicon/objects.json";
import people from "./lexicon/people.json";
import places from "./lexicon/places.json";
import caleb from "./spirits/caleb_vehicle_accident.json";
import elias from "./spirits/elias_river_drowning.json";
import mara from "./spirits/mara_kitchen_accident.json";
import ruth from "./spirits/ruth_natural_illness.json";
import type {
  AnswerPhraseMap,
  FactTuple,
  LexiconEntry,
  QuestionPatternDefinition,
  RawGameData,
  SpiritProfile
} from "../core/types";

function toFactTuples(items: string[][]): FactTuple[] {
  return items.map((item) => [item[0], item[1]]);
}

function toLexiconEntry(entry: {
  id: string;
  terms: string[];
  concepts: string[][];
}): LexiconEntry {
  return {
    id: entry.id,
    terms: entry.terms,
    concepts: toFactTuples(entry.concepts)
  };
}

function toSpiritProfile(spirit: {
  id: string;
  name: string;
  aliases: string[];
  facts: string[][];
  unknowns: string[][];
  refusals: string[][];
}): SpiritProfile {
  return {
    id: spirit.id,
    name: spirit.name,
    aliases: spirit.aliases,
    facts: toFactTuples(spirit.facts),
    unknowns: toFactTuples(spirit.unknowns),
    refusals: toFactTuples(spirit.refusals)
  };
}

export const rawGameData: RawGameData = {
  lexiconEntries: [
    ...objects.map(toLexiconEntry),
    ...biography.map(toLexiconEntry),
    ...deathCauses.map(toLexiconEntry),
    ...manners.map(toLexiconEntry),
    ...places.map(toLexiconEntry),
    ...people.map(toLexiconEntry),
    ...events.map(toLexiconEntry)
  ],
  spirits: [
    toSpiritProfile(mara),
    toSpiritProfile(elias),
    toSpiritProfile(ruth),
    toSpiritProfile(caleb)
  ],
  questionPatterns: questionPatterns as QuestionPatternDefinition[],
  answerPhrases: answerPhrases as AnswerPhraseMap
};
