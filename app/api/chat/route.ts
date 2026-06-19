import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { verifyAccessToken, ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { sessionsContainer, messagesContainer } from "@/lib/cosmos";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL!;
const MCP_SECRET = process.env.MCP_SECRET!;

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });

    const { userId } = payload;
    const { message, sessionId: existingSessionId } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
    }

    let sessionId = existingSessionId;

    if (!sessionId) {
      sessionId = uuidv4();
      const title = message.trim().slice(0, 60) + (message.length > 60 ? "…" : "");
      await sessionsContainer.items.create({
        sessionId,
        userId,
        title,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });
    } else {
      const { resource: session } = await sessionsContainer.item(sessionId, userId).read();
      if (!session || session.userId !== userId) {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
      }
      await sessionsContainer.item(sessionId, userId).replace({
        ...session,
        lastUpdated: new Date().toISOString(),
      });
    }

    await messagesContainer.items.create({
      messageId: uuidv4(),
      sessionId,
      userId,
      role: "user",
      content: message.trim(),
      timestamp: new Date().toISOString(),
    });

    const { resources: history } = await messagesContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.sessionId = @sessionId ORDER BY c.timestamp ASC",
        parameters: [{ name: "@sessionId", value: sessionId }],
      })
      .fetchAll();

    const agentRes = await fetch(`${MCP_SERVER_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mcp-secret": MCP_SECRET,
      },
      body: JSON.stringify({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!agentRes.ok) {
      return NextResponse.json(
        { error: "SharePilot agent is unavailable. Please try again." },
        { status: 502 }
      );
    }

    const agentData = await agentRes.json();
    const assistantContent =
      agentData.reply || agentData.content || agentData.message || "I couldn't process that request.";

    await messagesContainer.items.create({
      messageId: uuidv4(),
      sessionId,
      userId,
      role: "assistant",
      content: assistantContent,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ sessionId, reply: assistantContent });
  } catch (err: any) {
    console.error("Chat error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const payload = await verifyAccessToken(token);
  if (!payload) return NextResponse.json({ error: "Session expired." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required." }, { status: 400 });

  const { resources } = await messagesContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.sessionId = @sessionId AND c.userId = @userId ORDER BY c.timestamp ASC",
      parameters: [
        { name: "@sessionId", value: sessionId },
        { name: "@userId", value: payload.userId },
      ],
    })
    .fetchAll();

  return NextResponse.json({ messages: resources });
}