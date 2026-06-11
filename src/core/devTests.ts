import { askQuestion } from "./askQuestion";
import type { GameData } from "./types";

interface TestCase {
  spiritId: string;
  questionText: string;
  expected: "yes" | "no" | "unknown" | "partial";
}

const TEST_CASES: TestCase[] = [
  { spiritId: "spirit.mara", questionText: "Was it a knife?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Was it a kitchen knife?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Was it sharp?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Were you murdered?", expected: "no" },
  { spiritId: "spirit.mara", questionText: "Was it an accident?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Was it a gun?", expected: "no" },
  { spiritId: "spirit.mara", questionText: "Were you in the kitchen?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Were you killed by a knife?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Were you killed by something sharp?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Were you married?", expected: "no" },
  { spiritId: "spirit.mara", questionText: "Were you happy?", expected: "no" },
  { spiritId: "spirit.mara", questionText: "Were you a chef?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Were you careful?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Did you have children?", expected: "no" },
  { spiritId: "spirit.mara", questionText: "Are you dead?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Did you die?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Did you drown?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Was there water?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Do you know Julia?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Were you happy?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Were you lonely?", expected: "no" },
  { spiritId: "spirit.elias", questionText: "Were you a fisherman?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Did you die?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you murdered?", expected: "no" },
  { spiritId: "spirit.ruth", questionText: "Was it natural?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you sick?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you married?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Did you have children?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you a teacher?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you a mother?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you happy?", expected: "no" },
  { spiritId: "spirit.ruth", questionText: "Were you content?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you devout?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Are you dead?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Was it a car?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Was it a vehicle?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Were you on a road?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Were you hit by a car?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Were you murdered?", expected: "no" },
  { spiritId: "spirit.caleb", questionText: "Were you a mechanic?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Were you stubborn?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Did you have children?", expected: "no" },
  { spiritId: "spirit.caleb", questionText: "Were you married?", expected: "no" },
  { spiritId: "spirit.caleb", questionText: "Were you happy?", expected: "no" },
  { spiritId: "spirit.caleb", questionText: "Were you loved?", expected: "unknown" }
];

export function runDevTests(gameData: GameData, validationIssues: string[]): string[] {
  const failures: string[] = [];

  for (const testCase of TEST_CASES) {
    const result = askQuestion(gameData, testCase, validationIssues);
    if (result.answer !== testCase.expected) {
      failures.push(`${testCase.spiritId} :: "${testCase.questionText}" expected ${testCase.expected} but got ${result.answer}`);
    }
  }

  return failures;
}
