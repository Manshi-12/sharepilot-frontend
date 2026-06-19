import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from "@/lib/auth";
import { usersContainer } from "@/lib/cosmos";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const payload = await verifyAccessToken(token);
  if (!payload) return NextResponse.json({ error: "Session expired." }, { status: 401 });

  const { resources } = await usersContainer.items
    .query({
      query: "SELECT c.userId, c.email, c.displayName FROM c WHERE c.userId = @userId",
      parameters: [{ name: "@userId", value: payload.userId }],
    })
    .fetchAll();

  const user = resources[0];
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  return NextResponse.json({ user });
}