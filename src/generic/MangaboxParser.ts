import {
    Chapter,
    ChapterDetails,
    ContentRating,
    DiscoverSection,
    DiscoverSectionItem,
    DiscoverSectionType,
    SearchQuery,
    SearchResultItem,
    SourceManga,
    Tag,
    TagSection,
} from "@paperback/types";
import { Cheerio, CheerioAPI } from "cheerio";
import { Element } from "domhandler"; // Import Element from domhandler

import { MangaboxGeneric } from "./Mangabox";

export class MangaboxParser {
    private async getImageServerIndex(): Promise<number> {
        const server = (await Application.getState("image_server")) as
            | string[]
            | undefined;
        return parseInt(server?.[0]?.replace("server", "") ?? "1") - 1;
    }

    private fixImageUrl(url: string, source: MangaboxGeneric): string {
        if (!url || url.trim() === "") return "";
        const trimmedUrl = url.trim();
        if (trimmedUrl.startsWith("//")) {
            return "https:" + trimmedUrl;
        }
        if (trimmedUrl.startsWith("/")) {
            return source.domain + trimmedUrl;
        }
        return trimmedUrl;
    }

    async parseMangaDetails(
        $: CheerioAPI,
        mangaId: string,
        source: MangaboxGeneric,
    ): Promise<SourceManga> {
        const title =
            $(".manga-info-text h1, .manga-info-top h1")
                .first()
                .text()
                .trim() ||
            $("h1").first().text().trim() ||
            mangaId;

        const image = encodeURI(
            (await this.getImageSrc(
                $(".manga-info-pic img, .manga-info-top img").first(),
                source,
            )) ?? "",
        );

        const secondaryTitleBox = $(".story-alternative").first().text().trim();
        const secondaryTitles: string[] = secondaryTitleBox
            .replace(/^Alternative\s*:\s*/i, "")
            .split(";")
            .map((title) => title.trim())
            .filter((title) => title.length > 0);

        let authors = "Unknown";
        $(".manga-info-text li").each((_i, el) => {
            const text = $(el).text();
            if (text.includes("Author(s)")) {
                authors = text
                    .replace("Author(s) :", "")
                    .replace("Author(s):", "")
                    .trim();
            }
        });

        const synopsis: string = Application.decodeHTMLEntities(
            $("#contentBox").text().trim() || "",
        );

        const shareUrl: string = `${source.domain}/manga/${mangaId}`;

        const ratingParsed = $("#rate_row_cmd").text().trim();
        const rating: number =
            ((Number(ratingParsed.match(/rate\s*:\s*([\d.]+)/)?.[1]) || 0) /
                10) *
            2;

        let status: string = "Ongoing";
        $(".manga-info-text li").each((_i, el) => {
            const text = $(el).text().trim();
            if (text.includes("Status")) {
                if (text.toLowerCase().includes("completed")) {
                    status = "Completed";
                }
            }
        });

        let contentRating = source.defaultContentRating;

        const genres: Tag[] = [];
        for (const obj of $(".manga-info-text li.genres a").toArray()) {
            const title = $(obj).text().trim();
            const id = title.toLowerCase().replace(/\s+/g, "-");

            if (!title || !id) continue;

            if (["adult", "mature", "smut"].includes(title.toLowerCase())) {
                contentRating = ContentRating.ADULT;
            }

            genres.push({ title: title, id: id });
        }
        const tagGroups: TagSection[] = [
            { title: "genres", id: "genres", tags: genres },
        ];

        return {
            mangaId,
            mangaInfo: {
                shareUrl: shareUrl,
                rating: rating,
                primaryTitle: title,
                secondaryTitles: secondaryTitles,
                thumbnailUrl: image,
                author: authors,
                artist: authors,
                tagGroups: tagGroups,
                synopsis: synopsis,
                contentRating: contentRating,
                status: status,
            },
        };
    }

    parseChapterList(
        $: CheerioAPI,
        sourceManga: SourceManga,
        source: MangaboxGeneric,
    ): Chapter[] {
        const chapters: Chapter[] = [];
        const nodeArray = $(
            ".chapter-list .row, .row-content-chapter li",
        ).toArray();
        let nodesProcessed = 0;

        for (const obj of nodeArray) {
            const sortingIndex = nodeArray.length - nodesProcessed++;
            const link = $("a", obj).first().attr("href");
            if (!link) continue;

            const chapterIdMatch = link.match(/\/chapter-([^/?]+)/);
            const id = chapterIdMatch?.[1] ?? `${nodesProcessed}`;

            const chapName = $("a", obj).first().text().trim() ?? "";

            const chapterMatch = id.match(/^(\d+(?:\.\d+)?)/);
            const chapNum: string | number = chapterMatch?.[1]
                ? parseFloat(chapterMatch[1])
                : nodesProcessed;

            const mangaTime = this.parseDate(
                $("span", obj).last().attr("title") ?? "",
            );

            if (!id || typeof id === "undefined" || id === "#") {
                continue;
            }

            chapters.push({
                sourceManga: sourceManga,
                chapterId: id,
                langCode: source.language,
                chapNum: chapNum,
                title: chapName ? Application.decodeHTMLEntities(chapName) : "",
                publishDate: mangaTime,
                sortingIndex: sortingIndex,
            });
        }

        return chapters;
    }

