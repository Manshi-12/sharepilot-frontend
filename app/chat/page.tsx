"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ToolEvent {
  id: string;
  name: string;
  round: number;
  arguments?: any;
  result?: any;
  isError?: boolean;
  status: "calling" | "done";
}

interface UsageEvent {
  round: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface Message {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  streaming?: boolean;
  tools?: ToolEvent[];
  usage?: UsageEvent[];
  attachedFileName?: string | null;
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
const thinkingMessages = [
  "Analyzing your request…",
  "Searching your SharePoint content…",
  "Gathering the relevant information…",
  "Working through the details…",
  "Thanks for your patience — your answer is almost ready.",
  "Checking your SharePoint data…",
  "Reviewing available lists and files…",
  "Preparing a response for you…",
  "Looking through your workspace…",
  "Processing your request securely…",
  "Finding the best answer…",
  "Connecting the dots across your content…",
  "Verifying the latest information…",
  "Fetching the required data…",
  "Almost there — putting everything together.",
  "Just a moment while I complete that task…",
  "Organizing the results for you…",
  "Finalizing your response…",
  "Getting things ready behind the scenes…",
  "This may take a few seconds depending on your data size.",
  "Checking permissions and available resources…",
  "Reviewing documents and list items…",
  "Building a clear answer for you…",
  "Making sure everything is accurate…",
  "One last check before I respond…"
];

function ThinkingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    setMsgIndex(Math.floor(Math.random() * thinkingMessages.length));
    const interval = setInterval(() => {
      setMsgIndex(Math.floor(Math.random() * thinkingMessages.length));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 h-5">
      <div className="flex gap-1.5 items-center">
        <span className="sp-thinking-dot" style={{ animationDelay: "0ms" }} />
        <span className="sp-thinking-dot" style={{ animationDelay: "200ms" }} />
        <span className="sp-thinking-dot" style={{ animationDelay: "400ms" }} />
      </div>
      <span className="text-sm font-medium text-[#2b6389] animate-pulse">
        {thinkingMessages[msgIndex]}
      </span>
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [traceOpenFor, setTraceOpenFor] = useState<string | null>(null);
  const [selectedTraceNode, setSelectedTraceNode] = useState<string | null>(null);
  const [sessionMenuFor, setSessionMenuFor] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [backendStatus, setBackendStatus] = useState<"ok" | "degraded" | "unknown">("unknown");
  const [pendingUpload, setPendingUpload] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [libraryInput, setLibraryInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const traceAsideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat/health")
      .then(r => r.json())
      .then(d => setBackendStatus(d.sharepoint === "reachable" ? "ok" : "degraded"))
      .catch(() => setBackendStatus("degraded"));
  }, []);

  useEffect(() => { loadSessions(); loadUser(); }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuFor(null);
      }
      if (traceAsideRef.current && !traceAsideRef.current.contains(e.target as Node)) {
        setTraceOpenFor(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (renamingSessionId) renameInputRef.current?.focus();
  }, [renamingSessionId]);

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
        float t = u_time * 0.30;
        
        // 7 animated blobs covering the whole screen
        vec2 p1 = vec2(0.15 + 0.18 * sin(t * 0.9),       0.15 + 0.15 * cos(t * 0.7));
        vec2 p2 = vec2(0.80 + 0.15 * cos(t * 0.8),       0.25 + 0.20 * sin(t * 1.1));
        vec2 p3 = vec2(0.50 + 0.30 * sin(t * 1.2 + 1.0), 0.55 + 0.25 * cos(t * 0.9));
        vec2 p4 = vec2(0.20 + 0.15 * cos(t * 1.4),       0.75 + 0.18 * sin(t * 1.3));
        vec2 p5 = vec2(0.75 + 0.18 * sin(t * 0.6 + 2.0), 0.80 + 0.15 * cos(t * 1.5));
        vec2 p6 = vec2(0.55 + 0.20 * cos(t * 1.1 + 0.5), 0.20 + 0.18 * sin(t * 0.8));
        vec2 p7 = vec2(0.35 + 0.22 * sin(t * 0.7 + 3.0), 0.45 + 0.20 * cos(t * 1.2));
        
        float d1 = length(uv - p1);
        float d2 = length(uv - p2);
        float d3 = length(uv - p3);
        float d4 = length(uv - p4);
        float d5 = length(uv - p5);
        float d6 = length(uv - p6);
        float d7 = length(uv - p7);
        
       // Soft cool base
vec3 bg = vec3(0.96, 0.98, 1.00);

// SharePilot palette
vec3 mist   = vec3(0.67, 0.80, 0.84); // #AACCD6
vec3 azure  = vec3(0.26, 0.51, 0.87); // #4382DF
vec3 indigo = vec3(0.27, 0.28, 0.68); // #4647AE
vec3 navy   = vec3(0.07, 0.18, 0.51); // #112E81
vec3 teal   = vec3(0.48, 0.89, 0.81); // #7AE2CF

vec3 color = bg;

color = mix(color, mist,   smoothstep(0.40, 0.0, d1) * 0.20);
color = mix(color, azure,  smoothstep(0.36, 0.0, d2) * 0.18);
color = mix(color, indigo, smoothstep(0.42, 0.0, d3) * 0.16);
color = mix(color, teal,   smoothstep(0.34, 0.0, d4) * 0.15);
color = mix(color, azure,  smoothstep(0.44, 0.0, d5) * 0.14);
color = mix(color, navy,   smoothstep(0.32, 0.0, d6) * 0.10);
color = mix(color, teal,   smoothstep(0.46, 0.0, d7) * 0.12);

// Slight desaturation for a glass effect
color = mix(color, bg, 0.12);
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

  const apiFetch = async (url: string, opts: RequestInit = {}) => {
    let res = await fetch(url, opts);
    if (res.status === 401) {
      const r = await fetch("/api/auth/refresh", { method: "POST" });
      if (r.ok) res = await fetch(url, opts);
    }
    return res;
  };

  const loadSessions = async () => {
    const res = await apiFetch("/api/sessions");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setSessions(data.sessions || []);
  };

  const loadMessages = async (sessionId: string) => {
    setLoadingMessages(true);
    setActiveSessionId(sessionId);
    setSessionMenuFor(null);
    const res = await apiFetch(`/api/chat?sessionId=${sessionId}`);
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
    setAttachedFile(null);
  };

  // ── Send a message and consume the live SSE stream from /api/chat ─────────
  const sendingRef = useRef(false);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed && !attachedFile) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    // What shows in the chat bubble — always clean
    const displayMessage = attachedFile
      ? trimmed || `Upload "${attachedFile.name}" to a Document Library`
      : trimmed;

    setMessages((prev) => [...prev, {
      messageId: "temp-" + Date.now(),
      role: "user",
      content: displayMessage,
      attachedFileName: attachedFile?.name || null,
      timestamp: new Date().toISOString(),
    }]);

    setInput("");
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);

