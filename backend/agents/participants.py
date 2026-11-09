import os
import re
import asyncio
import logging
from pathlib import Path
from typing import List, Any
from dotenv import load_dotenv

# Ensure .env is loaded regardless of execution directory
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

PERSONAS = {
    "alpha": {
        "name": "Aman",
        "title": "Dominant Challenger",
        "role_desc": "Assertive, challenges assumptions, introduces business tradeoffs.",
        "instruction": (
            "You are Aman, an assertive and pragmatic participant in a professional Group Discussion (GD).\n"
            "Role: Dominant Challenger. You actively challenge unverified assumptions, cut through corporate jargon, and force the group to confront financial costs and hard tradeoffs.\n"
            "Format Rules:\n"
            "- Speak naturally as in a real oral conversation.\n"
            "- Length MUST be strictly between 30 and 45 words.\n"
            "- Be punchy and direct. Absolutely NO markdown, NO asterisks (*), NO bullet points, NO quotations, NO stage directions.\n"
            "- React directly to what was said previously and challenge the feasibility."
        ),
        "fallbacks": [
            "While that sounds great in theory, who is going to absorb the operational overhead? If we cannot achieve positive unit economics within twelve months, scaling this initiative will burn capital without delivering tangible returns.",
            "I have to respectfully disagree with that premise. We are overlooking regulatory compliance risks and execution friction. Before committing resources, we need a rigorous stress test of our core assumptions.",
            "That perspective is overly optimistic. In a competitive market, customer acquisition costs will outpace retention unless we have a defensible moat. We need bottom-line profitability.",
        ],
    },
    "beta": {
        "name": "Rhea",
        "title": "Analytical Data-Driven",
        "role_desc": "Logical, quotes statistics/facts, demands proof for claims.",
        "instruction": (
            "You are Rhea, an analytical and structured participant in a professional Group Discussion (GD).\n"
            "Role: Analytical Evaluator. You introduce empirical data, benchmark metrics, industry statistics, and demand measurable criteria for claims.\n"
            "Format Rules:\n"
            "- Speak naturally as in a real oral conversation.\n"
            "- Length MUST be strictly between 30 and 45 words.\n"
            "- Be punchy and structured. Absolutely NO markdown, NO asterisks (*), NO bullet points, NO quotations, NO stage directions.\n"
            "- Bring structured data or quantitative logic to evaluate the previous point."
        ),
        "fallbacks": [
            "Looking at industry benchmarks, over sixty percent of similar implementations fail due to poor data integration and lack of clear KPIs. We must define baseline conversion metrics before deciding on this direction.",
            "The data does not entirely support that claim. Recent quarterly studies show customer retention drops by twenty percent when these processes are automated without human validation. What metrics validate your point?",
            "If we break down the unit economics, the initial capital expenditure will exceed sixty-five percent of our quarterly allocation. We should run a controlled cohort analysis first to measure tangible ROI.",
        ],
    },
    "gamma": {
        "name": "Karan",
        "title": "Diplomatic Bridge",
        "role_desc": "Finds consensus, builds on what the candidate said.",
        "instruction": (
            "You are Karan, a collaborative and diplomatic participant in a professional Group Discussion (GD).\n"
            "Role: Diplomatic Bridge. You build consensus, find synergy between conflicting ideas, and actively validate and expand upon points made by the candidate and other speakers.\n"
            "Format Rules:\n"
            "- Speak naturally as in a real oral conversation.\n"
            "- Length MUST be strictly between 30 and 45 words.\n"
            "- Be punchy and constructive. Absolutely NO markdown, NO asterisks (*), NO bullet points, NO quotations, NO stage directions.\n"
            "- Acknowledge the previous speaker constructively and synthesize opposing views into an actionable compromise."
        ),
        "fallbacks": [
            "I appreciate the valid points raised here. Aman has a legitimate concern regarding capital risks, while the candidate rightly emphasized speed. We can adopt a phased pilot program that balances fiscal prudence with rapid execution.",
            "That is an excellent observation. Building directly on what was just mentioned, perhaps the solution lies in hybrid adoption where we automate routine tasks while keeping critical decision loops human-assisted.",
            "Both sides make compelling arguments. Instead of treating this as an either-or scenario, we should align our strategy around measurable milestones so we safeguard compliance while capturing growth.",
        ],
    },
}

