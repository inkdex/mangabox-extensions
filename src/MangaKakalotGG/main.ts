/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { BasicRateLimiter } from "@paperback/types";
import { Mangabox } from "../generic/main";
import pbconfig from "./pbconfig";

const DOMAIN: string = "https://www.mangakakalot.gg";

class MangaKakalotGGExtension extends Mangabox {
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