    async parseChapterDetails(
        $: CheerioAPI,
        chapter: Chapter,
        source: MangaboxGeneric,
    ): Promise<ChapterDetails> {
        const pages: string[] = [];

        const imageServerIndex = await this.getImageServerIndex();

        let cdns: string[] = [];
        $("script").each((_i, scriptElement) => {
            const scriptContent = $(scriptElement).html() || "";
            const cdnsMatch = scriptContent.match(
                /var\s+cdns\s*=\s*\[(.*?)\];/s,
            );
            if (cdnsMatch && cdnsMatch[1]) {
                try {
                    const cdnString = `[${cdnsMatch[1].replace(/'/g, '"')}]`;
                    const parsed = JSON.parse(cdnString) as unknown;
                    if (
                        Array.isArray(parsed) &&
                        parsed.every((p) => typeof p === "string")
                    ) {
                        cdns = parsed;
                    }
                } catch (e) {
                    console.error(
                        "[MangaboxParser] Failed to parse CDN list:",
                        e,
                    );
                }
            }
        });

        for (const obj of $("div.container-chapter-reader img").toArray()) {
            const $img = $(obj);
            if ($img.closest(".ads-contain").length > 0) continue;

            let imgUrl = await this.getImageSrc($img, source);

            if (!imgUrl || imgUrl.trim() === "") continue;
            imgUrl = imgUrl.trim();

            if (
                cdns.length > 0 &&
                imageServerIndex >= 0 &&
                imageServerIndex < cdns.length
            ) {
                const targetCdn = cdns[imageServerIndex];
                if (targetCdn) {
                    for (const cdnUrl of cdns) {
                        if (imgUrl.includes(cdnUrl)) {
                            imgUrl = imgUrl.replace(cdnUrl, targetCdn);
                            break;
                        }
                    }
                }
            }

            pages.push(encodeURI(imgUrl));
        }

        if (pages.length === 0) {
            throw new Error(
                `No images found for chapter ${chapter.chapterId}.`,
            );
        }

        return {
            id: chapter.chapterId,
            mangaId: chapter.sourceManga.mangaId,
            pages: pages,
        };
    }

    async parseDiscoverSections(
        $: CheerioAPI,
        section: DiscoverSection,
        source: MangaboxGeneric,
    ): Promise<DiscoverSectionItem[]> {
        const items: DiscoverSectionItem[] = [];

        for (const obj of $(
            "div.comic-list div.list-comic-item-wrap",
        ).toArray()) {
            const image = encodeURI(
                (await this.getImageSrc($("img", obj), source)) ?? "",
            );
            const title = $("h3 a", obj).first().text().trim();

            const link = $("a.list-story-item", obj).attr("href");
            if (!link) continue;
            const id = this.idCleaner(link);

            const subtitle = $("a.list-story-item-wrap-chapter", obj)
                .first()
                .text()
                .trim();

            if (!id || !title) {
                continue;
            }

            switch (section.type) {
                case DiscoverSectionType.featured:
                    items.push({
                        mangaId: id,
                        imageUrl: image,
                        title: Application.decodeHTMLEntities(title),
                        supertitle: Application.decodeHTMLEntities(subtitle),
                        type: "featuredCarouselItem",
                    });
                    break;

                case DiscoverSectionType.prominentCarousel:
                    items.push({
                        mangaId: id,
                        imageUrl: image,
                        title: Application.decodeHTMLEntities(title),
                        subtitle: Application.decodeHTMLEntities(subtitle),
                        type: "prominentCarouselItem",
                    });
                    break;

                case DiscoverSectionType.simpleCarousel:
                    items.push({
                        mangaId: id,
                        imageUrl: image,
                        title: Application.decodeHTMLEntities(title),
                        subtitle: Application.decodeHTMLEntities(subtitle),
                        type: "simpleCarouselItem",
                    });
                    break;
            }
        }

        return items;
    }

    async parseSearchTags($: CheerioAPI): Promise<TagSection[]> {
        const genres: Tag[] = [];

        const context = $('h3:contains("GENRES")').parent();

        for (const obj of $("td", context).toArray()) {
            const title = $("a", obj).attr("title")?.trim() ?? "";
            const id = this.idCleaner($("a", obj).attr("href") ?? "");

            if (!id || !title) {
                continue;
            }

            genres.push({ title: title, id: id });
        }

        const TagSections: TagSection[] = [
            { title: "Genres", id: "genres", tags: genres },
        ];

        return TagSections;
    }

