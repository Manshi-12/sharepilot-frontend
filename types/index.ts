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

export interface ToolEvent {
  id: string;
  name: string;
  round: number;
  arguments?: any;
  result?: any;
  isError?: boolean;
  status: "calling" | "done";
}

export interface UsageEvent {
  round: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Message {
  messageId: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tools?: ToolEvent[];
  usage?: UsageEvent[];
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