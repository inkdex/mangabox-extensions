import { type TestLogger } from "@paperback/types";

import { NeloMangaNET } from "../NeloMangaNET/main.js";
import sourceInfo from "../NeloMangaNET/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("NeloMangaNET tests", logger);
  registerDefaultTests(suite, NeloMangaNET, sourceInfo);

  await suite.run();
}
