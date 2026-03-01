import { BasicRateLimiter } from "@paperback/types";
import { MangaboxGeneric } from "../generic/Mangabox";
import pbconfig from "./pbconfig";

const DOMAIN: string = "https://www.mangakakalot.gg";

class MangaKakalotGGExtension extends MangaboxGeneric {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
      language: pbconfig.language,
      rateLimiter: new BasicRateLimiter("main", {
        numberOfRequests: 1,
        bufferInterval: 1,
        ignoreImages: true,
      }),
    });
  }
}

export const MangaKakalotGG = new MangaKakalotGGExtension();
