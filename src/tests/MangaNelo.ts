import { type TestLogger } from "@paperback/types";

import { MangaNelo } from "../MangaNelo/main.js";
import sourceInfo from "../MangaNelo/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaNelo tests", logger);
  registerDefaultTests(suite, MangaNelo, sourceInfo);

  await suite.run();
}
