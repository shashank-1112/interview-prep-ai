# InterviewPrep AI

A resume-based interview question generator and answer grader. Upload a resume PDF,
get 6-8 interview questions personalized to your actual experience, answer them, and
get a rubric-based grade + feedback + improvement suggestions.

This is an MVP learning project - see [Scope & limitations](#scope--limitations) below
for what's deliberately not built yet.

## How it works

```
 1. Upload resume PDF  ──▶  2. Extract text (pypdf)  ──▶  3. Generate 6-8 questions (Gemini)
                                                                        │
 6. Results screen     ◀──  5. Grade all answers (Gemini)  ◀──  4. Answer questions
    (rating + feedback +       (one call, whole interview
     suggestions)               graded together)
```

There is no database. A single in-memory `session_id` (created on upload, held by the
Angular frontend, sent back on every later request) ties the three backend calls
together for one interview session. Restarting the backend loses all in-progress
sessions - that's an accepted MVP trade-off, not a bug.

## Project structure

```
interview-prep-ai/
├── backend/            FastAPI + Gemini (google-genai) + pypdf
│   ├── app/
│   │   ├── routes/      HTTP layer - one file per endpoint group
│   │   ├── services/    business logic (PDF extraction, Gemini calls, session store)
│   │   ├── prompts/     the actual LLM prompt text, as plain string constants
│   │   └── schemas/     Pydantic request/response models
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/            Angular 21, standalone components
│   └── src/app/
│       ├── components/  upload / questions / results screens
│       ├── services/    api.service.ts (the only place HttpClient is used)
│       └── models/      TypeScript interfaces mirroring the backend schemas
└── docker-compose.yml   backend only for now (frontend runs via `ng serve`)
```

## Prerequisites

- **Python 3.11** (specifically - see [Known gotchas](#known-gotchas) below for why not
  a newer version)
- **Node.js 22.12+** and npm
- A **Gemini API key** - get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- Docker (only if you want to run the backend containerized instead of directly)

## Running the backend

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# now edit .env and set GEMINI_API_KEY to your real key

uvicorn app.main:app --reload --port 8000
```

Confirm it's running: open [http://localhost:8000/docs](http://localhost:8000/docs) -
FastAPI's auto-generated Swagger UI, useful for poking at the three endpoints directly
without the frontend.

### ...or with Docker instead

```bash
cd backend
cp .env.example .env   # then edit .env with your real GEMINI_API_KEY
cd ..
docker compose up --build
```

Same result, at the same `http://localhost:8000`. The compose file bind-mounts
`backend/app` into the container and runs uvicorn with `--reload`, so editing code on
your host takes effect immediately without rebuilding the image.

## Running the frontend

```bash
cd frontend
npm install
npm start        # same as `ng serve` - serves at http://localhost:4200
```

Open [http://localhost:4200](http://localhost:4200). It expects the backend to be
running at `http://localhost:8000` (configured in `src/environments/environment.ts`) -
start the backend first, or you'll see "Could not reach the server" when you try to
upload a resume.

## Using it

1. Go to `http://localhost:4200`, select a PDF resume, click **Start Interview**.
   (This one click does two backend calls in sequence: upload+extract, then generate
   questions - see `upload.component.ts`.)
2. Answer as many of the 6-8 questions as you want (leaving one blank is fine - it's
   graded as "no answer provided" rather than causing an error), click
   **Submit for Grading**.
3. See your overall rating (1-5), feedback on each answer, and 3-5 concrete
   improvement suggestions. Click **Start Over** to try again with a different resume.

## API reference

| Method | Path                  | Purpose |
|--------|-----------------------|---------|
| GET    | `/health`             | Liveness check |
| POST   | `/resume/upload`      | Upload a PDF, get back a `session_id` + extracted text preview |
| POST   | `/questions/generate` | Generate 6-8 questions for a `session_id`'s resume |
| POST   | `/grading/submit`     | Grade all answers for a `session_id`, get feedback + overall rating |

Full request/response schemas are visible at `/docs` while the backend is running, or
in `backend/app/schemas/`.

## The prompts

The two actual prompts sent to Gemini live in `backend/app/prompts/` as plain string
constants:

- `question_prompts.py` - asks for 6-8 questions personalized to the resume (grounded
  in named projects/technologies, not generic questions), returned as structured JSON
  via Gemini's `response_schema` feature (not just "please return JSON" in the prompt
  text - the API itself enforces the shape).
- `grading_prompts.py` - grades **all** answers in one call against a four-part rubric
  (clarity, specificity, structure, technical depth), producing per-question feedback,
  an overall rating, and improvement suggestions in one pass. Grading everything
  together (rather than one call per question) is what lets the model notice patterns
  across answers for the overall rating/suggestions.

## Scope & limitations

Deliberately **not** built, per MVP scope:
- No user accounts/login
- No database - all state is in-memory (backend session) or held by the Angular app
  in memory (frontend); a backend restart or a frontend page refresh both lose
  in-progress state
- No multi-domain question tracks (testing/devops/architecture, etc.)
- No answer file uploads - text input only
- No automated test suite - the app was verified manually at each build stage
  (mocked-Gemini unit tests for the backend services, a headless-browser run through
  the full frontend flow against a mock backend); adding real tests would be a
  reasonable next step

## Known gotchas

- **Python 3.14 breaks the backend venv.** `pydantic-core` (a compiled dependency) has
  no prebuilt wheel for Python 3.14 yet, and building it from source fails (PyO3 doesn't
  support 3.14 yet either). Use **Python 3.11** (`python3.11 -m venv venv`) - the
  Dockerfile is already pinned to `python:3.11-slim` for the same reason.
- **Angular is pinned to 21.x, not the newest 22.x major.** Angular 22 raised its
  minimum Node version to `22.22.3+`; if your Node is older than that (check `node
  --version`), `ng` commands using the 22.x CLI will refuse to run. This project uses
  Angular 21.2.22 (the actively-maintained previous major, tagged `v21-lts` on npm) so
  it works on a wider range of Node 22.x installs. If you're on Node `22.22.3+` (or 24.15+,
  or 26+), you can `ng update` to Angular 22 later.
- **Port 8000 conflicts.** If you already have something else bound to port 8000
  (another project's Docker container, another API), the backend will fail to bind
  with `address already in use`. Stop the other service, or run this backend on a
  different port (`uvicorn app.main:app --port 8010`, and update
  `frontend/src/environments/environment.ts`'s `apiBaseUrl` to match).
- **Rate limits / Gemini failures.** If Gemini returns a 429 or any other error, the
  backend surfaces a specific message ("rate-limited, try again" vs. "temporarily
  unavailable") rather than a generic 500 - see `backend/app/services/question_service.py`
  and `grading_service.py`.
