"use client";

import React from "react";

export interface ControlsProps {
  isMuted: boolean;
  toggleMic: () => void;
  onLeave: () => void;
  isCameraOff?: boolean;
  toggleCamera?: () => void;
  isHandRaised?: boolean;
  toggleHandRaise?: () => void;
  isCaptionsOn?: boolean;
  toggleCaptions?: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isMuted,
  toggleMic,
  onLeave,
  isCameraOff = false,
  toggleCamera,
  isHandRaised = false,
  toggleHandRaise,
  isCaptionsOn = true,
  toggleCaptions,
}) => {
  return (
    <div className="flex items-center justify-center w-full px-4 py-3">
      <div className="flex items-center gap-2 sm:gap-3 bg-[#202124]/95 border border-white/10 px-4 sm:px-6 py-2.5 rounded-full shadow-2xl backdrop-blur-xl">
        {/* Microphone Toggle */}
        <button
          type="button"
          onClick={toggleMic}
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          title={isMuted ? "Turn on microphone" : "Turn off microphone"}
          className={`relative group w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#202124] ${
            isMuted
              ? "bg-[#ea4335] text-white hover:bg-[#d93025] focus:ring-[#ea4335]"
              : "bg-[#3c4043] text-white hover:bg-[#474a4d] focus:ring-zinc-400"
          }`}
        >
          {isMuted ? (
            <svg
              className="w-5 h-5"
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
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2.2"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
          <span className="sr-only">{isMuted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={toggleCamera}
          aria-label={isCameraOff ? "Turn on camera" : "Turn off camera"}
          title={isCameraOff ? "Turn on camera" : "Turn off camera"}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#202124] ${
            isCameraOff
              ? "bg-[#ea4335] text-white hover:bg-[#d93025] focus:ring-[#ea4335]"
              : "bg-[#3c4043] text-white hover:bg-[#474a4d] focus:ring-zinc-400"
          }`}
        >
          {isCameraOff ? (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2.2"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M21 21l-3.6-3.6m0 0A7 7 0 0 0 16 11V7a2 2 0 0 0-2-2H7.8M15 15l-5-5m-6.4-2.6A2 2 0 0 0 2 7v10a2 2 0 0 0 2 2h12a2 2 0 0 0 1.4-.6" />
              <path d="M22 7l-6 4.5v1l6 4.5V7z" />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2.2"
            >
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          )}
          <span className="sr-only">Toggle Camera</span>
        </button>

        {/* Closed Captions Button */}
        {toggleCaptions && (
          <button
            type="button"
            onClick={toggleCaptions}
            aria-label={isCaptionsOn ? "Turn off captions" : "Turn on captions"}
            title={isCaptionsOn ? "Turn off captions" : "Turn on captions"}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#202124] ${
              isCaptionsOn
                ? "bg-blue-600/90 text-white hover:bg-blue-500 focus:ring-blue-400"
                : "bg-[#3c4043] text-zinc-300 hover:bg-[#474a4d] focus:ring-zinc-400"
            }`}
          >
            <span className="text-xs font-bold border border-current px-1 py-0.5 rounded leading-none">
              CC
            </span>
            <span className="sr-only">Captions</span>
          </button>
        )}

        {/* Hand Raise Button */}
        <button
          type="button"
          onClick={toggleHandRaise}
          aria-label={isHandRaised ? "Lower hand" : "Raise hand"}
          title={isHandRaised ? "Lower hand" : "Raise hand"}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#202124] ${
            isHandRaised
              ? "bg-amber-400 text-zinc-950 font-semibold shadow-lg shadow-amber-400/20 hover:bg-amber-300 focus:ring-amber-400"
              : "bg-[#3c4043] text-white hover:bg-[#474a4d] focus:ring-zinc-400"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M13 24c-3.26 0-6.19-1.99-7.4-5.04l-3.12-7.85c-.32-.81-.05-1.74.67-2.25.75-.54 1.76-.5 2.47.1l2.38 2.01V4.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v6h1V2c0-.83.67-1.5 1.5-1.5S15 1.17 15 2v8.5h1V3.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v7h1V6.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v11c0 3.59-2.91 6.5-6.5 6.5z" />
          </svg>
          <span className="sr-only">Raise Hand</span>
        </button>

        {/* End Call Button (Google Meet signature red pill/circle) */}
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          title="Leave call"
          className="w-14 h-11 rounded-full bg-[#ea4335] text-white hover:bg-[#d93025] flex items-center justify-center transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#202124] focus:ring-[#ea4335]"
        >
          <svg
            className="w-6 h-6 rotate-[135deg]"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-2.2 2.2a15.053 15.053 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-.99-1.12z" />
          </svg>
          <span className="sr-only">End Call</span>
        </button>
      </div>
    </div>
  );
};

export default Controls;
