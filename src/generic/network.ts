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
  private retryingUrls: Set<string> = new Set();

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

    if (response.status === 429 && !this.retryingUrls.has(request.url)) {
      const retryAfter = Number(response.headers?.["retry-after"]) || 10;
      if (retryAfter > 30) {
        throw new Error(
          `Rate limited; server requested ${retryAfter}s backoff (too long to wait): ${request.url}`,
        );
      }
      this.retryingUrls.add(request.url);
      try {
        console.log(
          `[MangaboxInterceptor] 429, sleeping ${retryAfter}s before retry: ${request.url}`,
        );
        await Application.sleep(retryAfter);
        const [, retriedData] = await Application.scheduleRequest(request);
        return retriedData;
      } finally {
        this.retryingUrls.delete(request.url);
      }
    }

    if (response.status !== 200) {
      throw new Error(`Request failed with status ${response.status}: ${request.url}`);
    }

    return data;
  }
}