    async parseSearchResults(
        $: CheerioAPI,
        source: MangaboxGeneric,
        query: SearchQuery,
    ): Promise<SearchResultItem[]> {
        const results: SearchResultItem[] = [];

        if (query.title) {
            for (const obj of $(".panel_story_list .story_item").toArray()) {
                const image = encodeURI(
                    (await this.getImageSrc($("img", obj), source)) ?? "",
                );
                const title = $(".story_name", obj).text().trim();

                const link = $("a", obj).attr("href");
                if (!link) continue;
                const id = this.idCleaner(link);

                const subtitle = $(".story_chapter", obj).first().text().trim();

                if (!id || !title) {
                    continue;
                }

                results.push({
                    mangaId: id,
                    imageUrl: image,
                    title: Application.decodeHTMLEntities(title),
                    subtitle: Application.decodeHTMLEntities(subtitle),
                });
            }
            return results;
        } else {
            for (const obj of $(
                "div.comic-list div.list-comic-item-wrap",
            ).toArray()) {
                const image = encodeURI(
                    (await this.getImageSrc($("img", obj), source)) ?? "",
                );
                const title = $("h3 a", obj).first().text().trim();

                const link = $("a.list-story-item", obj).attr("href");
                if (!link) continue;
                const id = this.idCleaner(link);

                const subtitle = $("a.list-story-item-wrap-chapter", obj)
                    .first()
                    .text()
                    .trim();

                if (!id || !title) {
                    continue;
                }

                results.push({
                    mangaId: id,
                    imageUrl: image,
                    title: Application.decodeHTMLEntities(title),
                    subtitle: Application.decodeHTMLEntities(subtitle),
                });
            }

            return results;
        }
    }

    // Utils
    async getImageSrc(
        imageObj: Cheerio<Element> | undefined,
        source: MangaboxGeneric,
    ): Promise<string> {
        let image: string | undefined;
        const sources = [
            "data-src",
            "data-lazy-src",
            "srcset",
            "src",
            "data-cfsrc",
        ];

        for (const attr of sources) {
            const val = imageObj?.attr(attr);

            if (val == null || val.trim() === "") continue;

            if (attr === "srcset") {
                image = val.split(",")[0]?.trim().split(" ")[0] ?? "";
            } else {
                image = val;
            }

            break;
        }

        if (image?.startsWith("/")) {
            image = source.domain + image;
        }

        image = image?.trim().replace(/(\s{2,})/gi, "");

        image = image?.replace(/http:\/\/\//g, "http://");
        image = image?.replace(/http:\/\//g, "https://");
        image = image?.replace(/https:\/\/\//g, "https://");

        return decodeURI(Application.decodeHTMLEntities(image ?? ""));
    }

    parseDate = (date: string): Date => {
        date = date.toUpperCase();

        if (date.includes("LESS THAN AN HOUR") || date.includes("JUST NOW")) {
            return new Date();
        }

        if (date.includes("YESTERDAY")) {
            return new Date(Date.now() - 86400000);
        }

        const timeUnits: Record<string, number> = {
            YEAR: 31556952000,
            MONTH: 2592000000,
            WEEK: 604800000,
            DAY: 86400000,
            HOUR: 3600000,
            MINUTE: 60000,
            SECOND: 1000,
        };

        const match = date.match(
            /(\d+)\s*(YEAR|MONTH|WEEK|DAY|HOUR|MINUTE|SECOND)/,
        );
        if (match) {
            const [, numStr, unit] = match;
            const number = Number(numStr);
            return new Date(Date.now() - number * timeUnits[unit]);
        }

        return new Date(date);
    };

    idCleaner(str: string): string {
        let cleanId: string | null = str;
        cleanId = cleanId.replace(/\/$/, "");
        cleanId = cleanId.split("/").pop() ?? null;

        if (!cleanId) throw new Error(`Unable to parse id for ${str}`);
        return cleanId;
    }

    isLastPage = ($: CheerioAPI): boolean => {
        const currentPageText = $(".group_page a.page_select").text().trim();
        if (!currentPageText) {
            const nextPageExists = $(`.group_page a[href*="page="]`).length > 0;
            return !nextPageExists;
        }

        const currentPageNum = parseInt(currentPageText) || 1;

        const lastPageLink = $(".group_page a.page_last").text();
        const lastPageMatch = lastPageLink.match(/Last\((\d+)\)/);

        if (lastPageMatch) {
            const lastPage = parseInt(lastPageMatch[1] ?? "1");
            return currentPageNum >= lastPage;
        }

        return true;
    };
}
