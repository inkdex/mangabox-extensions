/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import {
  CloudflareError,
  PaperbackInterceptor,
  type Request,
  type Response,
} from "@paperback/types";

import { Mangabox } from "./main";

export class MangaboxInterceptor extends PaperbackInterceptor {
  source: Mangabox;
  promise: Promise<string> | undefined;

  constructor(id: string, source: Mangabox) {
    super(id);
    this.source = source;
  }

  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      "user-agent": await Application.getDefaultUserAgent(),
      referer: `${this.source.domain}/`,
    };

    request.cookies = {
      ...request.cookies,
    };

    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    const cfMitigated = response.headers?.["cf-mitigated"];
    if (cfMitigated === "challenge") {
      throw new CloudflareError(
        {
          url: this.source.bypassPage ?? this.source.domain,
          method: "GET",
          headers: {
            referer: `${this.source.domain}/`,
            origin: `${this.source.domain}/`,
            "user-agent": await Application.getDefaultUserAgent(),
          },
        },
        "Cloudflare detected, bypass it to continue!",
      );
    }

    if (response.status !== 200) {
      throw new Error(`Request failed with status ${response.status}: ${request.url}`);
    }

    return data;
  }
}
