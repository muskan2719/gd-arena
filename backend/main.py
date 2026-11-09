import time
from typing import List, Any, Optional
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

try:
    from backend.agents.director import select_next_speaker
    from backend.agents.participants import generate_agent_speech, PERSONAS
    from backend.agents.researcher import research_company_and_jd
    from backend.agents.judge import evaluate_discussion
except ImportError:
    from agents.director import select_next_speaker
    from agents.participants import generate_agent_speech, PERSONAS
    from agents.researcher import research_company_and_jd
    from agents.judge import evaluate_discussion

app = FastAPI(title="GD Arena API")


class PrivateNetworkMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            response = Response(status_code=200)
            origin = request.headers.get("origin", "*")
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        else:
            response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(PrivateNetworkMiddleware)


class ReconRequest(BaseModel):
    company: str
    role: str
    job_description: str


class ReconAnalyzeRequest(BaseModel):
    job_description: str
    company_hint: Optional[str] = None


class GDRespondRequest(BaseModel):
    topic: str
    transcript: List[Any] = []
    last_speaker_id: Optional[str] = ""


class GDEvaluateRequest(BaseModel):
    topic: str
    duration_minutes: int = 10
    transcript: List[Any] = []


# In-memory Room Management Hub (Syncs tabs, Incognito windows, and multiple devices)
rooms_db = {}


@app.post("/api/room/join")
async def join_room(payload: dict):
    room_id = payload.get("room_id")
    user_id = payload.get("user_id")
    user_name = payload.get("user_name", "Peer Candidate")
    duration = payload.get("duration", 300)
    topic = payload.get("topic", "Group Discussion")
    active_agents = payload.get("active_agents", [])

    if not room_id or not user_id:
        return {"status": "error", "message": "Missing room_id or user_id"}

    if room_id not in rooms_db:
        rooms_db[room_id] = {
            "topic": topic,
            "duration": duration,
            "timer_running": False,
            "timer_start_time": None,
            "participants": {},
            "active_agents": list(active_agents) if active_agents else [],
            "session_ended": False,
        }
    else:
        rooms_db[room_id]["session_ended"] = False
        if topic and topic not in ["Group Discussion", "Campus Placement Discussion"]:
            rooms_db[room_id]["topic"] = topic
        if duration and "duration" not in rooms_db[room_id]:
            rooms_db[room_id]["duration"] = duration
        if active_agents:
            existing = rooms_db[room_id].setdefault("active_agents", [])
            for a in active_agents:
                if a not in existing:
                    existing.append(a)

    if not isinstance(rooms_db[room_id].get("participants"), dict):
        rooms_db[room_id]["participants"] = {}

    existing_p = rooms_db[room_id]["participants"].get(user_id, {})
    rooms_db[room_id]["participants"][user_id] = {
        "id": user_id,
        "name": user_name,
        "is_agent": False,
        "is_hand_raised": existing_p.get("is_hand_raised", False),
        "last_speech": existing_p.get("last_speech", ""),
        "is_speaking": existing_p.get("is_speaking", False),
    }

    return {
        "status": "ok",
        "room_id": room_id,
        "participants": list(rooms_db[room_id]["participants"].values()),
        "timer_running": rooms_db[room_id]["timer_running"],
        "duration": rooms_db[room_id]["duration"],
        "active_agents": rooms_db[room_id].get("active_agents", []),
        "topic": rooms_db[room_id].get("topic", topic),
    }


@app.get("/api/room/{room_id}/state")
async def get_room_state(room_id: str):
    if room_id not in rooms_db:
        return {
            "topic": "",
            "duration": 300,
            "timer_running": False,
            "time_remaining": 300,
            "participants": [],
            "active_agents": [],
            "session_ended": False,
        }

    room = rooms_db[room_id]
    time_remaining = room.get("duration", 300)

    if room.get("timer_running") and room.get("timer_start_time"):
        elapsed = int(time.time() - room["timer_start_time"])
        time_remaining = max(0, room["duration"] - elapsed)

    parts = room.get("participants", {})
    participant_list = list(parts.values()) if isinstance(parts, dict) else parts

    return {
        "topic": room.get("topic", ""),
        "duration": room.get("duration", 300),
        "timer_running": room.get("timer_running", False),
        "time_remaining": time_remaining,
        "participants": participant_list,
        "active_agents": room.get("active_agents", []),
        "session_ended": room.get("session_ended", False),
    }


