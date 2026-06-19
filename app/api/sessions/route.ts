import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { sessionsContainer } from "@/lib/cosmos";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const payload = await verifyAccessToken(token);
  if (!payload) return NextResponse.json({ error: "Session expired." }, { status: 401 });

  const { resources } = await sessionsContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.lastUpdated DESC",
      parameters: [{ name: "@userId", value: payload.userId }],
    })
    .fetchAll();

  return NextResponse.json({ sessions: resources });
}