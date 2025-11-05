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
    Request,
    Response,
    SearchFilter,
    SearchQuery,
    SearchResultItem,
    SearchResultsProviding,
    SourceManga,
    TagSection,
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
    readonly domain: string;
    readonly name: string;
    readonly defaultContentRating: ContentRating;
    readonly language: string;

    parser: MangaboxParser;
    requestManager: PaperbackInterceptor;

    constructor(params: GenericParams) {
        this.name = params.name;
        this.domain = params.domain;
        this.defaultContentRating =
            params.contentRating ?? ContentRating.EVERYONE;
        this.language = params.language ?? "🇬🇧";
        this.parser = params.parser ?? new MangaboxParser();
        this.requestManager =
            params.requestManager ?? new MangaboxInterceptor("main", this);
    }

    globalRateLimiter = new BasicRateLimiter("ratelimiter", {
        numberOfRequests: 4,
        bufferInterval: 1,
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
            url: `${this.domain}/manga/${mangaId}/chapter-${chapterId}`,
            method: "GET",
        });
        await this.checkResponseError(response);

        const $ = cheerio.load(Application.arrayBufferToUTF8String(buffer));
        return this.parser.parseChapterDetails($, chapter, this);
    }

    async getDiscoverSections(): Promise<DiscoverSection[]> {
        return [
            {
                id: "4",
                title: "Latest Updates",
                subtitle: "Recently updated chapters",
                type: DiscoverSectionType.prominentCarousel,
            },
            {
                id: "1",
                title: "New Titles",
                subtitle: "Recently added manga",
                type: DiscoverSectionType.simpleCarousel,
            },
            {
                id: "7",
                title: "Most Popular",
                subtitle: "Most viewed manga",
                type: DiscoverSectionType.simpleCarousel,
            },
        ];
    }

    async getDiscoverSectionItems(
        section: DiscoverSection,
        metadata: Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const page = metadata?.page ?? 1;

        const [response, buffer] = await Application.scheduleRequest({
            url: `${this.domain}/genre/all?filter=${section.id}&page=${page}`,
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
        const genreTags = tagSections.find(
            (x) => x.id === "genres",
        ) as TagSection;

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

        const [response, buffer] = await this.constructSearchRequest(
            page,
            query,
        );
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
        const existingCookies = [...this.cookieStorageInterceptor.cookies];
        for (const cookie of existingCookies) {
            this.cookieStorageInterceptor.deleteCookie(cookie);
        }

        for (const cookie of cookies) {
            if (!cookie.expires || cookie.expires.getTime() > Date.now()) {
                this.cookieStorageInterceptor.setCookie(cookie);
            }
        }
    }

    async getCloudflareBypassRequest(): Promise<Request> {
        return {
            url: this.domain,
            method: "GET",
            headers: {
                referer: this.domain,
                origin: this.domain,
            },
        };
    }

    constructSearchRequest(page: number, query: SearchQuery) {
        let url = "";

        const genreFilters = Object.keys(
            query.filters?.find((x) => x.id === "genres")?.value ?? {},
        );

        if (query.title) {
            const searchQuery = this.sanitizeQuery(query.title).replace(
                /\s+/g,
                "_",
            );
            url = `${this.domain}/search/story/${searchQuery}?page=${page}`;
        } else if (genreFilters.length) {
            url = `${this.domain}/genre/${genreFilters[0]}?page=${page}`;
        }

        return Application.scheduleRequest({
            url: url,
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

    async checkResponseError(response: Response): Promise<void> {
        const status = response.status;

        console.log("Response status:", status);
        console.log("Current cookies:", this.cookieStorageInterceptor.cookies);

        switch (status) {
            case 403:
            case 503:
                console.log(
                    `Cloudflare protection detected. Status: ${status}`,
                );
                throw new CloudflareError(
                    {
                        url: response.url,
                        method: "GET",
                        headers: {
                            referer: `${this.domain}/`,
                            origin: this.domain,
                        },
                    },
                    "Cloudflare bypass required, please complete the challenge.",
                );
            case 404:
                throw new Error(`Content not found: ${response.url}`);
            case 429:
                throw new Error(`Too many requests for ${response.url}`);
        }
    }
}
