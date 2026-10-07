import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Generic, Literal, TypeVar

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PracticeAttempt, PracticeEvaluation, PracticePaper
from app.schemas import LevelId
from app.security import MAX_UPLOAD_BYTES, read_validated_upload
from app.services.documents import extract_document, format_page_text
from app.services.grading import (
    grade_mcq,
    grade_written_answer,
    validate_evaluation_rubric,
    validate_evaluation_set,
)
from app.services.llm import CompletionTruncated, JsonCallError, OmniRouteError, json_call

router = APIRouter(prefix="/api/practice", tags=["practice"])
logger = logging.getLogger(__name__)


class PaperSection(BaseModel):
    id: Literal["A", "B", "C", "D"]
    name: str
    marks: int = Field(gt=0)
    count: int = Field(gt=0)
    each: int = Field(gt=0)


class PaperQuestion(BaseModel):
    id: str
    section: Literal["A", "B", "C", "D"]
    type: Literal["mcq", "short", "long", "numerical"]
    text: str
    marks: int = Field(gt=0)
    options: list[str] | None = None
    correct: int | None = None
    model: str
    topic: str
    keywords: list[str] | None = None


class PracticePaperData(BaseModel):
    id: str
    title: str
    subject: str
    level: LevelId
    chapter: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    totalMarks: int
    timeMin: int
    createdAt: str
    weakFocus: list[str]
    sections: list[PaperSection]
    questions: list[PaperQuestion]


class GeneratePaperRequest(BaseModel):
    level: LevelId
    subject: str = Field(min_length=1, max_length=120)
    chapter: str = Field(min_length=1, max_length=500)
    difficulty: Literal["Easy", "Medium", "Hard"]
    totalMarks: Literal[20, 30, 50, 80, 100]
    timeMin: int = Field(ge=5, le=360)
    weakFocus: list[str] = Field(default_factory=list, max_length=50)


class GeneratedPracticeQuestionFields(BaseModel):
    text: str = Field(min_length=1)
    marks: int = Field(gt=0)
    options: list[str] | None = None
    correct: int | None = None
    model: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    keywords: list[str] | None = None


class GeneratedMcqQuestion(GeneratedPracticeQuestionFields):
    type: Literal["mcq"]


class GeneratedShortQuestion(GeneratedPracticeQuestionFields):
    type: Literal["short"]


class GeneratedLongQuestion(GeneratedPracticeQuestionFields):
    type: Literal["long"]


class GeneratedNumericalQuestion(GeneratedPracticeQuestionFields):
    type: Literal["numerical"]


QuestionT = TypeVar("QuestionT", bound=GeneratedPracticeQuestionFields)


class GeneratedPracticeQuestionSet(BaseModel, Generic[QuestionT]):
    questions: list[QuestionT]


_QUESTION_MODELS: dict[str, type[GeneratedPracticeQuestionFields]] = {
    "MCQ": GeneratedMcqQuestion,
    "short": GeneratedShortQuestion,
    "long": GeneratedLongQuestion,
    "numerical": GeneratedNumericalQuestion,
}


class PaperSubmission(BaseModel):
    answers: dict[str, str]
    timeUsedSec: int = Field(ge=0, le=86_400)


class PaperQuestionResult(BaseModel):
    id: str
    awarded: float
    status: Literal["correct", "partial", "wrong", "skipped"]
    feedback: str


class SectionResult(BaseModel):
    id: str
    name: str
    score: float
    max: int


class PaperResult(BaseModel):
    score: float
    total: int
    timeUsedSec: int
    perQ: list[PaperQuestionResult]
    sections: list[SectionResult]
    weakTopics: list[str]


class EvaluationRubric(BaseModel):
    label: str
    got: float
    max: float


class Evaluation(BaseModel):
    id: str
    question: str
    marks: int
    answer: str
    rubric: list[EvaluationRubric]
    good: str
    improve: str
    model: str
    topic: str


class EvaluationSet(BaseModel):
    evaluations: list[Evaluation]


class ReevaluateRequest(BaseModel):
    answer: str = Field(max_length=20_000)


