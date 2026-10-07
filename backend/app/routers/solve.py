import asyncio
import logging
import re
import uuid
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from app.config import settings
from app.schemas import LevelId
from app.security import read_validated_upload
from app.services.documents import extract_document, format_page_text
from app.services.llm import OmniRouteError, json_call
from app.services.prompts import _LEVEL_INSTRUCTIONS
from app.services import llm

router = APIRouter(prefix="/api", tags=["solve"])
logger = logging.getLogger(__name__)
SolveMode = Literal["teach", "exam"]
SolveStyle = Literal["Simple", "Exam", "Detailed"]


class ExtractedQuestion(BaseModel):
    number: int = Field(ge=1)
    text: str = Field(min_length=1)
    marks: int = Field(default=2, ge=1)


class ExtractedQuestionSet(BaseModel):
    questions: list[ExtractedQuestion]


class SolutionBlock(BaseModel):
    label: str
    content: str


class SolvedContent(BaseModel):
    given: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    therefore: str = ""
    answer: str = ""
    blocks: list[SolutionBlock] | None = None
    hints: list[str] = Field(default_factory=list)


class FollowUpQuestion(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    n: int
    text: str
    marks: int
    status: Literal["solved", "review"] = "solved"
    hints: list[str] = Field(default_factory=list)
    solution: dict[str, object] = Field(default_factory=dict)


class ResolveRequest(BaseModel):
    question: FollowUpQuestion
    text: str = Field(min_length=1, max_length=20_000)
    level: LevelId
    style: SolveStyle = "Exam"
    mode: SolveMode = "exam"


class FollowUpRequest(BaseModel):
    kind: Literal["simpler", "method", "similar"]
    question: FollowUpQuestion


_NUMBERED_QUESTION = re.compile(
    r"(?m)^\s*(?:Q(?:uestion)?\s*)?(?P<number>\d{1,3})\s*[.)\:]\s+"
)
_MARKS = re.compile(r"[\[(]?\s*(\d{1,3})\s*(?:marks?|m)\s*[\])]?", re.I)


def split_questions_regex(text: str) -> list[ExtractedQuestion]:
    """Last-resort question splitter for text when structured extraction fails."""
    text = re.sub(r"(?m)^\s*\[Page\s+\d+\]\s*$", "", text).strip()
    matches = list(_NUMBERED_QUESTION.finditer(text))
    questions: list[ExtractedQuestion] = []
    if matches:
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            content = text[match.end() : end].strip()
            marks_match = _MARKS.search(content)
            marks = int(marks_match.group(1)) if marks_match else 2
            content = re.sub(r"\s*(?:\[\s*\d+\s*marks?\s*\]|\(\s*\d+\s*marks?\s*\))\s*$", "", content, flags=re.I)
            if content:
                questions.append(
                    ExtractedQuestion(number=int(match.group("number")), text=content, marks=marks)
                )
        if questions:
            return questions
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    return [
        ExtractedQuestion(number=index, text=paragraph, marks=2)
        for index, paragraph in enumerate(paragraphs, start=1)
    ]


async def extract_questions(text: str) -> list[ExtractedQuestion]:
    messages = [
        {
            "role": "system",
            "content": (
                "Act as an expert examiner. Extract every question exactly, with its "
                "number and marks if visible. Return JSON only. Use the schema "
                '{"questions":[{"number":1,"text":"...","marks":2}]}. '
                "Do not answer or paraphrase the questions."
            ),
        },
        {"role": "user", "content": f"Exam paper text:\n{text}"},
    ]
    try:
        result = await json_call(messages, ExtractedQuestionSet, task="split")
        if result.questions:
            return sorted(result.questions, key=lambda question: question.number)
    except (OmniRouteError, ValueError) as error:
        logger.warning(
            "Structured question extraction failed; using regex fallback: %s",
            type(error).__name__,
        )
    return split_questions_regex(text)


def _sample_paper_text(subject: str | None) -> str:
    selected_subject = subject or "Mathematics"
    return (
        f"Sample {selected_subject} examination paper:\n"
        "1. Solve 2x + 5 = 15. [2 marks]\n"
        "2. Factorise x^2 + 5x + 6. [3 marks]\n"
        "3. Find the area of a circle with radius 7 cm. [2 marks]\n"
    )


async def _solve_question(
    question: ExtractedQuestion,
    level: LevelId,
    subject: str | None,
    mode: SolveMode,
    style: SolveStyle,
) -> dict[str, object]:
    subject_text = f" Subject: {subject}." if subject else ""
    is_theory = bool(re.search(r"\b(?:define|what is|state|explain|describe|why)\b", question.text, re.I))
    if mode == "teach":
        format_instruction = (
            "Return exactly two progressive hints before the full solution. "
            "Do not reveal the final answer in either hint."
        )
    elif is_theory:
        format_instruction = (
            "For theory, structure blocks as Definition -> Explanation -> Example -> Conclusion. "
            "Use those labels in blocks and give a concise final answer."
        )
    else:
        format_instruction = (
            "For mathematics, provide Given -> clear step-by-step working -> Therefore -> Answer. "
            "Use LaTeX for mathematical expressions."
        )
    system = (
        f"{_LEVEL_INSTRUCTIONS[level]}{subject_text}\n"
        f"Answer style: {style}. {format_instruction}\n"
        "Return a JSON object with keys given (string array), steps (string array), "
        "therefore (string), answer (string), blocks (optional array of {label,content}), "
        "and hints (exactly two short progressive hints). Be accurate and encouraging."
    )
    async with _question_semaphore:
        solved = await json_call(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Question ({question.marks} marks): {question.text}"},
            ],
            SolvedContent,
            task="solve",
        )
    hints = list(solved.hints[:2])
    while len(hints) < 2:
        hints.append(
            "Identify what is given and which rule or formula connects it to the answer."
            if not hints
            else "Work through the next step carefully, then check your result."
        )
    blocks = solved.blocks
    if is_theory:
        explanation = " ".join(solved.steps) or solved.therefore or solved.answer
        supplied = {block.label.casefold(): block.content for block in blocks or []}
        defaults = {
            "definition": solved.given[0] if solved.given else solved.answer,
            "explanation": explanation,
            "example": solved.given[1] if len(solved.given) > 1 else solved.answer,
            "conclusion": solved.therefore or solved.answer,
        }
        blocks = [
            SolutionBlock(label=label.title(), content=supplied.get(label, "") or defaults[label])
            for label in ("definition", "explanation", "example", "conclusion")
        ]
    return {
        "id": str(uuid.uuid4()),
        "n": question.number,
        "text": question.text,
        "marks": question.marks,
        "status": "solved",
        "hints": hints,
        "solution": {
            "given": solved.given,
            "steps": solved.steps,
            "therefore": solved.therefore,
            "answer": solved.answer,
            **({"blocks": [block.model_dump() for block in blocks]} if blocks else {}),
        },
    }


