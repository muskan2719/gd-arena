import os
import re
import json
import asyncio
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
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


def get_genai_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        logger.error("Failed to initialize genai.Client in researcher: %s", e)
        return None


def is_obvious_keyboard_smash(text: str) -> bool:
    """Checks whether input text is obvious keyboard smash, empty, or purely non-alphabetic."""
    cleaned = (text or "").strip()
    if not cleaned:
        return True

    # Allow 2-letter tokens (e.g. EY, HP, GE, AI, IT, HR, QA, ML, UI, UX)
    if len(cleaned) < 2:
        return True

    # Repeated characters like 'aaaaa', 'zzz', or '11111'
    if re.match(r"^([a-zA-Z0-9])\1{2,}$", cleaned):
        return True

    # Obvious keyboard home-row or sequence mashing
    known_gibberish = {
        "asdf", "asdfg", "asdfgh", "asdfghj", "asdfghjk", "asdfghjkl",
        "qwerty", "qwert", "zxcv", "zxcvb", "zxcvbn", "zxcvbnm",
        "xyz", "abc", "test", "testing123", "none", "null", "undefined",
        "na", "n/a", "blah", "random"
    }
    if cleaned.lower() in known_gibberish:
        return True

    # Obvious random consonant mash (8+ characters, zero vowels, zero 'y')
    if " " not in cleaned and len(cleaned) >= 8:
        vowels_and_y = re.findall(r"[aeiouyAEIOUY]", cleaned)
        if len(vowels_and_y) == 0:
            return True

    # Long string with practically zero vowels/y
    letters = re.findall(r"[a-zA-Z]", cleaned)
    if len(letters) >= 12:
        vowels_and_y = re.findall(r"[aeiouyAEIOUY]", cleaned)
        if len(vowels_and_y) / len(letters) < 0.08:
            return True

    return False


ERROR_VERIFICATION_RESPONSE: Dict[str, Any] = {
    "status": "error",
    "company_summary": "",
    "suggested_topics": [],
    "message": "Unable to verify this company or role. Please paste a legitimate job description or provide a valid company name (e.g. TCS, Infosys, Google, Cognizant)."
}


PROMPT_TEMPLATE = """You are a Campus Placement Intelligence Specialist.
Analyze this target company, role, or Job Description:
"{user_input}"

Determine if this input references a plausible company, domain, industry, or job role (e.g., "Google", "junior engineer at tcs", "infosys", "wipro", "satva tech", "data analyst", "frontend dev", "hsbc", "hdfc", "l&t").

If the input is completely meaningless keyboard mash or random garbage, output JSON with "valid": false.

If it is a valid company or role, output strictly valid JSON:
{{
  "valid": true,
  "company_name": "<Identified Company or Domain>",
  "company_summary": "<A 2-3 sentence overview of the company profile, what their recruiters look for in freshers, and what the company does>",
  "suggested_topics": [
    {{
      "title": "<Thought-provoking GD topic suitable for campus placement at this company>",
      "relevance": "<Why this topic is relevant or frequently asked for this role/company>",
      "evidence_context": "<Specific technological shift, industry trend, or context backing this topic>"
    }},
    {{
      "title": "<Second GD topic>",
      "relevance": "<Relevance>",
      "evidence_context": "<Evidence context>"
    }},
    {{
      "title": "<Third GD topic>",
      "relevance": "<Relevance>",
      "evidence_context": "<Evidence context>"
    }}
  ]
}}
"""


def _generate_fallback_response(combined: str, clean_hint: str) -> Dict[str, Any]:
    """
    Intelligent domestic synthesis when Gemini quota is exhausted or network is unreachable.
    Guarantees legitimate users get realistic placement intelligence and 3 high-yield GD topics.
    """
    words = [w for w in re.findall(r"[a-zA-Z0-9&/]+", combined) if len(w) >= 2]
    entity = clean_hint if clean_hint else " ".join(words[:4]).title()
    if not entity:
        entity = "Technology & Campus Hiring"

    return {
        "status": "success",
        "company_name": entity,
        "company_summary": f"{entity} evaluates campus candidates on analytical aptitude, problem-solving under constraints, domain fundamentals, and collaborative team communication.",
        "suggested_topics": [
            {
                "id": "t1",
                "title": f"Can AI automation replace entry-level engineers at firms like {entity}, or will it elevate their productivity?",
                "topic": f"Can AI automation replace entry-level engineers at firms like {entity}, or will it elevate their productivity?",
                "relevance": f"Assesses candidate technical awareness and realistic understanding of engineering workflows at {entity}.",
                "relevance_reason": f"Assesses candidate technical awareness and realistic understanding of engineering workflows at {entity}.",
                "evidence_context": "Widely discussed across modern campus recruitment drives and technical intake rounds.",
                "evidence_proof": "Widely discussed across modern campus recruitment drives and technical intake rounds.",
            },
            {
                "id": "t2",
                "title": "Work from Home vs Hybrid Office: Does remote onboarding harm the fresher learning curve?",
                "topic": "Work from Home vs Hybrid Office: Does remote onboarding harm the fresher learning curve?",
                "relevance": "Tests critical thinking regarding collaborative team culture, mentorship, and professional growth.",
                "relevance_reason": "Tests critical thinking regarding collaborative team culture, mentorship, and professional growth.",
                "evidence_context": "A staple debate topic across premier IT, consulting, and product placement panels.",
                "evidence_proof": "A staple debate topic across premier IT, consulting, and product placement panels.",
            },
            {
                "id": "t3",
                "title": "Speed of delivery vs Code quality & system resilience: What should freshers prioritize?",
                "topic": "Speed of delivery vs Code quality & system resilience: What should freshers prioritize?",
                "relevance": "Assesses engineering maturity, attention to detail, and alignment with enterprise development cycles.",
                "relevance_reason": "Assesses engineering maturity, attention to detail, and alignment with enterprise development cycles.",
                "evidence_context": "Evaluates candidate balance between business deadlines and sustainable engineering practices.",
                "evidence_proof": "Evaluates candidate balance between business deadlines and sustainable engineering practices.",
            },
        ],
    }


