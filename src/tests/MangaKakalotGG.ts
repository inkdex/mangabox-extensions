import { type TestLogger } from "@paperback/types";

import { MangaKakalotGG } from "../MangaKakalotGG/main.js";
import sourceInfo from "../MangaKakalotGG/pbconfig.js";
import { TestSuite, registerDefaultTests } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("MangaKakalotGG tests", logger);
  registerDefaultTests(suite, MangaKakalotGG, sourceInfo);

  await suite.run();
}