_SECTION_PLANS: dict[int, tuple[tuple[str, str, int, int], ...]] = {
    20: (("A", "MCQ", 5, 1), ("B", "short", 3, 2), ("C", "long", 1, 5), ("D", "numerical", 1, 4)),
    30: (("A", "MCQ", 6, 1), ("B", "short", 4, 2), ("C", "long", 2, 4), ("D", "numerical", 2, 4)),
    50: (("A", "MCQ", 10, 1), ("B", "short", 5, 2), ("C", "long", 3, 5), ("D", "numerical", 3, 5)),
    80: (("A", "MCQ", 16, 1), ("B", "short", 8, 2), ("C", "long", 4, 6), ("D", "numerical", 4, 6)),
    100: (("A", "MCQ", 20, 1), ("B", "short", 10, 2), ("C", "long", 5, 6), ("D", "numerical", 5, 6)),
}

_BATCH_LIMITS = {"MCQ": 4, "short": 2, "long": 1, "numerical": 2}
_EXPECTED_TOKENS_PER_QUESTION = {
    "MCQ": 240,
    "short": 170,
    "long": 250,
    "numerical": 220,
}


def _valid_partial_questions(
    raw: str,
    question_model: type[GeneratedPracticeQuestionFields],
    section_type: str,
    each: int,
) -> list[GeneratedPracticeQuestionFields]:
    marker = '"questions"'
    marker_position = raw.find(marker)
    if marker_position < 0:
        return []
    array_start = raw.find("[", marker_position + len(marker))
    if array_start < 0:
        return []

    found: list[GeneratedPracticeQuestionFields] = []
    object_start: int | None = None
    depth = 0
    in_string = False
    escaped = False
    for index in range(array_start + 1, len(raw)):
        char = raw[index]
        if object_start is None:
            if char == "{":
                object_start = index
                depth = 1
            elif char == "]":
                break
            continue
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    question_data = json.loads(raw[object_start : index + 1])
                    generated_type = str(question_data.get("type", "")).lower()
                    accepted_types = {
                        "mcq": {"mcq"},
                        "short": {"short", "short_answer"},
                        "long": {"long", "long_answer"},
                        "numerical": {"numerical", "numeric"},
                    }[section_type.lower()]
                    if generated_type not in accepted_types:
                        object_start = None
                        continue
                    question_data["type"] = section_type.lower()
                    question = question_model.model_validate_json(
                        json.dumps(question_data)
                    )
                    if question.type == section_type.lower() and question.marks == each:
                        if question.type != "mcq" or (
                            question.options is not None
                            and len(question.options) >= 2
                            and question.correct is not None
                            and 0 <= question.correct < len(question.options)
                        ):
                            found.append(question)
                except (ValueError, json.JSONDecodeError):
                    pass
                object_start = None
    return found


