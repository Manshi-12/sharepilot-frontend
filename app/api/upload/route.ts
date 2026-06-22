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
        console.log("[upload] raw MCP response:", raw);

        let data: any;
        try {
            // MCP server returns SSE format: "event: message\ndata: {...}"
            // Extract the JSON from the data: line
            const dataLine = raw.split("\n").find((line) => line.startsWith("data:"));
            if (!dataLine) {
                return NextResponse.json({ error: "No data in MCP response." }, { status: 500 });
            }
            data = JSON.parse(dataLine.slice(5).trim());
        } catch {
            return NextResponse.json({ error: "Invalid response from MCP server." }, { status: 500 });
        }

        // MCP returns result.content[0].text which is a JSON string
        const resultText = data?.result?.content?.[0]?.text;
        if (!resultText) {
            console.error("[upload] unexpected MCP shape:", JSON.stringify(data));
            return NextResponse.json({ error: "Unexpected response shape from MCP server." }, { status: 500 });
        }

        let parsed: any;
        try {
            parsed = JSON.parse(resultText);
        } catch {
            return NextResponse.json({ error: "Could not parse tool result." }, { status: 500 });
        }

        return NextResponse.json(parsed);
    } catch (err: any) {
        console.error("[upload] error:", err);
        return NextResponse.json({ error: err.message || "Upload failed." }, { status: 500 });
    }
}