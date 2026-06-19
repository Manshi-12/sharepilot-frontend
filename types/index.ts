export interface User {
  userId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  title: string;
  createdAt: string;
  lastUpdated: string;
}

export interface Message {
  messageId: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface RefreshToken {
  tokenId: string;
  userId: string;
  hashedToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthResponse {
  user: { userId: string; email: string; displayName: string };
  accessToken: string;
}