"use client";

import React from "react";

export interface ParticipantEval {
  speaker_id: string;
  name: string;
  total_turns: number;
  strengths: string[];
  areas_for_improvement: string[];
  key_quotes_analyzed: string[];
}

export interface ScorecardData {
  overall_score: number;
  verdict: string;
  rubric_scores: {
    articulation: number;
    collaboration: number;
    critical_thinking: number;
    time_management: number;
  };
  participant_evaluations: ParticipantEval[];
  placement_readiness_tips: string[];
}

export interface ScorecardModalProps {
  isOpen: boolean;
  data: ScorecardData | null;
  isLoading: boolean;
  topic: string;
  onClose: () => void;
  onPracticeAgain: () => void;
}

export const ScorecardModal: React.FC<ScorecardModalProps> = ({
  isOpen,
  data,
  isLoading,
  topic,
  onClose,
  onPracticeAgain,
}) => {
  if (!isOpen) return null;

  // Extract the candidate's specific evaluation
  const candidateEval = data?.participant_evaluations?.find(
    (p) =>
      p.speaker_id === "user" ||
      p.speaker_id === "you" ||
      p.name.toLowerCase().includes("you")
  ) || data?.participant_evaluations?.[0];

  const getVerdictStyle = (verdict: string = "") => {
    const lower = verdict.toLowerCase();
    if (lower.includes("disqualified") || lower.includes("did not participate")) {
      return {
        bg: "bg-[#EF036C]/20 border-[#EF036C] text-[#EF036C]",
        ring: "ring-2 ring-[#EF036C]/40",
        label: "Disqualified / Did Not Participate",
      };
    }
    if (lower.includes("clear") || lower.includes("hire") || lower.includes("strong")) {
      return {
        bg: "bg-[#31EC56]/15 border-[#31EC56]/40 text-[#31EC56]",
        ring: "ring-2 ring-[#31EC56]/20",
        label: "Clear Hire",
      };
    }
    if (lower.includes("borderline")) {
      return {
        bg: "bg-amber-400/15 border-amber-400/40 text-amber-400",
        ring: "ring-2 ring-amber-400/20",
        label: "Borderline",
      };
    }
    return {
      bg: "bg-[#EF036C]/15 border-[#EF036C]/40 text-[#EF036C]",
      ring: "ring-2 ring-[#EF036C]/20",
      label: verdict || "Needs Improvement",
    };
  };

  const getMeterColor = (score: number) => {
    if (score >= 8) return "bg-[#31EC56]";
    if (score >= 6) return "bg-[#EE72F8]";
    return "bg-[#EF036C]";
  };

  const verdictConfig = getVerdictStyle(data?.verdict);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#111439] border border-[#B2B5E0]/30 shadow-2xl p-6 sm:p-8 md:p-10 text-[#F8F8F9] my-auto">
        {/* Loading Overlay */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-5">
            <div className="relative flex items-center justify-center">
              <img
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Judge&accessories=prescription02&top=frizzle"
                alt="Dr. Roy (Judge)"
                className="w-20 h-20 rounded-full border-2 border-[#EE72F8] bg-[#151945] shadow-xl relative z-10"
              />
              <div className="absolute -inset-2 rounded-full border-2 border-[#EE72F8]/40 border-t-[#EE72F8] animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#F8F8F9] mb-1">
                Judge Agent (Dr. Roy) is Analyzing Your GD Performance
              </h3>
              <p className="text-xs sm:text-sm text-[#B2B5E0] max-w-md mx-auto">
                Synthesizing articulation metrics, rebuttal timing, turn frequency, and group consensus alignment...
              </p>
            </div>
          </div>
        ) : data ? (
          <div className="space-y-8">
            {/* Header with Title, Judge Avatar and Topic */}
            <div className="border-b border-[#B2B5E0]/20 pb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src="https://api.dicebear.com/7.x/avataaars/svg?seed=Judge&accessories=prescription02&top=frizzle"
                    alt="Dr. Roy (Judge)"
                    className="w-13 h-13 rounded-full border-2 border-[#EE72F8]/60 bg-[#151945] shadow-lg shrink-0"
                  />
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EE72F8]/15 border border-[#EE72F8]/30 text-[#EE72F8] mb-1">
                      <span>★</span>
                      <span>Evaluated by Dr. Roy (Placement Moderator)</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#F8F8F9]">
                      Performance Assessment
                    </h2>
                    <p className="text-xs text-[#B2B5E0] mt-0.5 font-medium truncate max-w-xl">
                      Topic: {topic}
                    </p>
                  </div>
                </div>

                {/* Overall Score & Verdict Badge */}
                <div className="flex items-center sm:flex-col sm:items-end gap-3 shrink-0">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black text-[#F8F8F9] font-mono">
                      {data.overall_score.toFixed(1)}
                    </span>
                    <span className="text-sm font-semibold text-[#B2B5E0]/70">/ 10</span>
                  </div>
                  <div
                    className={`px-3.5 py-1 rounded-full text-xs font-bold border ${verdictConfig.bg} ${verdictConfig.ring}`}
                  >
                    {verdictConfig.label}
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Rubric Meters Grid */}
            <div>
              <h3 className="text-sm font-bold text-[#EE72F8] uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>Evaluator Competency Rubrics</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Articulation & Delivery", score: data.rubric_scores.articulation },
                  { label: "Collaboration & Synthesis", score: data.rubric_scores.collaboration },
                  { label: "Critical Thinking & Logic", score: data.rubric_scores.critical_thinking },
                  { label: "Time Entry & Composure", score: data.rubric_scores.time_management },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-[#151945]/80 border border-[#B2B5E0]/20 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs sm:text-sm font-semibold mb-2">
                      <span className="text-[#F8F8F9]">{item.label}</span>
                      <span className="font-mono font-bold text-[#B2B5E0]">{item.score}/10</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-2.5 bg-[#111439] rounded-full overflow-hidden p-0.5 border border-[#B2B5E0]/15">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${getMeterColor(item.score)}`}
                        style={{ width: `${Math.min(item.score * 10, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Candidate Participant Breakdown */}
            {candidateEval && (
              <div className="rounded-2xl p-5 sm:p-6 bg-[#151945]/90 border border-[#C5ADC5]/30 space-y-5">
                <div className="flex items-center justify-between border-b border-[#B2B5E0]/15 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#31EC56]" />
                    <h4 className="text-base font-bold text-[#F8F8F9]">
                      Candidate Performance Breakdown ({candidateEval.name})
                    </h4>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#1B2054] text-[#B2B5E0] border border-[#B2B5E0]/20 font-mono">
                    Total Turns: {candidateEval.total_turns}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Strengths */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-[#31EC56] mb-2.5 flex items-center gap-1.5">
                      <span>✓</span>
                      <span>Observed Strengths</span>
                    </h5>
                    <ul className="space-y-2 text-xs sm:text-sm text-[#F8F8F9]">
                      {candidateEval.strengths.map((str, sIdx) => (
                        <li key={sIdx} className="flex items-start gap-2">
                          <span className="text-[#31EC56] font-bold shrink-0">•</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Areas for Improvement */}
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-[#EF036C] mb-2.5 flex items-center gap-1.5">
                      <span>⚠</span>
                      <span>Areas for Improvement</span>
                    </h5>
                    <ul className="space-y-2 text-xs sm:text-sm text-[#F8F8F9]">
                      {candidateEval.areas_for_improvement.map((area, aIdx) => (
                        <li key={aIdx} className="flex items-start gap-2">
                          <span className="text-[#EF036C] font-bold shrink-0">•</span>
                          <span>{area}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Key Quotes Analyzed */}
                {candidateEval.key_quotes_analyzed && candidateEval.key_quotes_analyzed.length > 0 && (
                  <div className="pt-2 border-t border-[#B2B5E0]/15">
                    <h5 className="text-xs font-bold text-[#B2B5E0] uppercase tracking-wider mb-2">
                      Key Statement Analyzed
                    </h5>
                    <div className="space-y-1.5">
                      {candidateEval.key_quotes_analyzed.map((quote, qIdx) => (
                        <blockquote
                          key={qIdx}
                          className="text-xs sm:text-sm italic text-[#B2B5E0] border-l-2 border-[#EE72F8] pl-3 py-1 bg-[#111439]/60 rounded-r-lg"
                        >
                          "{quote}"
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Strategic Placement Tips */}
            {data.placement_readiness_tips && data.placement_readiness_tips.length > 0 && (
              <div className="rounded-2xl p-5 sm:p-6 bg-[#1A1F52]/90 border border-[#EE72F8]/30 shadow-lg">
                <h4 className="text-sm font-bold text-[#EE72F8] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#EE72F8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Placement Cell Executive Coaching Tips</span>
                </h4>
                <div className="space-y-2 text-xs sm:text-sm text-[#F8F8F9]">
                  {data.placement_readiness_tips.map((tip, tIdx) => (
                    <div key={tIdx} className="flex items-start gap-2.5">
                      <span className="text-[#EE72F8] font-bold shrink-0">0{tIdx + 1}.</span>
                      <p className="leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-[#B2B5E0]/20">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-semibold text-[#B2B5E0] hover:text-[#F8F8F9] hover:bg-[#151945] transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onPracticeAgain}
                className="w-full sm:w-auto px-8 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-[#EE72F8] via-[#a855f7] to-[#31EC56] text-white shadow-xl shadow-[#EE72F8]/20 hover:opacity-95 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Practice Again →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ScorecardModal;
