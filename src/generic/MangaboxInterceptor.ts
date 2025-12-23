import { PaperbackInterceptor, Request, Response } from "@paperback/types";
import { MangaboxGeneric } from "./Mangabox";

export class MangaboxInterceptor extends PaperbackInterceptor {
  source: MangaboxGeneric;
  promise: Promise<string> | undefined;

  constructor(id: string, source: MangaboxGeneric) {
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
    return data;
  }
}
