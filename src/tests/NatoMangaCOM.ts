import { type TestLogger } from "@paperback/types";

import { NatoMangaCOM } from "../NatoMangaCOM/main.js";
import sourceInfo from "../NatoMangaCOM/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("NatoMangaCOM tests", logger);
  registerDefaultTests(suite, NatoMangaCOM, sourceInfo);

  await suite.run();
}
