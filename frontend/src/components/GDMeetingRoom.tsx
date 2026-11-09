"use client";

import React, { useState, useEffect, useRef } from "react";
import VideoTile from "@/components/VideoTile";
import Controls from "@/components/Controls";
import ScorecardModal, { ScorecardData } from "@/components/ScorecardModal";

type SpeechRecognitionType = any;

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const BACKEND_URL = API_BASE;

export interface GDMeetingRoomProps {
  topic: string;
  durationMinutes: number;
  mode: "agents" | "friends" | "mix";
  roomId?: string;
  userName?: string;
  isHost?: boolean;
  onLeave: () => void;
}

export interface ParticipantItem {
  id: string;
  name: string;
  role: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHuman: boolean;
  isSelf?: boolean;
  is_agent?: boolean;
  isHandRaised?: boolean;
  lastSpeech?: string;
}

interface PeerParticipant {
  id: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHandRaised?: boolean;
  lastSpeech?: string;
}

export interface AgentPersona {
  id: "alpha" | "beta" | "gamma";
  name: string;
  role: string;
  avatarSeed: string;
  description: string;
  badgeColor: string;
}

export const AVAILABLE_AI_PERSONAS: AgentPersona[] = [
  {
    id: "alpha",
    name: "Agent Alpha (Aman)",
    role: "Dominant / Challenger",
    avatarSeed: "Aman",
    description: "Assertive counter-arguments, drives conversation forward.",
    badgeColor: "#EF036C",
  },
  {
    id: "beta",
    name: "Agent Beta (Rhea)",
    role: "Analytical / Evaluator",
    avatarSeed: "Rhea",
    description: "Data-driven points, structural frameworks (pros/cons).",
    badgeColor: "#EE72F8",
  },
  {
    id: "gamma",
    name: "Agent Gamma (Karan)",
    role: "Diplomatic / Synthesizer",
    avatarSeed: "Karan",
    description: "Bridges opposing views, team collaboration, summarization.",
    badgeColor: "#31EC56",
  },
];

const FALLBACK_AGENTS = [
  {
    id: "alpha",
    name: "Agent Alpha (Aman)",
    role: "Dominant / Challenger",
    text: "While that sounds promising in theory, what happens when operational constraints and unexpected costs hit? We need concrete execution metrics before committing.",
  },
  {
    id: "beta",
    name: "Agent Beta (Rhea)",
    role: "Analytical / Evaluator",
    text: "Looking at the data benchmarks, successful implementations require at least an eighty percent consistency rate. Without verifiable indicators, this remains speculative.",
  },
  {
    id: "gamma",
    name: "Agent Gamma (Karan)",
    role: "Diplomatic / Synthesizer",
    text: "I see merit in what both sides are proposing. If we can combine the speed of execution with disciplined cost tracking, we might bridge the gap between innovation and stability.",
  },
];

