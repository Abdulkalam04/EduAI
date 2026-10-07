import asyncio

import fitz

from app.routers import solve
from app.services import documents, rag
from app.services.documents import DocumentPage


def test_question_extraction_uses_json_model_result(monkeypatch):
    calls = []

    async def fake_json_call(messages, response_model, task="json"):
        calls.append((messages, response_model, task))
        return response_model(
            questions=[
                {"number": 3, "text": "Explain photosynthesis.", "marks": 5},
                {"number": 4, "text": "Define chlorophyll.", "marks": 2},
            ]
        )

    monkeypatch.setattr(solve, "json_call", fake_json_call)
    questions = asyncio.run(solve.extract_questions("[Page 1]\n3. Explain photosynthesis."))

    assert [(item.number, item.text, item.marks) for item in questions] == [
        (3, "Explain photosynthesis.", 5),
        (4, "Define chlorophyll.", 2),
    ]
    assert calls[0][1] is solve.ExtractedQuestionSet
    assert calls[0][2] == "split"
    assert "Act as an expert examiner" in calls[0][0][0]["content"]


def test_question_extraction_falls_back_to_numbered_text():
    questions = solve.split_questions_regex(
        "1. State Ohm's law. [2 marks]\n\n"
        "2. Calculate current when V = 12 V and R = 4 Ω. (3 marks)"
    )

    assert [(item.number, item.marks) for item in questions] == [(1, 2), (2, 3)]
    assert questions[0].text == "State Ohm's law."
    assert "Calculate current" in questions[1].text


def test_solver_response_matches_frontend_question_shape(monkeypatch):
    async def fake_json_call(messages, response_model, task="json"):
        return response_model(
            answer="Gravity is a force.",
            given=["Gravity is a force that attracts objects."],
            steps=["It pulls objects toward one another."],
            hints=["Think about what makes objects fall.", "Gravity is the force pulling them."],
        )

    monkeypatch.setattr(solve, "json_call", fake_json_call)
    question = solve.ExtractedQuestion(number=2, text="Define gravity.", marks=2)
    result = asyncio.run(solve._solve_question(question, "c9-10", "Science", "exam", "Exam"))

    assert set(result) == {"id", "n", "text", "marks", "status", "hints", "solution"}
    assert result["n"] == 2
    assert len(result["hints"]) == 2
    assert [block["label"] for block in result["solution"]["blocks"]] == [
        "Definition",
        "Explanation",
        "Example",
        "Conclusion",
    ]


def test_page_marker_parser_preserves_numbers_and_page_text():
    pages = documents.parse_page_markers(
        "Intro before markers\n[Page 12]\nGravity pulls objects.\n"
        "\n--- Page 13 ---\nMass stays constant."
    )

    assert pages == [
        DocumentPage(page=12, text="Gravity pulls objects."),
        DocumentPage(page=13, text="Mass stays constant."),
    ]
    assert documents.format_page_text(pages) == (
        "[Page 12]\nGravity pulls objects.\n\n[Page 13]\nMass stays constant."
    )


def test_scanned_page_vision_batches_never_exceed_eight(monkeypatch):
    batch_sizes = []
    current = 0

    async def fake_vision(images, prompt):
        nonlocal current
        batch_sizes.append(len(images))
        first_page = current + 1
        current += len(images)
        return "\n".join(
            f"[Page {page}]\nRecognized page {page}."
            for page in range(first_page, current + 1)
        )

    monkeypatch.setattr(documents, "vision", fake_vision)
    pages = asyncio.run(
        documents._extract_images(
            [(page, b"image-bytes") for page in range(1, 18)],
            page_images=True,
        )
    )

    assert batch_sizes == [8, 8, 1]
    assert [page.page for page in pages] == list(range(1, 18))
    assert pages[-1].text == "Recognized page 17."


def test_pdf_text_pages_stay_local_and_scanned_pages_use_png_images(monkeypatch):
    received = []

    async def fake_vision(images, prompt):
        received.extend(images)
        return "[Page 2]\nRecognized scanned page."

    monkeypatch.setattr(documents, "vision", fake_vision)
    pdf = fitz.open()
    text_page = pdf.new_page()
    text_page.insert_text(
        (72, 72),
        "This page contains enough searchable text to be extracted locally from the PDF.",
    )
    pdf.new_page()
    payload = pdf.tobytes()
    pdf.close()

    pages = asyncio.run(documents.extract_document(payload, "paper.pdf", "application/pdf"))

    assert [page.page for page in pages] == [1, 2]
    assert "searchable text" in pages[0].text
    assert pages[1].text == "Recognized scanned page."
    assert len(received) == 1
    assert received[0].startswith("data:image/png;base64,")


def test_large_document_ask_uses_bm25_page_subset(monkeypatch):
    captured = []

    async def fake_chat(messages, task="teacher", temperature=0.4):
        captured.append(messages)
        return "Normalization reduces duplication. [Page 4]"

    monkeypatch.setattr(rag, "chat", fake_chat)
    monkeypatch.setattr(rag.settings, "long_context_max_tokens", 2)
    pages = [
        DocumentPage(1, "Normalization organizes database tables and reduces duplicate data."),
        DocumentPage(2, "Photosynthesis converts light energy into chemical energy in plants."),
        DocumentPage(4, "Normalization prevents insertion and update anomalies."),
        DocumentPage(5, "The water cycle includes evaporation and condensation."),
    ]

    answer, sources = asyncio.run(
        documents.answer_document(pages, "How does normalization reduce anomalies?", "c9-10", 100)
    )

    sent_context = captured[0][1]["content"]
    assert "[Page 4]" in sent_context
    assert "[Page 1]" not in sent_context
    assert "[Page 2]" not in sent_context
    assert answer.endswith("[Page 4]")
    assert [item.page for item in sources] == [4]


