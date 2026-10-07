"""Shared document extraction, page-aware retrieval, and generation helpers."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
from collections.abc import Sequence
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field, ValidationError

from app.config import settings
from app.services.llm import (
    CompletionTruncated,
    JsonCallError,
    chat,
    json_call,
    vision,
)
from app.services.rag import (
    DocumentPage,
    answer_document,
    estimate_tokens,
    format_page_text,
    page_groups,
    parse_page_markers,
    rank_pages,
)

logger = logging.getLogger(__name__)


class GeneratedMcq(BaseModel):
    q: str
    options: tuple[str, str, str, str]
    correct: int = Field(ge=0, le=3)
    explanation: str


class RawMcqSet(BaseModel):
    mcqs: list[dict[str, Any]] = Field(
        validation_alias=AliasChoices(
            "mcqs", "MCQs", "questions", "Questions", "items", "Items"
        )
    )


class GeneratedFlashcard(BaseModel):
    front: str
    back: str


class FlashcardSet(BaseModel):
    cards: list[GeneratedFlashcard] = Field(min_length=1)


class GeneratedQuestion(BaseModel):
    q: str
    marks: int = Field(gt=0)


class ImportantQuestionSet(BaseModel):
    questions: list[GeneratedQuestion] = Field(min_length=1)


def _normalise_mcq(item: dict[str, Any]) -> GeneratedMcq | None:
    fields = {
        re.sub(r"[^a-z0-9]", "", key.casefold()): value
        for key, value in item.items()
    }
    question = next(
        (
            fields[key]
            for key in ("q", "question", "text", "prompt")
            if isinstance(fields.get(key), str) and fields[key].strip()
        ),
        None,
    )
    if question is None:
        return None

    options = fields.get("options", fields.get("choices"))
    if isinstance(options, dict):
        option_fields = {
            re.sub(r"[^a-z0-9]", "", str(key).casefold()): value
            for key, value in options.items()
        }
        ordered = [option_fields[key] for key in "abcd" if key in option_fields]
        options = ordered if len(ordered) == 4 else list(options.values())
    if not isinstance(options, list):
        options = [fields[key] for key in "abcd" if isinstance(fields.get(key), str)]
    if len(options) != 4 or not all(isinstance(option, str) for option in options):
        return None

    answer_key = next(
        (
            key
            for key in (
                "correct",
                "correctindex",
                "answerindex",
                "answer",
                "correctanswer",
                "answerletter",
            )
            if fields.get(key) is not None
        ),
        None,
    )
    if answer_key is None:
        return None
    answer = fields[answer_key]
    correct: int | None = None
    if isinstance(answer, int) and not isinstance(answer, bool):
        if answer_key == "answerindex" and 1 <= answer <= 4:
            correct = answer - 1
        elif 0 <= answer <= 3:
            correct = answer
        elif answer == 4:
            correct = 3
    elif isinstance(answer, str):
        answer_text = answer.strip()
        letter = re.fullmatch(r"(?:OPTION\s*)?([A-D])[\).]?", answer_text, re.IGNORECASE)
        if letter:
            correct = ord(letter.group(1).upper()) - ord("A")
        else:
            try:
                numeric = int(answer_text)
            except ValueError:
                numeric = -1
            if answer_key == "answerindex" and 1 <= numeric <= 4:
                correct = numeric - 1
            elif 0 <= numeric <= 3:
                correct = numeric
            else:
                correct = next(
                    (
                        index
                        for index, option in enumerate(options)
                        if option.strip().casefold() == answer_text.casefold()
                    ),
                    None,
                )
    if correct is None:
        return None

    explanation = next(
        (
            fields[key]
            for key in ("explanation", "rationale", "reason")
            if isinstance(fields.get(key), str)
        ),
        "",
    )
    try:
        return GeneratedMcq.model_validate(
            {
                "q": question.strip(),
                "options": options,
                "correct": correct,
                "explanation": explanation.strip(),
            }
        )
    except ValidationError:
        return None


def _recover_partial_mcqs(raw: str) -> list[dict[str, Any]]:
    decoder = json.JSONDecoder()
    recovered: list[dict[str, Any]] = []
    question_keys = {"q", "question", "text", "prompt"}
    for offset, character in enumerate(raw):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(raw[offset:])
        except json.JSONDecodeError:
            continue
        normalized_keys = (
            {re.sub(r"[^a-z0-9]", "", key.casefold()) for key in value}
            if isinstance(value, dict)
            else set()
        )
        if isinstance(value, dict) and question_keys.intersection(normalized_keys):
            recovered.append(value)
    return recovered


async def _generate_mcq_batch(
    context: str, batch_number: int, requested: int
) -> list[GeneratedMcq]:
    accepted: list[GeneratedMcq] = []
    seen_questions: set[str] = set()
    failure_reason = "the model returned too few valid questions"

    for attempt in range(3):
        missing = requested - len(accepted)
        if missing <= 0:
            break
        messages = [
            {
                "role": "system",
                "content": (
                    f"Create exactly {missing} concise multiple-choice questions, grounded "
                    "only in the source pages. Return compact JSON only, with each item "
                    "having q, four short options, correct (zero-based index), and a brief "
                    "explanation. No markdown or commentary."
                ),
            },
            {"role": "user", "content": context},
        ]
        if seen_questions:
            messages.append(
                {
                    "role": "user",
                    "content": "Do not repeat these questions: "
                    + " | ".join(sorted(seen_questions)),
                }
            )
        try:
            response = await json_call(
                messages,
                RawMcqSet,
                task="mcq",
                step=f"document MCQ batch {batch_number}",
                timeout=90,
                max_tokens=250 * missing,
            )
            candidates = response.mcqs
        except CompletionTruncated as error:
            candidates = _recover_partial_mcqs(error.content)
            failure_reason = "completion truncated at token limit"
        except JsonCallError as error:
            candidates = _recover_partial_mcqs(error.raw_response)
            failure_reason = error.error_type

        for candidate in candidates:
            normalized = _normalise_mcq(candidate)
            if normalized is None:
                continue
            key = normalized.q.casefold()
            if key in seen_questions:
                continue
            seen_questions.add(key)
            accepted.append(normalized)
            if len(accepted) == requested:
                break

    if len(accepted) != requested:
        raise ValueError(
            f"MCQ generation failed: received {len(accepted)} of {requested} "
            f"valid questions after retries ({failure_reason})."
        )
    return accepted


async def _generate_document_mcqs(context: str) -> list[GeneratedMcq]:
    batch_sizes = [4, 2]
    batches = await asyncio.gather(
        *(
            _generate_mcq_batch(context, batch_number, size)
            for batch_number, size in enumerate(batch_sizes, start=1)
        )
    )
    return [question for batch in batches for question in batch]


def _page_text_from_vision(result: str, page_numbers: Sequence[int]) -> list[DocumentPage]:
    marked = parse_page_markers(result)
    by_number = {item.page: item.text for item in marked}
    if len(marked) == len(page_numbers) and not set(by_number).intersection(page_numbers):
        return [
            DocumentPage(page=number, text=item.text)
            for number, item in zip(page_numbers, marked, strict=True)
        ]
    if len(page_numbers) == 1 and not marked:
        return [DocumentPage(page=page_numbers[0], text=result.strip())]
    return [
        DocumentPage(page=number, text=by_number.get(number, "").strip())
        for number in page_numbers
    ]


def _data_url(data: bytes, media_type: str) -> str:
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def _ocr_fallback(image: bytes) -> str:
    """Run local OCR only after multimodal extraction fails and Tesseract exists."""
    try:
        import cv2
        import numpy as np
        import pytesseract
    except ImportError:
        return ""
    from pathlib import Path
    import shutil

    executable = pytesseract.pytesseract.tesseract_cmd
    if not (shutil.which(executable) or Path(executable).is_file()):
        return ""
    try:
        buffer = np.frombuffer(image, dtype=np.uint8)
        gray = cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE)
        if gray is None:
            return ""
        denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
        thresholded = cv2.adaptiveThreshold(
            denoised,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            11,
        )
        return pytesseract.image_to_string(thresholded).strip()
    except (OSError, RuntimeError, ValueError):
        logger.info("Tesseract OCR fallback could not process an image")
        return ""


async def _extract_images(
    images: Sequence[tuple[int, bytes]], *, page_images: bool
) -> list[DocumentPage]:
    results: list[DocumentPage] = []
    for offset in range(0, len(images), 8):
        batch = images[offset : offset + 8]
        page_numbers = [page for page, _ in batch]
        labelled_images = [
            _data_url(image, "image/png") for _, image in batch
        ]
        prompt = (
            "Transcribe all readable text from these document images faithfully. "
            "Keep equations and question numbering. Return each page with exactly "
            "this heading format: [Page N], using the supplied page number for each "
            "image. Do not invent unreadable text."
            if page_images
            else "Transcribe all readable text from this image faithfully. Keep "
            "equations, headings, and question numbering. Do not invent unreadable text."
        )
        try:
            response = await vision(labelled_images, prompt)
            results.extend(_page_text_from_vision(response, page_numbers))
        except Exception as error:
            logger.warning("Multimodal document extraction failed: %s", type(error).__name__)
            for page_number, image in batch:
                fallback_text = await asyncio.to_thread(_ocr_fallback, image)
                results.append(DocumentPage(page=page_number, text=fallback_text))
    return results


async def extract_document(
    data: bytes, filename: str, content_type: str | None = None
) -> list[DocumentPage]:
    """Extract page text from an image or PDF; PDFs are never sent to an LLM."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    normalized_type = (content_type or "").lower()
    if extension == "pdf" or normalized_type == "application/pdf":
        import fitz

        try:
            pdf = fitz.open(stream=data, filetype="pdf")
        except (RuntimeError, ValueError) as error:
            raise ValueError("The uploaded PDF could not be opened.") from error
        text_pages: list[DocumentPage] = []
        scanned_images: list[tuple[int, bytes]] = []
        for index, page in enumerate(pdf):
            number = index + 1
            page_text = page.get_text("text").strip()
            if len(re.sub(r"\s+", "", page_text)) >= 40:
                text_pages.append(DocumentPage(page=number, text=page_text))
                continue
            pixmap = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72), alpha=False)
            scanned_images.append((number, pixmap.tobytes("png")))
        pdf.close()
        if scanned_images:
            text_pages.extend(await _extract_images(scanned_images, page_images=True))
        return sorted(text_pages, key=lambda item: item.page)

    if extension in {"jpg", "jpeg", "png"} or normalized_type in {"image/jpeg", "image/png"}:
        media_type = normalized_type if normalized_type.startswith("image/") else (
            "image/jpeg" if extension in {"jpg", "jpeg"} else "image/png"
        )
        try:
            response = await vision([_data_url(data, media_type)], "Transcribe all readable "
                                    "text from this image faithfully. Keep question numbers, "
                                    "headings, and equations. Do not invent unreadable text.")
            return [DocumentPage(page=1, text=response.strip())]
        except Exception as error:
            logger.warning("Multimodal image extraction failed: %s", type(error).__name__)
            return [DocumentPage(page=1, text=await asyncio.to_thread(_ocr_fallback, data))]
    raise ValueError("Upload a PDF, JPG, or PNG file.")


