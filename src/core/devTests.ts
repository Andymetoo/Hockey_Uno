import { askQuestion } from "./askQuestion";
import type { GameData } from "./types";

interface TestCase {
  spiritId: string;
  questionText: string;
  expected: "yes" | "no" | "unknown" | "partial";
}

const TEST_CASES: TestCase[] = [
  { spiritId: "spirit.mara", questionText: "Was it a knife?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Were you murdered?", expected: "no" },
  { spiritId: "spirit.mara", questionText: "Was it an accident?", expected: "yes" },
  { spiritId: "spirit.mara", questionText: "Was it a gun?", expected: "no" },
  { spiritId: "spirit.mara", questionText: "Were you in the kitchen?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Did you drown?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Was there water?", expected: "yes" },
  { spiritId: "spirit.elias", questionText: "Do you know Julia?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you murdered?", expected: "no" },
  { spiritId: "spirit.ruth", questionText: "Was it natural?", expected: "yes" },
  { spiritId: "spirit.ruth", questionText: "Were you sick?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Was it a car?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Was it a vehicle?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Were you on a road?", expected: "yes" },
  { spiritId: "spirit.caleb", questionText: "Were you murdered?", expected: "no" }
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