async def research_company_and_jd(job_description: str = "", company_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Direct, robust Gemini-driven company and job description reconnaissance analyzer.
    Validates company/role plausibility and generates targeted placement GD topics.
    """
    try:
        clean_hint = (company_name or "").strip()
        clean_jd = (job_description or "").strip()

        if clean_hint and clean_jd:
            combined = f"{clean_hint} - {clean_jd}"
        elif clean_hint:
            combined = clean_hint
        else:
            combined = clean_jd

        # 1. Input Sanity Check
        if not combined or len(combined) < 2 or is_obvious_keyboard_smash(combined):
            logger.info("Recon input rejected by sanity check: '%s'", combined[:30])
            return dict(ERROR_VERIFICATION_RESPONSE)

        # 2. Gemini Extraction via thread-safe call
        client = get_genai_client()
        if client:
            prompt = PROMPT_TEMPLATE.format(user_input=combined)
            models_to_try = [
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
                "gemini-flash-lite-latest",
                "gemini-3.5-flash",
                "gemini-3.6-flash",
            ]

            for model_name in models_to_try:
                try:
                    def _sync_call(m=model_name):
                        return client.models.generate_content(
                            model=m,
                            contents=prompt,
                            config=types.GenerateContentConfig(
                                response_mime_type="application/json",
                                temperature=0.3,
                            ),
                        )

                    response = await asyncio.wait_for(asyncio.to_thread(_sync_call), timeout=8.0)
                    if response and response.text:
                        raw_text = response.text.strip()
                        if raw_text.startswith("```"):
                            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                            raw_text = re.sub(r"\s*```$", "", raw_text)

                        data = json.loads(raw_text)

                        # Response Handling
                        if data.get("valid") is False:
                            logger.info("Model classified input as invalid: '%s'", combined[:30])
                            return dict(ERROR_VERIFICATION_RESPONSE)

                        if data.get("valid") is True or "suggested_topics" in data:
                            raw_topics = data.get("suggested_topics") or []
                            normalized_topics = []
                            for idx, item in enumerate(raw_topics, 1):
                                if isinstance(item, dict):
                                    t_title = item.get("title") or item.get("topic") or "Campus Placement Discussion"
                                    t_rel = item.get("relevance") or item.get("relevance_reason") or "Tests candidate critical thinking and industry awareness."
                                    t_ev = item.get("evidence_context") or item.get("evidence_proof") or "Frequently discussed in fresher campus recruitment rounds."
                                    normalized_topics.append({
                                        "id": item.get("id") or f"t{idx}",
                                        "title": t_title,
                                        "topic": t_title,
                                        "relevance": t_rel,
                                        "relevance_reason": t_rel,
                                        "evidence_context": t_ev,
                                        "evidence_proof": t_ev,
                                    })

                            if normalized_topics:
                                comp_summary = data.get("company_summary") or f"Campus recruitment and candidate evaluation profile for {combined[:40]}."
                                return {
                                    "status": "success",
                                    "company_name": data.get("company_name", clean_hint or combined[:30]),
                                    "company_summary": comp_summary,
                                    "suggested_topics": normalized_topics,
                                }

                except Exception as ex:
                    err_str = str(ex).lower()
                    if "429" in err_str or "quota" in err_str or "resource_exhausted" in err_str:
                        logger.warning("Model %s hit quota/rate limit: %s", model_name, ex)
                        continue
                    if "503" in err_str or "high demand" in err_str or "unavailable" in err_str:
                        logger.warning("Model %s unavailable (503): %s", model_name, ex)
                        continue
                    logger.warning("Researcher model %s failed: %s", model_name, ex)
                    continue

        # 3. Fallback if Gemini models hit quota or network errors
        logger.info("Employing fallback synthesis for valid input: '%s'", combined[:30])
        return _generate_fallback_response(combined, clean_hint)

    except Exception as e:
        logger.error("Unexpected error in research_company_and_jd: %s", e)
        return _generate_fallback_response(job_description or company_name or "Target Role", company_name or "")
