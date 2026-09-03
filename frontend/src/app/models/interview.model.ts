/**
 * TypeScript interfaces mirroring the backend's Pydantic schemas
 * (see backend/app/schemas/). Keeping them together in one file makes
 * the whole frontend<->backend contract easy to see at a glance, and
 * makes it obvious when the backend's schemas change out from under it.
 */

// --- POST /resume/upload --- (backend/app/schemas/resume.py)

export interface ResumeUploadResponse {
  session_id: string;
  character_count: number;
  resume_text_preview: string;
}

// --- POST /questions/generate --- (backend/app/schemas/questions.py)

export interface Question {
  id: string;
  focus_area: string;
  text: string;
}

export interface QuestionGenerationResponse {
  session_id: string;
  questions: Question[];
}

// --- POST /grading/submit --- (backend/app/schemas/grading.py)

export interface AnswerInput {
  question_id: string;
  answer_text: string;
}

export interface QuestionFeedback {
  question_id: string;
  question_text: string;
  rating: number; // 1-5
  feedback: string;
}

export interface GradingResponse {
  session_id: string;
  overall_rating: number; // 1-5
  per_question_feedback: QuestionFeedback[];
  improvement_suggestions: string[];
}
