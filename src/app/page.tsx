"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, ShieldAlert, ShieldCheck,
  Activity, User, AlertTriangle, Zap, Lock, Radio, Sun, Moon, Scan
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Transcript = { id: number; role: string; text: string };

/* ── helpers ── */
function ScoreRing({ score, isScam, isLight }: { score: number; isScam: boolean; isLight: boolean }) {
  const size = 110;
  const strokeW = 8;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score, 1);
  const dash = pct * circ;
  const color = isScam ? "#EF4444" : score > 0.5 ? "#F59E0B" : "#10B981";

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"} strokeWidth={strokeW} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, type: "spring", stiffness: 50, damping: 15 }}
      />
    </svg>
  );
}

function WaveBar({ delay, isScam }: { delay: number; isScam: boolean }) {
  return (
    <motion.div
      className={`w-1.5 rounded-full ${isScam ? "bg-red-500" : "bg-blue-400"}`}
      animate={{ height: ["8px", "28px", "12px", "20px", "8px"] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

const containerVariants: any = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

/* ────────────────────────────── MAIN PAGE ─────────────────────────────── */
export default function Home() {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [scamScore, setScamScore] = useState(0.0);
  const [isScamDetected, setIsScamDetected] = useState(false);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [callDuration, setCallDuration] = useState(0);
  const [isLight, setIsLight] = useState(false);

  const transcriptIdRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callActiveRef = useRef(false);
  const isConnectingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Call timer
  useEffect(() => {
    if (isCallActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isCallActive]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // Apply theme dynamically to root document for css vars to work if they exist, 
  // or just handle inline/class based styling.
  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
  }, [isLight]);

  const connectWebSocket = useCallback(function connect() {
    if (socket.current?.readyState === WebSocket.OPEN || isConnectingRef.current) return;
    isConnectingRef.current = true;
    socket.current = new WebSocket("ws://localhost:8000/ws/stream?token=intercept_secure_token");

    socket.current.onopen = () => {
      isConnectingRef.current = false;
      setConnectionStatus("connected");
    };

    socket.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.transcript) {
          setTranscripts(prev => [
            ...prev.slice(-49),
            { id: transcriptIdRef.current++, role: "U", text: data.transcript },
          ]);
        }
        if (data.error) {
          setTranscripts(prev => [
            ...prev.slice(-49),
            { id: transcriptIdRef.current++, role: "SYS", text: "Processing error — check backend." },
          ]);
        }
        if (data.analysis?.score !== undefined) {
          setScamScore(data.analysis.score);
          if (data.analysis.is_scam || data.analysis.score > 0.85) setIsScamDetected(true);
        }
      } catch (e) { console.error("Parse error", e); }
    };

    socket.current.onclose = () => {
      isConnectingRef.current = false;
      setConnectionStatus("disconnected");
      if (callActiveRef.current) setTimeout(connect, 2000);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recordLoop = async () => {
        while (callActiveRef.current) {
          await new Promise<void>((resolve) => {
            mediaRecorder.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
            mediaRecorder.current.ondataavailable = (e) => {
              if (e.data.size > 0 && socket.current?.readyState === WebSocket.OPEN)
                socket.current.send(e.data);
            };
            mediaRecorder.current.onstop = () => resolve();
            mediaRecorder.current.start();
            setTimeout(() => {
              if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
              else resolve();
            }, 3000);
          });
        }
      };
      recordLoop();
      connectWebSocket();
    } catch {
      alert("Microphone access is required.");
      setIsCallActive(false);
    }
  }, [connectWebSocket]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current?.state !== "inactive") mediaRecorder.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    socket.current?.close();
  }, []);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    }
  }, [isMuted]);

  useEffect(() => {
    callActiveRef.current = isCallActive;
    if (isCallActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScamScore(0); setIsScamDetected(false); setTranscripts([]); setIsMuted(false);
      startRecording();
    } else {
      stopRecording();
    }
    return () => { stopRecording(); };
  }, [isCallActive, startRecording, stopRecording]);

  const toggleCall = () => setIsCallActive(v => !v);
  const toggleMute = () => setIsMuted(v => !v);

  const simulateScam = useCallback(() => {
    setIsCallActive(true);
    setConnectionStatus("connected");
    setCallDuration(14);

    const script = [
      "Hello, am I speaking with the account holder?",
      "This is Officer John from the Federal Police.",
      "We have detected illegal money laundering activities linked to your SSN.",
      "Your bank account is going to be frozen immediately.",
      "To secure your funds, you must wire transfer them to our safe government account right now.",
      "Do not tell anyone about this call, or you will be arrested."
    ];

    setTranscripts([]);
    setScamScore(0.1);
    setIsScamDetected(false);

    script.forEach((text, i) => {
      setTimeout(() => {
        setTranscripts(prev => [...prev, { id: transcriptIdRef.current++, role: "U", text }]);

        if (i === 1) setScamScore(0.4);
        if (i === 3) setScamScore(0.75);
        if (i === 5) {
          setScamScore(0.99);
          setIsScamDetected(true);
        }
      }, i * 2500 + 500);
    });
  }, []);

  /* ── risk colour helpers ── */
  const riskColor = isScamDetected ? "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" : scamScore > 0.5 ? "text-amber-500" : "text-emerald-500";
  const riskLabel = isScamDetected ? "HIGH RISK" : scamScore > 0.5 ? "CAUTION" : "SAFE";
  const riskBg = isScamDetected ? "bg-red-500/10 border-red-500/30" : scamScore > 0.5 ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-500/10 border-emerald-500/20";

  /* ── Theme variables for inline styling ── */
  const T = isLight;
  const pageBg = T ? "bg-[#F8FAFC]" : "bg-[var(--bg-deep)]";
  const textColor = T ? "text-slate-900" : "text-slate-100";
  const textMuted = T ? "text-slate-500" : "text-slate-400";
  const cardBg = T ? "bg-white/80 border-slate-200 backdrop-blur-2xl" : "bg-[var(--bg-card)] border-[var(--border-subtle)] backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]";
  const cardShadow = T ? "shadow-2xl shadow-slate-200/50" : "shadow-2xl shadow-black/40";
  const headerBg = T ? "bg-white/80 border-slate-200" : "bg-[#02040A]/80 border-white/5";
  const messageUser = T ? "bg-white border-slate-200 text-slate-800 shadow-sm" : "bg-white/5 border-white/10 text-white/90 shadow-lg shadow-black/20";

  // Phone theme
  const phoneBody = T ? "bg-white/40 backdrop-blur-[60px] border-[8px] border-slate-100" : "bg-black/40 backdrop-blur-[60px] border-[8px] border-[#14161C] shadow-[inset_0_0_30px_rgba(255,255,255,0.03)]";
  const phoneShadow = T ? "shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15),inset_0_1px_4px_rgba(255,255,255,1)]" : "shadow-[0_40px_100px_rgba(0,0,0,0.9),0_0_40px_rgba(255,255,255,0.05),inset_0_1px_1px_rgba(255,255,255,0.2)]";

  return (
    <div className={`relative min-h-screen font-sans flex flex-col transition-colors duration-700 ${pageBg} ${textColor}`}>

      {/* ── AMBIENT BACKGROUND ── */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden z-0">
        <div className={`absolute inset-0 transition-opacity duration-1000 ${T ? 'opacity-5' : 'opacity-[0.02]'}`}
          style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)", backgroundSize: "64px 64px" }} />

        {!T && (
          <>
            <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.15, 0.3, 0.15] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 60%)" }} />
            <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.25, 0.1] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-[-20%] right-[-10%] w-[900px] h-[900px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 60%)" }} />
          </>
        )}

        <AnimatePresence>
          {isScamDetected && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
              className="absolute inset-0"
              style={{ background: "radial-gradient(ellipse at center, rgba(239,68,68,0.25) 0%, transparent 80%)" }} />
          )}
        </AnimatePresence>
      </div>

      {/* ── HEADER ── */}
      <header className={`relative z-20 flex items-center justify-between px-6 py-4 border-b backdrop-blur-xl transition-colors duration-500 ${headerBg}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <ShieldAlert size={20} className="text-white drop-shadow-md" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Intercept Console</h1>
            <p className={`text-[11px] font-medium tracking-wide uppercase mt-0.5 ${textMuted}`}>AI-Powered Scam Shield</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide border transition-all duration-300 ${isCallActive && connectionStatus === "connected"
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              : T ? "bg-slate-200 border-slate-300 text-slate-500" : "bg-white/5 border-white/10 text-white/40"
            }`}>
            <motion.div
              animate={isCallActive && connectionStatus === "connected" ? { scale: [1, 1.4, 1], opacity: [1, 0.4, 1] } : { scale: 1, opacity: 0.3 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className={`w-2 h-2 rounded-full ${isCallActive && connectionStatus === "connected" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-current"}`}
            />
            {isCallActive && connectionStatus === "connected" ? "LIVE" : "STANDBY"}
          </div>
          <button onClick={() => setIsLight(!isLight)} aria-label="Toggle theme"
            className={`w-10 h-10 flex items-center justify-center rounded-full border transition-all active:scale-95 ${T ? "bg-white border-slate-200 hover:bg-slate-50 text-slate-600 shadow-sm" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/60"
              }`}>
            {isLight ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 w-full max-w-[1400px] mx-auto flex flex-col md:flex-row p-4 sm:p-6 md:p-8 gap-8 items-center md:items-start overflow-hidden">

        {/* ════ LEFT: MOCK DIALER ════ */}
        <div className="w-full md:w-[360px] shrink-0 flex flex-col items-center justify-center pt-2 md:pt-4">

          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="relative w-full max-w-[340px]">

            {/* Glow under device */}
            <div className={`absolute -inset-8 rounded-[60px] blur-3xl transition-all duration-1000 pointer-events-none opacity-60 ${isScamDetected ? "bg-red-500/30" : isCallActive ? "bg-blue-500/20" : ""
              }`} />

            <motion.div
              animate={{ y: [-4, 4, -4] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className={`relative w-full aspect-[9/19] max-h-[700px] rounded-[56px] flex flex-col overflow-hidden transition-colors duration-500 ${phoneBody} ${phoneShadow}`}>

              {/* Phone Status Bar & Dynamic Island */}
              <div className="absolute top-0 inset-x-0 h-14 flex justify-between items-center px-7 z-50 text-[12px] font-bold tracking-wider opacity-80 pointer-events-none">
                <span className={T ? 'text-slate-800' : 'text-white'}>9:41</span>
                {/* Dynamic Island */}
                <div className={`w-28 h-7 rounded-full flex items-center px-3 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] ${T ? 'bg-black' : 'bg-[#050505]'}`}>
                  <div className="w-3 h-3 rounded-full bg-[#111] border border-white/10 shadow-inner flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-blue-900/50" />
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                </div>
                <div className={`flex items-center gap-1.5 ${T ? 'text-slate-800' : 'text-white'}`}>
                  <div className="w-6 h-3 rounded-[4px] border-2 border-current flex items-center px-[2px]">
                    <div className="h-1.5 w-4 bg-current rounded-[1px]" />
                  </div>
                </div>
              </div>

              <div className="pt-10" /> {/* Spacer for status bar */}

              {/* Avatar + Caller Info */}
              <div className="flex flex-col items-center pt-8 pb-4 px-6 relative z-10">
                <div className="relative mb-8">
                  {isCallActive && !isScamDetected && (
                    <>
                      <motion.div animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        className={`absolute inset-0 rounded-full border-2 ${T ? 'border-blue-500' : 'border-blue-400'}`} />
                      <motion.div animate={{ scale: [1, 1.9], opacity: [0.3, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5, ease: "easeOut" }}
                        className={`absolute inset-0 rounded-full border ${T ? 'border-blue-500' : 'border-blue-400'}`} />
                    </>
                  )}
                  {isScamDetected && (
                    <motion.div animate={{ scale: [1, 1.7], opacity: [0.6, 0] }} transition={{ duration: 0.8, repeat: Infinity }}
                      className="absolute inset-0 rounded-full border-2 border-red-500" />
                  )}
                  <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 shadow-inner ${isScamDetected ? "bg-red-500/20 ring-2 ring-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]" : T ? "bg-slate-200 ring-1 ring-slate-300" : "bg-white/5 ring-1 ring-white/10"
                    }`}>
                    <User size={48} className={isScamDetected ? "text-red-500" : T ? "text-slate-400" : "text-white/30"} strokeWidth={1.5} />
                  </div>
                </div>

                <h2 className="text-3xl font-bold tracking-tight">Unknown</h2>
                <p className={`text-sm mt-3 font-bold tracking-widest uppercase transition-colors duration-300 ${isScamDetected ? "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                    isMuted ? "text-amber-500" :
                      isCallActive && connectionStatus === "connected" ? "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                        isCallActive ? "text-blue-500 animate-pulse" : textMuted
                  }`}>
                  {isScamDetected ? "⚠ Scam Detected"
                    : isMuted ? "Muted"
                      : isCallActive && connectionStatus === "connected" ? `● ${formatTime(callDuration)}`
                        : isCallActive ? "Connecting…" : "Ready"}
                </p>
              </div>

              {/* Waveform / Visual area */}
              <div className="flex-1 flex items-center justify-center relative px-6 py-4">
                <AnimatePresence mode="wait">
                  {!isCallActive ? (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center gap-3">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                        className="relative w-16 h-16 rounded-full border border-dashed border-slate-500/30 flex items-center justify-center">
                        <Scan size={24} className={`${textMuted} opacity-50`} />
                      </motion.div>
                      <span className={`text-[11px] font-bold tracking-[0.2em] uppercase ${textMuted} opacity-50`}>
                        Awaiting Signal
                      </span>
                    </motion.div>
                  ) : isScamDetected ? (
                    <motion.div key="scam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-red-600 p-6 text-center z-20 overflow-hidden">

                      {/* Intense strobe effect */}
                      <motion.div animate={{ opacity: [1, 0.7, 1, 0.9, 1] }} transition={{ duration: 0.15, repeat: Infinity, repeatType: "mirror" }}
                        className="absolute inset-0 bg-red-700 mix-blend-multiply" />

                      <motion.div animate={{ scale: [1, 1.2, 1], rotate: [-2, 2, -2] }} transition={{ duration: 0.5, repeat: Infinity }}>
                        <AlertTriangle size={64} className="text-white mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" strokeWidth={2} />
                      </motion.div>

                      <p className="relative text-white font-black text-2xl tracking-tighter mb-2 z-10 drop-shadow-md uppercase">
                        SCAM DETECTED
                      </p>
                      <p className="relative text-red-100/90 text-sm leading-relaxed mb-8 font-medium max-w-[200px] z-10">
                        Threat signature matched. Disconnect immediately.
                      </p>

                      <button onClick={toggleCall} aria-label="End call"
                        className="relative z-10 w-20 h-20 rounded-full bg-white text-red-600 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95 transition-transform">
                        <PhoneOff size={32} />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div key="wave" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-2 h-16">
                      {[0, 0.15, 0.3, 0.1, 0.25, 0.05, 0.2, 0.35, 0.1].map((d, i) => (
                        <WaveBar key={i} delay={d} isScam={false} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Controls */}
              <div className="pb-14 pt-4 flex justify-center gap-8 items-center px-6 relative z-10">
                <motion.button onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"} whileTap={{ scale: 0.9 }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center border transition-all duration-300 ${isMuted
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                      : T ? "bg-white border-slate-300 text-slate-600 shadow-md" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                    }`}>
                  {isMuted ? <MicOff size={26} /> : <Mic size={26} />}
                </motion.button>

                <div className="relative">
                  {isCallActive && !isScamDetected && (
                    <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" style={{ animationDuration: '2.5s' }} />
                  )}
                  <motion.button onClick={toggleCall} aria-label={isCallActive ? "End call" : "Start call"} whileTap={{ scale: 0.85 }}
                    className={`relative w-[84px] h-[84px] rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-500 ${isCallActive
                        ? "bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/50 border-t border-red-400"
                        : "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/50 border-t border-emerald-300"
                      }`}>
                    <AnimatePresence mode="wait">
                      {isCallActive ? (
                        <motion.div key="off" initial={{ rotate: -45, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 45, opacity: 0 }} transition={{ type: "spring", stiffness: 300 }}>
                          <PhoneOff size={36} className="drop-shadow-md" />
                        </motion.div>
                      ) : (
                        <motion.div key="on" initial={{ rotate: 45, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -45, opacity: 0 }} transition={{ type: "spring", stiffness: 300 }}>
                          <Phone size={36} fill="white" className="drop-shadow-md" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </div>

                <motion.button onClick={simulateScam} aria-label="Simulate Scam Demo" whileTap={{ scale: 0.9 }} title="Simulate Scam Demo"
                  className={`w-16 h-16 rounded-full flex items-center justify-center border transition-all duration-300 ${T ? "bg-red-50 text-red-500 border-red-200 shadow-md" : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                    }`}>
                  <AlertTriangle size={24} />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ════ RIGHT: INTERCEPT CONSOLE ════ */}
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex-1 w-full flex flex-col gap-6 pt-2 md:pt-4">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Score */}
            <motion.div variants={itemVariants} className={`rounded-[32px] p-8 flex flex-col items-center justify-center gap-4 relative overflow-hidden transition-all duration-700 border ${cardBg} ${cardShadow} ${riskBg}`}>
              <div className="relative flex items-center justify-center">
                <ScoreRing score={scamScore} isScam={isScamDetected} isLight={isLight} />
                <div className="absolute flex flex-col items-center">
                  <span className={`text-4xl font-black tabular-nums tracking-tighter ${riskColor}`}>
                    {Math.round(scamScore * 100)}
                  </span>
                </div>
              </div>
              <span className={`text-sm font-black tracking-[0.2em] uppercase ${riskColor}`}>{riskLabel}</span>
            </motion.div>

            {/* System Status */}
            <motion.div variants={itemVariants} className={`rounded-[32px] p-8 flex flex-col justify-center border ${cardBg} ${cardShadow}`}>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] mb-6 ${textMuted}`}>System Status</p>
              <div className="space-y-5">
                {[
                  { label: "AI Engine", active: true, icon: Zap },
                  { label: "WebSocket", active: connectionStatus === "connected", icon: Radio },
                  { label: "Mic Input", active: isCallActive && !isMuted, icon: Mic },
                ].map(({ label, active, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${active ? "bg-emerald-500/10 text-emerald-500" : "bg-white/5 text-white/30"}`}>
                        <Icon size={16} />
                      </div>
                      <span className="text-sm font-semibold opacity-90">{label}</span>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${active ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" : "bg-current opacity-10"}`} />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Transcript panel */}
          <motion.div variants={itemVariants} className={`rounded-[32px] flex flex-col flex-1 min-h-[500px] border overflow-hidden ${cardBg} ${cardShadow}`}>
            {/* Panel header */}
            <div className={`flex items-center justify-between px-8 py-5 border-b backdrop-blur-sm ${T ? 'border-slate-200 bg-slate-50/80' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center gap-3">
                <Activity size={18} className={textMuted} />
                <span className={`text-xs font-black uppercase tracking-[0.2em] ${textMuted}`}>Live Transcript</span>
              </div>
              <AnimatePresence mode="wait">
                {isScamDetected ? (
                  <motion.span key="blocked" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-black tracking-wide bg-red-500/20 text-red-500 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    <Lock size={12} /> BLOCKED
                  </motion.span>
                ) : (
                  <motion.span key="secure" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-black tracking-wide bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                    <ShieldCheck size={12} /> SECURE
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 flex flex-col gap-5">
              <AnimatePresence>
                {!isCallActive && (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className={`flex flex-col items-center justify-center h-full gap-5 text-center py-20 ${textMuted}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border shadow-inner ${T ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/5'}`}>
                      <Radio size={24} className="opacity-40" />
                    </div>
                    <p className="text-sm font-semibold tracking-wide">System armed.<br />Awaiting call initialization.</p>
                  </motion.div>
                )}
                {isCallActive && transcripts.length === 0 && (
                  <motion.div key="listening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full gap-6 py-20">
                    <div className="flex items-center gap-2 h-10">
                      {[0, 0.2, 0.1, 0.3, 0.15].map((d, i) => (
                        <WaveBar key={i} delay={d} isScam={false} />
                      ))}
                    </div>
                    <p className={`text-sm font-bold tracking-widest uppercase ${textMuted} animate-pulse`}>Processing Audio…</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {transcripts.map((t) => (
                <motion.div key={t.id} initial={{ opacity: 0, y: 15, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="flex gap-4 items-start">
                  <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black mt-0.5 shadow-sm ${t.role === "SYS"
                      ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                      : "bg-blue-500/20 text-blue-500 border border-blue-500/40"
                    }`}>
                    {t.role === "SYS" ? "!" : "U"}
                  </div>
                  <div className={`flex-1 px-5 py-3.5 rounded-[20px] rounded-tl-md text-[15px] leading-relaxed font-medium ${t.role === "SYS"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : messageUser
                    }`}>
                    {t.text}
                  </div>
                </motion.div>
              ))}

              {isScamDetected && (
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
                  className="rounded-[24px] p-6 bg-red-500/10 border border-red-500/30 mt-4 shadow-[0_10px_30px_rgba(239,68,68,0.15)] relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                  <div className="flex items-center gap-2.5 mb-3">
                    <Zap size={16} className="text-red-500" />
                    <span className="text-[11px] font-black text-red-500 uppercase tracking-[0.2em]">Action Taken</span>
                  </div>
                  <p className="text-[15px] text-red-600 dark:text-red-300 leading-relaxed font-semibold">
                    Intent matched &quot;Digital Arrest&quot; pattern. Confidence: {Math.round(scamScore * 100)}%.
                    Webhook dispatched to HDFC Bank — UPI transfers blocked for 24h.
                  </p>
                </motion.div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
