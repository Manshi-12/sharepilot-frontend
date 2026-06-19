"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Message {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Session {
  sessionId: string;
  title: string;
  lastUpdated: string;
}

interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { loadSessions(); loadUser(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const loadUser = async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
    }
  };

  // ── Subtle live aurora background behind the message area ─────────────────
  // Same shader as the login page but slower-moving and much dimmer, so it
  // reads as "alive" without competing with the chat text.
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;

    function syncSize() {
      const w = canvas!.clientWidth || 800;
      const h = canvas!.clientHeight || 600;
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
    }
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = `attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`;
    const fs = `precision highp float;
      uniform float u_time;
      varying vec2 v_texCoord;
      void main() {
        vec2 uv = v_texCoord;
        float t = u_time * 0.12;
        vec2 p1 = vec2(0.5 + 0.35 * sin(t), 0.4 + 0.25 * cos(t * 0.9));
        vec2 p2 = vec2(0.25 + 0.25 * cos(t * 0.7), 0.75 + 0.15 * sin(t * 1.0));
        vec2 p3 = vec2(0.78 + 0.15 * sin(t * 1.2), 0.3 + 0.3 * cos(t * 0.8));
        float d1 = length(uv - p1);
        float d2 = length(uv - p2);
        float d3 = length(uv - p3);
        vec3 bg = vec3(0.941, 0.953, 1.0);
        vec3 glow = vec3(0.91, 0.95, 1.0);
        vec3 sky = vec3(0.78, 0.88, 0.97);
        vec3 accent = vec3(0.96, 0.93, 0.85);
        vec3 color = bg;
        color = mix(color, glow, smoothstep(0.8, 0.0, d1) * 0.5);
        color = mix(color, sky, smoothstep(0.7, 0.0, d2) * 0.35);
        color = mix(color, accent, smoothstep(0.6, 0.0, d3) * 0.25);
        gl_FragColor = vec4(color, 1.0);
      }`;

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, "u_time");

    let raf = 0;
    function render(t: number) {
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      if (uTime) gl!.uniform1f(uTime, t * 0.001);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const loadSessions = async () => {
    const res = await fetch("/api/sessions");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setSessions(data.sessions || []);
  };

  const loadMessages = async (sessionId: string) => {
    setLoadingMessages(true);
    setActiveSessionId(sessionId);
    const res = await fetch(`/api/chat?sessionId=${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
    }
    setLoadingMessages(false);
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setMessages((prev) => [...prev, {
      messageId: "temp-" + Date.now(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId: activeSessionId }),
      });

      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [...prev, {
          messageId: "err-" + Date.now(),
          role: "assistant",
          content: data.error || "Something went wrong. Please try again.",
          timestamp: new Date().toISOString(),
        }]);
        return;
      }

      if (!activeSessionId) {
        setActiveSessionId(data.sessionId);
        loadSessions();
      }

      setMessages((prev) => [...prev, {
        messageId: "reply-" + Date.now(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-screen bg-[#f0f3ff] overflow-hidden" style={{ fontFamily: "'Manrope', sans-serif" }}>

      {/* Sidebar */}
      <aside className={`flex flex-col bg-white/70 backdrop-blur-xl border-r border-[#2b6389]/10 transition-all duration-300 ${sidebarOpen ? "w-72" : "w-0 overflow-hidden"}`}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[#e7eeff]">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-[#2b6389] to-[#466272]">
            <svg width="16" height="16" viewBox="0 0 28 28" fill="none">
              <path d="M6 8h16M6 14h10M6 20h13" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="21" cy="20" r="5" fill="#98ccf8" />
              <path d="M19 20l1.5 1.5L23 18.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-bold text-[#121c2c] text-sm" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            SharePilot
          </span>
        </div>

        <div className="px-4 py-3">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#2b6389] to-[#466272] text-white text-sm font-semibold hover:shadow-[0_4px_12px_rgba(43,99,137,0.3)] transition-all duration-200"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
              <path d="M8 3v10M3 8h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {sessions.length === 0 ? (
            <p className="text-[#71787f] text-xs text-center mt-8 px-4">Your conversations will appear here.</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.sessionId}
                onClick={() => loadMessages(s.sessionId)}
                className={`w-full text-left px-3 py-3 rounded-xl mb-1 transition-all duration-150 ${activeSessionId === s.sessionId ? "bg-[#e7eeff] text-[#2b6389]" : "text-[#41474e] hover:bg-[#f0f3ff]"
                  }`}
              >
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-xs text-[#71787f] mt-0.5">{formatDate(s.lastUpdated)}</p>
              </button>
            ))
          )}
        </div>

        <div ref={userMenuRef} className="relative px-4 py-4 border-t border-[#e7eeff]">
          {userMenuOpen && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl border border-[#e7eeff] shadow-lg shadow-[#2b6389]/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#e7eeff]">
                <p className="text-sm font-semibold text-[#121c2c] truncate">{user?.displayName || "Loading…"}</p>
                <p className="text-xs text-[#71787f] truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-3 text-[#ba1a1a] text-sm hover:bg-[#ffdad6]/40 transition-colors"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                  <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#f0f3ff] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(user?.displayName || "?").trim().charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 min-w-0 text-sm font-medium text-[#121c2c] truncate">
              {user?.displayName || "Account"}
            </span>
            <svg width="14" height="14" fill="none" viewBox="0 0 16 16" className={`text-[#71787f] flex-shrink-0 transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-6 py-4 bg-white/60 backdrop-blur-xl border-b border-[#2b6389]/10">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-[#41474e] hover:bg-[#e7eeff] transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
              <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <h2 className="font-semibold text-[#121c2c] text-sm" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {activeSessionId ? (sessions.find((s) => s.sessionId === activeSessionId)?.title || "Chat") : "New Conversation"}
          </h2>
        </header>

        <div className="relative flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full -z-10 pointer-events-none" />
          {loadingMessages ? (
            <div className="flex justify-center mt-16">
              <div className="w-6 h-6 border-2 border-[#2b6389] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center mb-4 shadow-lg shadow-[#8cc0eb]/30">
                <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
                  <path d="M6 8h16M6 14h10M6 20h13" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="21" cy="20" r="5" fill="#98ccf8" />
                  <path d="M19 20l1.5 1.5L23 18.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#121c2c] mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                What can I help you with?
              </h3>
              <p className="text-[#41474e] text-sm leading-relaxed">
                Ask me to search files, create list items, upload documents, or update records on your SharePoint site.
              </p>
              <div className="grid grid-cols-1 gap-2 mt-6 w-full">
                {["Show me all items in Project Tasks", "Upload a file to Company Knowledge Base", "Create a new item in testList"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-4 py-3 rounded-xl bg-white/80 border border-[#dee8ff] text-[#2b6389] text-sm text-left hover:bg-[#e7eeff] hover:border-[#2b6389]/30 transition-all duration-150"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div key={msg.messageId} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                        <path d="M6 8h16M6 14h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                  <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user"
                    ? "bg-gradient-to-br from-[#2b6389] to-[#466272] text-white rounded-br-sm"
                    : "bg-white/80 backdrop-blur text-[#121c2c] border border-[#dee8ff] rounded-bl-sm shadow-sm"
                    }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1.5 ${msg.role === "user" ? "text-[#98ccf8]" : "text-[#71787f]"}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                      <path d="M6 8h16M6 14h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="bg-white/80 border border-[#dee8ff] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5 items-center h-4">
                      <div className="w-1.5 h-1.5 bg-[#2b6389] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-[#2b6389] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-[#2b6389] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="px-4 md:px-8 py-4 bg-white/60 backdrop-blur-xl border-t border-[#2b6389]/10">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-white/90 border border-[#dee8ff] rounded-2xl px-4 py-3 shadow-sm focus-within:border-[#2b6389] focus-within:shadow-[0_0_0_3px_rgba(43,99,137,0.08)] transition-all duration-200">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask SharePilot anything about your SharePoint site…"
                disabled={sending}
                className="flex-1 resize-none bg-transparent text-[#121c2c] placeholder-[#71787f] text-sm outline-none max-h-40 leading-relaxed disabled:opacity-50"
                style={{ fontFamily: "'Manrope', sans-serif" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center text-white transition-all duration-150 hover:shadow-[0_4px_12px_rgba(43,99,137,0.35)] hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:translate-y-0"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                  <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="white" />
                </svg>
              </button>
            </div>
            <p className="text-center text-xs text-[#71787f] mt-2">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}