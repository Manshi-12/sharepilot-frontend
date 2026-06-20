import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, signAccessToken, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, cookieOptions } from "@/lib/auth";
import { usersContainer } from "@/lib/cosmos";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const result = await verifyRefreshToken(refreshToken);
  if (!result) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { resource: user } = await usersContainer.item(result.userId, result.userId).read().catch(() => ({ resource: null }));
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const accessToken = await signAccessToken(user.userId, user.email);
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", `${ACCESS_TOKEN_COOKIE}=${accessToken}; ${cookieOptions(15 * 60)}`);
  return res;
}