import { type TestLogger } from "@paperback/types";

import { MangaBatCOM } from "../MangaBatCOM/main.js";
import sourceInfo from "../MangaBatCOM/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaBatCOM tests", logger);
  registerDefaultTests(suite, MangaBatCOM, sourceInfo);

  await suite.run();
}
