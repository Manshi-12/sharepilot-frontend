import { NextRequest, NextResponse } from "next/server";
import { usersContainer } from "@/lib/cosmos";
import {
  verifyPassword,
  signAccessToken,
  createRefreshToken,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const { resources } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email.toLowerCase() }],
      })
      .fetchAll();

    const user = resources[0];

    if (!user) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const accessToken = await signAccessToken(user.userId, user.email);
    const refreshToken = await createRefreshToken(user.userId);

    const res = NextResponse.json({
      user: { userId: user.userId, email: user.email, displayName: user.displayName },
      accessToken,
    });
    res.headers.append("Set-Cookie", `${ACCESS_TOKEN_COOKIE}=${accessToken}; ${cookieOptions(15 * 60)}`);
    res.headers.append("Set-Cookie", `${REFRESH_TOKEN_COOKIE}=${refreshToken}; ${cookieOptions(7 * 24 * 60 * 60)}`);
    return res;
  } catch (err: any) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}