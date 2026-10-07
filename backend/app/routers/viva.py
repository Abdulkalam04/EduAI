import json
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import VivaSession
from app.schemas import LevelId
from app.services.llm import OmniRouteError, json_call

router = APIRouter(prefix="/api/viva", tags=["viva"])
FeedbackLabel = Literal["Good", "Partially correct", "Needs work"]


class VivaQuestion(BaseModel):
    id: str = ""
    question: str
    topic: str
    keywords: list[str]
    explanation: str
    followUp: str | None = None


class VivaQuestionSet(BaseModel):
    questions: list[VivaQuestion] = Field(min_length=1)


class VivaFeedback(BaseModel):
    label: FeedbackLabel
    score: float = Field(ge=0, le=1)
    explanation: str
    ideal: str


class VivaFeedbackSet(BaseModel):
    label: FeedbackLabel
    score: float = Field(ge=0, le=1)
    explanation: str
    ideal: str


class VivaStart(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    topic: str = Field(default="", max_length=500)
    level: LevelId
    count: Literal[5, 10, 15] = 5
    adaptive: bool = True


class VivaAnswer(BaseModel):
    question: VivaQuestion
    answer: str = Field(max_length=20_000)
    level: LevelId


class VivaReportAnswer(BaseModel):
    question: VivaQuestion
    answer: str = Field(max_length=20_000)
    feedback: VivaFeedback


class VivaReportRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    topic: str = Field(default="", max_length=500)
    level: LevelId
    answers: list[VivaReportAnswer] = Field(min_length=1, max_length=100)


def _session_id(question_id: str) -> str:
    session_id, separator, _ = question_id.partition("::")
    if not separator:
        raise HTTPException(status_code=400, detail="This question is not linked to a viva session.")
    return session_id


def _examiner_tone(level: LevelId) -> str:
    return (
        "Use a warm, encouraging school examiner tone."
        if level != "grad"
        else "Use a formal, concise university examiner tone."
    )


@router.post("/start", response_model=list[VivaQuestion], response_model_exclude_none=True)
async def start_viva(payload: VivaStart, db: Session = Depends(get_db)):
    session_id = str(uuid.uuid4())
    tone = _examiner_tone(payload.level)
    prompt = (
        f"Create exactly {payload.count} distinct oral-exam questions for subject "
        f"{payload.subject!r}, topic {payload.topic or 'the subject syllabus'!r}, "
        f"learner level {payload.level}. {tone} "
        f"Adaptive difficulty is {'on' if payload.adaptive else 'off'}. "
        "Return one JSON object with a questions array. Every question must include all "
        "required fields: question (string), topic (string), keywords (array of 2-5 strings), "
        "explanation (one concise sentence), and followUp (string or null). Do not put "
        "reasoning, instructions, or commentary inside any field. Do not omit required fields."
    )
    try:
        result = await json_call(
            [
                {"role": "system", "content": "Generate fair, syllabus-aligned viva questions. Return JSON only."},
                {"role": "user", "content": prompt},
            ],
            VivaQuestionSet,
            task="viva_questions",
            step="Viva question generation",
            timeout=240.0,
            max_tokens=min(8192, max(1800, payload.count * 400)),
        )
    except OmniRouteError as error:
        status_code = 502 if error.status_code is not None else 503
        detail = (
            f"Viva question generation failed: {error}"
            if status_code == 502
            else str(error)
        )
        raise HTTPException(status_code=status_code, detail=detail) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    questions = result.questions[: payload.count]
    if len(questions) != payload.count:
        raise HTTPException(status_code=502, detail="The examiner returned too few questions.")
    for index, question in enumerate(questions, start=1):
        question.id = f"{session_id}::{index}"
    row = VivaSession(
        id=session_id,
        subject=payload.subject,
        topic=payload.topic,
        level=payload.level,
        adaptive=payload.adaptive,
        difficulty=1,
        questions_json=json.dumps([item.model_dump() for item in questions]),
        answers_json="[]",
    )
    db.add(row)
    db.commit()
    return questions


@router.post("/answer", response_model=VivaFeedback)
async def answer_viva(payload: VivaAnswer, db: Session = Depends(get_db)):
    session_id = _session_id(payload.question.id)
    session = db.get(VivaSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Viva session not found.")
    if payload.level != session.level:
        raise HTTPException(status_code=422, detail="The answer level does not match this viva.")
    tone = _examiner_tone(session.level)
    difficulty = session.difficulty
    if session.adaptive:
        difficulty = min(5, max(1, difficulty))
        difficulty_instruction = (
            f"Current adaptive difficulty is {difficulty}/5. Increase rigor after correct "
            "answers and make feedback more supportive if prior performance was weaker."
        )
    else:
        difficulty_instruction = "Keep a consistent moderate difficulty."
    try:
        feedback = await json_call(
            [
                {
                    "role": "system",
                    "content": (
                        f"Evaluate the student's oral answer. {tone} {difficulty_instruction} "
                        "Use label Good, Partially correct, or Needs work; score 1, 0.5, or 0 "
                        "respectively; provide one encouraging explanatory line and an ideal answer. "
                        "Return JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Question: {payload.question.question}\n"
                        f"Key concepts: {', '.join(payload.question.keywords)}\n"
                        f"Reference explanation: {payload.question.explanation}\n"
                        f"Student answer: {payload.answer or '(skipped)'}"
                    ),
                },
            ],
            VivaFeedbackSet,
            task="evaluation_feedback",
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    prior = json.loads(session.answers_json)
    entry = {
        "question": payload.question.model_dump(),
        "answer": payload.answer,
        "feedback": feedback.model_dump(),
    }
    prior = [item for item in prior if item["question"]["id"] != payload.question.id]
    prior.append(entry)
    session.answers_json = json.dumps(prior, ensure_ascii=False)
    if session.adaptive:
        session.difficulty = min(5, max(1, session.difficulty + (1 if feedback.score >= 1 else -1)))
    db.commit()
    return feedback


@router.post("/report")
def viva_report(payload: VivaReportRequest, db: Session = Depends(get_db)):
    session_ids = {_session_id(item.question.id) for item in payload.answers}
    if len(session_ids) != 1:
        raise HTTPException(status_code=400, detail="Report answers must come from one viva session.")
    session = db.get(VivaSession, session_ids.pop())
    if session is None:
        raise HTTPException(status_code=404, detail="Viva session not found.")
    topic_scores: dict[str, float] = {}
    report_questions: list[dict[str, object]] = []
    for item in payload.answers:
        topic_scores[item.question.topic] = (
            topic_scores.get(item.question.topic, 0) + item.feedback.score
        )
        report_questions.append(
            {
                "question": item.question.question,
                "topic": item.question.topic,
                "answer": item.answer,
                "feedback": item.feedback.model_dump(),
            }
        )
    ordered = sorted(topic_scores.items(), key=lambda entry: entry[1], reverse=True)
    report = {
        "id": f"viva-{uuid.uuid4()}",
        "subject": payload.subject,
        "topic": payload.topic,
        "level": payload.level,
        "score": sum(item.feedback.score for item in payload.answers),
        "total": len(payload.answers),
        "strengths": [name for name, points in ordered if points >= 1],
        "improvements": [name for name, points in ordered if points < 1],
        "questions": report_questions,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    session.report_json = json.dumps(report, ensure_ascii=False)
    session.answers_json = json.dumps(
        [
            {
                "question": item.question.model_dump(),
                "answer": item.answer,
                "feedback": item.feedback.model_dump(),
            }
            for item in payload.answers
        ],
        ensure_ascii=False,
    )
    db.commit()
    return report
