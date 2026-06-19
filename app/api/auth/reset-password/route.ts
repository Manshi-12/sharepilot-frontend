import { NextRequest, NextResponse } from "next/server";
import { usersContainer } from "@/lib/cosmos";
import { hashPassword } from "@/lib/auth";

// NOTE: This is a simplified reset flow with no email verification step —
// fine for this project's current stage, but before going to real users you'd
// want to email a one-time reset link/code instead of trusting the request
// directly. Flagging this so it doesn't get forgotten.
export async function POST(req: NextRequest) {
  try {
    const { email, newPassword } = await req.json();

    if (!email || !newPassword) {
      return NextResponse.json({ error: "Email and new password are required." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const { resources } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: email.toLowerCase() }],
      })
      .fetchAll();

    const user = resources[0];

    // Don't reveal whether the email exists — respond the same way either way.
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const passwordHash = await hashPassword(newPassword);
    await usersContainer.item(user.id, user.userId).replace({
      ...user,
      passwordHash,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}