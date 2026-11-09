import random
from typing import List, Any
import logging

logger = logging.getLogger(__name__)

AGENTS = ["alpha", "beta", "gamma"]


def select_next_speaker(transcript: List[Any], last_speaker_id: str) -> str:
    """
    Selects the next AI agent speaker in the group discussion.
    - Strictly prevents the same agent from speaking twice consecutively.
    - If user/candidate just spoke, dynamically rotates between alpha (Aman), beta (Rhea), and gamma (Karan).
    - Accurately tracks last_speaker_id from request payload.
    - Balances conversational turns while avoiding deterministic monotony.
    """
    clean_last_speaker = str(last_speaker_id or "").strip().lower()

    # Identify the last agent in the transcript if last_speaker_id is not an agent
    last_agent_in_transcript = None
    for entry in reversed(transcript or []):
        if isinstance(entry, dict):
            spk = str(entry.get("speaker_id") or "").lower()
            if spk in AGENTS:
                last_agent_in_transcript = spk
                break

    # Determine eligible agents (must NEVER be the agent who just spoke)
    if clean_last_speaker in AGENTS:
        eligible_agents = [agent for agent in AGENTS if agent != clean_last_speaker]
    elif last_agent_in_transcript:
        eligible_agents = [agent for agent in AGENTS if agent != last_agent_in_transcript]
    else:
        eligible_agents = list(AGENTS)

    # Count turns taken by each agent across entire transcript
    turn_counts = {agent: 0 for agent in AGENTS}
    last_spoken_index = {agent: -1 for agent in AGENTS}

    for idx, entry in enumerate(transcript or []):
        spk = None
        if isinstance(entry, dict):
            spk = str(entry.get("speaker_id") or "").lower()
            if not spk or spk not in AGENTS:
                name = str(entry.get("speaker_name") or entry.get("name") or "").lower()
                if "aman" in name or "alpha" in name:
                    spk = "alpha"
                elif "rhea" in name or "beta" in name:
                    spk = "beta"
                elif "karan" in name or "gamma" in name:
                    spk = "gamma"

        if spk and spk in turn_counts:
            turn_counts[spk] += 1
            last_spoken_index[spk] = idx

    # Filter to eligible agents only
    eligible_counts = {agent: turn_counts[agent] for agent in eligible_agents}
    min_count = min(eligible_counts.values())

    # Tied candidates with least turns
    tied_candidates = [agent for agent in eligible_agents if eligible_counts[agent] == min_count]

    # If only one candidate has the minimum turns, choose them
    if len(tied_candidates) == 1:
        return tied_candidates[0]

    # If multiple candidates tied (e.g. at the beginning or after equal turns),
    # pick randomly among the tied eligible candidates so different agents respond!
    if all(turn_counts[agent] == 0 for agent in eligible_agents):
        return random.choice(eligible_agents)

    # Break tie by selecting candidate who spoke least recently
    tied_candidates.sort(key=lambda a: last_spoken_index[a])
    return tied_candidates[0]