def test_document_answers_are_retried_when_citations_are_missing(monkeypatch):
    answers = iter(["A citation-free answer.", "The cited answer. [Page 7]"])

    async def fake_chat(messages, task="teacher", temperature=0.4):
        return next(answers)

    monkeypatch.setattr(rag, "chat", fake_chat)
    monkeypatch.setattr(rag.settings, "long_context_max_tokens", 10_000)
    answer, sources = asyncio.run(
        documents.answer_document(
            [DocumentPage(7, "Relevant source passage.")],
            "What does the passage say?",
            "c9-10",
            20,
        )
    )

    assert answer == "The cited answer. [Page 7]"
    assert [page.page for page in sources] == [7]


def test_large_document_notes_use_map_reduce(monkeypatch):
    calls = []

    async def fake_chat(messages, task="teacher", temperature=0.4):
        calls.append(messages)
        return f"notes-{len(calls)}"

    monkeypatch.setattr(documents, "chat", fake_chat)
    monkeypatch.setattr(documents.settings, "long_context_max_tokens", 2)
    pages = [DocumentPage(page, f"Page {page} content. " * 100) for page in range(1, 7)]

    result = asyncio.run(documents.generate_document_result(pages, "notes", 100))

    assert result == {"kind": "notes", "md": "notes-4"}
    assert len(calls) == 4
    assert "definitions" in calls[-1][0]["content"].lower()


def test_document_mcq_batches_normalize_variants_and_retry_only_missing(monkeypatch):
    calls = {}

    async def fake_json_call(messages, response_model, task="json", **kwargs):
        step = kwargs["step"]
        calls[step] = calls.get(step, 0) + 1
        if step.endswith("batch 1") and calls[step] == 1:
            return response_model(
                Questions=[
                    {
                        "Question": "What is photosynthesis?",
                        "Choices": ["A", "B", "C", "D"],
                        "Answer": "b",
                        "rationale": "Plants use light energy.",
                    },
                    {
                        "q": "Where does it occur?",
                        "options": ["A", "B", "C", "D"],
                        "correct": 0,
                        "explanation": "It occurs in chloroplasts.",
                    },
                ]
            )
        if step.endswith("batch 1"):
            assert "exactly 2 concise" in messages[0]["content"]
            return response_model(
                mcqs=[
                    {
                        "text": "What pigment absorbs light?",
                        "options": {
                            "A": "Chlorophyll",
                            "B": "Water",
                            "C": "Glucose",
                            "D": "Oxygen",
                        },
                        "answer_index": 1,
                    },
                    {
                        "prompt": "What is released?",
                        "A": "Carbon dioxide",
                        "B": "Oxygen",
                        "C": "Nitrogen",
                        "D": "Hydrogen",
                        "correct_answer": "B",
                    },
                ]
            )
        return response_model(
            items=[
                {
                    "q": "What is the energy source?",
                    "options": ["Sunlight", "Soil", "Wind", "Sound"],
                    "correct_index": 0,
                },
                {
                    "q": "What gas is used?",
                    "options": ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
                    "correct": 2,
                },
            ]
        )

    monkeypatch.setattr(documents, "json_call", fake_json_call)
    pages = [DocumentPage(1, "Photosynthesis uses light, water and carbon dioxide.")]

    result = asyncio.run(documents.generate_document_result(pages, "mcqs", 20))

    assert len(result["mcqs"]) == 6
    assert result["mcqs"][0]["correct"] == 1
    assert result["mcqs"][0]["explanation"] == "Plants use light energy."
    assert result["mcqs"][2]["correct"] == 0
    assert calls == {"document MCQ batch 1": 2, "document MCQ batch 2": 1}


def test_document_mcq_generation_reports_incomplete_result(monkeypatch):
    calls = 0

    async def fake_json_call(messages, response_model, task="json", **kwargs):
        nonlocal calls
        calls += 1
        return response_model(mcqs=[])

    monkeypatch.setattr(documents, "json_call", fake_json_call)

    try:
        asyncio.run(documents._generate_mcq_batch("source", 1, 2))
    except ValueError as error:
        assert "received 0 of 2 valid questions after retries" in str(error)
    else:
        raise AssertionError("Expected incomplete MCQ generation to fail clearly")
    assert calls == 3


def test_document_mcq_batch_keeps_complete_questions_before_truncation(monkeypatch):
    calls = 0

    async def fake_json_call(messages, response_model, task="json", **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise documents.CompletionTruncated(
                '{"mcqs":[{"q":"First complete question?","options":["A","B","C","D"],'
                '"correct":1,"explanation":"Reason."},{"q":"Incomplete',
                100,
            )
        return response_model(
            mcqs=[
                {
                    "q": "Second requested question?",
                    "options": ["A", "B", "C", "D"],
                    "correct": 2,
                    "explanation": "Another reason.",
                }
            ]
        )

    monkeypatch.setattr(documents, "json_call", fake_json_call)
    result = asyncio.run(documents._generate_mcq_batch("source", 1, 2))

    assert [question.q for question in result] == [
        "First complete question?",
        "Second requested question?",
    ]
    assert calls == 2
