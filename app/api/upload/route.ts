import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, ACCESS_TOKEN_COOKIE } from "@/lib/auth";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL!;
const MCP_SECRET = process.env.MCP_SECRET!;

export async function POST(req: NextRequest) {
    const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const payload = await verifyAccessToken(token);
    if (!payload) return NextResponse.json({ error: "Session expired." }, { status: 401 });

    const body = await req.json();

    try {
        const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                ...(MCP_SECRET ? { "x-mcp-secret": MCP_SECRET } : {}),
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {
                    name: "upload_file",
                    arguments: {
                        filename: body.filename,
                        content: body.content,
                        libraryName: body.libraryName || "Documents",
                        isBase64: true,
                        mimeType: body.mimeType,
                    },
                },
            }),
        });

        const raw = await res.text();
        console.log("[upload] raw:", raw);

        // Parse SSE envelope: find the "data: {...}" line
        const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) {
            return NextResponse.json({ error: "No data in MCP response." }, { status: 500 });
        }

        const envelope = JSON.parse(dataLine.slice(5).trim());

        // Check for MCP-level error
        if (envelope.error) {
            return NextResponse.json({ error: envelope.error.message || "MCP error." }, { status: 500 });
        }

        // Extract the tool result text
        const resultText = envelope?.result?.content?.[0]?.text;
        if (!resultText) {
            console.error("[upload] unexpected shape:", JSON.stringify(envelope));
            return NextResponse.json({ error: "Unexpected response from MCP." }, { status: 500 });
        }

        const parsed = JSON.parse(resultText);
        console.log("[upload] parsed result:", parsed);

        // Return clean response to frontend
        return NextResponse.json({
            name: parsed.name,
            webUrl: parsed.webUrl,
            size: parsed.size,
            libraryName: parsed.libraryName,
            status: parsed.status,
        });

    } catch (err: any) {
        console.error("[upload] error:", err);
        return NextResponse.json({ error: err.message || "Upload failed." }, { status: 500 });
    }
}