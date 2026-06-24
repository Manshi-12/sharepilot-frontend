import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { verifyAccessToken, ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { sessionsContainer, messagesContainer } from "@/lib/cosmos";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL!;
const MCP_SECRET = process.env.MCP_SECRET!;

export async function POST(req: NextRequest) {
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

  try {
    if (!sessionId) {
      sessionId = uuidv4();
      const title = message.trim().slice(0, 60) + (message.length > 60 ? "…" : "");
      await sessionsContainer.items.create({
        id: sessionId,
        sessionId,
        userId,
        title,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });
    } else {
      let session = (await sessionsContainer.item(sessionId, userId).read()).resource;
      if (!session) {
        await new Promise((r) => setTimeout(r, 250));
        session = (await sessionsContainer.item(sessionId, userId).read()).resource;
      }
      if (!session || session.userId !== userId) {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
      }
      await sessionsContainer.item(sessionId, userId).replace({
        ...session,
        lastUpdated: new Date().toISOString(),
      });
    }

    const userMessageId = uuidv4();
    await messagesContainer.items.create({
      id: userMessageId,
      messageId: userMessageId,
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

    if (!agentRes.ok || !agentRes.body) {
      return NextResponse.json(
        { error: "SharePilot agent is unavailable. Please try again." },
        { status: 502 }
      );
    }

    const upstreamReader = agentRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let finalContent = "";

    // These collect the real trace data as it streams through, so we can
    // save it alongside the final message instead of losing it on reload.
    const tools: any[] = [];
    const usage: any[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type: "session", sessionId })}\n\n`)
        );

        while (true) {
          const { done, value } = await upstreamReader.read();
          if (done) break;

          controller.enqueue(value);

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            try {
              const evt = JSON.parse(trimmed.slice(5).trim());
              if (evt.type === "done" && typeof evt.content === "string") {
                finalContent = evt.content;
              } else if (evt.type === "tool_call") {
                tools.push({
                  id: evt.id,
                  name: evt.name,
                  round: evt.round,
                  arguments: evt.arguments,
                  status: "calling",
                });
              } else if (evt.type === "tool_result") {
                const t = tools.find((x) => x.id === evt.id);
                if (t) {
                  t.result = evt.result;
                  t.isError = evt.isError;
                  t.status = "done";
                }
              } else if (evt.type === "usage") {
                usage.push({
                  round: evt.round,
                  promptTokens: evt.promptTokens,
                  completionTokens: evt.completionTokens,
                  totalTokens: evt.totalTokens,
                });
              }
            } catch {
              // ignore partial chunk
            }
          }
        }

        if (finalContent) {
          const assistantMessageId = uuidv4();
          await messagesContainer.items.create({
            id: assistantMessageId,
            messageId: assistantMessageId,
            sessionId,
            userId,
            role: "assistant",
            content: finalContent,
            tools,
            usage,
            timestamp: new Date().toISOString(),
          });
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
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