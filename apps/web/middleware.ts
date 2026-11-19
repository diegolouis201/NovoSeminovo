import { NextResponse, type NextRequest } from "next/server";
import { GONE_HTML, isLegacyWordPress } from "@/lib/legacy-wordpress";

// 410 (Gone) para os endereços do WordPress antigo do domínio, para o Google
// tirá-los do índice (ver lib/legacy-wordpress.ts).
//
// O Next mandaria "/wdk-listing/x/" para "/wdk-listing/x" (308) antes de
// chegar aqui; com skipTrailingSlashRedirect (next.config.js) essa troca é
// feita aqui mesmo, igual ao Next, para todo endereço terminado em "/".
export function middleware(request: NextRequest) {
  const { pathname, searchParams, search } = request.nextUrl;
  if (isLegacyWordPress(pathname, searchParams)) {
    return new NextResponse(GONE_HTML, {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    // URL comum (não a NextURL, que devolveria a barra do fim).
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "") || "/";
    url.search = search;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

// Só roda nestes caminhos: o resto do site não passa pelo middleware.
export const config = {
  matcher: [
    "/wdk-:slug/:path*",
    "/wp-content/:path*",
    "/wp-admin/:path*",
    "/wp-includes/:path*",
    "/wp-json/:path*",
    "/wp-login.php",
    "/xmlrpc.php",
    "/listing/:path*",
    "/listings/:path*",
    "/author/:path*",
    "/category/:path*",
    "/tag/:path*",
    "/feed",
    "/:path+/feed",
    "/index.php/:path*",
    { source: "/", has: [{ type: "query", key: "p" }] },
    { source: "/", has: [{ type: "query", key: "page_id" }] },
    // Endereço terminado em "/" (o redirecionamento que o Next fazia).
    "/:path+/",
  ],
};