@app.post("/api/room/start_timer")
async def start_timer(payload: dict):
    room_id = payload.get("room_id")
    if room_id in rooms_db:
        rooms_db[room_id]["timer_running"] = True
        rooms_db[room_id]["timer_start_time"] = time.time()
        return {"status": "ok", "timer_running": True}
    return {"status": "error", "message": "Room not found"}


@app.post("/api/room/raise_hand")
async def toggle_raise_hand(payload: dict):
    room_id = payload.get("room_id")
    user_id = payload.get("user_id")
    is_raised = payload.get("is_hand_raised", False)

    if room_id in rooms_db and user_id in rooms_db[room_id]["participants"]:
        rooms_db[room_id]["participants"][user_id]["is_hand_raised"] = is_raised
        return {"status": "ok", "is_hand_raised": is_raised}
    return {"status": "error", "message": "User or room not found"}


@app.post("/api/room/broadcast_speech")
async def broadcast_speech(payload: dict):
    room_id = payload.get("room_id")
    user_id = payload.get("user_id")
    transcript = payload.get("transcript", "")
    is_speaking = payload.get("is_speaking", True)

    if room_id in rooms_db and user_id in rooms_db[room_id]["participants"]:
        rooms_db[room_id]["participants"][user_id]["last_speech"] = transcript
        rooms_db[room_id]["participants"][user_id]["is_speaking"] = is_speaking
        return {"status": "ok"}
    return {"status": "error"}


@app.post("/api/room/leave")
async def leave_room(payload: dict):
    room_id = payload.get("room_id")
    user_id = payload.get("user_id")
    if room_id in rooms_db and user_id:
        parts = rooms_db[room_id].get("participants")
        if isinstance(parts, dict):
            parts.pop(user_id, None)
        elif isinstance(parts, list):
            rooms_db[room_id]["participants"] = [p for p in parts if p.get("id") != user_id]
    return {"status": "ok"}


@app.post("/api/room/end")
async def end_room(payload: dict):
    room_id = payload.get("room_id")
    if room_id in rooms_db:
        rooms_db[room_id]["session_ended"] = True
    return {"status": "ok"}


@app.post("/api/room/add_agent")
async def add_agent_to_room(payload: dict):
    room_id = payload.get("room_id")
    agent_id = payload.get("agent_id")
    if room_id in rooms_db and agent_id:
        agents = rooms_db[room_id].setdefault("active_agents", [])
        if agent_id not in agents:
            agents.append(agent_id)
    return {"status": "ok", "active_agents": rooms_db.get(room_id, {}).get("active_agents", [])}


@app.get("/")
def read_root():
    return {"status": "GD Arena Backend Active"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/api/recon")
def trigger_recon(payload: ReconRequest):
    return {
        "status": "pending",
        "message": "Recon placeholder received",
        "data": {
            "company": payload.company,
            "role": payload.role,
            "job_description": payload.job_description,
        },
    }


@app.post("/api/recon/analyze")
async def recon_analyze(payload: ReconAnalyzeRequest):
    """
    Analyzes JD and company intelligence using DuckDuckGo search + Gemini
    to synthesize a company profile and high-relevance GD topics.
    """
    result = await research_company_and_jd(
        job_description=payload.job_description,
        company_name=payload.company_hint,
    )
    return result


@app.post("/api/gd/respond")
async def gd_respond(payload: GDRespondRequest):
    """
    Selects the next persona turn and generates their conversational GD speech.
    """
    speaker_id = select_next_speaker(
        transcript=payload.transcript,
        last_speaker_id=payload.last_speaker_id or "",
    )

    speech_text = await generate_agent_speech(
        speaker_id=speaker_id,
        topic=payload.topic,
        transcript=payload.transcript,
    )

    speaker_meta = PERSONAS.get(speaker_id, {})
    speaker_name = speaker_meta.get("name", speaker_id.capitalize())

    return {
        "speaker_id": speaker_id,
        "speaker_name": speaker_name,
        "text": speech_text,
    }


@app.post("/api/gd/evaluate")
async def gd_evaluate(payload: GDEvaluateRequest):
    """
    Evaluates participant performance in the Group Discussion
    and generates a placement readiness scorecard and coaching rubric.
    """
    scorecard = await evaluate_discussion(
        topic=payload.topic,
        duration_minutes=payload.duration_minutes,
        transcript=payload.transcript,
    )
    return scorecard


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
