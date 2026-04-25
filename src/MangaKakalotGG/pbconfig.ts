import { ContentRating, type ExtensionInfo, SourceIntents } from "@paperback/types";
import { getVersion } from "../generic/utils";

export default {
  name: "MangaKakalotGG",
  description: "Extension that pulls content from mangakakalot.gg.",
  version: getVersion(),
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  badges: [],
  capabilities:
    SourceIntents.CHAPTER_PROVIDING |
    SourceIntents.DISCOVER_SECIONS_PROVIDING |
    SourceIntents.SETTINGS_FORM_PROVIDING |
    SourceIntents.SEARCH_RESULTS_PROVIDING |
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  developers: [
    {
      name: "Saw_6",
    },
  ],
} satisfies ExtensionInfo;