    const assistantId = "stream-" + Date.now();
    setMessages((prev) => [...prev, {
      messageId: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      streaming: true,
      tools: [],
      usage: [],
    }]);

    try {
      // ── File upload — handle directly, bypass the AI agent ─────────────
      if (attachedFile) {
        // Extract library name from what user typed
        // e.g. "Upload "file.txt" to the HR Documents" → "HR Documents"
        const libraryMatch = trimmed.match(/to\s+(?:the\s+)?(.+)$/i);
        const libraryName = libraryMatch ? libraryMatch[1].trim() : "";

        if (!libraryName) {
          // User didn't specify library — ask them
          setMessages((prev) => prev.map((m) =>
            m.messageId === assistantId
              ? { ...m, content: "Which Document Library would you like to upload this file to? Please type the library name (e.g. 'Documents', 'HR Documents').", streaming: false }
              : m
          ));
          setSending(false);
          sendingRef.current = false;
          return;
        }

        try {
          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: attachedFile.name,
              content: attachedFile.base64,
              libraryName,
              isBase64: true,
              mimeType: attachedFile.mimeType,
            }),
          });

          const uploadData = await uploadRes.json();
          const successMsg = uploadData.error
            ? `❌ Failed to upload "${attachedFile.name}": ${uploadData.error}`
            : `✅ File **${attachedFile.name}** uploaded successfully!\n\n- **Library:** ${uploadData.libraryName || libraryName}\n- **Size:** ${uploadData.size ? uploadData.size + " bytes" : "—"}\n- **Link:** [View File](${uploadData.webUrl})`;

          setMessages((prev) => prev.map((m) =>
            m.messageId === assistantId ? { ...m, content: successMsg, streaming: false } : m
          ));
        } catch {
          setMessages((prev) => prev.map((m) =>
            m.messageId === assistantId ? { ...m, content: "❌ Upload failed. Please try again.", streaming: false } : m
          ));
        } finally {
          setSending(false);
          sendingRef.current = false;
          if (activeSessionId) loadSessions();
          textareaRef.current?.focus();
        }
        return;
      }

      // ── Normal chat message — goes through AI agent ─────────────────────
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId: activeSessionId }),
      });

      if (res.status === 401) { router.push("/login"); return; }

      if (!res.ok || !res.body) {
        let errMsg = "Something went wrong. Please try again.";
        try { errMsg = (await res.json()).error || errMsg; } catch { }
        setMessages((prev) => prev.map((m) =>
          m.messageId === assistantId ? { ...m, content: errMsg, streaming: false } : m
        ));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let newSessionId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;
          let evt: any;
          try {
            evt = JSON.parse(trimmedLine.slice(5).trim());
          } catch {
            continue;
          }

          if (evt.type === "session") {
            newSessionId = evt.sessionId;
          } else if (evt.type === "token") {
            setMessages((prev) => prev.map((m) =>
              m.messageId === assistantId ? { ...m, content: m.content + evt.delta } : m
            ));
          } else if (evt.type === "tool_call") {
            setMessages((prev) => prev.map((m) => {
              if (m.messageId !== assistantId) return m;
              const tools = [...(m.tools || []), {
                id: evt.id, name: evt.name, round: evt.round, arguments: evt.arguments, status: "calling" as const,
              }];
              return { ...m, tools };
            }));
          } else if (evt.type === "tool_result") {
            setMessages((prev) => prev.map((m) => {
              if (m.messageId !== assistantId) return m;
              const tools = (m.tools || []).map((t) =>
                t.id === evt.id ? { ...t, result: evt.result, isError: evt.isError, status: "done" as const } : t
              );
              return { ...m, tools };
            }));
          } else if (evt.type === "usage") {
            setMessages((prev) => prev.map((m) =>
              m.messageId === assistantId
                ? { ...m, usage: [...(m.usage || []), { round: evt.round, promptTokens: evt.promptTokens, completionTokens: evt.completionTokens, totalTokens: evt.totalTokens }] }
                : m
            ));
          } else if (evt.type === "done") {
            setMessages((prev) => prev.map((m) =>
              m.messageId === assistantId ? { ...m, content: evt.content, streaming: false } : m
            ));
          }
        }
      }

      if (newSessionId && !activeSessionId) {
        setActiveSessionId(newSessionId);
        loadSessions();
      } else if (activeSessionId) {
        loadSessions();
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) =>
        m.messageId === assistantId ? { ...m, content: "Connection lost. Please try again.", streaming: false } : m
      ));
    } finally {
      setSending(false);
      sendingRef.current = false;
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

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // Clipboard API blocked (e.g. insecure context) — silently ignore
    }
  };

  const startRename = (s: Session) => {
    setRenamingSessionId(s.sessionId);
    setRenameValue(s.title);
    setSessionMenuFor(null);
  };

  const commitRename = async (sessionId: string) => {
    const trimmed = renameValue.trim();
    setRenamingSessionId(null);
    if (!trimmed) return;

    setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? { ...s, title: trimmed } : s)));

    const res = await apiFetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (!res.ok) loadSessions(); // revert to server truth on failure
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { sessionId } = deleteTarget;
    setDeleteTarget(null);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    if (activeSessionId === sessionId) startNewChat();

    const res = await apiFetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) loadSessions();
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

  const totalTokensFor = (m: Message) =>
    (m.usage || []).reduce((sum, u) => sum + u.totalTokens, 0);

  return (
    <div className="flex h-screen bg-[#f0f3ff] overflow-hidden relative z-0" style={{ fontFamily: "'Manrope', sans-serif" }}>
      <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full -z-10 pointer-events-none" />

      {/* Sidebar */}
      <aside className={`flex flex-col bg-white/40 backdrop-blur-3xl border-r border-white/50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 z-10 ${sidebarOpen ? "w-60" : "w-0 overflow-hidden"}`}>
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
          <span className={`w-2 h-2 rounded-full ${backendStatus === "ok" ? "bg-green-400" : backendStatus === "degraded" ? "bg-red-400 animate-pulse" : "bg-gray-300"}`} title={`Backend: ${backendStatus}`} />
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

        <div className="flex-1 overflow-y-auto px-2 pb-3 sp-sidebar-scroll">
          {sessions.length === 0 ? (
            <p className="text-[#71787f] text-xs text-center mt-8 px-4">Your conversations will appear here.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.sessionId} className="relative group">
                {renamingSessionId === s.sessionId ? (
                  <div className="px-3 py-2 mb-1">
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitRename(s.sessionId); }
                        if (e.key === "Escape") setRenamingSessionId(null);
                      }}
                      onBlur={() => commitRename(s.sessionId)}
                      maxLength={100}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#2b6389] bg-white text-sm text-[#121c2c] outline-none focus:shadow-[0_0_0_3px_rgba(43,99,137,0.12)]"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => loadMessages(s.sessionId)}
                    className={`w-full text-left px-4 py-3 pr-9 rounded-2xl mb-1 transition-all duration-300 border ${activeSessionId === s.sessionId
                      ? "bg-white/60 backdrop-blur-md border-white/80 shadow-sm text-[#2b6389]"
                      : "bg-transparent border-transparent text-[#41474e] hover:bg-white/30 hover:border-white/40"
                      }`}
                  >
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-[#71787f] mt-0.5">{formatDate(s.lastUpdated)}</p>
                  </button>
                )}

                {renamingSessionId !== s.sessionId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSessionMenuFor(sessionMenuFor === s.sessionId ? null : s.sessionId); }}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#71787f] hover:bg-[#dee8ff] hover:text-[#2b6389] transition-all duration-150 ${sessionMenuFor === s.sessionId ? "opacity-100 bg-[#dee8ff]" : "opacity-0 group-hover:opacity-100"}`}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 16 16">
                      <circle cx="8" cy="3.2" r="1.3" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="8" cy="12.8" r="1.3" fill="currentColor" />
                    </svg>
                  </button>
                )}

                {sessionMenuFor === s.sessionId && (
                  <div
                    ref={sessionMenuRef}
                    className="absolute right-1 top-10 z-20 w-36 bg-white rounded-xl border border-[#e7eeff] shadow-lg shadow-[#2b6389]/15 overflow-hidden"
                  >
                    <button
                      onClick={() => startRename(s)}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-[#121c2c] hover:bg-[#f0f3ff] transition-colors"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 16 16">
                        <path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.5 12.3l-3 .7.7-3 8.1-8.1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                      Rename
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(s); setSessionMenuFor(null); }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-[#ba1a1a] hover:bg-[#ffdad6]/40 transition-colors"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 16 16">
                        <path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5l.6 8.4a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>


      </aside>

      {/* Main */}
      <div className="relative z-0 flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 py-2.5 bg-white/40 backdrop-blur-2xl border-b border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] z-10">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-[#41474e] hover:bg-[#e7eeff] transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
              <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <h2 className="flex-1 font-semibold text-[#121c2c] text-sm truncate" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {activeSessionId ? (sessions.find((s) => s.sessionId === activeSessionId)?.title || "Chat") : "New Conversation"}
          </h2>

          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl text-left hover:bg-white/50 transition-colors"
            >
              <span className="hidden sm:block text-sm font-medium text-[#121c2c] truncate max-w-[120px]">
                {user?.displayName || "Account"}
              </span>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(user?.displayName || "?").trim().charAt(0).toUpperCase()}
              </div>
            </button>
            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl border border-[#e7eeff] shadow-lg shadow-[#2b6389]/10 overflow-hidden z-50">
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
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {loadingMessages ? (
            <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                  <div className={`h-16 rounded-3xl bg-white/40 border border-white/30 ${i % 2 === 0 ? "w-[65%]" : "w-[45%]"}`} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-24 h-24 flex items-center justify-center mb-2">
                <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm hover:drop-shadow-md transition-all duration-300 hover:-translate-y-1">
                  <circle cx="34" cy="20" r="14" fill="#04686B" opacity="0.85" />
                  <circle cx="44" cy="34" r="15" fill="#1BBCC2" opacity="0.85" />
                  <circle cx="32" cy="46" r="12" fill="#5EE5E5" opacity="0.85" />
                  <rect x="10" y="22" width="28" height="28" rx="5" fill="#03787C" />
                  <text x="24" y="36.5" fill="white" fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="800" fontSize="21" textAnchor="middle" dominantBaseline="central">S</text>
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#121c2c] mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                What can I help you with?
              </h3>
              <p className="text-[#41474e] text-sm leading-relaxed">
                Ask me to search files, create list items, upload documents, or update records on your SharePoint site.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 w-full max-w-2xl mx-auto">
                {[
                  { icon: "📋", text: "Show me all items in Project Tasks" },
                  { icon: "📤", text: "Upload a file to Company Knowledge Base" },
                  { icon: "✨", text: "Create a new item in testList" }
                ].map((s) => (
                  <button
                    key={s.text}
                    onClick={() => setInput(s.text)}
                    className="flex flex-col items-center justify-center gap-3 p-5 rounded-3xl bg-white/50 backdrop-blur-md border border-white/60 shadow-[0_4px_24px_rgba(0,0,0,0.04)] text-[#2b6389] text-sm text-center font-medium hover:-translate-y-1.5 hover:shadow-[0_12px_32px_rgba(43,99,137,0.12)] hover:bg-white/80 transition-all duration-300"
                  >
                    <span className="text-3xl mb-1">{s.icon}</span>
                    <span className="leading-snug">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                const hasTools = (msg.tools || []).length > 0;
                const tokens = totalTokensFor(msg);
                const liveCallingTool = (msg.tools || []).find((t) => t.status === "calling");

                return (
                  <div key={msg.messageId} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
                          <path d="M6 8h16M6 14h10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      </div>
                    )}

                    <div className={`group max-w-[78%] min-w-0 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`px-5 py-4 rounded-3xl text-sm leading-relaxed ${isUser
                        ? "bg-gradient-to-br from-[#2b6389]/95 to-[#466272]/95 backdrop-blur-md border border-white/20 text-white rounded-br-sm shadow-md"
                        : "bg-white/50 backdrop-blur-xl text-[#121c2c] border border-white/60 rounded-bl-sm shadow-[0_8px_32px_rgba(0,0,0,0.04)]"
                        }`}>

                        {/* Live tool-call status line, real-time while streaming */}
                        {!isUser && liveCallingTool && (
                          <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm w-fit text-xs text-[#2b6389] font-semibold">
                            <span className="flex gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2b6389] animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2b6389] animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2b6389] animate-bounce" style={{ animationDelay: "300ms" }} />
                            </span>
                            Running <code className="px-2 py-0.5 rounded-md bg-white/60 border border-white/40 shadow-[0_2px_8px_rgba(43,99,137,0.05)]">{liveCallingTool.name}</code>
                          </div>
                        )}

                        {isUser ? (
                          <div className="flex flex-col gap-2">
                            {msg.attachedFileName && (
                              <div className="flex items-center gap-2 px-2 py-1.5 bg-white/20 border border-white/30 rounded-xl w-fit">
                                <svg width="13" height="13" fill="none" viewBox="0 0 16 16">
                                  <path d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="white" strokeWidth="1.3" />
                                  <path d="M9 2v4h4" stroke="white" strokeWidth="1.3" />
                                </svg>
                                <span className="text-xs text-white/90 font-medium max-w-[180px] truncate">
                                  {msg.attachedFileName}
                                </span>
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        ) : msg.streaming && !msg.content ? (
                          <ThinkingIndicator />
                        ) : (
                          <div className="sp-markdown">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            {msg.streaming && <span className="sp-cursor" />}
                          </div>
                        )}

                        <p className={`text-xs mt-1.5 ${isUser ? "text-[#98ccf8]" : "text-[#71787f]"}`}>
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>

                      {/* Action row: copy + tokens/traces (assistant only), shown on hover */}
                      <div className={`flex items-center gap-1 mt-1 px-1 transition-opacity duration-150 ${isUser ? "opacity-0 group-hover:opacity-100" : ""} ${!isUser && msg.streaming ? "opacity-0" : ""}`}>
                        <button
                          onClick={() => handleCopy(msg.messageId, msg.content)}
                          title="Copy"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#71787f] hover:bg-[#e7eeff] hover:text-[#2b6389] transition-colors opacity-0 group-hover:opacity-100"
                        >
                          {copiedId === msg.messageId ? (
                            <>
                              <svg width="12" height="12" fill="none" viewBox="0 0 16 16"><path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              Copied
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" fill="none" viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M3 10.5V3.5A1.5 1.5 0 0 1 4.5 2h7" stroke="currentColor" strokeWidth="1.3" /></svg>
                              Copy
                            </>
                          )}
                        </button>

                        {!isUser && !msg.streaming && (hasTools || tokens > 0) && (
                          <>
                            <span className="text-[#dee8ff]">·</span>
                            <button
                              onClick={() => { setTraceOpenFor(msg.messageId); setSelectedTraceNode(null); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#71787f] hover:bg-[#e7eeff] hover:text-[#2b6389] transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 16 16"><path d="M8 1.5v3M8 11.5v3M2.5 8h3M10.5 8h3M4 4l2 2M12 4l-2 2M4 12l2-2M12 12l-2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                              {tokens > 0 ? `${tokens}t` : ""} {hasTools ? `· ${msg.tools!.length} tool${msg.tools!.length > 1 ? "s" : ""}` : ""}
                              View trace
                            </button>
                          </>
                        )}

                        {/* Summarize button — standalone, NOT inside any other button */}
                        {!isUser && !msg.streaming && msg.content.match(/\.(docx|xlsx|csv|txt)/i) && (
                          <>
                            <span className="text-[#dee8ff]">·</span>
                            <button
                              onClick={() => {
                                setInput("Summarize that file for me");
                                setTimeout(() => handleSend(), 100);
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[#71787f] hover:bg-[#e7eeff] hover:text-[#2b6389] transition-colors opacity-0 group-hover:opacity-100"
                            >
                              ✦ Summarize
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="px-4 md:px-8 py-2.5 bg-white/40 backdrop-blur-2xl border-t border-white/50 z-10">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col bg-white/50 backdrop-blur-xl border border-white/60 rounded-3xl px-4 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.04)] focus-within:bg-white/80 focus-within:border-white focus-within:shadow-[0_8px_32px_rgba(43,99,137,0.1)] transition-all duration-300">

              {/* File preview chip — shows when a file is attached */}
              {attachedFile && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-[#e7eeff] border border-[#dee8ff] rounded-xl w-fit">
                  <svg width="14" height="14" fill="none" viewBox="0 0 16 16">
                    <path d="M4 2h6l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="#2b6389" strokeWidth="1.3" />
                    <path d="M9 2v4h4" stroke="#2b6389" strokeWidth="1.3" />
                  </svg>
                  <span className="text-xs text-[#2b6389] font-medium max-w-[200px] truncate">{attachedFile.name}</span>
                  <button
                    onClick={() => setAttachedFile(null)}
                    className="text-[#71787f] hover:text-[#ba1a1a] transition-colors ml-1"
                  >
                    <svg width="12" height="12" fill="none" viewBox="0 0 16 16">
                      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              )}

              <div className="flex items-end gap-3">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".txt,.csv,.json,.md,.docx,.xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = (reader.result as string).split(",")[1];
                      setAttachedFile({ name: file.name, base64, mimeType: file.type });
                      setInput(`Upload "${file.name}" to the `);
                      setTimeout(() => textareaRef.current?.focus(), 50);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />

                {/* Paperclip button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Attach a file"
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[#71787f] hover:bg-[#e7eeff] hover:text-[#2b6389] transition-colors disabled:opacity-40"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

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

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && !attachedFile) || sending}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#2b6389] to-[#466272] flex items-center justify-center text-white transition-all duration-150 hover:shadow-[0_4px_12px_rgba(43,99,137,0.35)] hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:translate-y-0"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                    <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="white" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="text-center text-xs text-[#71787f] mt-2">
              SharePilot is AI and can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </div>

      {traceOpenFor && (() => {
        const traceMsg = messages.find((m) => m.messageId === traceOpenFor);
        if (!traceMsg) return null;
        const tools = traceMsg.tools || [];
        const usage = traceMsg.usage || [];
        const totalTokens = usage.reduce((s, u) => s + u.totalTokens, 0);

        type Node = { id: string; kind: "input" | "tool" | "response"; label: string; sub: string; status: "done" | "error" | "running" };
        const nodes: Node[] = [
          { id: "__input", kind: "input", label: "Conversation", sub: "User message", status: "done" },
          ...tools.map((t) => ({
            id: t.id,
            kind: "tool" as const,
            label: t.name,
            sub: `round ${t.round + 1}`,
            status: t.status === "calling" ? ("running" as const) : t.isError ? ("error" as const) : ("done" as const),
          })),
          { id: "__output", kind: "response", label: "Response", sub: `${traceMsg.streaming ? "generating…" : "completed"}`, status: traceMsg.streaming ? "running" : "done" },
        ];

        const selected = selectedTraceNode || "__output";
        const selectedTool = tools.find((t) => t.id === selected);

        return (
          <aside
            ref={traceAsideRef}
            className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white/95 backdrop-blur-xl border-l border-[#2b6389]/15 shadow-[-12px_0_40px_rgba(43,99,137,0.12)] z-50 flex flex-col animate-in"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eeff] flex-shrink-0">
              <div>
                <p className="text-sm font-bold text-[#121c2c]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Trace</p>
                <p className="text-xs text-[#71787f] mt-0.5">
                  {traceMsg.streaming ? "Running" : "Completed"} · {totalTokens > 0 ? `${totalTokens} tokens` : "—"}
                </p>
              </div>
              <button
                onClick={() => setTraceOpenFor(null)}
                className="p-2 rounded-lg text-[#71787f] hover:bg-[#e7eeff] hover:text-[#2b6389] transition-colors"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="px-3 py-4 border-b border-[#e7eeff] overflow-y-auto flex-shrink-0 max-h-[42%]">
              <div className="relative pl-4">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#dee8ff]" />
                {nodes.map((n, i) => {
                  const isSelected = selected === n.id;
                  const dotColor = n.status === "running" ? "bg-[#98ccf8]" : n.status === "error" ? "bg-[#ba1a1a]" : "bg-[#4ade80]";
                  return (
                    <button
                      key={n.id}
                      onClick={() => setSelectedTraceNode(n.id)}
                      className={`sp-trace-row relative w-full flex items-center gap-3 text-left mb-1 px-3 py-2.5 rounded-lg transition-colors ${isSelected ? "bg-[#2b6389]/10 border border-[#2b6389]/30" : "hover:bg-[#f0f3ff] border border-transparent"}`}
                    >
                      <span className={`absolute -left-[13px] w-2.5 h-2.5 rounded-full ring-4 ring-white flex-shrink-0 ${dotColor} ${n.status === "running" ? "animate-pulse" : ""}`} />
                      <span className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${n.kind === "tool" ? "bg-[#98ccf8]/20 text-[#2b6389]" : "bg-[#e7eeff] text-[#121c2c]"}`}>
                        {n.kind === "input" ? "U" : n.kind === "response" ? "A" : "T"}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-[#121c2c] truncate">{n.kind === "tool" ? <code>{n.label}</code> : n.label}</span>
                        <span className="block text-[11px] text-[#71787f]">{n.sub}</span>
                      </span>
                      {i < nodes.length - 1 && (
                        <svg width="10" height="10" fill="none" viewBox="0 0 16 16" className="text-[#71787f]/50 flex-shrink-0"><path d="M6 3l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {selected === "__input" && (
                <>
                  <p className="text-xs font-semibold text-[#466272] uppercase tracking-wide mb-2">User input</p>
                  <div className="bg-[#f0f3ff] border border-[#dee8ff] rounded-xl px-3.5 py-3">
                    <p className="text-sm text-[#121c2c] whitespace-pre-wrap break-words">{messages.find((m) => m.role === "user" && messages.indexOf(m) === messages.indexOf(traceMsg) - 1)?.content || "—"}</p>
                  </div>
                </>
              )}

              {selected === "__output" && (
                <>
                  <p className="text-xs font-semibold text-[#466272] uppercase tracking-wide mb-2">Agent output</p>
                  <div className="bg-[#f0f3ff] border border-[#dee8ff] rounded-xl px-3.5 py-3 mb-4">
                    <div className="sp-markdown text-sm text-[#121c2c]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{traceMsg.content || "_(empty)_"}</ReactMarkdown>
                    </div>
                  </div>
                  {usage.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-[#466272] uppercase tracking-wide mb-2">Token usage</p>
                      <div className="space-y-1.5">
                        {usage.map((u, i) => (
                          <div key={i} className="flex items-center justify-between text-xs text-[#41474e] bg-[#f0f3ff] border border-[#dee8ff] rounded-lg px-3 py-2">
                            <span>Round {u.round + 1}</span>
                            <span className="font-mono">{u.promptTokens}p + {u.completionTokens}c = <span className="text-[#2b6389] font-semibold">{u.totalTokens}t</span></span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs text-[#121c2c] bg-[#2b6389]/10 border border-[#2b6389]/30 rounded-lg px-3 py-2 font-semibold">
                          <span>Total</span>
                          <span className="font-mono text-[#2b6389]">{totalTokens}t</span>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {selectedTool && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2 h-2 rounded-full ${selectedTool.status === "calling" ? "bg-[#98ccf8] animate-pulse" : selectedTool.isError ? "bg-[#ba1a1a]" : "bg-[#4ade80]"}`} />
                    <code className="text-sm font-semibold text-[#2b6389]">{selectedTool.name}</code>
                    <span className="text-[11px] text-[#71787f] ml-auto">round {selectedTool.round + 1}</span>
                  </div>

                  <p className="text-xs font-semibold text-[#466272] uppercase tracking-wide mb-2">Input</p>
                  <pre className="text-[12px] text-[#121c2c] whitespace-pre-wrap break-all font-mono leading-relaxed bg-[#f0f3ff] border border-[#dee8ff] rounded-xl px-3.5 py-3 mb-4">{JSON.stringify(selectedTool.arguments, null, 2)}</pre>

                  {selectedTool.status === "done" ? (
                    <>
                      <p className="text-xs font-semibold text-[#466272] uppercase tracking-wide mb-2">{selectedTool.isError ? "Error" : "Output"}</p>
                      <pre className={`text-[12px] whitespace-pre-wrap break-all font-mono leading-relaxed rounded-xl px-3.5 py-3 border ${selectedTool.isError ? "text-[#ba1a1a] bg-[#ffdad6]/40 border-[#ffb4ab]" : "text-[#41474e] bg-[#f0f3ff] border-[#dee8ff]"}`}>{JSON.stringify(selectedTool.result, null, 2)}</pre>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-[#2b6389]">
                      <span className="sp-thinking-dot" />
                      Running…
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        );
      })()}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-[#121c2c]/15 backdrop-blur-[1px] flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-bold text-[#121c2c] text-base mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Delete this chat?
            </h3>
            <p className="text-sm text-[#41474e] mb-5 leading-relaxed">
              "{deleteTarget.title}" and all of its messages will be permanently deleted. This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#dee8ff] text-[#41474e] text-sm font-medium hover:bg-[#f0f3ff] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#ba1a1a] text-white text-sm font-semibold hover:bg-[#a51616] transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}