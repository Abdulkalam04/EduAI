"""Page-aware retrieval and long-context document question answering."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.config import settings
from app.services.llm import chat

_TOKEN = re.compile(r"[a-z0-9]+")
_PAGE_MARKER = re.compile(
    r"(?im)^\s*(?:\[Page\s+(\d+)\]|(?:-{2,}\s*)?Page\s+(\d+)(?:\s*-{2,})?\s*:?)\s*$"
)


@dataclass(frozen=True)
class DocumentPage:
    page: int
    text: str


def parse_page_markers(text: str) -> list[DocumentPage]:
    """Split text into numbered pages while preserving the source page labels."""
    matches = list(_PAGE_MARKER.finditer(text))
    pages: list[DocumentPage] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        page_number = int(match.group(1) or match.group(2))
        pages.append(DocumentPage(page=page_number, text=text[start:end].strip()))
    return pages


def format_page_text(pages: Sequence[DocumentPage]) -> str:
    return "\n\n".join(f"[Page {item.page}]\n{item.text}" for item in pages)


def estimate_tokens(text: str) -> int:
    return max(1, (len(text) + 3) // 4)


def rank_pages(
    query: str, pages: Sequence[DocumentPage], limit: int = 8
) -> list[DocumentPage]:
    """Select relevant pages with BM25 and keep deterministic source order."""
    if limit <= 0:
        return []
    from rank_bm25 import BM25Okapi

    tokenized_pages = [_TOKEN.findall(page.text.lower()) for page in pages]
    if not pages or not any(tokenized_pages):
        return list(pages[:limit])
    query_tokens = _TOKEN.findall(query.lower())
    if not query_tokens:
        return list(pages[:limit])
    scores = BM25Okapi(tokenized_pages).get_scores(query_tokens)
    ranked = sorted(range(len(pages)), key=lambda index: scores[index], reverse=True)
    selected = [pages[index] for index in ranked[:limit] if scores[index] > 0]
    if not selected:
        selected = [pages[index] for index in ranked[:limit]]
    return sorted(selected, key=lambda item: item.page)


def page_groups(
    pages: Sequence[DocumentPage], max_chars: int
) -> list[list[DocumentPage]]:
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")
    groups: list[list[DocumentPage]] = []
    current: list[DocumentPage] = []
    size = 0
    for page in pages:
        page_size = len(page.text) + 32
        if current and size + page_size > max_chars:
            groups.append(current)
            current, size = [], 0
        current.append(page)
        size += page_size
    if current:
        groups.append(current)
    return groups


def parse_citations(answer: str) -> list[int]:
    return list(
        dict.fromkeys(
            int(match) for match in re.findall(r"\[?Page\s+(\d+)\]?", answer, re.I)
        )
    )


async def answer_document(
    pages: Sequence[DocumentPage], question: str, level: str, token_estimate: int
) -> tuple[str, list[DocumentPage]]:
    if not pages:
        raise ValueError("The document does not contain any pages to search.")
    if token_estimate <= settings.long_context_max_tokens:
        selected = list(pages)
    else:
        selected = rank_pages(question, pages, limit=8)
    by_number = {item.page: item for item in selected}
    messages = [
        {
            "role": "system",
            "content": (
                f"Answer the student's question using only the supplied textbook pages. "
                f"Adapt the explanation to level {level}. Cite every factual claim with "
                "[Page N] citations. If the answer is not in the pages, say so."
            ),
        },
        {
            "role": "user",
            "content": f"Textbook pages:\n{format_page_text(selected)}\n\nQuestion: {question}",
        },
    ]
    answer = await chat(messages, task="multimodal", temperature=0.2)
    sources = [
        by_number[number] for number in parse_citations(answer) if number in by_number
    ]
    if not sources:
        messages.extend(
            [
                {"role": "assistant", "content": answer},
                {
                    "role": "user",
                    "content": (
                        "Rewrite your answer and include valid [Page N] citations for its "
                        f"claims. Cite only these available page numbers: {sorted(by_number)}."
                    ),
                },
            ]
        )
        answer = await chat(messages, task="multimodal", temperature=0.2)
        sources = [
            by_number[number]
            for number in parse_citations(answer)
            if number in by_number
        ]
    if not sources:
        raise ValueError("The generated answer did not include valid page citations.")
    return answer, sources
