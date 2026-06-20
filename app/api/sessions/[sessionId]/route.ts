import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { sessionsContainer, messagesContainer } from "@/lib/cosmos";

// Cosmos point-reads/writes need the document's REAL partition key value,
// not just any field that happens to be named "userId". We ask the
// container what its partition key path actually is (cached after first
// call) so this keeps working no matter how the container is configured.
let _pkPathPromise: Promise<string> | null = null;
async function getPartitionKeyPath(): Promise<string> {
  if (!_pkPathPromise) {
    _pkPathPromise = sessionsContainer.read()
      .then((r: any) => r.resource.partitionKey.paths[0].replace(/^\//, ""));
  }
  return _pkPathPromise;
}

async function findSession(sessionId: string, userId: string) {
  const { resources } = await sessionsContainer.items
    .query({
      query: "SELECT * FROM c WHERE (c.id = @id OR c.sessionId = @id) AND c.userId = @userId",
      parameters: [
        { name: "@id", value: sessionId },
        { name: "@userId", value: userId },
      ],
    })
    .fetchAll();

  const session = resources[0];
  if (!session) return null;

  const pkPath = await getPartitionKeyPath();
  return { session, pkValue: session[pkPath] };
}

// PATCH /api/sessions/:sessionId — rename a session (sidebar "Rename")
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const payload = await verifyAccessToken(token);
  if (!payload) return NextResponse.json({ error: "Session expired." }, { status: 401 });

  const { sessionId } = await params;
  const { title } = await req.json();
  const trimmed = (title || "").trim();

  if (!trimmed) {
    return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
  }
  if (trimmed.length > 100) {
    return NextResponse.json({ error: "Title is too long." }, { status: 400 });
  }

  try {
    const found = await findSession(sessionId, payload.userId);
    if (!found) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const { resource: updated } = await sessionsContainer
      .item(found.session.id, found.pkValue)
      .replace({ ...found.session, title: trimmed });

    return NextResponse.json({ session: updated });
  } catch (err: any) {
    console.error("Rename session error:", err);
    return NextResponse.json({ error: "Failed to rename chat." }, { status: 500 });
  }
}

// DELETE /api/sessions/:sessionId — delete a session and all of its messages
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const payload = await verifyAccessToken(token);
  if (!payload) return NextResponse.json({ error: "Session expired." }, { status: 401 });

  const { sessionId } = await params;

  try {
    const found = await findSession(sessionId, payload.userId);
    if (!found) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    // Delete every message in this session first (messages are partitioned
    // by sessionId, separate from the sessions container's partition).
    const { resources: messages } = await messagesContainer.items
      .query({
        query: "SELECT c.id, c.messageId FROM c WHERE c.sessionId = @sessionId",
        parameters: [{ name: "@sessionId", value: sessionId }],
      })
      .fetchAll();

    await Promise.all(
      messages.map((m: any) => messagesContainer.item(m.id ?? m.messageId, sessionId).delete().catch(() => { }))
    );

    await sessionsContainer.item(found.session.id, found.pkValue).delete();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Delete session error:", err);
    return NextResponse.json({ error: "Failed to delete chat." }, { status: 500 });
  }
}