import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { refreshTokensContainer } from "./cosmos";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "7");

// ── Password ──────────────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Access Token (JWT, short-lived, lives in httpOnly cookie) ─────────────────
// Uses `jose` instead of `jsonwebtoken` because this code also runs inside
// Next.js Middleware, which executes on the Edge runtime — `jsonwebtoken`
// relies on Node's `crypto` module and silently fails there.
export async function signAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: string; email: string };
  } catch {
    return null;
  }
}

// ── Refresh Token (long-lived, stored hashed in Cosmos DB) ────────────────────
export async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = uuidv4() + uuidv4();
  const hashedToken = await bcrypt.hash(rawToken, 10);
  const tokenId = uuidv4();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

  await refreshTokensContainer.items.create({
    tokenId,
    userId,
    hashedToken,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  });

  return `${tokenId}.${rawToken}`;
}

export async function verifyRefreshToken(
  compositeToken: string
): Promise<{ userId: string; tokenId: string } | null> {
  const dotIndex = compositeToken.indexOf(".");
  if (dotIndex === -1) return null;
  const tokenId = compositeToken.slice(0, dotIndex);
  const rawToken = compositeToken.slice(dotIndex + 1);

  try {
    const { resource } = await refreshTokensContainer.item(tokenId, undefined).read();
    if (!resource) return null;

    if (new Date(resource.expiresAt) < new Date()) {
      await refreshTokensContainer.item(tokenId, resource.userId).delete();
      return null;
    }

    const valid = await bcrypt.compare(rawToken, resource.hashedToken);
    if (!valid) return null;

    return { userId: resource.userId, tokenId };
  } catch {
    return null;
  }
}

export async function deleteRefreshToken(tokenId: string, userId: string): Promise<void> {
  try {
    await refreshTokensContainer.item(tokenId, userId).delete();
  } catch {
    // Already deleted — fine
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────
export const ACCESS_TOKEN_COOKIE = "sp_access";
export const REFRESH_TOKEN_COOKIE = "sp_refresh";

export function cookieOptions(maxAgeSeconds: number) {
  return [
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}