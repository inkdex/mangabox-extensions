import {
  BasicRateLimiter,
  Chapter,
  ChapterDetails,
  ChapterProviding,
  CloudflareBypassRequestProviding,
  CloudflareError,
  ContentRating,
  Cookie,
  CookieStorageInterceptor,
  DiscoverSection,
  DiscoverSectionItem,
  DiscoverSectionProviding,
  DiscoverSectionType,
  Extension,
  MangaProviding,
  PagedResults,
  PaperbackInterceptor,
  Response,
  SearchFilter,
  SearchQuery,
  SearchResultItem,
  SearchResultsProviding,
  SourceManga,
  TagSection,
  URL,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { MangaboxInterceptor } from "./MangaboxInterceptor";
import { MangaboxParser } from "./MangaboxParser";

export interface GenericParams {
  name: string;
  domain: string;
  contentRating: ContentRating;
  language: string;
  parser?: MangaboxParser;
  requestManager?: PaperbackInterceptor;
}

type Metadata = {
  page?: number;
  completed?: boolean;
};

export abstract class MangaboxGeneric
  implements
    Extension,
    SearchResultsProviding,
    MangaProviding,
    ChapterProviding,
    DiscoverSectionProviding,
    CloudflareBypassRequestProviding
{
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

  requestManager: PaperbackInterceptor;

  /**
   *
   */
  constructor(params: GenericParams) {
    this.name = params.name;
    this.domain = params.domain;
    this.defaultContentRating = params.contentRating ?? ContentRating.EVERYONE;
    this.language = params.language ?? "🇬🇧";
    this.parser = params.parser ?? new MangaboxParser();
    this.requestManager = params.requestManager ?? new MangaboxInterceptor("main", this);
  }

  // Ratelimit: Wait 2 sec after 5 requests
  globalRateLimiter = new BasicRateLimiter("ratelimiter", {
    numberOfRequests: 5,
    bufferInterval: 2,
    ignoreImages: true,
  });

  cookieStorageInterceptor = new CookieStorageInterceptor({
    storage: "stateManager",
  });

  async initialise(): Promise<void> {
    this.cookieStorageInterceptor.registerInterceptor();
    this.globalRateLimiter.registerInterceptor();
    this.requestManager?.registerInterceptor();
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const [response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/manga/${mangaId}`,
      method: "GET",
    });
    await this.checkResponseError(response);

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));
    return this.parser.parseMangaDetails($, mangaId, this);
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const [response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/manga/${sourceManga.mangaId}`,
      method: "GET",
    });
    await this.checkResponseError(response);

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    return this.parser.parseChapterList($, sourceManga, this);
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const mangaId = chapter.sourceManga.mangaId;
    const chapterId = chapter.chapterId;

    const [response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/manga/${mangaId}/${chapterId}`,
      method: "GET",
    });
    await this.checkResponseError(response);

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

    const [response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}/manga-list/${param}?page=${page}`,
      method: "GET",
    });
    await this.checkResponseError(response);

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    const items = await this.parser.parseDiscoverSections($, section, this);

    metadata = !this.parser.isLastPage($) ? { page: page + 1 } : undefined;

    return {
      items: items,
      metadata: metadata,
    };
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const [response, buffer] = await Application.scheduleRequest({
      url: `${this.domain}`,
      method: "GET",
    });
    await this.checkResponseError(response);

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

    const [response, buffer] = await this.constructSearchRequest(page, query);

    await this.checkResponseError(response);

    const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));

    const results = await this.parser.parseSearchResults($, this, query);

    metadata = !this.parser.isLastPage($) ? { page: page + 1 } : undefined;
    return {
      items: results,
      metadata: metadata,
    };
  }

  async saveCloudflareBypassCookies(cookies: Cookie[]): Promise<void> {
    // Clear all the cookies
    for (const cookie of cookies) {
      this.cookieStorageInterceptor.deleteCookie(cookie);
    }

    // Set all the cookies
    for (const cookie of cookies) {
      this.cookieStorageInterceptor.setCookie(cookie);
    }
  }

  // Utility
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
      .replace(/'[^ ]*/g, "") // Remove apostrophes and the following characters up to a space
      .replace(/\.+/g, "") // Remove all periods
      .replace(/["']/g, "") // Remove quotes
      .trim();
  }

  async checkResponseError(response: Response): Promise<void> {
    const status = response.status;
    switch (status) {
      case 403:
      case 503:
        throw new CloudflareError(
          {
            url: response.url,
            method: "GET",
            headers: {
              referer: `${this.domain}/`,
              origin: `${this.domain}/`,
              "user-agent": await Application.getDefaultUserAgent(),
            },
          },
          "Cloudflare detected!\nPlease do the Cloudflare bypass to continue!",
        );
      case 404:
        throw new Error(`The requested page ${response.url} was not found!`);

      case 429:
        throw new Error(`Too many requests for ${response.url}!`);
    }
  }
}
