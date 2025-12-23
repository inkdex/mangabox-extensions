import { MangaboxGeneric } from "../generic/Mangabox";
import pbconfig from "./pbconfig";

const DOMAIN: string = "https://www.natomanga.com";

class NatoMangaCOMExtension extends MangaboxGeneric {
  constructor() {
    super({
      domain: DOMAIN,
      name: pbconfig.name,
      contentRating: pbconfig.contentRating,
      language: pbconfig.language,
    });
  }
}

export const NatoMangaCOM = new NatoMangaCOMExtension();
