import { type TestLogger } from "@paperback/types";

import { MangaBat } from "../MangaBat/main.js";
import sourceInfo from "../MangaBat/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaBat tests", logger);
  registerDefaultTests(suite, MangaBat, sourceInfo);

  await suite.run();
}
