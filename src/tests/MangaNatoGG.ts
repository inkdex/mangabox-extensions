import { type TestLogger } from "@paperback/types";

import { MangaNatoGG } from "../MangaNatoGG/main.js";
import sourceInfo from "../MangaNatoGG/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaNatoGG tests", logger);
  registerDefaultTests(suite, MangaNatoGG, sourceInfo);

  await suite.run();
}
