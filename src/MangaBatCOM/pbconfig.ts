import { ContentRating, SourceInfo, SourceIntents } from "@paperback/types";
import { getVersion } from "../generic/MangaboxHelper";

export default {
    name: "MangaBatCOM",
    description: "Extension that pulls content from mangabat.com.",
    version: getVersion(),
    icon: "icon.png",
    language: "🇬🇧",
    contentRating: ContentRating.EVERYONE,
    badges: [],
    capabilities:
        SourceIntents.MANGA_CHAPTERS |
        SourceIntents.DISCOVER_SECIONS |
        SourceIntents.SETTINGS_UI |
        SourceIntents.MANGA_SEARCH |
        SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
    developers: [
        {
            name: "Netsky",
            github: "https://github.com/TheNetsky",
        },
        {
            name: "Saw_6",
        },
    ],
} satisfies SourceInfo;
