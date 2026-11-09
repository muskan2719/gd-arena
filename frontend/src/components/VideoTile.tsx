"use client";

import React, { useEffect, useRef, useState } from "react";

export interface VideoTileProps {
  name: string;
  role: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHuman: boolean;
  stream?: MediaStream | null;
  isCameraOff?: boolean;
  isHandRaised?: boolean;
  style?: React.CSSProperties;
}

export const getIllustratedAvatarUrl = (name: string, role: string, isHuman: boolean): string => {
  const n = (name || "").toLowerCase();
  const r = (role || "").toLowerCase();

  // Aman (Alpha - Dominant / Challenger)
  if (n.includes("aman") || n.includes("alpha") || r.includes("alpha") || r.includes("dominant") || r.includes("challenger")) {
    return "https://api.dicebear.com/7.x/avataaars/svg?seed=Aman&facialHair=beardLight&top=shortCurly&clothingColor=blue01";
  }

  // Rhea (Beta - Analytical / Evaluator)
  if (n.includes("rhea") || n.includes("beta") || r.includes("beta") || r.includes("analytical") || r.includes("evaluator")) {
    return "https://api.dicebear.com/7.x/avataaars/svg?seed=Rhea&top=straight01&accessories=kurt&clothingColor=pastelGreen";
  }

  // Karan (Gamma - Diplomatic / Warm / Collaborative)
  if (n.includes("karan") || n.includes("gamma") || r.includes("gamma") || r.includes("diplomatic") || r.includes("collaborative")) {
    return "https://api.dicebear.com/7.x/avataaars/svg?seed=Karan&top=shortFlat&clothingColor=pastelRed";
  }

  // Judge / Dr. Roy
  if (n.includes("judge") || n.includes("roy") || r.includes("judge") || r.includes("observer")) {
    return "https://api.dicebear.com/7.x/avataaars/svg?seed=Judge&accessories=prescription02&top=frizzle";
  }

  // Candidate / Peer Friends when camera is off
  const cleanSeed = encodeURIComponent(name.replace(/[^a-zA-Z0-9]/g, "") || "Candidate");
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanSeed}&backgroundColor=151945`;
};

export const VideoTile: React.FC<VideoTileProps> = ({
  name,
  role,
  avatarUrl,
  isSpeaking,
  isMuted,
  isHuman,
  stream,
  isCameraOff = false,
  isHandRaised = false,
  style,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [imageFailed, setImageFailed] = useState<boolean>(false);

  useEffect(() => {
    if (videoRef.current && stream && !isCameraOff) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isCameraOff]);

  // Determine avatar URL
  const resolvedAvatarUrl = avatarUrl || getIllustratedAvatarUrl(name, role, isHuman);

  // Generate consistent initials fallback
  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || name.slice(0, 1).toUpperCase();

  // Avatar color gradients based on role (fallback)
  const getAvatarGradient = () => {
    if (isHuman) return "from-emerald-600 to-teal-800";
    if (role.toLowerCase().includes("dominant") || role.toLowerCase().includes("alpha")) {
      return "from-rose-600 to-amber-700";
    }
    if (role.toLowerCase().includes("analytical") || role.toLowerCase().includes("beta")) {
      return "from-blue-600 to-indigo-800";
    }
    return "from-purple-600 to-violet-800";
  };

  return (
    <div
      style={{
        border: isSpeaking ? "3px solid #31EC56" : "1px solid rgba(255,255,255,0.1)",
        boxShadow: isSpeaking ? "0 0 25px rgba(49,236,86,0.6)" : "none",
        ...style,
      }}
      className={`relative flex flex-col items-center justify-center w-full h-full rounded-2xl overflow-hidden transition-all duration-300 select-none ${
        isSpeaking
          ? "bg-[#14183E] ring-2 ring-[#31EC56]/50 animate-pulse"
          : "bg-[#151945]/90"
      }`}
    >
      {/* Top right badges: Hand raise, Role tag */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {isHandRaised && (
          <div className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs px-2.5 py-1 rounded-full backdrop-blur-md animate-bounce">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M13 24c-3.26 0-6.19-1.99-7.4-5.04l-3.12-7.85c-.32-.81-.05-1.74.67-2.25.75-.54 1.76-.5 2.47.1l2.38 2.01V4.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v6h1V2c0-.83.67-1.5 1.5-1.5S15 1.17 15 2v8.5h1V3.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v7h1V6.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v11c0 3.59-2.91 6.5-6.5 6.5z" />
            </svg>
            <span className="font-medium text-[11px]">Raised Hand</span>
          </div>
        )}
        <div className="bg-[#111439]/80 border border-[#B2B5E0]/30 backdrop-blur-md text-[#B2B5E0] text-[11px] font-medium px-2.5 py-0.5 rounded-full">
          {role}
        </div>
      </div>

      {/* Main Content: Camera stream or Illustrated Avatar */}
      {isHuman && stream && !isCameraOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform -scale-x-100"
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-4">
          <div className="relative flex items-center justify-center">
            {/* Audio wave ping effect when speaking */}
            {isSpeaking && (
              <div className="absolute inset-0 rounded-full animate-ping bg-[#31EC56]/20 scale-125 pointer-events-none" />
            )}

            {!imageFailed ? (
              <div
                className={`relative w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-full overflow-hidden border-2 transition-transform duration-300 bg-[#111439] shadow-lg ${
                  isSpeaking
                    ? "border-[#31EC56] scale-105 ring-4 ring-[#31EC56]/30 shadow-[#31EC56]/40"
                    : "border-[#B2B5E0]/30 hover:border-[#B2B5E0]/60"
                }`}
              >
                <img
                  src={resolvedAvatarUrl}
                  alt={name}
                  onError={() => setImageFailed(true)}
                  className={`w-full h-full object-cover select-none pointer-events-none transition-transform duration-300 ${
                    isSpeaking ? "scale-105" : ""
                  }`}
                  loading="lazy"
                />
              </div>
            ) : (
              <div
                className={`w-28 h-28 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-full flex items-center justify-center text-white text-2xl sm:text-3xl font-semibold shadow-inner bg-gradient-to-br ${getAvatarGradient()} transition-transform duration-300 ${
                  isSpeaking ? "scale-105 ring-4 ring-[#31EC56]/40" : ""
                }`}
              >
                {initials}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left overlay: Participant Name Pill with Mic Status */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 bg-[#111439]/85 border border-[#B2B5E0]/30 backdrop-blur-md px-3 py-1.5 rounded-full max-w-[85%] truncate shadow-md">
        {/* Mic Indicator */}
        {isMuted ? (
          <div className="w-5 h-5 rounded-full bg-[#EF036C]/90 flex items-center justify-center shrink-0">
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2.2"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full bg-[#31EC56]/90 flex items-center justify-center shrink-0">
            <svg
              className="w-3 h-3 text-zinc-950"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </div>
        )}

        <span className="text-xs font-semibold text-[#F8F8F9] truncate">
          {name}
        </span>
      </div>
    </div>
  );
};

export default VideoTile;
