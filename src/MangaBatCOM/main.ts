import { MangaboxGeneric } from "../generic/Mangabox";
import pbconfig from "./pbconfig";

const DOMAIN: string = "https://www.mangabats.com";

class MangaBatCOMExtension extends MangaboxGeneric {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
      language: pbconfig.language,
    });
  }
}

export const MangaBatCOM = new MangaBatCOMExtension();
