import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/chat")) {
    const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const valid = token ? await verifyAccessToken(token) : null;
    if (!valid) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (pathname === "/login") {
    const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const valid = token ? await verifyAccessToken(token) : null;
    if (valid) {
      return NextResponse.redirect(new URL("/chat", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/login"],
};
