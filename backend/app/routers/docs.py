import json
import re
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import StudyDocument
from app.security import read_validated_upload
from app.services.documents import (
    extract_document,
    generate_document_result,
)
from app.services.llm import OmniRouteError
from app.services.rag import DocumentPage, answer_document, estimate_tokens

router = APIRouter(prefix="/api", tags=["documents"])
DocTask = Literal["explain", "summary", "notes", "mcqs", "flashcards", "questions"]
LevelId = Literal["c1-5", "c6-8", "c9-10", "c11-12", "grad"]


class DocumentQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=20_000)
    level: LevelId = "c9-10"


class DocumentGeneration(BaseModel):
    task: DocTask
    level: LevelId = "c9-10"


def _pages(document: StudyDocument) -> list[DocumentPage]:
    values = json.loads(document.pages_json)
    return [DocumentPage(page=item["page"], text=item["text"]) for item in values]


def _sections(pages: list[DocumentPage]) -> list[dict[str, int | str]]:
    sections: list[dict[str, int | str]] = []
    seen: set[str] = set()
    heading_pattern = re.compile(r"^(?:chapter|section|\d+(?:\.\d+)*[.)]?)\b", re.I)
    for page in pages:
        for line in page.text.splitlines():
            heading = re.sub(r"\s+", " ", line).strip(" \t#")
            if not heading or len(heading) > 100:
                continue
            if heading_pattern.search(heading) or (
                len(heading.split()) <= 10 and heading.isupper()
            ):
                key = heading.casefold()
                if key not in seen:
                    sections.append({"title": heading, "page": page.page})
                    seen.add(key)
                break
    if not sections and pages:
        title = next((line.strip() for line in pages[0].text.splitlines() if line.strip()), "Introduction")
        sections.append({"title": title[:100], "page": pages[0].page})
    return sections[:30]


def _book_doc(document: StudyDocument) -> dict[str, object]:
    return {
        "id": document.id,
        "title": document.title,
        "pages": document.page_count,
        "uploadedAt": document.uploaded_at,
        "sections": json.loads(document.sections_json),
    }


def _stored_pages(document: StudyDocument) -> list[DocumentPage]:
    return _pages(document)


@router.post("/docs/upload")
async def upload_document(
    file: UploadFile = File(...), db: Session = Depends(get_db)
) -> dict[str, object]:
    filename, payload = await read_validated_upload(file)
    content_type = file.content_type or ""
    try:
        pages = await extract_document(payload, filename, content_type)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not pages:
        raise HTTPException(status_code=422, detail="No pages could be extracted from this file.")
    full_text = "\n\n".join(f"[Page {item.page}]\n{item.text}" for item in pages)
    document = StudyDocument(
        id=str(uuid.uuid4()),
        title=filename,
        page_count=len(pages),
        uploaded_at=date.today().isoformat(),
        pages_json=json.dumps(
            [{"page": item.page, "text": item.text} for item in pages],
            ensure_ascii=False,
        ),
        token_estimate=estimate_tokens(full_text),
        sections_json=json.dumps(_sections(pages), ensure_ascii=False),
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return _book_doc(document)


@router.get("/docs")
def list_documents(db: Session = Depends(get_db)) -> list[dict[str, object]]:
    documents = db.scalars(
        select(StudyDocument).order_by(StudyDocument.uploaded_at.desc(), StudyDocument.id)
    ).all()
    return [_book_doc(item) for item in documents]


@router.delete("/docs/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)) -> None:
    document = db.get(StudyDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    db.delete(document)
    db.commit()


@router.post("/docs/{document_id}/ask")
async def ask_document(
    document_id: str,
    payload: DocumentQuestion,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = db.get(StudyDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        answer, cited_pages = await answer_document(
            _stored_pages(document),
            payload.question,
            payload.level,
            document.token_estimate,
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    sources = [
        {"page": item.page, "quote": item.text[:1200]}
        for item in cited_pages
    ]
    return {"text": answer, "sources": sources}


@router.post("/docs/{document_id}/generate")
async def generate_from_document(
    document_id: str,
    payload: DocumentGeneration,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = db.get(StudyDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        return await generate_document_result(
            _stored_pages(document), payload.task, document.token_estimate
        )
    except OmniRouteError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
