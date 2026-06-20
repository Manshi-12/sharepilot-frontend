"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Floating context cards drifting over the aurora canvas
const FLOATING_CARDS = [
  { icon: "📄", label: "Quick Access", text: "Search Documents", top: "5%", left: "30%", duration: 10, tx: -20, ty: 15, rot: 3 },
  { icon: "📌", label: "Contextual Action", text: "Create Project Task", top: "35%", left: "8%", duration: 8, tx: 15, ty: -20, rot: -2 },
  { icon: "📊", label: "AI Insight", text: "Generate Reports", top: "35%", right: "40%", duration: 9, tx: 25, ty: 10, rot: 1 },
  { icon: "📋", label: "List Management", text: "Update SharePoint Lists", bottom: "20%", right: "39%", duration: 11, tx: -15, ty: -18, rot: -1.5 },
  { icon: "🤖", label: "AI Agent", text: "Ask SharePilot Anything", top: "62%", left: "4%", duration: 7.5, tx: 18, ty: 12, rot: 2 },
] as const;

type Mode = "login" | "register" | "forgot";

const EYE_OPEN = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
const EYE_CLOSED = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.5 5.4A10.4 10.4 0 0112 5c5 0 9 4 10 7-0.4 1.2-1.2 2.6-2.3 3.8M6.3 6.5C4.4 7.8 3 9.6 2 12c1 3 5 7 10 7 1.3 0 2.5-.2 3.6-.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EMPTY_FORM = { email: "", password: "", confirmPassword: "", displayName: "", newPassword: "", confirmNewPassword: "" };

