import { ContentRating, SourceInfo, SourceIntents } from "@paperback/types";
import { getVersion } from "../generic/MangaboxHelper";

export default {
    name: "NeloMangaNET",
    description: "Extension that pulls content from nelomanga.net.",
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
