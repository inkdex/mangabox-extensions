import { type TestLogger } from "@paperback/types";

import { MangaKakalot } from "../MangaKakalot/main.js";
import sourceInfo from "../MangaKakalot/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaKakalot tests", logger);
  registerDefaultTests(suite, MangaKakalot, sourceInfo);

  await suite.run();
}
