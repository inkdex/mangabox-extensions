/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import { Mangabox } from "../generic/main";
import pbconfig from "./pbconfig";

const DOMAIN: string = "https://www.mangabats.com";

class MangaBatCOMExtension extends Mangabox {
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