_question_semaphore = asyncio.Semaphore(settings.max_concurrent_llm)


@router.post("/solve")
async def solve_paper(
    file: UploadFile | None = File(default=None),
    level: LevelId = Form(default="c9-10"),
    subject: str | None = Form(default=None),
    mode: SolveMode = Form(default="exam"),
    style: SolveStyle = Form(default="Exam"),
    sample: str = Form(default="false"),
) -> list[dict[str, object]]:
    if file is None:
        if sample.lower() not in {"true", "1", "yes"}:
            raise HTTPException(status_code=400, detail="Upload a question paper to solve.")
        source_text = _sample_paper_text(subject)
    else:
        filename, payload = await read_validated_upload(file)
        try:
            pages = await extract_document(payload, filename, file.content_type)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        source_text = format_page_text(pages)
    if not source_text.strip():
        raise HTTPException(status_code=422, detail="No readable text was found in the paper.")
    questions = await extract_questions(source_text)
    if not questions:
        raise HTTPException(status_code=422, detail="No questions could be found in the paper.")
    try:
        return await asyncio.gather(
            *(
                _solve_question(question, level, subject, mode, style)
                for question in questions
            )
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/solve/resolve")
async def resolve_question(payload: ResolveRequest) -> dict[str, object]:
    question = ExtractedQuestion(
        number=payload.question.n,
        text=payload.text,
        marks=payload.question.marks,
    )
    try:
        result = await _solve_question(
            question, payload.level, None, payload.mode, payload.style
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    result["id"] = payload.question.id
    return result


@router.post("/solve/follow-up")
async def solve_follow_up(payload: FollowUpRequest) -> str:
    instructions = {
        "simpler": (
            "Explain the solution in simpler words at the learner's level. Keep the "
            "mathematics correct and do not omit essential steps."
        ),
        "method": "Show a genuinely different valid method to solve the same question.",
        "similar": (
            "Write one similar practice question with changed values or context. "
            "Include its answer in a short parenthetical check."
        ),
    }
    try:
        return await llm.chat(
            [
                {"role": "system", "content": instructions[payload.kind]},
                {
                    "role": "user",
                    "content": (
                        f"Question: {payload.question.text}\n"
                        f"Current solution: {payload.question.solution}"
                    ),
                },
            ],
            task="solve",
            temperature=0.3,
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
