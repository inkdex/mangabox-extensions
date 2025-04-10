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
    async parseMangaDetails(
        $: CheerioAPI,
        mangaId: string,
        source: MangaboxGeneric,
    ): Promise<SourceManga> {
        const context = "div.main-wrapper";

        const title = $("img", context).attr("alt")?.trim() ?? "";

        const image = encodeURI(
            (await this.getImageSrc($("img", context), source)) ?? "",
        );

        const secondaryTitleBox = $(".story-alternative", context)
            .first()
            .text()
            .trim();
        const secondaryTitles: string[] = secondaryTitleBox
            .replace(/^Alternative\s*:\s*/i, "")
            .split(";")
            .map((title) => title.trim())
            .filter((title) => title.length > 0);

        const authors = $('li:contains("Author(s)") a')
            .map((_, el) => $(el).text().trim())
            .get()
            .join(", ");

        const synopsis: string = Application.decodeHTMLEntities(
            $("#contentBox", context).first().text().trim(),
        );

        const shareUrl: string = `${source.domain}/manga/${mangaId}`;

        const ratingParsed = $("#rate_row_cmd").text().trim();
        const rating: number =
            ((Number(ratingParsed.match(/rate\s*:\s*([\d.]+)/)?.[1]) || 0) /
                10) *
            2;

        const parsedStatus: string = $("li:contains(Status)", context)
            .text()
            .trim()
            .toUpperCase();

        let status: string;
        if (parsedStatus.includes("COMPLETED")) {
            status = "Completed";
        } else {
            status = "Ongoing";
        }

        let contentRating = source.defaultContentRating;

        const genres: Tag[] = [];
        for (const obj of $("a", $("li.genres", context)).toArray()) {
            const title = $(obj).text().trim();
            const id = this.idCleaner($(obj).attr("href") ?? "");

            if (!title || !id) continue;

            // If item contains NSFW, set item to adult
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
        const nodeArray = $(".row", ".chapter-list").toArray();
        let nodesProcessed = 0;

        // For each available chapter..
        for (const obj of nodeArray) {
            const sortingIndex = nodeArray.length - nodesProcessed++;
            const id = this.idCleaner($("a", obj).first().attr("href") ?? "");

            const chapName = $("a", obj).first().text().trim() ?? "";
            const chapNumRegex = id.match(
                /(?:chapter|ch.*?)(\d+\.?\d?(?:[-_]\d+)?)|(\d+\.?\d?(?:[-_]\d+)?)$/,
            );
            let chapNum: string | number =
                chapNumRegex && chapNumRegex[1]
                    ? chapNumRegex[1].replace(/[-_]/gm, ".")
                    : (chapNumRegex?.[2] ?? "0");

            // make sure the chapter number is a number and not NaN
            chapNum = parseFloat(chapNum) ?? 0;

            const mangaTime = this.parseDate(
                $("span", obj).last().attr("title") ?? "",
            );

            if (!id || typeof id === "undefined" || id === "#") {
                console.log(
                    `Could not parse out ID when getting chapters for mangaId:${sourceManga.mangaId} parsedId: ${id}`,
                );
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

        for (const obj of $("img", "div.container-chapter-reader").toArray()) {
            const page = await this.getImageSrc($(obj), source);
            if (!page) {
                console.log(
                    `Could not parse pages for mangaId:${chapter.sourceManga.mangaId} chapterId:${chapter.chapterId}`,
                );
                continue;
            }
            pages.push(encodeURI(page));
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

        for (const obj of $("div.list-truyen-item-wrap").toArray()) {
            const image = encodeURI(
                (await this.getImageSrc($("img", obj), source)) ?? "",
            );
            const title = $("img", obj).attr("alt")?.trim() ?? "";

            const id = this.idCleaner($("a", obj).attr("href") ?? "");

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

        // Title Search
        if (query.title) {
            for (const obj of $("div.story_item").toArray()) {
                const image = encodeURI(
                    (await this.getImageSrc($("img", obj), source)) ?? "",
                );
                const title = $(".story_name", obj).text().trim();

                const id = this.idCleaner($("a", obj).attr("href") ?? "");
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

            // Genre Search
        } else {
            for (const obj of $("div.list-truyen-item-wrap").toArray()) {
                const image = encodeURI(
                    (await this.getImageSrc($("img", obj), source)) ?? "",
                );
                const title = $("img", obj).attr("alt")?.trim() ?? "";

                const id = this.idCleaner($("a", obj).attr("href") ?? "");

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

            // If it's srcset, extract the first URL
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

        image = image?.replace(/http:\/\/\//g, "http://"); // only changes urls with http protocol
        image = image?.replace(/http:\/\//g, "https://");
        // Malforumed url fix (Turns https:///example.com into https://example.com (or the http:// equivalent))
        image = image?.replace(/https:\/\/\//g, "https://"); // only changes urls with https protocol

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
        const currentPage = $(".page-select, .page_select").text();
        let totalPages = $(".page-last, .page_last").text();

        if (currentPage) {
            totalPages = (/(\d+)/g.exec(totalPages) ?? [""])[0];
            return +totalPages == +currentPage;
        }

        return true;
    };
}
