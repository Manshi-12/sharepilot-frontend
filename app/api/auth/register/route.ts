import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { usersContainer } from "@/lib/cosmos";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, displayName } = await req.json();

    if (!email || !password || !displayName) {
      return NextResponse.json(
        { error: "Email, password, and display name are required." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    const { resources: existing } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email.toLowerCase() }],
      })
      .fetchAll();

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const userId = uuidv4();
    const passwordHash = await hashPassword(password);

    await usersContainer.items.create({
      userId,
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName.trim(),
      createdAt: new Date().toISOString(),
    });

    // Note: registration no longer auto-signs-in the user. They're sent back
    // to the Sign In tab and log in explicitly with their new credentials.
    return NextResponse.json(
      { user: { userId, email: email.toLowerCase(), displayName: displayName.trim() } },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}