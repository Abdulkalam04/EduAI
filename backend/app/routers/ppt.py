import re
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.responses import Response

from app.schemas import LevelId
from app.services.llm import OmniRouteError, json_call
from app.services.pptx_builder import build_pptx

router = APIRouter(prefix="/api", tags=["ppt"])
PptTheme = Literal["Indigo Modern", "Clean White", "Dark Elegant", "Playful"]
SlideKind = Literal["title", "content", "quiz", "conclusion"]


class DeckSlide(BaseModel):
    id: str = ""
    title: str
    bullets: list[str] = Field(max_length=5)
    notes: str = ""
    kind: SlideKind
    diagram: str | None = None


class DeckOutput(BaseModel):
    slides: list[DeckSlide] = Field(min_length=5, max_length=20)


class PptRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    level: LevelId
    slides: int = Field(ge=5, le=20)
    theme: PptTheme
    speakerNotes: bool
    includeDiagrams: bool
    includeQuiz: bool
    extra: str = Field(default="", max_length=4000)


class PptxExportRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    theme: PptTheme
    slides: list[DeckSlide] = Field(min_length=1, max_length=20)
    speakerNotes: bool


@router.post("/ppt")
async def generate_presentation(payload: PptRequest):
    prompt = (
        f"Create exactly {payload.slides} slides about {payload.topic!r} for learner "
        f"level {payload.level}. Theme: {payload.theme}. Include speaker notes: "
        f"{payload.speakerNotes}. Include Mermaid diagrams when relevant: "
        f"{payload.includeDiagrams}. Include a quiz slide: {payload.includeQuiz}. "
        f"Extra instructions: {payload.extra or 'none'}.\n"
        "Return a JSON object with slides array. Each slide has title, up to 5 concise "
        "bullets, notes, kind (title/content/quiz/conclusion), and an optional raw "
        "Mermaid diagram. First slide must be title, last conclusion, and include a "
        "quiz slide if requested. Notes must be empty when speaker notes are disabled."
    )
    try:
        result = await json_call(
            [
                {"role": "system", "content": "Build accurate, coherent educational slide decks. Return JSON only."},
                {"role": "user", "content": prompt},
            ],
            DeckOutput,
            task="ppt",
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    slides = result.slides
    if len(slides) != payload.slides:
        raise HTTPException(status_code=502, detail="The generated deck does not match the requested slide count.")
    if slides[0].kind != "title" or slides[-1].kind != "conclusion":
        raise HTTPException(status_code=502, detail="The deck must start with a title slide and end with a conclusion.")
    if payload.includeQuiz and not any(slide.kind == "quiz" for slide in slides):
        raise HTTPException(status_code=502, detail="The generated deck is missing its requested quiz slide.")
    for index, slide in enumerate(slides, start=1):
        slide.id = f"s{index}"
        if not payload.speakerNotes:
            slide.notes = ""
        if not payload.includeDiagrams:
            slide.diagram = None
    return {
        "id": f"deck-{uuid.uuid4()}",
        "topic": payload.topic,
        "level": payload.level,
        "theme": payload.theme,
        "slides": [slide.model_dump(exclude_none=True) for slide in slides],
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "speakerNotes": payload.speakerNotes,
    }


@router.post("/pptx")
def export_presentation(payload: PptxExportRequest) -> Response:
    try:
        content = build_pptx(
            topic=payload.topic,
            theme=payload.theme,
            slides=[slide.model_dump() for slide in payload.slides],
            speaker_notes=payload.speakerNotes,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    filename = re.sub(r"[^A-Za-z0-9_-]+", "-", payload.topic).strip("-") or "presentation"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pptx"'},
    )
