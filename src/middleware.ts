import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/jwt";

/**
 * Edge middleware.
 *
 * It checks the signed session cookie and applies security headers. The
 * database is not reachable from the edge runtime, so route handlers and
 * server components re-check the session against the database — this is a
 * fast rejection layer, not the authorisation boundary.
 */

const PROTECTED = ["/dashboard", "/admin"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

function securityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (needsAuth && !claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return securityHeaders(NextResponse.redirect(url));
  }

  if (pathname.startsWith("/admin") && claims?.role !== "ADMIN") {
    const url = request.nextUrl.clone();
    url.pathname = claims ? "/dashboard" : "/login";
    url.search = "";
    return securityHeaders(NextResponse.redirect(url));
  }

  if (claims && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = claims.role === "ADMIN" ? "/admin" : "/dashboard";
    url.search = "";
    return securityHeaders(NextResponse.redirect(url));
  }

  return securityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!api/webhooks|api/maintenance|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