@router.post("/generate", response_model=PracticePaperData, response_model_exclude_none=True)
async def generate_paper(payload: GeneratePaperRequest, db: Session = Depends(get_db)):
    specs = _SECTION_PLANS[payload.totalMarks]

    async def generate_section(
        section_id: str, section_type: str, count: int, each: int
    ) -> list[GeneratedPracticeQuestionFields]:
        section_started = time.perf_counter()
        question_model = _QUESTION_MODELS[section_type]
        request_number = 0

        def validate_questions(
            questions: list[GeneratedPracticeQuestionFields], requested_count: int
        ) -> None:
            if len(questions) > requested_count:
                raise ValueError(f"expected at most {requested_count} questions")
            for question in questions:
                if question.type != section_type.lower() or question.marks != each:
                    raise ValueError(
                        f"expected {section_type.lower()} questions worth {each} marks"
                    )
                if question.type == "mcq" and (
                    question.options is None
                    or len(question.options) < 2
                    or question.correct is None
                    or not 0 <= question.correct < len(question.options)
                ):
                    raise ValueError("an MCQ is missing valid options or a correct index")

        async def request_batch(
            requested_count: int,
            *,
            continuation: bool = False,
            retry_count: int = 0,
        ) -> list[GeneratedPracticeQuestionFields]:
            nonlocal request_number
            request_number += 1
            prompt = (
                f"Create {requested_count} {section_type} questions, each exactly {each} marks. "
                f"Subject: {payload.subject}. Chapter: {payload.chapter}. Level: {payload.level}. "
                f"Difficulty: {payload.difficulty}. Focus: "
                f"{', '.join(payload.weakFocus) if payload.weakFocus else 'none specified'}. "
                "Return compact JSON only: {\"questions\":[...]}. No markdown, commentary, "
                "section metadata, or IDs. Each item must contain type, text, marks, options, "
                "correct, model, topic, keywords. Keep question text short, model answer to one "
                "sentence (20 words maximum), topic to a few words, and keywords to at most two. "
                "For non-MCQs use null options/correct. MCQs need four short options and a valid "
                "zero-based correct index."
            )
            prompt += (
                " Strict size limits: question text at most 12 words; model answer at most "
                "10 words (20 for long/numerical); topic at most 2 words; keywords must be []. "
                "Keep every option at most 5 words. For numerical answers show only the "
                "essential equation and result."
            )
            if continuation:
                prompt += (
                    f" This is continuation request {request_number}; generate only the "
                    f"{requested_count} missing {section_type} questions."
                )
            try:
                generated = await json_call(
                    [
                        {
                            "role": "system",
                            "content": (
                                "Generate accurate, age-appropriate questions. Output compact "
                                "valid JSON only, without explanation or markdown."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    GeneratedPracticeQuestionSet[question_model],
                    task="practice",
                    step=(
                        f"Practice {section_type} section {section_id} "
                        f"batch {request_number}"
                    ),
                    timeout=120.0,
                    max_tokens=2
                    * requested_count
                    * _EXPECTED_TOKENS_PER_QUESTION[section_type],
                    validator=lambda result: validate_questions(
                        result.questions, requested_count
                    ),
                    repair_invalid=False,
                )
                questions = generated.questions
            except CompletionTruncated as error:
                questions = _valid_partial_questions(
                    error.content, question_model, section_type, each
                )
                missing_count = requested_count - len(questions)
                if missing_count <= 0:
                    return questions[:requested_count]
                if requested_count == 1:
                    raise ValueError(
                        f"Practice {section_type} section {section_id} returned a "
                        "truncated single-question response."
                    ) from error
                if missing_count == requested_count:
                    left_count = requested_count // 2
                    right_count = requested_count - left_count
                    left, right = await asyncio.gather(
                        request_batch(left_count, continuation=True),
                        request_batch(right_count, continuation=True),
                    )
                    return left + right
                return questions + await request_batch(
                    missing_count, continuation=True
                )
            except JsonCallError as error:
                questions = _valid_partial_questions(
                    error.raw_response, question_model, section_type, each
                )
            validate_questions(questions, requested_count)
            missing_count = requested_count - len(questions)
            if missing_count:
                if retry_count >= 1:
                    raise ValueError(
                        f"Practice {section_type} section {section_id} is missing "
                        f"{missing_count} question(s) after a continuation request."
                    )
                return questions + await request_batch(
                    missing_count, continuation=True, retry_count=retry_count + 1
                )
            return questions

        batch_limit = _BATCH_LIMITS[section_type]
        batch_sizes = [
            min(batch_limit, count - start)
            for start in range(0, count, batch_limit)
        ]
        batch_results = await asyncio.gather(
            *(request_batch(batch_size) for batch_size in batch_sizes),
            return_exceptions=True,
        )
        for batch_size, result in zip(batch_sizes, batch_results, strict=True):
            if isinstance(result, Exception):
                logger.warning(
                    "practice_generation section=%s duration_ms=%.2f status=failed "
                    "error_type=%s",
                    section_type,
                    (time.perf_counter() - section_started) * 1000,
                    type(result).__name__,
                )
                raise result
            if len(result) != batch_size:
                raise ValueError(
                    f"Practice {section_type} section {section_id} generated an "
                    f"unexpected question count ({len(result)} of {batch_size})."
                )
        questions = [
            question
            for result in batch_results
            for question in result
        ]
        logger.info(
            "practice_generation section=%s duration_ms=%.2f batches=%d status=ok",
            section_type,
            (time.perf_counter() - section_started) * 1000,
            len(batch_sizes),
        )
        return questions

    section_results = await asyncio.gather(
        *(generate_section(*spec) for spec in specs),
        return_exceptions=True,
    )
    for spec, result in zip(specs, section_results, strict=True):
        if isinstance(result, Exception):
            status_code = (
                502
                if not isinstance(result, OmniRouteError) or result.status_code is not None
                else 503
            )
            raise HTTPException(
                status_code=status_code,
                detail=f"Practice paper section {spec[0]} ({spec[1]}) failed: {result}",
            ) from result

    sections = [
        PaperSection(id=section_id, name=section_type, count=count, each=each, marks=count * each)
        for section_id, section_type, count, each in specs
    ]
    questions = [
        PaperQuestion(
            id=f"q-{section_id}-{index}",
            section=section_id,
            **question.model_dump(),
        )
        for (section_id, _, _, _), result in zip(specs, section_results, strict=True)
        for index, question in enumerate(result, start=1)
    ]
    if (
        sum(question.marks for question in questions) != payload.totalMarks
        or sum(section.marks for section in sections) != payload.totalMarks
    ):
        raise HTTPException(
            status_code=502,
            detail="Practice paper section merge failed: generated marks do not match the selected total.",
        )
    generated = PracticePaperData(
        id="",
        title="",
        subject=payload.subject,
        level=payload.level,
        chapter=payload.chapter,
        difficulty=payload.difficulty,
        totalMarks=payload.totalMarks,
        timeMin=payload.timeMin,
        createdAt="",
        weakFocus=payload.weakFocus,
        sections=sections,
        questions=questions,
    )
    generated.id = f"paper-{uuid.uuid4()}"
    generated.title = f"{payload.subject.upper()} TEST"
    generated.subject = payload.subject
    generated.level = payload.level
    generated.chapter = payload.chapter
    generated.difficulty = payload.difficulty
    generated.totalMarks = payload.totalMarks
    generated.timeMin = payload.timeMin
    generated.createdAt = datetime.now(timezone.utc).isoformat()
    generated.weakFocus = payload.weakFocus
    db.add(
        PracticePaper(
            id=generated.id,
            paper_json=generated.model_dump_json(exclude_none=True),
        )
    )
    db.commit()
    return generated


@router.post("/{paper_id}/submit", response_model=PaperResult)
async def submit_paper(
    paper_id: str, payload: PaperSubmission, db: Session = Depends(get_db)
):
    stored = db.get(PracticePaper, paper_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="Practice paper not found.")
    paper = PracticePaperData.model_validate_json(stored.paper_json)

    async def grade(question: PaperQuestion) -> PaperQuestionResult:
        answer = payload.answers.get(question.id, "").strip()
        if not answer:
            return PaperQuestionResult(
                id=question.id,
                awarded=0,
                status="skipped",
                feedback="You skipped this one — no worries. Read the model answer and try a similar question next time.",
            )
        if question.type == "mcq":
            graded = grade_mcq(answer, question.correct, question.options, question.marks)
            return PaperQuestionResult(
                id=question.id,
                awarded=graded.awarded,
                status=graded.status,
                feedback=f"{graded.feedback} {question.model}"
                if graded.status == "wrong"
                else graded.feedback,
            )
        try:
            graded = await grade_written_answer(
                question=question.text,
                model_answer=question.model,
                answer=answer,
                topic=question.topic,
                marks=question.marks,
                level=paper.level,
            )
        except OmniRouteError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        return PaperQuestionResult(
            id=question.id,
            awarded=min(float(question.marks), graded.awarded),
            status=graded.status,
            feedback=graded.feedback,
        )

    results = await asyncio.gather(*(grade(item) for item in paper.questions))
    by_id = {item.id: item for item in results}
    sections = [
        SectionResult(
            id=section.id,
            name=section.name,
            score=sum(
                by_id[question.id].awarded
                for question in paper.questions
                if question.section == section.id
            ),
            max=section.marks,
        )
        for section in paper.sections
    ]
    topic_marks: dict[str, list[float]] = {}
    for question in paper.questions:
        values = topic_marks.setdefault(question.topic, [0.0, 0.0])
        values[0] += by_id[question.id].awarded
        values[1] += question.marks
    weak_topics = [
        topic for topic, (score, maximum) in sorted(
            topic_marks.items(), key=lambda item: item[1][0] / item[1][1]
        ) if score < maximum
    ][:3]
    result = PaperResult(
        score=sum(item.awarded for item in results),
        total=paper.totalMarks,
        timeUsedSec=payload.timeUsedSec,
        perQ=results,
        sections=sections,
        weakTopics=weak_topics,
    )
    db.add(
        PracticeAttempt(
            paper_id=paper.id,
            subject=paper.subject,
            chapter=paper.chapter,
            total=paper.totalMarks,
            score=result.score,
            paper_json=paper.model_dump_json(),
            result_json=result.model_dump_json(),
        )
    )
    db.commit()
    return result


@router.post("/check", response_model=list[Evaluation], response_model_exclude_none=True)
async def check_handwritten(
    answers: list[UploadFile] = File(...),
    paper_id: str | None = Form(default=None, alias="paperId"),
    question_paper: UploadFile | None = File(default=None, alias="questionPaper"),
    db: Session = Depends(get_db),
):
    total_bytes = 0
    extracted: list[str] = []
    for file in answers:
        filename, content = await read_validated_upload(file)
        total_bytes += len(content)
        if total_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Combined uploads must be 20 MB or smaller.")
        try:
            pages = await extract_document(content, filename, file.content_type)
        except ValueError as error:
            raise HTTPException(status_code=415, detail=str(error)) from error
        extracted.append(format_page_text(pages))
    if not extracted:
        raise HTTPException(status_code=400, detail="Upload at least one answer image or PDF.")
    if question_paper:
        filename, content = await read_validated_upload(question_paper)
        total_bytes += len(content)
        if total_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Combined uploads must be 20 MB or smaller.")
        try:
            question_pages = await extract_document(content, filename, question_paper.content_type)
        except ValueError as error:
            raise HTTPException(status_code=415, detail=str(error)) from error
        question_text = format_page_text(question_pages)
    elif paper_id:
        stored = db.get(PracticePaper, paper_id)
        if stored is None:
            raise HTTPException(status_code=404, detail="Practice paper not found.")
        paper = PracticePaperData.model_validate_json(stored.paper_json)
        question_text = "\n".join(
            f"{question.id}. ({question.marks} marks) {question.text}"
            for question in paper.questions
        )
    else:
        question_text = "Use the questions visible in the uploaded answer pages."
    if total_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Combined uploads must be 20 MB or smaller.")
    try:
        result = await json_call(
            [
                {
                    "role": "system",
                    "content": (
                        "Evaluate handwritten student answers against the question paper. "
                        "Return evaluations with id, question, marks, answer, rubric "
                        "with exactly four rows named Concept, Explanation, Example, and "
                        "Presentation. Split each question's marks as 40%, 25%, 20%, and "
                        "15% respectively (round to two decimals and adjust Concept so "
                        "the maxima sum exactly to the question marks). Include good, "
                        "improve, model, and topic. Keep tone encouraging and do not invent "
                        "unreadable text."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Question paper:\n{question_text}\n\nStudent pages:\n" + "\n\n".join(extracted),
                },
            ],
            EvaluationSet,
            task="grading",
            validator=validate_evaluation_set,
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    for evaluation in result.evaluations:
        db.add(
            PracticeEvaluation(
                id=evaluation.id,
                evaluation_json=evaluation.model_dump_json(),
            )
        )
    db.commit()
    return result.evaluations


@router.post("/{evaluation_id}/re-evaluate", response_model=Evaluation)
async def re_evaluate(
    evaluation_id: str,
    payload: ReevaluateRequest,
    db: Session = Depends(get_db),
):
    previous = db.get(PracticeEvaluation, evaluation_id)
    if previous is None:
        raise HTTPException(status_code=404, detail="Evaluation not found. Please upload the answers again.")
    original = Evaluation.model_validate_json(previous.evaluation_json)
    try:
        result = await json_call(
            [
                {
                    "role": "system",
                    "content": (
                        "Re-evaluate the revised answer and return one Evaluation object with "
                        "the same schema: id, question, marks, answer, rubric, good, improve, "
                        "model, topic. The rubric must contain exactly Concept, Explanation, "
                        "Example, and Presentation rows, weighted 40%, 25%, 20%, and 15% of "
                        "the maximum marks; round to two decimals and adjust Concept so the "
                        "maxima total the question marks. Be encouraging and score only the "
                        "shown answer."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Original question: {original.question}\n"
                        f"Maximum marks: {original.marks}\n"
                        f"Topic: {original.topic}\n"
                        f"Model answer: {original.model}\n"
                        f"Previous rubric: {original.rubric}\n"
                        f"Revised answer:\n{payload.answer}"
                    ),
                },
            ],
            Evaluation,
            task="grading",
            validator=validate_evaluation_rubric,
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    result.id = evaluation_id
    result.answer = payload.answer
    previous.evaluation_json = result.model_dump_json()
    db.commit()
    return result