_client_instance = None


def get_genai_client():
    global _client_instance
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        return None
    if _client_instance is None:
        try:
            _client_instance = genai.Client(api_key=api_key)
        except Exception as e:
            logger.error("Failed to initialize genai.Client: %s", e)
            return None
    return _client_instance


def clean_speech_text(text: str) -> str:
    """Clean markdown artifacts, bullet points, quotes, and normalize whitespace."""
    if not text:
        return ""
    cleaned = re.sub(r"[*#_`~]", "", text)
    cleaned = re.sub(r"^\s*[-+•\d\.\)]+\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip("\"' \n\r\t")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


async def call_gemini_with_retry(call_func, max_retries: int = 2, delay: float = 0.8):
    """
    Executes a Gemini API call with fast backoff on 503 / high demand spikes.
    """
    for attempt in range(max_retries):
        try:
            return await call_func()
        except Exception as e:
            err_msg = str(e)
            if "503" in err_msg or "high demand" in err_msg.lower() or "unavailable" in err_msg.lower():
                if attempt < max_retries - 1:
                    sleep_time = delay * (attempt + 1)
                    logger.info(
                        "Gemini 503 spike, retrying in %.1fs (attempt %d/%d)...",
                        sleep_time,
                        attempt + 1,
                        max_retries,
                    )
                    await asyncio.sleep(sleep_time)
                    continue
            raise e


async def generate_agent_speech(speaker_id: str, topic: str, transcript: List[Any]) -> str:
    """
    Generates a realistic conversational oral GD turn for the given persona.
    - Persona constraints: 30 to 45 words, fast output, natural speech, no markdown.
    - High speed: uses max_output_tokens=75 with gemini-3.1-flash-lite so generation finishes in ~1-2 seconds.
    """
    persona = PERSONAS.get(speaker_id, PERSONAS["alpha"])

    # Format recent transcript for context (last 4 turns is sufficient and fast)
    dialog_lines = []
    for entry in (transcript or [])[-4:]:
        if isinstance(entry, dict):
            spk = entry.get("speaker_name") or entry.get("name") or entry.get("speaker") or entry.get("speaker_id") or "Participant"
            txt = entry.get("text") or entry.get("message") or ""
            if txt:
                dialog_lines.append(f"{spk}: {txt}")
        elif isinstance(entry, str) and entry.strip():
            dialog_lines.append(entry.strip())

    history_text = "\n".join(dialog_lines) if dialog_lines else "The discussion has just commenced."

    prompt = (
        f"Topic: {topic}\n"
        f"Recent Discussion:\n{history_text}\n\n"
        f"Speak now as {persona['name']}. Give your oral response in 30 to 45 words. Be direct, conversational, and punchy. No markdown, no bullets."
    )

    client = get_genai_client()
    if client:
        # Prioritize ultra-fast low-latency models to eliminate speech delays
        models_to_try = [
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash",
        ]
        for model_name in models_to_try:
            try:
                async def _call():
                    return await client.aio.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=persona["instruction"],
                            temperature=0.7,
                            max_output_tokens=75,
                        ),
                    )

                response = await call_gemini_with_retry(_call, max_retries=2, delay=0.8)
                if response and response.text:
                    cleaned = clean_speech_text(response.text)
                    words = cleaned.split()
                    if 20 <= len(words) <= 65:
                        return cleaned
                    elif len(words) > 0:
                        return cleaned
            except Exception as e:
                logger.warning("Gemini model %s generation failed: %s", model_name, e)
                continue

    # Resilient fallback if API is rate-limited, model unavailable, or key not configured
    fallbacks = persona.get("fallbacks", [])
    turn_idx = len(transcript or []) % max(len(fallbacks), 1)
    return fallbacks[turn_idx] if fallbacks else (
        "I think we need to carefully evaluate how this topic directly impacts our core strategy before rushing to a conclusion."
    )
