import { NextResponse, type NextRequest } from "next/server";

import { parseGameStatsRouteId } from "./app/game-stats/[id]/parseGameStatsRouteId";

/**
 * Next App Router can stream a 200 before an async page throws notFound().
 * For malformed replay identifiers, reject *before* React streaming begins.
 * Preserve the framework's styled 404 page with an internal rewrite and keep
 * the original URL visible. Valid replay IDs retain their unchanged route.
 *
 * Explicit exact-one-segment matcher excludes /game-stats/[id]/review,
 * /game-stats/live/[sessionKey], APIs, ratings, custody and everything else.
 */
export function middleware(request: NextRequest) {
  const pathPrefix = "/game-stats/";
  const slug = request.nextUrl.pathname.startsWith(pathPrefix)
    ? request.nextUrl.pathname.slice(pathPrefix.length)
    : "";

  if (parseGameStatsRouteId(slug) === null) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), {
      status: 404,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/game-stats/:id"],
};
