/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

import {
  BasicRateLimiter,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type CloudflareBypassRequestProviding,
  ContentRating,
  type Cookie,
  CookieStorageInterceptor,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  DiscoverSectionType,
  type Extension,
  type MangaProviding,
  type PagedResults,
  PaperbackInterceptor,
  type SearchFilter,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SourceManga,
  type TagSection,
  URL,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { MangaboxInterceptor } from "./network";
import { MangaboxParser } from "./parsers";

export interface MangaboxParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
  language: string;
  parser?: MangaboxParser;
  requestManager?: PaperbackInterceptor;
  rateLimiter?: BasicRateLimiter;
}

type Metadata = {
  page?: number;
  completed?: boolean;
};

type MangaboxImplementation = Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding &
  CloudflareBypassRequestProviding;

export abstract class Mangabox implements MangaboxImplementation {
  /**
   * The Madara URL of the website. Eg. https://webtoon.xyz
   */
  readonly domain: string;

  /**
   * The readable name of the website. Eg. Toonily
   */
  readonly name: string;

  /**
   * The default content rating. Eg. Hiperdex = Adult
   */
  readonly defaultContentRating: ContentRating;

  /**
   * The language code the source's content is served in in string form.
   */
  readonly language: string;

  parser: MangaboxParser;

  bypassPage?: string;

  requestManager: PaperbackInterceptor;

  rateLimiter: BasicRateLimiter;

  constructor(params: MangaboxParams) {
    this.name = params.name;
    this.domain = params.domain;
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.language = params.language ?? "🇬🇧";
    this.parser = params.parser ?? new MangaboxParser();
    this.bypassPage = `${this.domain}/manga`;
    this.requestManager = params.requestManager ?? new MangaboxInterceptor("main", this);
    this.rateLimiter =
      params.rateLimiter ??
      new BasicRateLimiter("ratelimiter", {
        numberOfRequests: 5,
        bufferInterval: 2,
        ignoreImages: true,
      });
  }

  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });

  async initialise(): Promise<void> {
    this.cookieStorageInterceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
    this.requestManager.registerInterceptor();
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const [_response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/manga/${mangaId}`,
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));
    return this.parser.parseMangaDetails($, mangaId, this);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const mangaId = sourceManga.mangaId;
    const apiUrl = `${this.domain}/api/manga/${mangaId}/chapters?limit=9000&offset=0`;

    const [_responseAPI, bufferAPI] = await Application.scheduleRequest({
      url: apiUrl,
      method: "GET",
    });

    const jsonString = Application.arrayBufferToUTF8String(bufferAPI);
    let json;
    try {
      json = JSON.parse(jsonString);
    } catch (e) {
      console.error(`Failed to parse JSON for ${sourceManga.mangaId}`, e);
      return [];
    }
    return this.parser.parseChapterList(json, sourceManga, this);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = chapter.sourceManga.mangaId;
    const chapterId = chapter.chapterId;

    const [_response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/manga/${mangaId}/${chapterId}`,
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    return this.parser.parseChapterDetails($, chapter, this);
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "new_titles",
        title: "New Titles",
        type: DiscoverSectionType.featured,
      },
      {
        id: "latest_updates",
        title: "Latest Updates",
        type: DiscoverSectionType.chapterUpdates,
      },
      {
        id: "most_popular",
        title: "Most Popular",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "completed_titles",
        title: "Completed Titles",
        type: DiscoverSectionType.simpleCarousel,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    let param = "";
    const page = metadata?.page ?? 1;

    switch (section.id) {
      case "new_titles":
        param = "new-manga";
        break;
      case "latest_updates":
        param = "latest-manga";
        break;
      case "most_popular":
        param = "hot-manga";
        break;
      case "completed_titles":
        param = "completed-manga";
        break;

      default:
        throw new Error("Invalid sectionId provided!");
    }

    const [_response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/manga-list/${param}?page=${page}`,
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    const items = await this.parser.parseDiscoverSections($, section, this);

    metadata = !this.parser.isLastPage($) ? { page: page + 1 } : undefined;

    return {
      items: items,
      metadata: metadata,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const [_response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}`,
      method: "GET",
    });

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    const tagSections = await this.parser.parseSearchTags($);
    const genreTags = tagSections.find((x) => x.id === "genres") as TagSection;

    return [
      {
        type: "multiselect",
        options: genreTags.tags
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((x) => ({
            id: x.id,
            value: x.title,
          })),
        id: genreTags.id,
        allowExclusion: false,
        title: genreTags.title,
        value: {},
        allowEmptySelection: true,
        maximum: 1,
      },
    ];
  }

  async getSearchResults(
    query: SearchQuery,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;

    const [_response, buffer] = await this.constructSearchRequest(page, query);

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    const results = await this.parser.parseSearchResults($, this, query);

    metadata = !this.parser.isLastPage($) ? { page: page + 1 } : undefined;
    return {
      items: results,
      metadata: metadata,
    };
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    for (const cookie of cookies) {
      this.cookieStorageInterceptor.deleteCookie(cookie);
    }

    for (const cookie of cookies) {
      this.cookieStorageInterceptor.setCookie(cookie);
    }
  }

  constructSearchRequest(page: number, query: SearchQuery) {
    const urlBuilder = new URL(this.domain);

    const genreFilters = Object.keys(query.filters.find((x) => x.id === "genres")?.value ?? {});

    if (query.title) {
      urlBuilder.addPathComponent("search");
      urlBuilder.addPathComponent("story");
      urlBuilder.addPathComponent(encodeURIComponent(this.sanitizeQuery(query?.title ?? "")));
      urlBuilder.setQueryItem("page", page.toString());
    } else if (genreFilters.length) {
      urlBuilder.addPathComponent("genre");
      urlBuilder.addPathComponent(genreFilters[0] ?? "");
      urlBuilder.setQueryItem("page", page.toString());
    }

    return Application.scheduleRequest({
      url: urlBuilder.toString(),
      method: "GET",
    });
  }

  sanitizeQuery(query: string): string {
    return query
      .replace(/'[^ ]*/g, "")
      .replace(/\.+/g, "")
      .replace(/["']/g, "")
      .trim();
  }
}