export default function LoginPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbWrapRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [poppedCard, setPoppedCard] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setFieldErrors({});
    setForm(EMPTY_FORM);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
  };

  const handleCardClick = (i: number) => {
    setPoppedCard(i);
    window.setTimeout(() => setPoppedCard((cur) => (cur === i ? null : cur)), 450);
  };

  // ── Aurora WebGL shader background ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function syncSize() {
      const w = canvas!.clientWidth || 1280;
      const h = canvas!.clientHeight || 720;
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
        float t = u_time * 0.3;
        vec2 p1 = vec2(0.5 + 0.3 * sin(t), 0.5 + 0.2 * cos(t * 1.1));
        vec2 p2 = vec2(0.2 + 0.2 * cos(t * 0.8), 0.8 + 0.1 * sin(t * 1.2));
        vec2 p3 = vec2(0.8 + 0.1 * sin(t * 1.5), 0.2 + 0.3 * cos(t * 0.9));
        float d1 = length(uv - p1);
        float d2 = length(uv - p2);
        float d3 = length(uv - p3);
        vec3 bg = vec3(1.0, 0.992, 0.961);
        vec3 glow = vec3(1.0, 0.976, 0.824);
        vec3 sky = vec3(0.749, 0.867, 0.941);
        vec3 accent = vec3(1.0, 0.922, 0.8);
        vec3 color = bg;
        color = mix(color, glow, smoothstep(0.8, 0.0, d1));
        color = mix(color, sky, smoothstep(0.7, 0.0, d2) * 0.6);
        color = mix(color, accent, smoothstep(0.6, 0.0, d3) * 0.4);
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

  // ── Orb mouse-tilt ───────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const wrap = orbWrapRef.current;
      const orb = orbRef.current;
      if (!wrap || !orb) return;
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angleX = (e.clientY - cy) / 25;
      const angleY = (e.clientX - cx) / 25;
      orb.style.transform = `rotateX(${-angleX}deg) rotateY(${angleY}deg)`;
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = (): boolean => {
    const errs: { [key: string]: string } = {};

    if (!emailRe.test(form.email)) errs.email = "Enter a valid email address.";

    if (mode === "register") {
      if (form.displayName.trim().length < 2) errs.displayName = "Enter your full name.";
      if (form.password.length < 8) errs.password = "Password must be at least 8 characters.";
      else if (!/[A-Z]/.test(form.password)) errs.password = "Include at least one uppercase letter.";
      else if (!/[0-9]/.test(form.password)) errs.password = "Include at least one number.";
      if (form.confirmPassword !== form.password) errs.confirmPassword = "Passwords don't match.";
    } else if (mode === "login") {
      if (!form.password) errs.password = "Password is required.";
    } else if (mode === "forgot") {
      if (form.newPassword.length < 8) errs.newPassword = "Password must be at least 8 characters.";
      else if (!/[A-Z]/.test(form.newPassword)) errs.newPassword = "Include at least one uppercase letter.";
      else if (!/[0-9]/.test(form.newPassword)) errs.newPassword = "Include at least one number.";
      if (form.confirmNewPassword !== form.newPassword) errs.confirmNewPassword = "Passwords don't match.";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!validate()) return;
    setLoading(true);

    try {
      if (mode === "forgot") {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, newPassword: form.newPassword }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Something went wrong.");
          return;
        }
        switchMode("login");
        setNotice("Password updated. Sign in with your new password.");
        return;
      }

      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email: form.email, password: form.password }
          : { email: form.email, password: form.password, displayName: form.displayName };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      if (mode === "register") {
        const registeredEmail = form.email;
        switchMode("login");
        setForm((f) => ({ ...f, email: registeredEmail }));
        setNotice("Account created! Sign in to continue.");
        return;
      }

      router.push("/chat");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Mode, { heading: string; sub: string }> = {
    login: { heading: "Welcome back", sub: "Sign in to your SharePilot workspace" },
    register: { heading: "Create your account", sub: "Start managing SharePoint with AI" },
    forgot: { heading: "Reset your password", sub: "Enter your email and choose a new password" },
  };

  return (
    <>
      <style>{`
        @keyframes orbPulse {
          0%, 100% { transform: scale(1) translateY(0); box-shadow: 0 0 40px rgba(140,192,235,0.6), inset 0 0 20px rgba(255,255,255,0.8); }
          50% { transform: scale(1.05) translateY(-10px); box-shadow: 0 0 60px rgba(140,192,235,0.8), inset 0 0 20px rgba(255,255,255,0.8); }
        }
        @keyframes rotateCW { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
        @keyframes rotateCCW { from { transform: translate(-50%,-50%) rotate(360deg); } to { transform: translate(-50%,-50%) rotate(0deg); } }
        @keyframes drift {
          from { transform: translate(0,0) rotate(var(--rot)); }
          to   { transform: translate(var(--tx), var(--ty)) rotate(calc(var(--rot) + 5deg)); }
        }
        @keyframes fadeSwap { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position:-200% center; } 100% { background-position:200% center; } }

        .ai-orb {
          width: 130px; height: 130px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #ffffff, #8cc0eb);
          animation: orbPulse 4s ease-in-out infinite;
          transition: transform 0.3s cubic-bezier(.175,.885,.32,1.275);
        }
        .orb-ring { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); border-radius:50%; border:1px solid rgba(140,192,235,0.4); pointer-events:none; }
        .ring-1 { width:170px; height:170px; border-style:dashed; animation: rotateCW 20s linear infinite; }
        .ring-2 { width:148px; height:148px; border-width:2px; animation: rotateCCW 15s linear infinite; opacity:0.5; }
        .orb-wrap { perspective: 1000px; }

        .floating-card {
          position:absolute;
          background: rgba(255,255,255,0.45);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.6);
          box-shadow: 0 8px 32px 0 rgba(140,192,235,0.12);
          animation: drift var(--duration) ease-in-out infinite alternate;
          transition: transform 0.25s cubic-bezier(.4,0,.2,1), background 0.25s ease, box-shadow 0.25s ease;
        }
        .floating-card:hover { transform: translateY(-14px) scale(1.12) !important; background: rgba(255,255,255,0.75); box-shadow: 0 16px 36px 0 rgba(140,192,235,0.2); }
        .floating-card.popped { transform: scale(1.18) !important; background: rgba(255,255,255,0.85) !important; box-shadow: 0 14px 40px 0 rgba(140,192,235,0.28) !important; z-index: 25; }

        .form-card { animation: fadeSwap 0.3s ease-out both; }
        .login-btn-gradient { background: linear-gradient(135deg, #2b6389, #8cc0eb); transition: all .3s ease; }
        .login-btn-gradient:hover { filter: brightness(1.1); transform: translateY(-2px); box-shadow: 0 10px 20px -5px rgba(43,99,137,0.4); }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <main className="relative min-h-screen w-full overflow-x-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {/* Aurora shader background */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Floating context cards (hidden on small screens) */}
        <div className="hidden lg:block">
          {FLOATING_CARDS.map((c, i) => (
            <div
              key={i}
              onClick={() => handleCardClick(i)}
              className={`floating-card p-3 rounded-2xl w-48 z-20 cursor-pointer select-none ${poppedCard === i ? "popped" : ""}`}
              style={{
                top: "top" in c ? c.top : undefined,
                bottom: "bottom" in c ? (c as any).bottom : undefined,
                left: "left" in c ? (c as any).left : undefined,
                right: "right" in c ? (c as any).right : undefined,
                "--duration": `${c.duration}s`,
                "--tx": `${c.tx}px`,
                "--ty": `${c.ty}px`,
                "--rot": `${c.rot}deg`,
              } as any}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[16px]">{c.icon}</span>
                <span className="text-[11px] tracking-wide uppercase font-medium text-[#41474e] opacity-70">{c.label}</span>
              </div>
              <p className="text-sm font-semibold text-[#1b1c17]">{c.text}</p>
            </div>
          ))}
        </div>

        {/* Layout: orb takes ~2/3, login card docked right */}
        <div className="relative z-10 flex flex-col lg:flex-row min-h-screen w-full">
          {/* Left/center 2/3 — Orb + branding */}
          <div className="hidden lg:flex lg:flex-[2] flex-col items-center justify-center px-6 py-8">
            <div ref={orbWrapRef} className="orb-wrap cursor-pointer mb-6">
              <div className="relative w-[170px] h-[170px] flex items-center justify-center">
                <div className="ring-1 orb-ring" />
                <div className="ring-2 orb-ring" />
                <div ref={orbRef} className="ai-orb" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-[32px] font-extrabold text-[#2b6389] tracking-tight mb-1" style={{ fontFamily: "'Manrope', sans-serif" }}>
                SharePilot
              </h1>
              <p className="text-[#41474e] text-base opacity-80">Your Intelligent SharePoint Workspace</p>
              <p className="text-[#71787f] text-sm mt-2 max-w-xs mx-auto leading-relaxed">
                Search files, manage lists, and automate SharePoint — just by asking.
              </p>
            </div>
          </div>

          {/* Right 1/3 — Login modal, docked right, internally scrollable so the page never grows a real scrollbar */}
          <div className="w-full lg:flex-[1] lg:max-w-md flex items-center justify-center px-6 py-6 lg:pr-12 overflow-y-auto no-scrollbar">
            <div
              key={mode}
              className="form-card w-full max-w-sm rounded-[2rem] p-8 flex flex-col gap-5 my-auto"
              style={{
                background: "rgba(255,255,255,0.45)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.5)",
                boxShadow: "0 8px 32px 0 rgba(140,192,235,0.1)",
              }}
            >
              <div>
                <h2 className="text-2xl font-bold text-[#1b1c17]" style={{ fontFamily: "'Manrope', sans-serif" }}>
                  {titles[mode].heading}
                </h2>
                <p className="text-[#41474e] text-sm mt-1">{titles[mode].sub}</p>
              </div>

              {mode !== "forgot" && (
                <div className="flex bg-white/40 rounded-xl p-1">
                  {(["login", "register"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => switchMode(tab)}
                      className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${mode === tab ? "bg-white text-[#2b6389] shadow-sm" : "text-[#41474e] hover:text-[#2b6389]"
                        }`}
                    >
                      {tab === "login" ? "Sign In" : "Register"}
                    </button>
                  ))}
                </div>
              )}

              {notice && (
                <div className="bg-[#dcf5e3] text-[#1b5e2a] text-sm px-4 py-3 rounded-xl">{notice}</div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {mode === "register" && (
                  <div>
                    <label className="block text-xs font-semibold text-[#41474e] mb-1.5 uppercase tracking-wide">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      placeholder="Your full name"
                      required
                      className={`w-full px-4 py-3 rounded-2xl bg-white/50 border text-[#1b1c17] placeholder-[#71787f] text-sm outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,99,137,0.12)] transition-all duration-200 ${fieldErrors.displayName ? "border-[#ba1a1a]" : "border-transparent focus:border-[#2b6389]"
                        }`}
                    />
                    {fieldErrors.displayName && <p className="text-[#ba1a1a] text-xs mt-1">{fieldErrors.displayName}</p>}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#41474e] mb-1.5 uppercase tracking-wide">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    required
                    className={`w-full px-4 py-3 rounded-2xl bg-white/50 border text-[#1b1c17] placeholder-[#71787f] text-sm outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,99,137,0.12)] transition-all duration-200 ${fieldErrors.email ? "border-[#ba1a1a]" : "border-transparent focus:border-[#2b6389]"
                      }`}
                  />
                  {fieldErrors.email && <p className="text-[#ba1a1a] text-xs mt-1">{fieldErrors.email}</p>}
                </div>

                {(mode === "login" || mode === "register") && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-[#41474e] uppercase tracking-wide">
                        Password
                      </label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => switchMode("forgot")}
                          className="text-xs font-semibold text-[#2b6389] hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                        required
                        className={`w-full px-4 py-3 pr-11 rounded-2xl bg-white/50 border text-[#1b1c17] placeholder-[#71787f] text-sm outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,99,137,0.12)] transition-all duration-200 ${fieldErrors.password ? "border-[#ba1a1a]" : "border-transparent focus:border-[#2b6389]"
                          }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71787f] hover:text-[#2b6389] transition-colors"
                      >
                        {showPassword ? EYE_CLOSED : EYE_OPEN}
                      </button>
                    </div>
                    {fieldErrors.password && <p className="text-[#ba1a1a] text-xs mt-1">{fieldErrors.password}</p>}
                  </div>
                )}

                {mode === "register" && (
                  <div>
                    <label className="block text-xs font-semibold text-[#41474e] mb-1.5 uppercase tracking-wide">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={form.confirmPassword}
                        onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                        placeholder="Re-enter your password"
                        required
                        className={`w-full px-4 py-3 pr-11 rounded-2xl bg-white/50 border text-[#1b1c17] placeholder-[#71787f] text-sm outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,99,137,0.12)] transition-all duration-200 ${fieldErrors.confirmPassword ? "border-[#ba1a1a]" : "border-transparent focus:border-[#2b6389]"
                          }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71787f] hover:text-[#2b6389] transition-colors"
                      >
                        {showConfirmPassword ? EYE_CLOSED : EYE_OPEN}
                      </button>
                    </div>
                    {fieldErrors.confirmPassword && <p className="text-[#ba1a1a] text-xs mt-1">{fieldErrors.confirmPassword}</p>}
                  </div>
                )}

                {mode === "forgot" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-[#41474e] mb-1.5 uppercase tracking-wide">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={form.newPassword}
                          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                          placeholder="At least 8 characters"
                          required
                          className={`w-full px-4 py-3 pr-11 rounded-2xl bg-white/50 border text-[#1b1c17] placeholder-[#71787f] text-sm outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,99,137,0.12)] transition-all duration-200 ${fieldErrors.newPassword ? "border-[#ba1a1a]" : "border-transparent focus:border-[#2b6389]"
                            }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((v) => !v)}
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71787f] hover:text-[#2b6389] transition-colors"
                        >
                          {showNewPassword ? EYE_CLOSED : EYE_OPEN}
                        </button>
                      </div>
                      {fieldErrors.newPassword && <p className="text-[#ba1a1a] text-xs mt-1">{fieldErrors.newPassword}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#41474e] mb-1.5 uppercase tracking-wide">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmNewPassword ? "text" : "password"}
                          value={form.confirmNewPassword}
                          onChange={(e) => setForm({ ...form, confirmNewPassword: e.target.value })}
                          placeholder="Re-enter new password"
                          required
                          className={`w-full px-4 py-3 pr-11 rounded-2xl bg-white/50 border text-[#1b1c17] placeholder-[#71787f] text-sm outline-none focus:bg-white focus:shadow-[0_0_0_3px_rgba(43,99,137,0.12)] transition-all duration-200 ${fieldErrors.confirmNewPassword ? "border-[#ba1a1a]" : "border-transparent focus:border-[#2b6389]"
                            }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmNewPassword((v) => !v)}
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71787f] hover:text-[#2b6389] transition-colors"
                        >
                          {showConfirmNewPassword ? EYE_CLOSED : EYE_OPEN}
                        </button>
                      </div>
                      {fieldErrors.confirmNewPassword && <p className="text-[#ba1a1a] text-xs mt-1">{fieldErrors.confirmNewPassword}</p>}
                    </div>
                  </>
                )}

                {error && (
                  <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="login-btn-gradient w-full py-3.5 rounded-full text-white font-semibold text-sm mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading
                    ? mode === "login" ? "Signing in…" : mode === "register" ? "Creating account…" : "Updating password…"
                    : mode === "login" ? "Sign In →" : mode === "register" ? "Create Account →" : "Update Password →"}
                </button>

                {mode === "forgot" && (
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="text-center text-sm font-semibold text-[#2b6389] hover:underline -mt-1"
                  >
                    ← Back to Sign In
                  </button>
                )}
              </form>

              <p className="text-center text-xs text-[#71787f]">
                Secured with bcrypt · JWT · Azure Cosmos DB
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}