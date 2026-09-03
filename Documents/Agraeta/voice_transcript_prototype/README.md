# Sales Call Analytics — POC

Minimal proof of concept for the AI pipeline described in the BRD: upload a sales
call recording, get a transcript back, and get an AI-generated dealer-assessment
report (clarity, pitch quality, sub-ratings, action plan, improvement areas).

This is a **standalone Python service**, built to be called by the existing .NET
backend the same way it will be in production (an HTTP call to `/api/analyze`).
It does not touch the C# project.

## Stack

- **Transcription**: user-selectable per request — Groq-hosted `whisper-large-v3`
  (near-zero cost, fast) or ElevenLabs Scribe (diarization + word-level timestamps,
  handles code-switching better in places, but prone to confident hallucination
  on unclear audio — treat its output with the same skepticism as any ASR result)
- **Insights**: Gemini 2.5 Flash (large context, cheap, generous free tier)
- **Server**: FastAPI + a single static HTML page for the demo UI

## Setup

Requires Python 3.11 (3.14 currently breaks `pydantic-core`'s build via PyO3/maturin).

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Install `ffmpeg` — every upload is run through a denoise/normalize filter chain
before transcription (real dealer-visit recordings are noisy: phone in pocket,
shop ambient noise, multiple speakers), and ffmpeg is also used to convert
`.opus` (WhatsApp voice note) files and compress oversized files (>25MB).

```bash
brew install ffmpeg
```

Copy the env template and add your keys:

```bash
cp .env.example .env
```

- `GROQ_API_KEY` — https://console.groq.com/keys
- `GEMINI_API_KEY` — https://aistudio.google.com/apikey
- `ELEVENLABS_API_KEY` — https://elevenlabs.io (only needed if you select the
  ElevenLabs provider in the UI; Groq is the default and doesn't need it)

## Run

```bash
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000, upload an `.mp3`/`.wav`/`.m4a`/`.aac`/`.ogg`/`.opus`
(WhatsApp voice note)/`.mp4` file, pick a transcription provider from the
dropdown, and click Analyze Call.

## API

`POST /api/analyze` — multipart form fields `file` (audio, required) and
`provider` (`"groq"` or `"elevenlabs"`, optional, defaults to `"groq"`). Returns: 

```json
{
  "transcript": "...",
  "translation": "... (full transcript translated to English, via Gemini — handles calls with multiple/code-switched languages)",
  "insights": {
    "overall_confidence": {"rating": 4, "why": "..."},
    "transcription_clarity": {"rating": 4, "why": "...", "confidence_impact": "..."},
    "call_outcome": "follow_up_scheduled",
    "sales_pitch_quality": {"rating": 3, "rationale": "...", "evidence": "..."},
    "sub_ratings": {
      "opening_rapport": {"rating": 4, "comment": "...", "evidence": "..."},
      "needs_discovery": {"rating": 3, "comment": "...", "evidence": "..."},
      "product_knowledge": {"rating": 4, "comment": "...", "evidence": "..."},
      "objection_handling": {"rating": 2, "comment": "...", "evidence": "..."},
      "trust_building": {"rating": 3, "comment": "...", "evidence": "..."},
      "close": {"rating": 3, "comment": "...", "evidence": "..."}
    },
    "call_dynamics": {
      "talk_time_ratio": "salesperson 60% / dealer 40%",
      "sentiment_trend": {"opening": "...", "middle": "...", "close": "..."},
      "listening_quality": "..."
    },
    "objections_raised": ["...", "..."],
    "pain_points_mentioned": ["...", "..."],
    "competitor_mentions": ["...", "..."],
    "pricing_discussed": {"discussed": true, "details": "..."},
    "commitments_made": ["...", "..."],
    "dealer_investment_rating": {"rating": 3, "rationale": "...", "evidence": "..."},
    "coaching_focus": "...",
    "action_plan": [
      {"action": "...", "priority": "high", "owner": "salesperson"}
    ],
    "improvement_areas": ["...", "..."]
  },
  "provider": "groq"
}
```

This is the shape the .NET backend would store as `TranscriptText` +
`InsightsJson` per the BRD's data flow.

## Scope / what's intentionally left out

This is a demo, not production code:

- No auth, no database — files are processed in-memory/temp and deleted after the request.
- No retry/queueing for long calls — synchronous request/response only.
- No persistence layer — the .NET backend owns storage per the architecture doc.
