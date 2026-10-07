import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.schemas import LevelId
from app.services.llm import OmniRouteError, json_call

router = APIRouter(prefix="/api", tags=["diagram"])
DiagramType = Literal[
    "Flowchart",
    "Mind Map",
    "Concept Map",
    "ER Diagram",
    "UML Class",
    "Sequence",
    "Process",
    "Network",
    "Block Diagram",
]


class Diagram(BaseModel):
    id: str
    prompt: str
    title: str
    type: DiagramType
    code: str
    explanation: str
    level: LevelId
    createdAt: str


class DiagramOutput(BaseModel):
    title: str
    code: str
    explanation: str


class DiagramRequest(BaseModel):
    action: Literal["refine"] | None = None
    prompt: str | None = Field(default=None, max_length=4000)
    type: DiagramType | None = None
    level: LevelId
    forceFlowchart: bool = False
    forceMindMap: bool = False
    diagram: Diagram | None = None
    instruction: str | None = Field(default=None, max_length=2000)


def _validate_notation(diagram_type: DiagramType, code: str, force_flow: bool, force_mind: bool) -> None:
    header = code.strip().splitlines()[0].strip().lower() if code.strip() else ""
    expected = {
        "ER Diagram": ("erdiagram",),
        "UML Class": ("classdiagram",),
        "Sequence": ("sequencediagram",),
        "Mind Map": ("mindmap",),
    }
    if force_mind or diagram_type == "Mind Map":
        valid = header.startswith("mindmap")
    elif force_flow or diagram_type in {"Flowchart", "Process"}:
        valid = header.startswith(("flowchart", "graph"))
    else:
        valid = not expected.get(diagram_type) or header.startswith(expected[diagram_type])
    if not valid:
        raise HTTPException(
            status_code=502,
            detail=f"The generated Mermaid code does not match the requested {diagram_type} notation.",
        )


@router.post("/diagram", response_model=Diagram)
async def generate_or_refine_diagram(payload: DiagramRequest):
    refining = payload.action == "refine"
    if refining:
        if payload.diagram is None or not payload.instruction:
            raise HTTPException(status_code=422, detail="A diagram and refinement instruction are required.")
        prompt = (
            f"Improve this Mermaid diagram according to the instruction. Keep valid Mermaid "
            f"syntax and preserve its educational meaning.\nType: {payload.diagram.type}\n"
            f"Level: {payload.level}\nInstruction: {payload.instruction}\n"
            f"Current code:\n{payload.diagram.code}"
        )
        diagram_type = payload.diagram.type
        original_prompt = f"{payload.diagram.prompt} — {payload.instruction}"
        previous_title = payload.diagram.title
    else:
        if not payload.prompt or not payload.type:
            raise HTTPException(status_code=422, detail="A prompt and diagram type are required.")
        diagram_type = "Flowchart" if payload.forceFlowchart else (
            "Mind Map" if payload.forceMindMap else payload.type
        )
        notation = (
            "Use Mermaid flowchart syntax and include explicit Start and End terminal shapes."
            if payload.forceFlowchart or diagram_type == "Flowchart"
            else "Use Mermaid mindmap syntax beginning with `mindmap`."
            if payload.forceMindMap or diagram_type == "Mind Map"
            else f"Use valid Mermaid syntax for {diagram_type}."
        )
        prompt = (
            f"Create an accurate student-friendly diagram about: {payload.prompt}\n"
            f"Type: {diagram_type}. Level: {payload.level}. {notation}\n"
            "Return a short title, raw Mermaid source code without fences, and a concise explanation."
        )
        original_prompt = payload.prompt
        previous_title = ""
    try:
        output = await json_call(
            [
                {"role": "system", "content": "You create correct Mermaid diagrams. Return JSON with title, code and explanation only."},
                {"role": "user", "content": prompt},
            ],
            DiagramOutput,
            task="mermaid",
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    title = output.title.strip() or previous_title or "Learning diagram"
    code = output.code.strip().removeprefix("```mermaid").removesuffix("```").strip()
    _validate_notation(diagram_type, code, payload.forceFlowchart, payload.forceMindMap)
    if (payload.forceFlowchart or diagram_type == "Flowchart") and not (
        "start" in code.casefold() and "end" in code.casefold()
    ):
        raise HTTPException(status_code=502, detail="Flowcharts must include Start and End nodes.")
    return Diagram(
        id=f"diagram-{uuid.uuid4()}",
        prompt=original_prompt,
        title=title,
        type=diagram_type,
        code=code,
        explanation=output.explanation,
        level=payload.level,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )
