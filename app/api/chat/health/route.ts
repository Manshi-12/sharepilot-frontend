import { NextResponse } from "next/server";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "";
const MCP_SECRET = process.env.MCP_SECRET || "";

export async function GET() {
  try {
    const res = await fetch(`${MCP_SERVER_URL}/`, {
      headers: MCP_SECRET ? { "x-mcp-secret": MCP_SECRET } : {},
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { status: "degraded", sharepoint: "unreachable" },
      { status: 503 }
    );
  }
}