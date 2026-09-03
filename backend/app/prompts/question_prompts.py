"""
Prompt template for interview question generation.

This is the actual text sent to Gemini - kept here as a plain string
constant, separate from the code that calls the API, so it can be read
and tuned on its own.

Placeholders (filled in via .format() in app/services/question_service.py):
    {resume_text} - the full text extracted from the candidate's resume PDF.

Note: literal curly braces meant to survive .format() (the JSON example
at the end) are doubled ({{ }}) - that's Python str.format() escaping,
not part of the prompt itself.
"""

QUESTION_GENERATION_PROMPT = """You are an experienced technical interviewer preparing to interview a candidate.

Below is the candidate's resume, extracted from their uploaded PDF:

---
{resume_text}
---

Generate between 6 and 8 interview questions personalized to THIS candidate specifically.

Rules:
1. Every question must reference something concrete from the resume above - a named project, a specific technology/tool, a company/role, a claimed responsibility, or a metric they cited. Do not ask generic questions that could apply to any candidate (e.g. "Tell me about yourself", "What are your greatest strengths?").
2. Aim for a mix:
   - Several questions that go deep on a specific project or technical claim ("You mention X - walk me through how you designed/built that, and what tradeoffs you made.")
   - Several that probe technical depth on a specific skill/technology they listed ("You list Y - explain how it works internally, or when you'd choose it over an alternative.")
   - One or two behavioral questions grounded in something specific on the resume (a real role, team, or metric) rather than a generic behavioral prompt.
3. Keep each question to 1-3 sentences - concise and realistic, the way a real interviewer would ask it out loud, not a multi-part essay prompt.
4. For each question, include a short `focus_area` label (3-6 words) naming what part of the resume it targets, e.g. "RAG API project" or "FastAPI / async experience".

Return ONLY JSON matching this shape - no markdown fences, no commentary outside the JSON:
{{
  "questions": [
    {{"focus_area": "...", "text": "..."}}
  ]
}}
"""