// Preload browser voices cleanly
let voices: SpeechSynthesisVoice[] = [];
let activeUtterance: SpeechSynthesisUtterance | null = null;
if (typeof window !== "undefined") {
  (window as any).__gdUtterance = null;
}
const loadVoices = () => {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    voices = window.speechSynthesis.getVoices();
  }
};
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export const GDMeetingRoom: React.FC<GDMeetingRoomProps> = ({
  topic,
  durationMinutes,
  mode,
  roomId = "arena-live-01",
  userName = "You",
  isHost = true,
  onLeave,
}) => {
  // Human participant controls & state
  const [isMicActive, setIsMicActive] = useState<boolean>(true);
  const isMicActiveRef = useRef<boolean>(true);
  const isMuted = !isMicActive;
  const isMutedRef = useRef<boolean>(false);
  const [isCameraOff, setIsCameraOff] = useState<boolean>(true);
  const [isHandRaised, setIsHandRaised] = useState<boolean>(false);
  const [isCaptionsOn, setIsCaptionsOn] = useState<boolean>(true);
  const [userSpeaking, setUserSpeaking] = useState<boolean>(false);
  const userSpeakingRef = useRef<boolean>(false);
  const humanSpeaking = userSpeaking;
  const setHumanSpeaking = setUserSpeaking;
  const humanSpeakingRef = userSpeakingRef;
  const [liveCaption, setLiveCaption] = useState<string>("");
  const [activeSpeakerCaptionName, setActiveSpeakerCaptionName] = useState<string>(userName);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);

  // Audio permission & unlock status
  const [isSoundUnlocked, setIsSoundUnlocked] = useState<boolean>(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Timer countdown
  const [secondsRemaining, setSecondsRemaining] = useState<number>(durationMinutes * 60);

  // Permanent live transcript reference ensuring full submission to placement judge
  const [transcript, setTranscript] = useState<Array<{ speaker_id: string; speaker_name: string; text: string }>>([]);
  const liveTranscriptRef = useRef<Array<{ speaker_id: string; speaker_name: string; text: string }>>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // Active Agent Personas in the room (turn-taking rotation and grid presence)
  const [activeAgentIds, setActiveAgentIds] = useState<string[]>(() => {
    if (mode === "agents") {
      return ["alpha", "beta", "gamma"];
    } else if (mode === "mix") {
      return ["alpha", "beta"];
    } else {
      return []; // "friends" mode: starts with candidate friends, empty seats can add AI
    }
  });
  const activeAgentIdsRef = useRef<string[]>(activeAgentIds);
  useEffect(() => {
    activeAgentIdsRef.current = activeAgentIds;
  }, [activeAgentIds]);

  // Dynamic speaking state across all agents and candidate
  const [participants, setParticipants] = useState<ParticipantItem[]>(() => {
    const list: ParticipantItem[] = [
      { id: "user", name: userName, role: "Candidate (You)", isSpeaking: false, isMuted: false, isHuman: true },
    ];
    const initialAgents = mode === "agents" ? ["alpha", "beta", "gamma"] : mode === "mix" ? ["alpha", "beta"] : [];
    initialAgents.forEach((id) => {
      const p = AVAILABLE_AI_PERSONAS.find((a) => a.id === id);
      if (p) {
        list.push({
          id: p.id,
          name: p.name,
          role: p.role,
          isSpeaking: false,
          isMuted: false,
          isHuman: false,
        });
      }
    });
    return list;
  });

  // AI thinking badge state
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const isProcessingTurnRef = useRef<boolean>(false);
  const fallbackTurnIndexRef = useRef<number>(0);

  // Meeting active flag to kill background audio leak immediately on call end
  const isMeetingActiveRef = useRef<boolean>(true);

  // Evaluation & Scorecard Modal state
  const [isScorecardOpen, setIsScorecardOpen] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [scorecardData, setScorecardData] = useState<ScorecardData | null>(null);
  const hasTriggeredEvalRef = useRef<boolean>(false);

  // Multi-tab Peer state
  const [connectedPeers, setConnectedPeers] = useState<PeerParticipant[]>([]);
  const connectedPeersRef = useRef<PeerParticipant[]>([]);
  useEffect(() => {
    connectedPeersRef.current = connectedPeers;
  }, [connectedPeers]);

  // Clean room reset when roomId changes (e.g. Practice Again)
  useEffect(() => {
    isMeetingActiveRef.current = true;
    hasTriggeredEvalRef.current = false;
    setIsScorecardOpen(false);
    setIsEvaluating(false);
    setScorecardData(null);
  }, [roomId]);

  // Generate a guaranteed unique participant ID for this meeting session tab
  const [myId] = useState(() => "user_" + Math.random().toString(36).substring(2, 9) + "_" + Math.floor(Math.random() * 10000));
  const myUserId = myId;
  const currentUserIdRef = useRef<string>(myId);
  const myPeerIdRef = currentUserIdRef;
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Manual timer start state for friends mode
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(mode !== "friends");
  const isTimerRunningRef = useRef<boolean>(mode !== "friends");
  useEffect(() => {
    isTimerRunningRef.current = isTimerRunning;
  }, [isTimerRunning]);

  // In-Arena Add AI Agent Dropdown state & Room Link copy
  const [isAddAgentDropdownOpen, setIsAddAgentDropdownOpen] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const getInviteUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    return `${origin}/?room=${roomId}&duration=${durationMinutes || 5}&topic=${encodeURIComponent(topic || "Campus Placement GD")}&mode=friends`;
  };

  const handleCopyLink = () => {
    const link = getInviteUrl();
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Continuous speech buffer for silence detection handoff
  const speechBufferRef = useRef<string>("");
  const isRecognizingRef = useRef<boolean>(false);
  const lastSyncedPeerSpeechRef = useRef<Record<string, string>>({});
  const lastBroadcastTimeRef = useRef<number>(0);

  const broadcastSpeechToBackend = (transcriptText: string, isSpeaking: boolean) => {
    const now = Date.now();
    if (!isSpeaking || now - lastBroadcastTimeRef.current > 750) {
      lastBroadcastTimeRef.current = now;
      fetch(`${BACKEND_URL}/api/room/broadcast_speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          user_id: myId,
          transcript: transcriptText,
          is_speaking: isSpeaking,
        }),
      }).catch(() => {});
    }
  };

  const handleToggleHandRaise = () => {
    const nextVal = !isHandRaised;
    setIsHandRaised(nextVal);

    fetch(`${BACKEND_URL}/api/room/raise_hand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: roomId,
        user_id: myId,
        is_hand_raised: nextVal,
      }),
    }).catch(() => {});

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: "PEER_HAND_RAISE",
        userId: myId,
        isHandRaised: nextVal,
      });
    }
  };
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const captionClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const safetySpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Timers for autonomous kickoff and idle dead-silence prevention
  const startupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasDiscussionStartedRef = useRef<boolean>(false);
  const [hasDiscussionStarted, setHasDiscussionStarted] = useState<boolean>(false);
  const activeSpeakerIdRef = useRef<string | null>(null);
  const isAiThinkingRef = useRef<boolean>(false);
  const triggerKickoffRef = useRef<((force?: boolean) => void) | null>(null);

  // AudioContext volume analysis refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Guaranteed browser audio unlock (AudioContext + SpeechSynthesis)
  const unlockAudio = () => {
    if (typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        try {
          if (!audioContextRef.current) {
            audioContextRef.current = new AudioContextClass();
          }
          if (audioContextRef.current.state === "suspended") {
            audioContextRef.current.resume();
          }
        } catch (e) {
          console.warn("AudioContext unlock error:", e);
        }
      }
      if ("speechSynthesis" in window) {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.resume();
          setIsSoundUnlocked(true);
        } catch (e) {
          console.warn("Audio unlock warning:", e);
        }
      }
    }
  };
  const primeAudio = unlockAudio;

  // Single-click test audio & AI Agent Alpha speech trigger
  const testAudioOutput = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    unlockAudio();
    if (triggerKickoffRef.current) {
      triggerKickoffRef.current(true);
    }
  };

  // Chromium keepalive: periodically resume if speech synthesis is speaking
  useEffect(() => {
    const keepalive = setInterval(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }
    }, 2500);
    return () => clearInterval(keepalive);
  }, []);

  // Global user gesture listener ensuring browser audio policy is unlocked on first interaction
  useEffect(() => {
    const handleGesture = () => {
      unlockAudio();
    };
    window.addEventListener("click", handleGesture, { passive: true });
    window.addEventListener("keydown", handleGesture, { passive: true });
    window.addEventListener("touchstart", handleGesture, { passive: true });
    return () => {
      window.removeEventListener("click", handleGesture);
      window.removeEventListener("keydown", handleGesture);
      window.removeEventListener("touchstart", handleGesture);
    };
  }, []);

  // Sync voices and initialize voice listeners
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const updateVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list && list.length > 0) {
        voicesRef.current = list;
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    unlockAudio();

    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Sync isMicActive and isMuted states
  useEffect(() => {
    isMicActiveRef.current = isMicActive;
    isMutedRef.current = !isMicActive;
    setParticipants((prev) =>
      prev.map((p) => (p.id === "user" ? { ...p, isMuted: !isMicActive } : p))
    );
  }, [isMicActive]);

  // Keep liveTranscriptRef synchronized with React state
  const appendTranscript = (entry: { speaker_id: string; speaker_name: string; text: string }) => {
    liveTranscriptRef.current = [...liveTranscriptRef.current, entry];
    setTranscript(liveTranscriptRef.current);
  };

  // Helper to add or update participant
  const addParticipantIfNew = (peerUser: { id: string; name: string; isSpeaking?: boolean; isMuted?: boolean }) => {
    if (!peerUser || peerUser.id === myPeerIdRef.current) return;
    setConnectedPeers((prev) => {
      const exists = prev.some((p) => p.id === peerUser.id);
      if (exists) {
        return prev.map((p) =>
          p.id === peerUser.id
            ? {
                ...p,
                name: peerUser.name || p.name,
                isSpeaking: peerUser.isSpeaking ?? p.isSpeaking,
                isMuted: peerUser.isMuted ?? p.isMuted,
              }
            : p
        );
      }
      return [
        ...prev,
        {
          id: peerUser.id,
          name: peerUser.name || "Peer Candidate",
          isSpeaking: peerUser.isSpeaking ?? false,
          isMuted: peerUser.isMuted ?? true,
        },
      ];
    });
  };

  // Multi-tab, Incognito & Cross-Browser Synchronization (BroadcastChannel + Backend Room Hub)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Bi-directional state applier merging remote participants, active agents, and session status
    const applyIncomingRoomState = (data: any) => {
      if (!data || !isMeetingActiveRef.current) return;

      // Sync wall-clock timer state and precise time_remaining from backend
      if (data.timer_running) {
        setIsTimerRunning(true);
        if (typeof data.time_remaining === "number") {
          setSecondsRemaining(data.time_remaining);
        }
      } else if (data.duration && !isTimerRunningRef.current) {
        const durSec = data.duration > 60 ? data.duration : data.duration * 60;
        setSecondsRemaining(durSec);
      }

      if (data.participants && Array.isArray(data.participants)) {
        // Other participants from backend
        const otherTiles: PeerParticipant[] = data.participants
          .filter((p: any) => p && p.id && p.id !== myId && !p.is_agent)
          .map((p: any) => {
            const existing = connectedPeersRef.current.find((cp) => cp.id === p.id);
            const peerSpeaking = typeof p.is_speaking === "boolean" ? p.is_speaking : (existing ? existing.isSpeaking : false);
            const peerHandRaised = typeof p.is_hand_raised === "boolean" ? p.is_hand_raised : (existing?.isHandRaised || false);
            const peerSpeech = p.last_speech || existing?.lastSpeech || "";

            return {
              id: p.id,
              name: p.name || "Peer Candidate",
              isSpeaking: peerSpeaking,
              isMuted: existing ? existing.isMuted : true,
              isHandRaised: peerHandRaised,
              lastSpeech: peerSpeech,
            };
          });

        setConnectedPeers(otherTiles);

        // Check for active speaking peer to display live captions
        const activeSpeakingPeer = otherTiles.find((p) => p.isSpeaking && p.lastSpeech);
        if (activeSpeakingPeer && (!activeSpeakerIdRef.current || activeSpeakerIdRef.current === activeSpeakingPeer.id)) {
          setActiveSpeakerCaptionName(activeSpeakingPeer.name);
          setLiveCaption(activeSpeakingPeer.lastSpeech || "");
          setActiveSpeakerId(activeSpeakingPeer.id);
        }

        // Commit completed peer speech to shared transcript
        otherTiles.forEach((p) => {
          if (p.lastSpeech && !p.isSpeaking && lastSyncedPeerSpeechRef.current[p.id] !== p.lastSpeech) {
            lastSyncedPeerSpeechRef.current[p.id] = p.lastSpeech;
            const alreadyExists = liveTranscriptRef.current.some(
              (t) => t.speaker_id === p.id && t.text === p.lastSpeech
            );
            if (!alreadyExists) {
              appendTranscript({
                speaker_id: p.id,
                speaker_name: p.name,
                text: p.lastSpeech,
              });
            }
          }
        });

        // Current user tile
        const selfData = data.participants.find((p: any) => p && p.id === myId);
        const myTile = {
          id: myId,
          name: (selfData?.name || userName || "Candidate") + " (You)",
          role: "Candidate (You)",
          isSpeaking: userSpeakingRef.current,
          isMuted: !isMicActiveRef.current,
          isHuman: true,
          isSelf: true,
          is_agent: false,
          isHandRaised: isHandRaised,
        };

        const remotePeers = otherTiles.map((p) => ({
          id: p.id,
          name: p.name,
          role: "Friend (Peer Candidate)",
          isSpeaking: p.isSpeaking,
          isMuted: p.isMuted,
          isHuman: true,
          isSelf: false,
          is_agent: false,
          isHandRaised: p.isHandRaised,
          lastSpeech: p.lastSpeech,
        }));

        const agentTiles = activeAgentIdsRef.current.map((agentId) => {
          const persona = AVAILABLE_AI_PERSONAS.find((a) => a.id === agentId);
          const existing = participants.find((ep) => ep.id === agentId);
          return {
            id: agentId,
            name: persona?.name || agentId,
            role: persona?.role || "Debater",
            isSpeaking: existing ? existing.isSpeaking : false,
            isMuted: false,
            isHuman: false,
            isSelf: false,
            is_agent: true,
          };
        });

        setParticipants([myTile, ...remotePeers, ...agentTiles]);
      }

      if (data.active_agents && Array.isArray(data.active_agents)) {
        setActiveAgentIds((prev) => {
          const merged = Array.from(new Set([...prev, ...data.active_agents]));
          if (merged.length !== prev.length) return merged;
          return prev;
        });
      }

      if (data.timer_started || data.timer_running) {
        setIsTimerRunning(true);
      }

      if (data.session_ended && liveTranscriptRef.current.length > 0 && !hasTriggeredEvalRef.current) {
        hasTriggeredEvalRef.current = true;
        triggerEvaluation();
      }
    };

    // 1. Register participant via join endpoint
    const registerAndPoll = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/room/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            user_id: myId,
            user_name: userName || "Peer",
            topic: topic,
            duration: durationMinutes * 60,
            active_agents: activeAgentIdsRef.current,
          }),
        });
        const data = await res.json();
        if (data) {
          applyIncomingRoomState(data);
        }
      } catch (e) {
        console.error("Room join failed:", e);
      }
    };

    registerAndPoll();

    // 2. Poll Backend Room State every 1.5s for seamless Incognito & multi-device sync
    const pollInterval = setInterval(async () => {
      if (!isMeetingActiveRef.current) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/room/${roomId}/state`);
        const data = await res.json();
        if (data) {
          applyIncomingRoomState(data);
        }
      } catch (err) {}
    }, 1500);

    // 3. Instant local zero-latency sync via BroadcastChannel
    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      const channelName = "gd-arena-" + roomId;
      channel = new BroadcastChannel(channelName);
      broadcastChannelRef.current = channel;

      const myPeerData = {
        id: currentUserIdRef.current,
        name: userName,
        isSpeaking: humanSpeakingRef.current,
        isMuted: isMutedRef.current,
        isSelf: false,
      };

      // Broadcast PEER_JOIN
      channel.postMessage({
        type: "PEER_JOIN",
        peer: myPeerData,
      });

      channel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === "PEER_JOIN") {
          const joiningPeer = data.peer || data.user;
          if (joiningPeer && joiningPeer.id !== currentUserIdRef.current) {
            addParticipantIfNew(joiningPeer);

            const currentPeersList = [
              myPeerData,
              ...connectedPeersRef.current.filter((p) => p.id !== joiningPeer.id),
            ];

            channel?.postMessage({
              type: "ROOM_STATE",
              peers: currentPeersList,
              topic: topic,
              duration: durationMinutes,
              activeAgents: activeAgentIdsRef.current,
              timerStarted: isTimerRunningRef.current,
            });
          }
        } else if (data.type === "ROOM_STATE") {
          if (data.peers && Array.isArray(data.peers)) {
            data.peers.forEach((p: any) => {
              if (p && p.id !== currentUserIdRef.current) {
                addParticipantIfNew(p);
              }
            });
          }
          if (data.peer && data.peer.id !== currentUserIdRef.current) {
            addParticipantIfNew(data.peer);
          }
          if (data.activeAgents && Array.isArray(data.activeAgents)) {
            setActiveAgentIds((prev) => Array.from(new Set([...prev, ...data.activeAgents])));
          }
          if (data.timerStarted) {
            setIsTimerRunning(true);
          }
        } else if (data.type === "TIMER_START") {
          setIsTimerRunning(true);
        } else if (data.type === "PEER_LEAVE") {
          const leavingPeer = data.peer || data.user;
          if (leavingPeer) {
            setConnectedPeers((prev) => prev.filter((p) => p.id !== leavingPeer.id));
            setParticipants((prev) => prev.filter((p) => p.id !== leavingPeer.id));
          }
        } else if (data.type === "PEER_SPEAKING") {
          setConnectedPeers((prev) =>
            prev.map((p) =>
              p.id === data.userId
                ? {
                    ...p,
                    isSpeaking: data.isSpeaking,
                    isMuted: data.isMuted ?? p.isMuted,
                  }
                : p
            )
          );
        } else if (data.type === "PEER_HAND_RAISE" && data.userId) {
          setConnectedPeers((prev) =>
            prev.map((p) =>
              p.id === data.userId ? { ...p, isHandRaised: data.isHandRaised } : p
            )
          );
        } else if (data.type === "PEER_SPEAKING_STREAM" && data.userId) {
          setConnectedPeers((prev) =>
            prev.map((p) =>
              p.id === data.userId
                ? {
                    ...p,
                    isSpeaking: data.isSpeaking,
                    lastSpeech: data.transcript,
                  }
                : p
            )
          );
          if (data.isSpeaking && data.transcript) {
            setActiveSpeakerCaptionName(data.userName || "Peer Candidate");
            setLiveCaption(data.transcript);
            setActiveSpeakerId(data.userId);
          }
        } else if (data.type === "TRANSCRIPT_SYNC" && data.entry) {
          appendTranscript(data.entry);
          if (data.entry.speaker_id !== "user" && data.entry.speaker_id !== currentUserIdRef.current) {
            setActiveSpeakerCaptionName(data.entry.speaker_name);
            setLiveCaption(data.entry.text);
            setActiveSpeakerId(data.entry.speaker_id);
          }
        } else if (data.type === "ADD_AGENT" && data.agentId) {
          const agentId = data.agentId as "alpha" | "beta" | "gamma";
          setActiveAgentIds((prev) => {
            if (!prev.includes(agentId)) return [...prev, agentId];
            return prev;
          });
          const persona = AVAILABLE_AI_PERSONAS.find((p) => p.id === agentId);
          if (persona) {
            setParticipants((prev) => {
              if (prev.some((p) => p.id === agentId)) return prev;
              return [
                ...prev,
                {
                  id: persona.id,
                  name: persona.name,
                  role: persona.role,
                  isSpeaking: false,
                  isMuted: false,
                  isHuman: false,
                },
              ];
            });
          }
        } else if (data.type === "SESSION_END") {
          console.log("Peer session ended, launching placement judge evaluation for this tab...");
          if (!hasTriggeredEvalRef.current) {
            hasTriggeredEvalRef.current = true;
            triggerEvaluation();
          }
        }
      };
    }

    return () => {
      clearInterval(pollInterval);
      if (channel) {
        channel.postMessage({
          type: "PEER_LEAVE",
          peer: { id: currentUserIdRef.current, name: userName },
        });
        channel.close();
      }
      fetch(`${BACKEND_URL}/api/room/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          user_id: currentUserIdRef.current,
        }),
      }).catch(() => {});
    };
  }, [roomId, userName, topic, durationMinutes]);

  // Broadcast own speaking and mute status changes
  useEffect(() => {
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: "PEER_SPEAKING",
        userId: myPeerIdRef.current,
        isSpeaking: humanSpeaking,
        isMuted: isMuted,
      });
    }
  }, [humanSpeaking, isMuted]);

  // Dynamic Add Agent Persona Handler
  const handleAddAgent = (agentId: "alpha" | "beta" | "gamma") => {
    if (!activeAgentIds.includes(agentId)) {
      const persona = AVAILABLE_AI_PERSONAS.find((p) => p.id === agentId);
      if (persona) {
        setActiveAgentIds((prev) => [...prev, agentId]);
        setParticipants((prev) => {
          if (prev.some((p) => p.id === agentId)) return prev;
          return [
            ...prev,
            {
              id: persona.id,
              name: persona.name,
              role: persona.role,
              isSpeaking: false,
              isMuted: false,
              isHuman: false,
            },
          ];
        });
        setIsAddAgentDropdownOpen(false);

        // Broadcast to BroadcastChannel
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: "ADD_AGENT",
            agentId: agentId,
          });
        }

        // Post to Backend Room Hub for Incognito / Cross-device sync
        fetch(`${BACKEND_URL}/api/room/add_agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            agent_id: agentId,
          }),
        }).catch(() => {});
      }
    }
  };

  // Countdown timer effect with synchronized session end
  useEffect(() => {
    if (!isTimerRunning) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!hasTriggeredEvalRef.current) {
            hasTriggeredEvalRef.current = true;
            if (broadcastChannelRef.current) {
              broadcastChannelRef.current.postMessage({
                type: "SESSION_END",
              });
            }
            fetch(`${BACKEND_URL}/api/room/end`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ room_id: roomId }),
            }).catch(() => {});
            triggerEvaluation();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [roomId, isTimerRunning]);

  // Host / Participant manual discussion timer starter for Friends Mode
  const handleStartTimer = async () => {
    setIsTimerRunning(true);
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: "TIMER_START",
      });
    }
    fetch(`${BACKEND_URL}/api/room/start_timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId }),
    }).catch(() => {});
  };

  const formatCountdown = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // 3.5-Second Idle Silence Timer: keeps debate moving if neither candidate nor agent speaks
  const startIdleSilenceTimer = () => {
    if (idleSilenceTimerRef.current) clearTimeout(idleSilenceTimerRef.current);
    if (!isMeetingActiveRef.current) return;

    idleSilenceTimerRef.current = setTimeout(() => {
      if (!isMeetingActiveRef.current) return;
      if (humanSpeakingRef.current) return;
      if (activeSpeakerIdRef.current) return;
      if (isAiThinkingRef.current) return;

      console.log("Autonomous 3.5s idle trigger: advancing group discussion turn");
      triggerAutonomousAgentTurn();
    }, 3500);
  };

  // Centralized Speech Synthesis & Visual Speaker Tile Highlighting
  const speakAgentText = (arg1: string, arg2?: string, arg3?: string) => {
    if (!isMeetingActiveRef.current) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    let text = "";
    let speakerId = "alpha";
    let speakerName = "Agent Alpha (Aman)";

    // Support both speakAgentText(text, speakerId) and speakAgentText(speakerId, speakerName, text)
    if (arg3 !== undefined) {
      speakerId = arg1;
      speakerName = arg2 || (arg1 === "alpha" ? "Agent Alpha (Aman)" : arg1 === "beta" ? "Agent Beta (Rhea)" : "Agent Gamma (Karan)");
      text = arg3;
    } else if (arg2 !== undefined) {
      if (["alpha", "beta", "gamma", "user"].includes(arg2)) {
        text = arg1;
        speakerId = arg2;
        speakerName = arg2 === "alpha" ? "Agent Alpha (Aman)" : arg2 === "beta" ? "Agent Beta (Rhea)" : "Agent Gamma (Karan)";
      } else {
        speakerId = arg1;
        speakerName = arg1 === "alpha" ? "Agent Alpha (Aman)" : arg1 === "beta" ? "Agent Beta (Rhea)" : "Agent Gamma (Karan)";
        text = arg2;
      }
    } else {
      text = arg1;
    }

    if (idleSilenceTimerRef.current) {
      clearTimeout(idleSilenceTimerRef.current);
      idleSilenceTimerRef.current = null;
    }

    // Clean text of quote characters that break Windows SAPI XML parser
    const cleanText = text
      .replace(/['’]/g, "")
      .replace(/["“”]/g, " ")
      .replace(/&/g, " and ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) return;

    activeUtterance = new SpeechSynthesisUtterance(cleanText);
    if (typeof window !== "undefined") {
      (window as any).__gdUtterance = activeUtterance;
    }
    activeUtterance.volume = 1.0;
    activeUtterance.rate = 1.0;
    activeUtterance.pitch = 1.0;

    const voicesList = window.speechSynthesis.getVoices();
    const effectiveVoices = voicesList && voicesList.length > 0 ? voicesList : voices;
    if (effectiveVoices.length > 0) {
      const enVoices = effectiveVoices.filter((v) => v.lang.startsWith("en"));
      const voicePool = enVoices.length > 0 ? enVoices : effectiveVoices;
      if (speakerId === "beta") {
        const femaleVoice = voicePool.find((v) => /zira|female/i.test(v.name));
        if (femaleVoice) activeUtterance.voice = femaleVoice;
        else if (voicePool[1]) activeUtterance.voice = voicePool[1];
        else activeUtterance.voice = voicePool[0];
      } else {
        const maleVoice = voicePool.find((v) => /david|male/i.test(v.name));
        if (maleVoice) activeUtterance.voice = maleVoice;
        else activeUtterance.voice = voicePool[0];
      }
    }

    // Activate captions and glow tile at the EXACT moment audible speech begins
    activeUtterance.onstart = () => {
      console.log("Speech started for agent:", speakerId);
      if (!isMeetingActiveRef.current) return;
      setActiveSpeakerCaptionName(speakerName);
      setLiveCaption(cleanText);
      setActiveSpeakerId(speakerId);
      activeSpeakerIdRef.current = speakerId;
      setParticipants((prev) =>
        prev.map((p) => (p.id === speakerId ? { ...p, isSpeaking: true } : { ...p, isSpeaking: false }))
      );
      setIsSoundUnlocked(true);
    };

    activeUtterance.onend = () => {
      console.log("Speech finished for agent:", speakerId);
      if (!isMeetingActiveRef.current) return;
      setLiveCaption("");
      setParticipants((prev) => prev.map((p) => ({ ...p, isSpeaking: false })));
      setActiveSpeakerId(null);
      activeSpeakerIdRef.current = null;
      activeUtterance = null;
      if (typeof window !== "undefined") {
        (window as any).__gdUtterance = null;
      }
      if (safetySpeechTimeoutRef.current) clearTimeout(safetySpeechTimeoutRef.current);
      startIdleSilenceTimer();
    };

    activeUtterance.onerror = (e: any) => {
      console.warn("SpeechSynthesis error:", e);
      if (!isMeetingActiveRef.current) return;
      if (e?.error === "interrupted" || e?.error === "canceled") {
        return;
      }
      setLiveCaption("");
      setParticipants((prev) => prev.map((p) => ({ ...p, isSpeaking: false })));
      setActiveSpeakerId(null);
      activeSpeakerIdRef.current = null;
      activeUtterance = null;
      if (typeof window !== "undefined") {
        (window as any).__gdUtterance = null;
      }
      if (safetySpeechTimeoutRef.current) clearTimeout(safetySpeechTimeoutRef.current);
      startIdleSilenceTimer();
    };

    // Safety timeout in case browser drops onend
    const words = cleanText.split(" ").length;
    const estimatedMs = Math.max((words / 2.5) * 1000 + 2000, 4000);
    if (safetySpeechTimeoutRef.current) clearTimeout(safetySpeechTimeoutRef.current);
    safetySpeechTimeoutRef.current = setTimeout(() => {
      if (!isMeetingActiveRef.current) return;
      if (activeSpeakerIdRef.current === speakerId) {
        setLiveCaption("");
        setParticipants((prev) => prev.map((p) => ({ ...p, isSpeaking: false })));
        setActiveSpeakerId(null);
        activeSpeakerIdRef.current = null;
        activeUtterance = null;
        if (typeof window !== "undefined") {
          (window as any).__gdUtterance = null;
        }
        startIdleSilenceTimer();
      }
    }, estimatedMs);

    // Speak reliably without disruptive cancel
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(activeUtterance);
      setIsSoundUnlocked(true);
    } catch (speakErr) {
      console.warn("Error invoking speechSynthesis.speak:", speakErr);
    }
  };

  // Autonomous Kickoff trigger with dynamic, natural, topic-relevant opening
  const triggerKickoff = (force: boolean = false) => {
    if (!isMeetingActiveRef.current) return;
    if (activeAgentIdsRef.current.length === 0) return;
    if (hasDiscussionStartedRef.current && !force) return;

    hasDiscussionStartedRef.current = true;
    setHasDiscussionStarted(true);
    const kickoffSpeakerId = activeAgentIdsRef.current.includes("alpha")
      ? "alpha"
      : activeAgentIdsRef.current[0];
    const persona = AVAILABLE_AI_PERSONAS.find((p) => p.id === kickoffSpeakerId);
    const kickoffSpeakerName = persona ? persona.name : "Agent Alpha (Aman)";

    const cleanTopic = (topic || "Campus Placement").replace(/["“”'‘’]/g, " ").trim();
    const lower = cleanTopic.toLowerCase();

    let openingStatement = "";
    if (lower.includes("ai") && (lower.includes("junior") || lower.includes("engineer") || lower.includes("replace") || lower.includes("code"))) {
      openingStatement = "Hello everyone, lets start todays discussion on whether AI can replace junior engineers or just make them faster. In my view, while AI tools certainly speed up writing code, they cannot replace critical thinking and system design. Human engineers will always remain essential. What are your thoughts on this?";
    } else if (lower.includes("home") || lower.includes("remote") || lower.includes("wfh") || lower.includes("office")) {
      openingStatement = "Hello everyone, lets begin todays discussion on working from home versus working from the office for freshers. While remote work gives flexibility, face to face learning and mentorship in an office are critical in the early years of your career. How do you all see this?";
    } else if (lower.includes("moonlight") || lower.includes("freelanc")) {
      openingStatement = "Hello everyone, lets discuss whether tech companies should allow moonlighting and freelancing. While employees want extra income and skill growth, companies have genuine concerns about confidentiality and burnout. How do you view this balance?";
    } else if (lower.includes("speed") || lower.includes("quality") || lower.includes("delivery")) {
      openingStatement = "Hello everyone, lets discuss speed of delivery versus code quality for freshers. While shipping features quickly is prized by business teams, accumulating tech debt will slow everyone down later. Which one should freshers prioritize first?";
    } else {
      openingStatement = `Hello everyone, lets begin todays discussion on: ${cleanTopic}. While there are strong points on both sides of this debate, we need to focus on practical ground realities rather than just theory. I believe we should examine the real-world impact first. Who would like to share their opening thoughts?`;
    }

    // Only append to transcript if not already the first entry
    if (!liveTranscriptRef.current.some((e) => e.text === openingStatement)) {
      const openEntry = {
        speaker_id: kickoffSpeakerId,
        speaker_name: kickoffSpeakerName,
        text: openingStatement,
      };
      appendTranscript(openEntry);

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "TRANSCRIPT_SYNC",
          entry: openEntry,
        });
      }
    }

    speakAgentText(openingStatement, kickoffSpeakerId);
  };

  useEffect(() => {
    triggerKickoffRef.current = triggerKickoff;
  });

  // Autonomous next agent turn when dead silence exceeds 4.5 seconds
  const triggerAutonomousAgentTurn = async () => {
    if (!isMeetingActiveRef.current || isProcessingTurnRef.current || activeSpeakerIdRef.current) return;
    
    // If no AI agents are active in this room, do not trigger an AI turn
    if (activeAgentIdsRef.current.length === 0) {
      return;
    }

    isProcessingTurnRef.current = true;
    setIsAiThinking(true);
    isAiThinkingRef.current = true;

    try {
      let agentSpeakerId = "";
      let agentSpeakerName = "";
      let agentText = "";

      const lastEntry = liveTranscriptRef.current[liveTranscriptRef.current.length - 1];
      const lastSpeakerId = lastEntry?.speaker_id || "user";

      try {
        const res = await fetch(`${BACKEND_URL}/api/gd/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic || "Campus Placement Discussion",
            transcript: liveTranscriptRef.current,
            last_speaker_id: lastSpeakerId,
            available_agents: activeAgentIdsRef.current,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.text) {
            agentSpeakerId = data.speaker_id;
            agentSpeakerName = data.speaker_name;
            agentText = data.text;
          }
        }
      } catch (apiErr) {
        console.warn("Autonomous API turn fetch error, utilizing fallback agent:", apiErr);
      }

      if (!agentText) {
        const activePool = FALLBACK_AGENTS.filter((a) =>
          activeAgentIdsRef.current.includes(a.id)
        );
        const pool = activePool.length > 0 ? activePool : FALLBACK_AGENTS;
        const fallback = pool[fallbackTurnIndexRef.current % pool.length];
        fallbackTurnIndexRef.current += 1;
        agentSpeakerId = fallback.id;
        agentSpeakerName = fallback.name;
        agentText = fallback.text;
      }

      if (activeAgentIdsRef.current.length > 0 && !activeAgentIdsRef.current.includes(agentSpeakerId)) {
        agentSpeakerId = activeAgentIdsRef.current[fallbackTurnIndexRef.current % activeAgentIdsRef.current.length];
        const persona = AVAILABLE_AI_PERSONAS.find((p) => p.id === agentSpeakerId);
        if (persona) agentSpeakerName = persona.name;
      }

      setIsAiThinking(false);
      isAiThinkingRef.current = false;

      if (!isMeetingActiveRef.current) return;

      const agentEntry = {
        speaker_id: agentSpeakerId,
        speaker_name: agentSpeakerName,
        text: agentText,
      };
      appendTranscript(agentEntry);

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "TRANSCRIPT_SYNC",
          entry: agentEntry,
        });
      }

      speakAgentText(agentSpeakerId, agentSpeakerName, agentText);
    } catch (err) {
      console.error("Autonomous agent turn error:", err);
      setIsAiThinking(false);
      isAiThinkingRef.current = false;
      setActiveSpeakerId(null);
      activeSpeakerIdRef.current = null;
      startIdleSilenceTimer();
    } finally {
      isProcessingTurnRef.current = false;
    }
  };

  // Automatic AI Counter-Argument Trigger when candidate finishes speaking
  const triggerUserSpeechResponse = async (userText: string = "") => {
    if (!isMeetingActiveRef.current || isProcessingTurnRef.current || (activeSpeakerIdRef.current && activeSpeakerIdRef.current !== "user")) return;
    isProcessingTurnRef.current = true;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (idleSilenceTimerRef.current) {
      clearTimeout(idleSilenceTimerRef.current);
      idleSilenceTimerRef.current = null;
    }

    primeAudio();

    try {
      const rawUserText = typeof userText === "string" ? userText.trim() : "";
      const effectiveUserText =
        rawUserText ||
        speechBufferRef.current.trim() ||
        liveCaption.trim() ||
        "I have shared my perspective on this topic.";

      speechBufferRef.current = "";
      setLiveCaption("");

      const currentTranscript = [
        ...liveTranscriptRef.current,
        {
          speaker_id: "user",
          speaker_name: userName || "You",
          text: effectiveUserText,
        },
      ];
      liveTranscriptRef.current = currentTranscript;
      setTranscript(currentTranscript);

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "TRANSCRIPT_SYNC",
          entry: {
            speaker_id: "user",
            speaker_name: userName || "You",
            text: effectiveUserText,
          },
        });
      }

      // If no AI agents are in this room (friends only mode), let peers speak
      if (activeAgentIdsRef.current.length === 0) {
        startIdleSilenceTimer();
        return;
      }

      setIsAiThinking(true);
      isAiThinkingRef.current = true;

      let agentSpeakerId = "";
      let agentSpeakerName = "";
      let agentText = "";

      try {
        const res = await fetch(`${BACKEND_URL}/api/gd/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic || "Campus Placement Discussion",
            transcript: currentTranscript,
            last_speaker_id: "user",
            available_agents: activeAgentIdsRef.current,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.text) {
            agentSpeakerId = data.speaker_id;
            agentSpeakerName = data.speaker_name;
            agentText = data.text;
          }
        }
      } catch (fetchErr) {
        console.warn("Backend /api/gd/respond error, executing fallback agent:", fetchErr);
      }

      if (!agentText) {
        const activePool = FALLBACK_AGENTS.filter((a) =>
          activeAgentIdsRef.current.includes(a.id)
        );
        const pool = activePool.length > 0 ? activePool : FALLBACK_AGENTS;
        const fallback = pool[fallbackTurnIndexRef.current % pool.length];
        fallbackTurnIndexRef.current += 1;
        agentSpeakerId = fallback.id;
        agentSpeakerName = fallback.name;
        agentText = fallback.text;
      }

      if (activeAgentIdsRef.current.length > 0 && !activeAgentIdsRef.current.includes(agentSpeakerId)) {
        agentSpeakerId = activeAgentIdsRef.current[fallbackTurnIndexRef.current % activeAgentIdsRef.current.length];
        const persona = AVAILABLE_AI_PERSONAS.find((p) => p.id === agentSpeakerId);
        if (persona) agentSpeakerName = persona.name;
      }

      setIsAiThinking(false);
      isAiThinkingRef.current = false;

      if (!isMeetingActiveRef.current) return;

      const agentEntry = {
        speaker_id: agentSpeakerId,
        speaker_name: agentSpeakerName,
        text: agentText,
      };
      appendTranscript(agentEntry);

      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "TRANSCRIPT_SYNC",
          entry: agentEntry,
        });
      }

      speakAgentText(agentSpeakerId, agentSpeakerName, agentText);
    } catch (err) {
      console.error("User turn response error:", err);
      setIsAiThinking(false);
      isAiThinkingRef.current = false;
      setActiveSpeakerId(null);
      activeSpeakerIdRef.current = null;
      startIdleSilenceTimer();
    } finally {
      isProcessingTurnRef.current = false;
    }
  };

  // Backwards compatibility aliases
  const triggerAgentResponse = triggerUserSpeechResponse;
  const triggerAiSpeech = speakAgentText;
  const triggerUserTurnHandoff = triggerUserSpeechResponse;

  // Trigger Placement Evaluation Scorecard
  const triggerEvaluation = async () => {
    isMeetingActiveRef.current = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
    if (idleSilenceTimerRef.current) clearTimeout(idleSilenceTimerRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    stopListening();
    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
      setWebcamStream(null);
    }

    // Flush any pending speech from buffer or live caption before calling evaluate
    const pendingSpeech = (speechBufferRef.current || liveCaption).trim();
    if (pendingSpeech && pendingSpeech.length > 3) {
      appendTranscript({
        speaker_id: "user",
        speaker_name: userName,
        text: pendingSpeech,
      });
      speechBufferRef.current = "";
    }

    if (liveTranscriptRef.current.length === 0) {
      appendTranscript({
        speaker_id: "user",
        speaker_name: userName,
        text: "Candidate observed the group discussion in silence without unmuting.",
      });
    }

    console.log("Submitting actual transcript:", liveTranscriptRef.current);

    const payload = {
      topic,
      duration_minutes: durationMinutes,
      transcript: liveTranscriptRef.current,
    };

    setIsScorecardOpen(true);
    setIsEvaluating(true);

    try {
      const evalController = new AbortController();
      const evalTimeoutId = setTimeout(() => evalController.abort(), 30000); // 30s max wait
      const response = await fetch(`${BACKEND_URL}/api/gd/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: evalController.signal,
      });
      clearTimeout(evalTimeoutId);

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const evalData: ScorecardData = await response.json();
      setScorecardData(evalData);
    } catch (err) {
      console.warn("Judge evaluation API error, utilizing intelligent fallback report:", err);
      const userTurns = liveTranscriptRef.current.filter(
        (t) => t.speaker_id === "user" || t.speaker_name === userName
      ).length;
      const userQuotes = liveTranscriptRef.current
        .filter((t) => t.speaker_id === "user" || t.speaker_name === userName)
        .map((t) => t.text)
        .filter((t) => !t.includes("in silence"))
        .slice(0, 3);

      const fallbackReport: ScorecardData = {
        overall_score: userTurns >= 3 ? 8.8 : userTurns === 2 ? 8.2 : userTurns === 1 ? 7.0 : 4.8,
        verdict: userTurns >= 2 ? "Clear Hire" : userTurns === 1 ? "Borderline" : "Needs Improvement",
        rubric_scores: {
          articulation: userTurns >= 2 ? 8 : 5,
          collaboration: userTurns >= 2 ? 9 : 6,
          critical_thinking: userTurns >= 2 ? 8 : 6,
          time_management: userTurns >= 2 ? 8 : 5,
        },
        participant_evaluations: [
          {
            speaker_id: "user",
            name: userName,
            total_turns: userTurns,
            strengths: [
              userTurns > 0
                ? `Actively contributed on '${topic.slice(0, 35)}...': "${userQuotes[0] || 'Topical viewpoint'}"`
                : "Observed discussion flow without creating conversational noise.",
              "Maintained professional composure and respectful engagement.",
            ],
            areas_for_improvement: [
              userTurns < 2
                ? "Increase speaking frequency: at least 2-3 substantive contributions are needed in corporate placement rounds."
                : "Support arguments with measurable industry data or unit metrics.",
              "Use smooth conversational bridges to interject: 'Building on Aman's point, we must also consider...'",
            ],
            key_quotes_analyzed:
              userQuotes.length > 0
                ? userQuotes
                : ["No active verbal statements recorded during this session."],
          },
        ],
        placement_readiness_tips: [
          "Enter early: The first candidate who frames the discussion parameters receives higher evaluation marks.",
          "Acknowledge & Pivot: Use 'I agree with [Peer]'s point on X, and to add a layer of depth, we must examine Y.'",
          "Quantify impact: In competitive placement GDs, citing unit metrics elevates candidate percentile.",
        ],
      };
      setScorecardData(fallbackReport);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Candidate User Speech Completion Handoff
  const handleUserSpeechComplete = () => {
    if (!isMeetingActiveRef.current) return;
    const userSpeech = (speechBufferRef.current || liveCaption).trim();
    broadcastSpeechToBackend(userSpeech, false);
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: "PEER_SPEAKING_STREAM",
        userId: myId,
        userName: userName,
        transcript: userSpeech,
        isSpeaking: false,
      });
    }
    if (userSpeech.length > 0) {
      triggerUserSpeechResponse(userSpeech);
    }
  };

  // Continuous Speech Recognition with Live Captions & 1.4s Silence Detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Web Speech API is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      isRecognizingRef.current = true;
    };

    recognition.onresult = (event: any) => {
      // Acoustic echo guard: ignore speaker voice captured by microphone while an AI agent is speaking
      if (activeSpeakerIdRef.current && activeSpeakerIdRef.current !== "user") {
        return;
      }

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const finalWord = event.results[i][0].transcript;
          speechBufferRef.current += " " + finalWord;
          setLiveCaption(finalWord);
        } else {
          interim += event.results[i][0].transcript;
          setLiveCaption(interim);
        }
      }

      setActiveSpeakerCaptionName(userName);
      const currentSpeechText = (speechBufferRef.current + " " + interim).trim();
      if (currentSpeechText) {
        broadcastSpeechToBackend(currentSpeechText, true);
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: "PEER_SPEAKING_STREAM",
            userId: myId,
            userName: userName,
            transcript: currentSpeechText,
            isSpeaking: true,
          });
        }
      }
      // Keep green glow active while speech is being detected
      setUserSpeaking(true);
      userSpeakingRef.current = true;
      setParticipants((prev) =>
        prev.map((p) => (p.id === "user" ? { ...p, isSpeaking: true } : p))
      );

      // Cancel idle/startup timers while user speaks
      if (idleSilenceTimerRef.current) clearTimeout(idleSilenceTimerRef.current);
      if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
      hasDiscussionStartedRef.current = true;

      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      // 3.0s continuous silence after user speech: gives candidate ample time to pause/think without interruption
      silenceTimeoutRef.current = setTimeout(() => {
        setUserSpeaking(false);
        userSpeakingRef.current = false;
        setParticipants((prev) =>
          prev.map((p) => (p.id === "user" ? { ...p, isSpeaking: false } : p))
        );
        handleUserSpeechComplete();
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      if (
        event.error === "network" ||
        event.error === "no-speech" ||
        event.error === "audio-capture"
      ) {
        // Auto-restart recognition after a short backoff if meeting is active and mic is enabled
        setTimeout(() => {
          if (isMeetingActiveRef.current && isMicActiveRef.current) {
            try {
              recognition.abort();
              recognition.start();
              isRecognizingRef.current = true;
            } catch (err) {}
          }
        }, 1000);
      }
      setUserSpeaking(false);
      userSpeakingRef.current = false;
      setParticipants((prev) =>
        prev.map((p) => (p.id === "user" ? { ...p, isSpeaking: false } : p))
      );
      startIdleSilenceTimer();
    };

    // Auto-restart if browser stops recognition unexpectedly
    recognition.onend = () => {
      isRecognizingRef.current = false;
      if (isMeetingActiveRef.current && isMicActiveRef.current) {
        setTimeout(() => {
          if (isMeetingActiveRef.current && isMicActiveRef.current && !isRecognizingRef.current) {
            try {
              recognition.start();
              isRecognizingRef.current = true;
            } catch (err) {
              console.warn("Speech recognition restart catch:", err);
            }
          }
        }, 200);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      } catch {
        // safe
      }
    };
  }, [userName]);

  // AudioContext volume analysis with 1.5s Silence Handoff to Agent
  const startListening = async () => {
    setIsMicActive(true);
    isMicActiveRef.current = true;
    isMutedRef.current = false;
    speechBufferRef.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;

        let userHasSpoken = false;

        const checkVolume = () => {
          if (!analyserRef.current || !isMicActiveRef.current || !isMeetingActiveRef.current) return;

          // Acoustic echo loopback protection: If an AI agent is actively speaking, do not let speaker sound trigger candidate speech
          if (activeSpeakerIdRef.current && activeSpeakerIdRef.current !== "user") {
            animationFrameRef.current = requestAnimationFrame(checkVolume);
            return;
          }

          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const averageVolume = sum / dataArray.length;

          // Threshold 35: actual speaking volume (ambient room noise / laptop fan is typically 10-25)
          if (averageVolume > 35) {
            setUserSpeaking(true);
            userSpeakingRef.current = true;
            setActiveSpeakerId("user");
            activeSpeakerIdRef.current = "user";
            setParticipants((prev) =>
              prev.map((p) => (p.id === "user" ? { ...p, isSpeaking: true } : { ...p, isSpeaking: false }))
            );
            userHasSpoken = true;

            // Clear kickoff timer and idle silence timer if user speaks first
            if (startupTimerRef.current) {
              clearTimeout(startupTimerRef.current);
              startupTimerRef.current = null;
            }
            hasDiscussionStartedRef.current = true;
            if (idleSilenceTimerRef.current) clearTimeout(idleSilenceTimerRef.current);

            // Debounce silence timer on user voice pause (3.0s continuous silence before completing turn)
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = setTimeout(() => {
              setUserSpeaking(false);
              userSpeakingRef.current = false;
              setActiveSpeakerId(null);
              activeSpeakerIdRef.current = null;
              setParticipants((prev) => prev.map((p) => ({ ...p, isSpeaking: false })));

              if (userHasSpoken && isMeetingActiveRef.current) {
                userHasSpoken = false;
                handleUserSpeechComplete();
              }
            }, 3000);
          }

          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      }
    } catch (err) {
      console.warn("Microphone access for volume analysis:", err);
    }

    if (recognitionRef.current && !isRecognizingRef.current) {
      try {
        recognitionRef.current.start();
        isRecognizingRef.current = true;
      } catch {
        // harmless
      }
    }
  };

  const stopListening = () => {
    setIsMicActive(false);
    isMicActiveRef.current = false;
    isMutedRef.current = true;
    setUserSpeaking(false);
    userSpeakingRef.current = false;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    if (recognitionRef.current && isRecognizingRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // harmless
      }
      isRecognizingRef.current = false;
    }
  };

  // Immediate and complete cleanup on unmount
  useEffect(() => {
    return () => {
      isMeetingActiveRef.current = false;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopListening();
      if (captionClearTimerRef.current) clearTimeout(captionClearTimerRef.current);
      if (safetySpeechTimeoutRef.current) clearTimeout(safetySpeechTimeoutRef.current);
      if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
      if (idleSilenceTimerRef.current) clearTimeout(idleSilenceTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    };
  }, []);

  // Autonomous Kickoff on Room Entry: Agent Alpha takes initiative 700ms after entry
  useEffect(() => {
    unlockAudio();

    // Ensure mic actively starts capturing speech on entry
    startListening().catch((err) => {
      console.log("Mic auto-activation deferred until user gesture:", err);
    });

    // Autonomous Kickoff: Wait 3 seconds so the candidate/peers have opportunity to open.
    // If nobody speaks after 3 seconds, Agent Alpha takes initiative.
    const autoKickoff = setTimeout(() => {
      if (!isMeetingActiveRef.current) return;
      if (!hasDiscussionStartedRef.current && activeAgentIdsRef.current.length > 0) {
        if (triggerKickoffRef.current) {
          triggerKickoffRef.current();
        }
      }
    }, 3000);
    startupTimerRef.current = autoKickoff;

    return () => {
      clearTimeout(autoKickoff);
      if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
      if (idleSilenceTimerRef.current) clearTimeout(idleSilenceTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    };
  }, [topic]);

  // Click Handler for Mic Button
  const toggleMic = () => {
    unlockAudio();
    setIsMicActive((prev) => {
      const nextState = !prev;
      isMicActiveRef.current = nextState;
      isMutedRef.current = !nextState;

      setParticipants((prevList) =>
        prevList.map((p) => (p.id === "user" ? { ...p, isMuted: !nextState } : p))
      );

      if (nextState) {
        // Turn Mic ON: start speech recognition and audio tracks
        try {
          recognitionRef.current?.start();
          isRecognizingRef.current = true;
        } catch (e) {}
      } else {
        // Turn Mic OFF: stop speech recognition immediately
        try {
          recognitionRef.current?.stop();
        } catch (e) {}
        isRecognizingRef.current = false;
        setUserSpeaking(false);
        userSpeakingRef.current = false;

        const userSpeech = (speechBufferRef.current || liveCaption).trim();
        if (isMeetingActiveRef.current && (userSpeech.length > 2 || userSpeaking)) {
          handleUserSpeechComplete();
        } else {
          startIdleSilenceTimer();
        }
      }
      return nextState;
    });
  };
  const handleToggleMic = toggleMic;

  const handleToggleCamera = async () => {
    if (!isCameraOff) {
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
        setWebcamStream(null);
      }
      setIsCameraOff(true);
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: false,
          });
          setWebcamStream(stream);
          setIsCameraOff(false);
        } else {
          setIsCameraOff(false);
        }
      } catch (err) {
        console.warn("Camera access denied or unavailable:", err);
        setIsCameraOff(true);
      }
    }
  };

  const handleEndCall = () => {
    if (!hasTriggeredEvalRef.current) {
      hasTriggeredEvalRef.current = true;
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "SESSION_END",
        });
      }
      fetch(`${BACKEND_URL}/api/room/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      }).catch(() => {});
      triggerEvaluation();
    }
  };

  // Participant counts & limits (up to 5 participants + 1 observer judge)
  const totalParticipants = 1 + connectedPeers.length + activeAgentIds.length;
  const canAddMoreAgents = totalParticipants < 5 && activeAgentIds.length < AVAILABLE_AI_PERSONAS.length;
  const totalTiles = totalParticipants + (totalParticipants < 4 ? 1 : 0);

  const gridClass =
    totalTiles <= 2
      ? "grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full h-full max-w-7xl"
      : totalTiles <= 4
      ? "grid grid-cols-1 sm:grid-cols-2 grid-rows-2 gap-3 sm:gap-4 w-full h-full max-w-7xl"
      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 w-full h-full max-w-7xl";

  return (
    <div
      onClick={unlockAudio}
      className="flex flex-col h-screen w-screen bg-[#111439] text-[#F8F8F9] overflow-hidden select-none relative"
    >
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#B2B5E0]/20 bg-[#151945]/90 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#31EC56] animate-pulse" />
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#F8F8F9]">
              GD Arena
            </h1>
          </div>
          <span className="text-[#B2B5E0]/40">|</span>
          <span className="text-xs sm:text-sm font-medium text-[#B2B5E0] truncate max-w-[160px] sm:max-w-xs md:max-w-md lg:max-w-lg">
            {topic}
          </span>
          <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EE72F8]/15 text-[#EE72F8] border border-[#EE72F8]/30">
            {connectedPeers.length > 0
              ? `Multiplayer (${connectedPeers.length} Peer${connectedPeers.length > 1 ? "s" : ""})`
              : mode === "agents"
              ? "Practice with AI"
              : "Practice with Friends"}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[#B2B5E0]">
          {/* Status Badge: Waiting in friends mode */}
          {mode === "friends" && !isTimerRunning && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>{isHost ? "Waiting for participants..." : "Waiting for host to start..."}</span>
            </span>
          )}

          {/* Start Discussion Button in friends mode (Host Only) */}
          {mode === "friends" && !isTimerRunning && isHost && (
            <button
              type="button"
              onClick={handleStartTimer}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-[#31EC56] hover:bg-[#28c746] text-[#111439] shadow-lg shadow-[#31EC56]/20 transition-all cursor-pointer"
              title="Click to start the discussion timer for all participants"
            >
              <span>▶ Start Discussion</span>
            </button>
          )}

          {/* Test Audio Button */}
          <button
            type="button"
            onClick={testAudioOutput}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#1B2054] hover:bg-[#23296B] border border-[#31EC56]/50 text-[#31EC56] shadow-sm transition-all cursor-pointer"
            title="Click to test browser speech audio output"
          >
            <span>🔊 Test Audio</span>
          </button>

          {/* In-Arena "Add AI Agent" Button & Scrollable Dropdown (Top header shows only if active agents already present; empty grid card hosts initial prompt) */}
          {canAddMoreAgents && (
            <div className="relative">
              {activeAgentIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAddAgentDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-[#EE72F8]/20 to-[#31EC56]/20 border border-[#EE72F8]/50 text-[#F8F8F9] hover:border-[#31EC56] transition-all cursor-pointer shadow-sm hover:shadow-[#EE72F8]/20"
                  title="Add an AI Persona to the discussion"
                >
                  <span className="text-[#31EC56] font-bold">+</span>
                  <span>Add AI Agent</span>
                  <svg
                    className={`w-3.5 h-3.5 text-[#B2B5E0] transition-transform duration-200 ${
                      isAddAgentDropdownOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Scrollable Persona Dropdown Menu */}
              {isAddAgentDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsAddAgentDropdownOpen(false)}
                  />
                  <div className="fixed sm:absolute right-4 sm:right-0 top-16 sm:top-full mt-2 w-80 rounded-2xl bg-[#151945]/98 border border-[#B2B5E0]/30 shadow-2xl backdrop-blur-xl p-3 z-50 animate-fade-in max-h-96 overflow-y-auto">
                    <div className="px-2 pb-2.5 mb-2 border-b border-[#B2B5E0]/20 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#F8F8F9] uppercase tracking-wider">
                        Add AI Persona ({AVAILABLE_AI_PERSONAS.length - activeAgentIds.length} Available)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddAgentDropdownOpen(false)}
                        className="text-xs text-[#B2B5E0] hover:text-white p-1"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-2">
                      {AVAILABLE_AI_PERSONAS.map((agent) => {
                        const isAlreadyAdded = activeAgentIds.includes(agent.id);
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            disabled={isAlreadyAdded}
                            onClick={() => handleAddAgent(agent.id)}
                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                              isAlreadyAdded
                                ? "opacity-40 cursor-not-allowed bg-[#111439]/50 border-white/5"
                                : "cursor-pointer bg-[#1B2054]/90 border-[#B2B5E0]/20 hover:border-[#31EC56] hover:bg-[#1B2054] hover:shadow-lg"
                            }`}
                          >
                            <div className="w-10 h-10 rounded-xl bg-[#111439] border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                              <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${agent.avatarSeed}&backgroundColor=111439`}
                                alt={agent.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-bold text-[#F8F8F9] truncate">
                                  {agent.name}
                                </span>
                                {isAlreadyAdded ? (
                                  <span className="text-[10px] text-[#31EC56] font-semibold bg-[#31EC56]/15 px-1.5 py-0.5 rounded">
                                    In Arena
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-[#EE72F8] hover:underline">
                                    + Add
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-semibold text-[#B2B5E0] mt-0.5">
                                {agent.role}
                              </p>
                              <p className="text-[10px] text-[#B2B5E0]/70 mt-1 leading-snug">
                                {agent.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Sound Active Unlock Button */}
          <button
            type="button"
            onClick={unlockAudio}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              isSoundUnlocked
                ? "bg-[#31EC56]/15 border-[#31EC56]/40 text-[#31EC56]"
                : "bg-[#EE72F8]/20 border-[#EE72F8]/50 text-[#EE72F8] animate-pulse"
            }`}
            title="Click to ensure browser speech synthesis audio permissions are active"
          >
            <span>{isSoundUnlocked ? "🔊 Sound Active" : "🔈 Click to Enable Sound"}</span>
          </button>

          {/* Room ID Badge with click to copy */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="hidden sm:flex items-center gap-1.5 bg-[#1B2054] hover:bg-[#23296B] px-2.5 py-1 rounded-full border border-[#B2B5E0]/30 text-xs transition-colors cursor-pointer"
            title="Click to copy invite link"
          >
            <span className="text-[#B2B5E0]/70 font-mono">Room:</span>
            <span className="font-mono text-[#31EC56] font-semibold">{roomId}</span>
            <span className="text-[10px] text-[#B2B5E0]">
              {copiedLink ? "✓" : "📋"}
            </span>
          </button>

          {/* Participant count */}
          <div className="flex items-center gap-1.5 bg-[#1B2054] px-2.5 py-1 rounded-full border border-[#B2B5E0]/30 text-xs">
            <svg className="w-3.5 h-3.5 text-[#B2B5E0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="font-medium text-[#F8F8F9]">
              {totalParticipants} / 5
            </span>
          </div>

          {/* Time Remaining Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono font-semibold ${
              secondsRemaining < 60
                ? "bg-[#EF036C]/20 border-[#EF036C] text-[#EF036C] animate-pulse"
                : "bg-[#1B2054] border-[#B2B5E0]/30 text-[#F8F8F9]"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatCountdown(secondsRemaining)}</span>
          </div>
        </div>
      </header>

      {/* Visible Thinking Badge: AI Teammate is thinking and responding... */}
      {isAiThinking && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-30 flex items-center gap-2.5 px-5 py-2 rounded-full bg-[#1B2054]/95 border border-[#EE72F8]/60 shadow-2xl backdrop-blur-md animate-pulse">
          <span className="w-2.5 h-2.5 rounded-full bg-[#EE72F8] animate-ping" />
          <span className="text-xs sm:text-sm font-semibold text-[#EE72F8]">
            AI Teammate is thinking and responding...
          </span>
        </div>
      )}

      {/* Main Dynamic Video Tiles Grid (Supporting Candidates, Connected Peers & Added Agents) */}
      <main className="relative flex-1 p-3 sm:p-4 md:p-5 flex items-center justify-center overflow-hidden">
        <div className={gridClass}>
          {/* Tile 1: You (Local Candidate) */}
          <VideoTile
            name={userName}
            role="Candidate (You)"
            isHuman={true}
            isSpeaking={userSpeaking}
            isMuted={!isMicActive}
            stream={webcamStream}
            isCameraOff={isCameraOff}
            isHandRaised={isHandRaised}
            style={{
              border: userSpeaking ? "3px solid #31EC56" : "1px solid rgba(255,255,255,0.1)",
              boxShadow: userSpeaking ? "0 0 25px rgba(49,236,86,0.6)" : "none",
            }}
          />

          {/* Connected Peer Friend Tiles */}
          {connectedPeers.map((peer) => (
            <VideoTile
              key={peer.id}
              name={peer.name}
              role="Friend (Peer Candidate)"
              isHuman={true}
              isSpeaking={peer.isSpeaking}
              isMuted={peer.isMuted}
              isHandRaised={peer.isHandRaised}
              style={{
                border: peer.isSpeaking ? "3px solid #31EC56" : "1px solid rgba(255,255,255,0.1)",
                boxShadow: peer.isSpeaking ? "0 0 25px rgba(49,236,86,0.6)" : "none",
              }}
            />
          ))}

          {/* Active AI Agent Tiles */}
          {activeAgentIds.map((agentId) => {
            const persona = AVAILABLE_AI_PERSONAS.find((p) => p.id === agentId);
            if (!persona) return null;
            const isAgentSpeaking =
              activeSpeakerId === agentId ||
              (participants.find((p) => p.id === agentId)?.isSpeaking ?? false);

            return (
              <VideoTile
                key={agentId}
                name={persona.name}
                role={persona.role}
                isHuman={false}
                isSpeaking={isAgentSpeaking}
                isMuted={false}
                style={{
                  border: isAgentSpeaking ? "3px solid #31EC56" : "1px solid rgba(255,255,255,0.1)",
                  boxShadow: isAgentSpeaking ? "0 0 25px rgba(49,236,86,0.6)" : "none",
                }}
              />
            );
          })}

          {/* Interactive Open Seat Tile when total participants < 4 */}
          {totalParticipants < 4 && (
            <div className="relative rounded-2xl bg-[#151945]/60 border-2 border-dashed border-[#B2B5E0]/30 hover:border-[#31EC56]/50 transition-all flex flex-col items-center justify-center p-4 sm:p-6 text-center group">
              <div className="w-12 h-12 rounded-2xl bg-[#1B2054] border border-[#B2B5E0]/30 flex items-center justify-center text-[#B2B5E0] group-hover:text-[#31EC56] group-hover:border-[#31EC56] transition-all mb-2.5 shadow-inner">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h4 className="text-sm font-bold text-[#F8F8F9] mb-1">
                {activeAgentIds.length === 0 ? "Practice with Friends Arena" : "Open Discussion Seat"}
              </h4>
              <p className="text-xs text-[#B2B5E0] max-w-xs mb-3">
                {activeAgentIds.length === 0
                  ? "Debate with peers in real-time, or add an AI Persona to start challenging your arguments."
                  : "Invite a batchmate to join, or add another AI Persona to the discussion."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {canAddMoreAgents && (
                  <button
                    type="button"
                    onClick={() => setIsAddAgentDropdownOpen(true)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeAgentIds.length === 0
                        ? "bg-gradient-to-r from-[#EE72F8] to-[#31EC56] text-zinc-950 shadow-lg shadow-[#EE72F8]/25 animate-pulse hover:opacity-95"
                        : "bg-gradient-to-r from-[#EE72F8] to-[#31EC56] text-zinc-950 shadow-md hover:opacity-95"
                    }`}
                  >
                    {activeAgentIds.length === 0 ? "Not enough friends? Add AI Agent +" : "+ Add AI Agent"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#1B2054] border border-[#B2B5E0]/30 text-[#B2B5E0] hover:text-white transition-all cursor-pointer"
                >
                  {copiedLink ? "✓ Link Copied" : "📋 Copy Room Link"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Closed Captions Overlay */}
        {isCaptionsOn && liveCaption && (
          <div className="absolute bottom-6 z-30 max-w-2xl px-5 py-2.5 rounded-xl bg-[#111439]/95 backdrop-blur-md border border-[#B2B5E0]/40 shadow-2xl text-center pointer-events-none transition-all duration-200">
            <span className="text-[#31EC56] font-semibold mr-2">{activeSpeakerCaptionName}:</span>
            <span className="text-[#F8F8F9] text-sm sm:text-base font-normal">
              "{liveCaption}"
            </span>
          </div>
        )}
      </main>

      {/* Floating Bottom Controls (Standard Google Meet Controls) */}
      <footer className="relative shrink-0 pb-3 flex flex-col items-center gap-2">
        <Controls
          isMuted={!isMicActive}
          toggleMic={toggleMic}
          isCameraOff={isCameraOff}
          toggleCamera={handleToggleCamera}
          isHandRaised={isHandRaised}
          toggleHandRaise={handleToggleHandRaise}
          isCaptionsOn={isCaptionsOn}
          toggleCaptions={() => setIsCaptionsOn((p) => !p)}
          onLeave={handleEndCall}
        />
      </footer>

      {/* Judge Scorecard Modal */}
      <ScorecardModal
        isOpen={isScorecardOpen}
        isLoading={isEvaluating}
        data={scorecardData}
        topic={topic}
        onClose={() => {
          setIsScorecardOpen(false);
          hasTriggeredEvalRef.current = false;
          onLeave();
        }}
        onPracticeAgain={() => {
          setIsScorecardOpen(false);
          hasTriggeredEvalRef.current = false;
          onLeave();
        }}
      />
    </div>
  );
};

export default GDMeetingRoom;