async def _generate_summary_group(pages: Sequence[DocumentPage], task: str) -> str:
    instruction = (
        "Create detailed study notes with clear headings, important definitions, "
        "and likely exam questions with marks. Include Markdown sections titled "
        "'Important Definitions' and 'Exam Questions'."
        if task == "notes"
        else "Summarise the key ideas accurately. Preserve important formulas and definitions."
    )
    return await chat(
        [
            {"role": "system", "content": instruction},
            {"role": "user", "content": format_page_text(pages)},
        ],
        task="notes" if task == "notes" else "multimodal",
        temperature=0.2,
    )


async def generate_document_result(
    pages: Sequence[DocumentPage], task: Literal["explain", "summary", "notes", "mcqs", "flashcards", "questions"],
    token_estimate: int,
) -> dict[str, object]:
    is_large = token_estimate > settings.long_context_max_tokens
    if task in {"summary", "notes"} and is_large:
        group_chars = max(4000, min(48_000, settings.long_context_max_tokens * 2))
        groups = page_groups(pages, group_chars)
        partials = await asyncio.gather(*(_generate_summary_group(group, task) for group in groups))
        combined = await chat(
            [
                {
                    "role": "system",
                    "content": (
                        "Combine the supplied page-group material into a coherent, accurate "
                        + (
                            "set of study notes with Markdown headings, sections titled "
                            "'Important Definitions' and 'Exam Questions', and questions with marks."
                            if task == "notes"
                            else "chapter summary with clear headings, key formulas and definitions."
                        )
                    ),
                },
                {"role": "user", "content": "\n\n".join(partials)},
            ],
            task="notes" if task == "notes" else "multimodal",
            temperature=0.2,
        )
        return {"kind": task, "md": combined}

    if is_large:
        relevant = rank_pages(
            {
                "explain": "explain key concepts and definitions",
                "mcqs": "important concepts, facts and exam questions",
                "flashcards": "important terms, definitions and formulas",
                "questions": "important likely exam questions and marks",
            }.get(task, task),
            pages,
            limit=12,
        )
    else:
        relevant = list(pages)
    context = format_page_text(relevant)
    if task in {"explain", "summary", "notes"}:
        instruction = {
            "explain": "Explain the main concepts clearly and at an accessible student level.",
            "summary": "Write a concise chapter summary with headings, formulas and definitions.",
            "notes": (
                "Write study notes with Markdown headings and sections titled "
                "'Important Definitions' and 'Exam Questions'. Include likely "
                "exam questions with marks."
            ),
        }[task]
        markdown = await chat(
            [
                {"role": "system", "content": instruction},
                {"role": "user", "content": context},
            ],
            task="notes" if task == "notes" else "multimodal",
            temperature=0.2,
        )
        return {"kind": task, "md": markdown}

    base_messages = [
        {
            "role": "system",
            "content": (
                f"Create exactly 6 {task} items grounded only in the source pages. "
                "Keep language appropriate for a school learner. Return the schema requested."
            ),
        },
        {"role": "user", "content": context},
    ]
    if task == "mcqs":
        generated = await _generate_document_mcqs(context)
        return {"kind": "mcqs", "mcqs": [item.model_dump() for item in generated]}
    if task == "flashcards":
        generated = await json_call(base_messages, FlashcardSet, task="flashcard")
        return {"kind": "flashcards", "cards": [item.model_dump() for item in generated.cards]}
    generated = await json_call(base_messages, ImportantQuestionSet, task="json")
    return {"kind": "questions", "questions": [item.model_dump() for item in generated.questions]}
