"use client";

import React, { useState, useEffect, useRef } from "react";
import GDMeetingRoom from "@/components/GDMeetingRoom";

interface SuggestedTopic {
  id: string;
  topic: string;
  relevance_reason: string;
  evidence_proof: string;
}

interface ReconResult {
  status?: string;
  message?: string;
  company_summary: string;
  suggested_topics: SuggestedTopic[];
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const getBackendUrl = () => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return `http://${host}:8000`;
    }
  }
  return API_BASE;
};

export default function GDApp() {
  // Navigation view: "landing" | "meeting"
  const [view, setView] = useState<"landing" | "meeting">("landing");

  // Pathway selection: "topic" | "jd"
  const [activePathway, setActivePathway] = useState<"topic" | "jd">("topic");

  // Participant & Room state
  const [userName, setUserName] = useState<string>("You");
  const [customTopic, setCustomTopic] = useState<string>(
    "Can AI replace junior engineers or just make them faster?"
  );
  const [duration, setDuration] = useState<number>(10);
  const [mode, setMode] = useState<"agents" | "friends">("agents");
  const [roomId, setRoomId] = useState<string>("arena-7x9q");
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(true);

  // Friend Invite Joining State
  const [isNamePromptOpen, setIsNamePromptOpen] = useState<boolean>(false);
  const [inviteNameInput, setInviteNameInput] = useState<string>("");

  // Job Description Recon state
  const [companyHint, setCompanyHint] = useState<string>("");
  const [jobDescription, setJobDescription] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [reconData, setReconData] = useState<ReconResult | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Scroll Tracking & High-Impact 3D Animations
  const [heroAnimKey, setHeroAnimKey] = useState<number>(0);
  const [stage2Entered, setStage2Entered] = useState<boolean>(true); // safe baseline on mount
  const hasResetAtTopRef = useRef<boolean>(false);
  const stage1Ref = useRef<HTMLDivElement | null>(null);
  const stage2Ref = useRef<HTMLDivElement | null>(null);
  const stage3Ref = useRef<HTMLDivElement | null>(null);

  // Unlock browser speech synthesis audio engine immediately on user gesture
  const unlockAudio = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {
        // safe
      }
    }
  };
  const primeAudio = unlockAudio;

  // Check URL query parameters on mount for ?room=XYZ
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room") || params.get("id");
      if (roomParam) {
        setRoomId(roomParam);
        setIsHost(false);
        const durationParam = params.get("duration");
        if (durationParam) {
          const parsed = parseInt(durationParam, 10);
          if (!isNaN(parsed) && parsed > 0) {
            setDuration(parsed > 60 ? Math.round(parsed / 60) : parsed);
          }
        }
        const topicParam = params.get("topic");
        if (topicParam) {
          setCustomTopic(decodeURIComponent(topicParam));
        }
        const modeParam = params.get("mode");
        if (modeParam === "friends" || modeParam === "agents") {
          setMode(modeParam as any);
        } else {
          setMode("friends");
        }
        setIsNamePromptOpen(true);
      } else {
        setRoomId(`arena-${Math.random().toString(36).substring(2, 7)}`);
      }
    }
  }, []);

  // Scroll position listener for reliable dynamic translations and replay
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const scrollY = window.scrollY;

      // When scrollY >= 120: both cards smoothly transform to translateX(0px) with transition: transform 0.5s ease-out
      // When scrollY < 120: Card A is shifted -80px, Card B is shifted +80px
      if (scrollY >= 120) {
        setStage2Entered(true);
      } else {
        setStage2Entered(false);
      }

      if (scrollY < 100) {
        if (!hasResetAtTopRef.current) {
          hasResetAtTopRef.current = true;
          // Re-trigger the "Welcome to GD Arena" text animation
          setHeroAnimKey((prev) => prev + 1);
        }
      } else {
        hasResetAtTopRef.current = false;
      }
    };

    // Initial check on load/reload
    if (window.scrollY >= 120) {
      setStage2Entered(true);
    } else {
      setStage2Entered(false);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToStage2 = () => {
    setStage2Entered(true);
    stage2Ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToStage3 = () => {
    setTimeout(() => {
      stage3Ref.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const getInviteUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    return `${origin}/?room=${roomId}&duration=${duration || 5}&topic=${encodeURIComponent(customTopic || "Campus Placement GD")}&mode=friends`;
  };

  const handleCopyLink = () => {
    const link = getInviteUrl();
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Quick preset topics tailored for campus placements
  const sampleTopics = [
    "Can AI replace junior engineers or just make them faster?",
    "Work from home vs Work from office: Does remote work harm learning for freshers?",
    "Should tech companies allow employees to do moonlighting and freelancing?",
    "Speed of delivery vs Code quality: What should freshers prioritize?",
  ];

  // Call Recon API with Real Research Validation (No Fake Fallbacks)
  const handleAnalyzeJD = async () => {
    if (!jobDescription.trim() && !companyHint.trim()) {
      setErrorMsg("Please provide a Job Description or valid Company Name before running intel extraction.");
      setReconData(null);
      return;
    }
    setErrorMsg(null);
    setIsAnalyzing(true);
    setReconData(null);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 18000);

    try {
      const backend = getBackendUrl();
      const response = await fetch(`${backend}/api/recon/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          job_description: jobDescription.trim(),
          company_hint: companyHint.trim() || undefined,
        }),
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data: ReconResult = await response.json();
      if (data.status === "error" || !data.suggested_topics || data.suggested_topics.length === 0) {
        setErrorMsg(
          data.message ||
            "Unable to verify this company or role. Please paste a legitimate job description or provide a valid company name (e.g. TCS, Infosys, Google, Cognizant)."
        );
        setReconData(null);
      } else {
        setErrorMsg(null);
        setReconData(data);
        if (data.suggested_topics?.length > 0) {
          setSelectedTopicId(data.suggested_topics[0].id);
          setCustomTopic(data.suggested_topics[0].topic);
        }
      }
    } catch (err: any) {
      console.warn("Recon API error:", err);
      if (err.name === "AbortError") {
        setErrorMsg("Request timed out (18s). Please try again or check your backend server.");
      } else if (err.message && err.message.includes("Server responded with")) {
        setErrorMsg(`Backend server error (${err.message}). Please check backend logs.`);
      } else if (
        err.message &&
        (err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError") ||
          err.message.includes("connection"))
      ) {
        setErrorMsg("Unable to connect to the backend server on port 8000. Please ensure the backend is running.");
      } else {
        setErrorMsg(
          "Unable to extract intelligence. Please check your network connection or enter a valid company name (e.g. TCS, Infosys, Google, Cognizant)."
        );
      }
      setReconData(null);
    } finally {
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  };

  const handleLaunchMeeting = () => {
    primeAudio();
    setIsHost(true);
    setView("meeting");
  };

  const handleJoinFromInvite = () => {
    primeAudio();
    const finalName = inviteNameInput.trim() || "Friend";
    setUserName(finalName);
    setMode("friends");
    setIsHost(false);
    setIsNamePromptOpen(false);
    setView("meeting");
  };

  // If in meeting view, render the Google Meet room
  if (view === "meeting") {
    return (
      <GDMeetingRoom
        topic={customTopic}
        durationMinutes={duration}
        mode={mode}
        roomId={roomId}
        userName={userName}
        isHost={isHost}
        onLeave={() => {
          setView("landing");
          setRoomId(`arena-${Math.random().toString(36).substring(2, 7)}`);
          setIsHost(true);
          // Remove ?room query param without reloading
          if (typeof window !== "undefined" && window.history) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F8F8F9] [background:radial-gradient(circle_at_50%_0%,_#FFFFFF_0%,_#F8F8F9_60%,_#E9EBF8_100%)] text-[#111439] selection:bg-[#EE72F8] selection:text-white relative overflow-x-hidden antialiased">
      {/* Background glowing ambient orbs (non-blocking with pointer-events-none) */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-[#EE72F8]/15 rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="fixed top-1/3 right-10 w-96 h-96 bg-[#31EC56]/15 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-10 left-1/3 w-[500px] h-[500px] bg-[#B2B5E0]/25 rounded-full blur-[160px] pointer-events-none z-0" />

      {/* Invite Join Modal */}
      {isNamePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in pointer-events-auto">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-white border border-[#EE72F8]/40 shadow-2xl text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-[#EE72F8]/15 border border-[#EE72F8]/40 text-[#EE72F8] flex items-center justify-center mx-auto text-xl">
              👋
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#111439]">
                You have been invited to join GD Arena!
              </h3>
              <p className="text-xs text-[#555A8A] mt-1">
                Room: <span className="font-mono text-[#31EC56] font-semibold">{roomId}</span>
                {duration ? ` • ${duration} min` : ""}
              </p>
              {customTopic && (
                <p className="text-xs text-[#111439] font-medium bg-slate-100 p-2.5 rounded-xl mt-2 line-clamp-2 text-left">
                  <span className="font-semibold text-[#EE72F8]">Topic:</span> {customTopic}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-left text-[#111439] mb-1.5">
                Enter your name:
              </label>
              <input
                type="text"
                autoFocus
                value={inviteNameInput}
                onChange={(e) => setInviteNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleJoinFromInvite();
                }}
                placeholder="e.g. Rahul, Sneha, Amit..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-[#111439] focus:outline-none focus:border-[#EE72F8] text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleJoinFromInvite}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#EE72F8] to-[#31EC56] text-zinc-950 shadow-lg shadow-[#EE72F8]/25 hover:opacity-95 transition-all cursor-pointer"
            >
              Join Discussion →
            </button>
          </div>
        </div>
      )}

      {/* Navigation Header */}
      <nav className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between z-30 relative">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#EE72F8] to-[#31EC56] flex items-center justify-center shadow-lg shadow-[#EE72F8]/20">
            <svg className="w-5 h-5 text-zinc-950 font-black" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-[#111439]">
            GD <span className="text-[#EE72F8]">ARENA</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/90 border border-slate-300 shadow-sm text-[#111439]">
            <span className="w-2 h-2 rounded-full bg-[#31EC56] animate-pulse" />
            Campus Placement Edition
          </span>
          <button
            onClick={scrollToStage2}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-[#EE72F8] to-[#31EC56] text-zinc-950 shadow-lg shadow-[#EE72F8]/20 hover:opacity-95 transition-all cursor-pointer"
          >
            Launch Setup
          </button>
        </div>
      </nav>

      {/* ======================================================== */}
      {/* STAGE 1: HERO ENTRY (Screen 1)                            */}
      {/* Re-animates smoothly whenever scroll returns to top       */}
      {/* ======================================================== */}
      <section
        key={heroAnimKey}
        ref={stage1Ref}
        className="relative z-10 max-w-5xl mx-auto px-6 min-h-[80vh] flex flex-col items-center justify-center text-center py-12"
      >
        {/* Top Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 border border-[#EE72F8]/40 shadow-sm mb-6 backdrop-blur-md animate-hero-desc">
          <span className="w-2 h-2 rounded-full bg-[#EE72F8]" />
          <span className="text-xs font-semibold text-[#EE72F8] tracking-wide uppercase">
            AI-Orchestrated Placement Interview Simulator
          </span>
        </div>

        {/* Hero Title with .animate-hero-title */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6 animate-hero-title text-[#111439]">
          WELCOME TO{" "}
          <span className="bg-gradient-to-r from-[#111439] via-[#3B458E] to-[#EE72F8] bg-clip-text text-transparent">
            GD ARENA
          </span>
        </h1>

        {/* Motivational Description with .animate-hero-desc */}
        <p className="max-w-2xl text-base sm:text-lg text-[#232759] leading-relaxed mb-10 font-normal animate-hero-desc">
          Most GDs aren't lost because of poor knowledge — they are lost because fear makes your voice freeze. Step in, practice with AI teammates who challenge your arguments, invite friends to debate, and walk into your campus placement interview knowing you won't back down.
        </p>

        {/* Visual Cue Button */}
        <button
          onClick={scrollToStage2}
          className="group relative flex items-center gap-3 px-8 py-4 rounded-2xl bg-white border border-slate-300 text-[#111439] font-semibold text-base shadow-xl backdrop-blur-xl hover:border-[#EE72F8] hover:shadow-[#EE72F8]/20 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer animate-hero-desc"
        >
          <span className="text-[#31EC56]">●</span>
          <span>Configure & Initialize Arena</span>
          <svg
            className="w-5 h-5 text-[#555A8A] group-hover:translate-y-1 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>

        {/* Scroll Cue indicator */}
        <div
          onClick={scrollToStage2}
          className="mt-8 flex flex-col items-center gap-1.5 opacity-70 hover:opacity-100 cursor-pointer animate-bounce transition-opacity"
        >
          <span className="text-xs uppercase tracking-wider text-[#555A8A] font-semibold">Scroll Down</span>
          <svg className="w-4 h-4 text-[#555A8A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ======================================================== */}
      {/* STAGE 2: THE DUAL PATHWAYS (Screen 2)                    */}
      {/* High-Impact 3D Tilt & Sweep Transforms + Neon Glow Hover */}
      {/* ======================================================== */}
      <section
        ref={stage2Ref}
        className="max-w-5xl mx-auto px-6 py-20 relative z-20"
      >
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-300 text-xs font-semibold text-[#111439] mb-3 shadow-sm">
            <span>Stage 02</span>
            <span>•</span>
            <span className="text-emerald-600 font-bold">Select Pathway</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#111439]">
            Select Your Preparation Pathway
          </h2>
          <p className="text-sm sm:text-base text-[#232759] mt-2 max-w-xl mx-auto">
            Choose whether to debate directly on campus placement favorite topics or extract company-specific intelligence from a job description.
          </p>
        </div>

        {/* Dual Pathway Selector Cards - 100% visible, 3D perspective grid with neon borders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto relative z-20 pathway-grid-perspective">
          {/* Card A: I Have a Topic (Malachite Green / Pastel Purple neon glow, smooth -100px rotateY(10deg) to 0) */}
          <div
            onClick={() => {
              setActivePathway("topic");
              scrollToStage3();
            }}
            style={{
              transform: stage2Entered
                ? "translateX(0px) rotateY(0deg)"
                : "translateX(-100px) rotateY(10deg)",
              transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease, border-color 0.4s ease",
              transformStyle: "preserve-3d",
            }}
            className={`cursor-pointer rounded-3xl p-8 border-2 pointer-events-auto relative z-20 opacity-100 backdrop-blur-md pathway-card-topic card-neon-topic ${
              activePathway === "topic"
                ? "pathway-selected-topic border-[#31EC56]"
                : ""
            }`}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#31EC56]/15 border border-[#31EC56]/30 flex items-center justify-center text-[#31EC56] shadow-lg shadow-[#31EC56]/10">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#31EC56]/15 text-[#31EC56] border border-[#31EC56]/30 tracking-wide uppercase">
                Direct Debate
              </span>
            </div>

            <h3 className="text-2xl font-bold text-[#F8F8F9] mb-3">I Have a Topic</h3>
            <p className="text-sm sm:text-base text-[#B2B5E0] leading-relaxed">
              Quick-fire debate on a custom or standard topic. Configure duration, pick participant modes, and jump straight into the live Google Meet arena.
            </p>

            <div className="mt-6 flex items-center text-sm font-semibold text-[#31EC56] gap-2">
              <span>{activePathway === "topic" ? "Active Selection" : "Click to select"}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          {/* Card B: I Have a Job Description (Heliotrope / Steel Blue neon glow, smooth 100px rotateY(-10deg) to 0) */}
          <div
            onClick={() => {
              setActivePathway("jd");
              scrollToStage3();
            }}
            style={{
              transform: stage2Entered
                ? "translateX(0px) rotateY(0deg)"
                : "translateX(100px) rotateY(-10deg)",
              transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease, border-color 0.4s ease",
              transformStyle: "preserve-3d",
            }}
            className={`cursor-pointer rounded-3xl p-8 border-2 pointer-events-auto relative z-20 opacity-100 backdrop-blur-md pathway-card-jd card-neon-jd ${
              activePathway === "jd"
                ? "pathway-selected-jd border-[#EE72F8]"
                : ""
            }`}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#EE72F8]/15 border border-[#EE72F8]/30 flex items-center justify-center text-[#EE72F8] shadow-lg shadow-[#EE72F8]/10">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#EE72F8]/15 text-[#EE72F8] border border-[#EE72F8]/30 tracking-wide uppercase">
                Company Recon Intel
              </span>
            </div>

            <h3 className="text-2xl font-bold text-[#F8F8F9] mb-3">I Have a Job Description</h3>
            <p className="text-sm sm:text-base text-[#B2B5E0] leading-relaxed">
              Deep company background analysis, Glassdoor & Ambitionbox placement intel, and curated debate topics with evidence proof.
            </p>

            <div className="mt-6 flex items-center text-sm font-semibold text-[#EE72F8] gap-2">
              <span>{activePathway === "jd" ? "Active Selection" : "Click to select"}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================== */}
      {/* STAGE 3: CONFIGURATION & LAUNCH (Screen 3)               */}
      {/* ======================================================== */}
      <section
        ref={stage3Ref}
        className="max-w-5xl mx-auto px-6 pb-28 pt-6 relative z-20 pointer-events-auto"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-300 text-xs font-semibold text-[#111439] mb-3 shadow-sm">
            <span>Stage 03</span>
            <span>•</span>
            <span className={activePathway === "topic" ? "text-emerald-600 font-bold" : "text-[#EE72F8] font-bold"}>
              {activePathway === "topic" ? "Direct Debate Setup" : "Company Recon Setup"}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111439]">
            Customize & Launch Discussion
          </h2>
          <p className="text-xs sm:text-sm text-[#232759] mt-1.5 font-medium">
            Configure your candidate profile, discussion parameters, and step into the arena.
          </p>
        </div>

        {/* Configuration Flow Container */}
        <div className="rounded-3xl bg-[#151945]/90 border border-[#B2B5E0]/30 p-6 sm:p-9 shadow-2xl relative z-20 pointer-events-auto">
          {/* User Name Config */}
          <div className="mb-6 pb-6 border-b border-[#B2B5E0]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label className="block text-sm font-semibold text-[#F8F8F9]">
                Your Candidate Name
              </label>
              <p className="text-xs text-[#B2B5E0] mt-0.5">
                Displayed on your video tile and placement evaluation scorecard.
              </p>
            </div>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Rahul, Priya, You..."
              className="px-4 py-2.5 rounded-xl bg-[#111439] border border-[#B2B5E0]/40 text-sm text-[#F8F8F9] placeholder-[#B2B5E0]/40 focus:outline-none focus:border-[#31EC56] w-full sm:w-60 pointer-events-auto"
            />
          </div>

          {/* PATH A: HAVE A TOPIC FLOW */}
          {activePathway === "topic" && (
            <div className="space-y-8 animate-fade-in pointer-events-auto">
              {/* Topic Input */}
              <div>
                <label className="block text-sm font-semibold text-[#F8F8F9] mb-2">
                  Group Discussion Topic
                </label>
                <input
                  type="text"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Enter custom topic or pick from recommendations below..."
                  className="w-full px-4 py-3.5 rounded-xl bg-[#111439] border border-[#B2B5E0]/40 text-[#F8F8F9] placeholder-[#B2B5E0]/40 focus:outline-none focus:border-[#31EC56] focus:ring-1 focus:ring-[#31EC56] transition-colors text-sm sm:text-base pointer-events-auto"
                />

                {/* Preset Chips */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-[#B2B5E0]/70 self-center mr-1">Campus Favorites:</span>
                  {sampleTopics.map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCustomTopic(t)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1B2054] border border-[#B2B5E0]/30 text-[#B2B5E0] hover:text-[#31EC56] hover:border-[#31EC56]/50 transition-colors cursor-pointer pointer-events-auto"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-[#F8F8F9]">
                    Time Duration Picker
                  </label>
                  <span className="text-sm font-bold text-[#31EC56] font-mono bg-[#1B2054] px-2.5 py-0.5 rounded-md border border-[#31EC56]/30">
                    {duration} Minutes
                  </span>
                </div>

                {/* Quick Pills */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {[3, 5, 10, 15, 30].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDuration(mins)}
                      className={`py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer pointer-events-auto ${
                        duration === mins
                          ? "bg-[#31EC56] text-zinc-950 shadow-md shadow-[#31EC56]/30"
                          : "bg-[#111439] border border-[#B2B5E0]/30 text-[#B2B5E0] hover:bg-[#1B2054]"
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>

                {/* Dynamic Slider */}
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full accent-[#31EC56] h-2 bg-[#111439] rounded-lg cursor-pointer pointer-events-auto"
                />
              </div>

              {/* Mode Selector - Streamlined 2-Mode Structure */}
              <div>
                <label className="block text-sm font-semibold text-[#F8F8F9] mb-3">
                  Discussion Mode
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Option 1: Practice with AI */}
                  <div
                    onClick={() => setMode("agents")}
                    className={`cursor-pointer rounded-2xl p-5 border transition-all pointer-events-auto ${
                      mode === "agents"
                        ? "bg-[#1B2054] border-[#31EC56] shadow-xl shadow-[#31EC56]/15 ring-2 ring-[#31EC56]/30"
                        : "bg-[#111439] border-[#B2B5E0]/30 hover:border-[#B2B5E0]/60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🤖</span>
                        <span className="text-sm font-bold text-[#F8F8F9]">Practice with AI</span>
                      </div>
                      {mode === "agents" && <span className="w-2.5 h-2.5 rounded-full bg-[#31EC56]" />}
                    </div>
                    <p className="text-xs text-[#B2B5E0] leading-relaxed">
                      Step into the arena directly with AI debaters (Aman, Rhea, Karan).
                    </p>
                  </div>

                  {/* Option 2: Practice with Friends */}
                  <div
                    onClick={() => setMode("friends")}
                    className={`cursor-pointer rounded-2xl p-5 border transition-all pointer-events-auto ${
                      mode === "friends"
                        ? "bg-[#1B2054] border-[#EE72F8] shadow-xl shadow-[#EE72F8]/15 ring-2 ring-[#EE72F8]/30"
                        : "bg-[#111439] border-[#B2B5E0]/30 hover:border-[#B2B5E0]/60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">👥</span>
                        <span className="text-sm font-bold text-[#F8F8F9]">Practice with Friends</span>
                      </div>
                      {mode === "friends" && <span className="w-2.5 h-2.5 rounded-full bg-[#EE72F8]" />}
                    </div>
                    <p className="text-xs text-[#B2B5E0] leading-relaxed">
                      Debate with your peers in real-time. Add AI agents later if needed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Prominent Shareable Link Card for Friends Mode */}
              {mode === "friends" && (
                <div className="rounded-2xl p-5 bg-[#1B2054]/95 border border-[#EE72F8]/50 shadow-xl shadow-[#EE72F8]/15 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#31EC56] animate-pulse" />
                      <h4 className="text-sm font-bold text-[#F8F8F9]">
                        Shareable Peer Discussion Link
                      </h4>
                    </div>
                    <span className="text-xs text-[#B2B5E0]">
                      Room ID: <span className="font-mono text-[#31EC56] font-bold">{roomId}</span>
                    </span>
                  </div>
                  <p className="text-xs text-[#B2B5E0] mb-3">
                    Invite batchmates to debate with you in real-time, or open this link in a second browser window / incognito tab to test peer multiplayer mode:
                  </p>
                  <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                    <input
                      type="text"
                      readOnly
                      value={getInviteUrl()}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-[#111439] border border-[#B2B5E0]/40 text-xs sm:text-sm font-mono text-[#31EC56] select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className={`px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-lg ${
                        copiedLink
                          ? "bg-[#31EC56] text-zinc-950 shadow-[#31EC56]/30 ring-2 ring-[#31EC56]"
                          : "bg-gradient-to-r from-[#EE72F8] to-[#9B51E0] text-white shadow-[#EE72F8]/25 hover:opacity-95"
                      }`}
                    >
                      {copiedLink ? (
                        <>
                          <span>✓</span>
                          <span>Link Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Action Button: Enter GD Arena */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    handleLaunchMeeting();
                  }}
                  disabled={!customTopic.trim()}
                  className="w-full py-4 rounded-2xl font-bold text-base sm:text-lg bg-gradient-to-r from-[#31EC56] via-[#2cd84f] to-[#31EC56] text-zinc-950 shadow-xl shadow-[#31EC56]/20 hover:opacity-95 hover:shadow-2xl hover:shadow-[#31EC56]/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer pointer-events-auto"
                >
                  Enter GD Arena →
                </button>
              </div>
            </div>
          )}

          {/* PATH B: HAVE A JOB DESCRIPTION FLOW */}
          {activePathway === "jd" && (
            <div className="space-y-8 animate-fade-in pointer-events-auto">
              {/* JD Input Area */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <label className="text-sm font-semibold text-[#F8F8F9]">
                    Job Description & Role Specification
                  </label>
                  <input
                    type="text"
                    value={companyHint}
                    onChange={(e) => setCompanyHint(e.target.value)}
                    placeholder="Company hint (e.g. TCS, Infosys, Google)..."
                    className="px-3 py-1.5 rounded-lg bg-[#111439] border border-[#B2B5E0]/40 text-xs text-[#F8F8F9] placeholder-[#B2B5E0]/40 focus:outline-none focus:border-[#EE72F8] pointer-events-auto"
                  />
                </div>

                <textarea
                  rows={5}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the Job Description or key requirements here..."
                  className="w-full px-4 py-3 rounded-xl bg-[#111439] border border-[#B2B5E0]/40 text-[#F8F8F9] placeholder-[#B2B5E0]/40 focus:outline-none focus:border-[#EE72F8] focus:ring-1 focus:ring-[#EE72F8] text-sm pointer-events-auto"
                />

                {errorMsg && (
                  <div className="mt-4 p-4 rounded-2xl border-2 border-[#EF036C] bg-[#EF036C]/10 text-[#F8F8F9] flex items-start gap-3 shadow-xl shadow-[#EF036C]/20">
                    <span className="text-[#EF036C] text-xl font-bold shrink-0">⚠️</span>
                    <div className="flex-1">
                      <h5 className="text-xs sm:text-sm font-bold text-[#EF036C] uppercase tracking-wide mb-1">
                        Verification Notice
                      </h5>
                      <p className="text-xs sm:text-sm text-[#F8F8F9] font-medium leading-relaxed">
                        {errorMsg}
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAnalyzeJD}
                    disabled={isAnalyzing}
                    className="relative group px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#EE72F8] to-[#9B51E0] text-white shadow-lg shadow-[#EE72F8]/25 hover:opacity-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer pointer-events-auto"
                  >
                    {isAnalyzing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Extracting Placement Intelligence...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>Analyze & Extract Intel</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Loading State with Heliotrope glowing indicator */}
              {isAnalyzing && (
                <div className="rounded-2xl p-8 bg-[#111439]/90 border border-[#EE72F8]/40 shadow-2xl shadow-[#EE72F8]/20 flex flex-col items-center justify-center text-center animate-pulse">
                  <div className="w-12 h-12 rounded-full border-4 border-[#EE72F8]/20 border-t-[#EE72F8] animate-spin mb-4" />
                  <h4 className="text-base font-bold text-[#F8F8F9] mb-1">
                    Analyzing Company Recon Intelligence
                  </h4>
                  <p className="text-xs text-[#B2B5E0] max-w-md">
                    Scanning Glassdoor & Ambitionbox placement archives and generating realistic campus debate topics...
                  </p>
                </div>
              )}

              {/* Recon Results Display */}
              {reconData && !isAnalyzing && (
                <div className="space-y-6 pt-2 pointer-events-auto">
                  {/* Company Summary Card */}
                  <div className="rounded-2xl p-5 bg-[#1B2054]/90 border border-[#C5ADC5]/40 shadow-xl pointer-events-auto">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#EE72F8] uppercase tracking-wider mb-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>Company Profile & Key Domains</span>
                    </div>
                    <p className="text-sm text-[#F8F8F9] leading-relaxed">
                      {reconData.company_summary}
                    </p>
                  </div>

                  {/* Selectable Suggested Topics */}
                  <div>
                    <label className="block text-sm font-semibold text-[#F8F8F9] mb-3">
                      Select Campus Placement GD Topic (With Context & Proof)
                    </label>

                    <div className="space-y-3">
                      {reconData.suggested_topics.map((t) => {
                        const isSelected = selectedTopicId === t.id;
                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              setSelectedTopicId(t.id);
                              setCustomTopic(t.topic);
                            }}
                            className={`cursor-pointer rounded-2xl p-5 border transition-all pointer-events-auto ${
                              isSelected
                                ? "bg-[#1B2054] border-[#31EC56] shadow-xl shadow-[#31EC56]/15 ring-2 ring-[#31EC56]/30"
                                : "bg-[#111439] border-[#B2B5E0]/30 hover:border-[#B2B5E0]/60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <h4 className="text-base font-bold text-[#F8F8F9]">
                                {t.topic}
                              </h4>
                              {isSelected ? (
                                <span className="w-5 h-5 rounded-full bg-[#31EC56] text-zinc-950 flex items-center justify-center font-bold text-xs shrink-0">
                                  ✓
                                </span>
                              ) : (
                                <span className="w-5 h-5 rounded-full border border-[#B2B5E0]/40 shrink-0" />
                              )}
                            </div>

                            <div className="space-y-1.5 text-xs text-[#B2B5E0] mt-3">
                              <div className="flex items-start gap-1.5">
                                <span className="font-semibold text-[#EE72F8] shrink-0">Relevance:</span>
                                <span>{t.relevance_reason}</span>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <span className="font-semibold text-[#31EC56] shrink-0">Evidence:</span>
                                <span>{t.evidence_proof}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Duration and Mode config once topic is selected */}
                  <div className="pt-4 border-t border-[#B2B5E0]/20 space-y-6">
                    {/* Duration Picker */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-[#F8F8F9]">
                          Time Duration
                        </label>
                        <span className="text-sm font-bold text-[#31EC56] font-mono bg-[#1B2054] px-2.5 py-0.5 rounded-md border border-[#31EC56]/30">
                          {duration} Minutes
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2 mb-3">
                        {[3, 5, 10, 15, 30].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setDuration(mins)}
                            className={`py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer pointer-events-auto ${
                              duration === mins
                                ? "bg-[#31EC56] text-zinc-950 shadow-md shadow-[#31EC56]/30"
                                : "bg-[#111439] border border-[#B2B5E0]/30 text-[#B2B5E0] hover:bg-[#1B2054]"
                            }`}
                          >
                            {mins} min
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Mode Selector - Streamlined 2-Mode Structure */}
                    <div>
                      <label className="block text-sm font-semibold text-[#F8F8F9] mb-3">
                        Discussion Mode
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Option 1: Practice with AI */}
                        <div
                          onClick={() => setMode("agents")}
                          className={`cursor-pointer rounded-2xl p-4 border transition-all pointer-events-auto ${
                            mode === "agents"
                              ? "bg-[#1B2054] border-[#31EC56] shadow-xl shadow-[#31EC56]/15 ring-2 ring-[#31EC56]/30"
                              : "bg-[#111439] border-[#B2B5E0]/30 hover:border-[#B2B5E0]/60"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">🤖</span>
                              <span className="text-sm font-bold text-[#F8F8F9]">Practice with AI</span>
                            </div>
                            {mode === "agents" && <span className="w-2.5 h-2.5 rounded-full bg-[#31EC56]" />}
                          </div>
                          <p className="text-xs text-[#B2B5E0] leading-relaxed">
                            Step into the arena directly with AI debaters (Aman, Rhea, Karan).
                          </p>
                        </div>

                        {/* Option 2: Practice with Friends */}
                        <div
                          onClick={() => setMode("friends")}
                          className={`cursor-pointer rounded-2xl p-4 border transition-all pointer-events-auto ${
                            mode === "friends"
                              ? "bg-[#1B2054] border-[#EE72F8] shadow-xl shadow-[#EE72F8]/15 ring-2 ring-[#EE72F8]/30"
                              : "bg-[#111439] border-[#B2B5E0]/30 hover:border-[#B2B5E0]/60"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">👥</span>
                              <span className="text-sm font-bold text-[#F8F8F9]">Practice with Friends</span>
                            </div>
                            {mode === "friends" && <span className="w-2.5 h-2.5 rounded-full bg-[#EE72F8]" />}
                          </div>
                          <p className="text-xs text-[#B2B5E0] leading-relaxed">
                            Debate with your peers in real-time. Add AI agents later if needed.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Prominent Shareable Link Card for Friends Mode in Pathway B */}
                    {mode === "friends" && (
                      <div className="rounded-2xl p-5 bg-[#1B2054]/95 border border-[#EE72F8]/50 shadow-xl shadow-[#EE72F8]/15 animate-fade-in">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#31EC56] animate-pulse" />
                            <h4 className="text-sm font-bold text-[#F8F8F9]">
                              Shareable Peer Discussion Link
                            </h4>
                          </div>
                          <span className="text-xs text-[#B2B5E0]">
                            Room ID: <span className="font-mono text-[#31EC56] font-bold">{roomId}</span>
                          </span>
                        </div>
                        <p className="text-xs text-[#B2B5E0] mb-3">
                          Invite batchmates to debate with you in real-time, or open this link in a second browser window / incognito tab to test peer multiplayer mode:
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                          <input
                            type="text"
                            readOnly
                            value={getInviteUrl()}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-[#111439] border border-[#B2B5E0]/40 text-xs sm:text-sm font-mono text-[#31EC56] select-all focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            className={`px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-lg ${
                              copiedLink
                                ? "bg-[#31EC56] text-zinc-950 shadow-[#31EC56]/30 ring-2 ring-[#31EC56]"
                                : "bg-gradient-to-r from-[#EE72F8] to-[#9B51E0] text-white shadow-[#EE72F8]/25 hover:opacity-95"
                            }`}
                          >
                            {copiedLink ? (
                              <>
                                <span>✓</span>
                                <span>Link Copied!</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Enter Arena Button */}
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudio();
                        handleLaunchMeeting();
                      }}
                      className="w-full py-4 rounded-2xl font-bold text-base sm:text-lg bg-gradient-to-r from-[#EE72F8] via-[#a855f7] to-[#31EC56] text-white shadow-xl shadow-[#EE72F8]/20 hover:opacity-95 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer pointer-events-auto"
                    >
                      Enter Tailored GD Arena →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
