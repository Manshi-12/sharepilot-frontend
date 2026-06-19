import { NextRequest, NextResponse } from "next/server";
import {
  verifyRefreshToken,
  deleteRefreshToken,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    if (refreshToken) {
      const payload = await verifyRefreshToken(refreshToken);
      if (payload) {
        await deleteRefreshToken(payload.tokenId, payload.userId);
      }
    }
    const res = NextResponse.json({ success: true });
    res.headers.append("Set-Cookie", `${ACCESS_TOKEN_COOKIE}=; ${cookieOptions(0)}`);
    res.headers.append("Set-Cookie", `${REFRESH_TOKEN_COOKIE}=; ${cookieOptions(0)}`);
    return res;
  } catch {
    const res = NextResponse.json({ success: true });
    res.headers.append("Set-Cookie", `${ACCESS_TOKEN_COOKIE}=; ${cookieOptions(0)}`);
    res.headers.append("Set-Cookie", `${REFRESH_TOKEN_COOKIE}=; ${cookieOptions(0)}`);
    return res;
  }
}