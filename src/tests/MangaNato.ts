import { type TestLogger } from "@paperback/types";

import { MangaNato } from "../MangaNato/main.js";
import sourceInfo from "../MangaNato/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaNato tests", logger);
  registerDefaultTests(suite, MangaNato, sourceInfo);

  await suite.run();
}
