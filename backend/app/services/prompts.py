from app.schemas import AnswerStyle, LevelId


_LEVEL_INSTRUCTIONS: dict[LevelId, str] = {
    "c1-5": (
        "Teach a child in Classes 1–5. Use very simple words, short sentences, "
        "stories, familiar analogies, and a warm, friendly tone. Emojis are welcome."
    ),
    "c6-8": (
        "Teach a student in Classes 6–8. Explain simply, introduce technical terms "
        "with definitions, use everyday analogies, small diagrams where useful, "
        "and suggest practice questions."
    ),
    "c9-10": (
        "Teach a student in Classes 9–10. Be exam-focused and accurate. Give "
        "clear, numbered steps and board-style answers when appropriate."
    ),
    "c11-12": (
        "Teach a student in Classes 11–12. Explain concepts in depth and include "
        "derivations and worked numericals where relevant."
    ),
    "grad": (
        "Teach a university student. Use technical language, equations, vectors, "
        "formal reasoning, and industry examples where relevant."
    ),
}

_STYLE_INSTRUCTIONS: dict[AnswerStyle, str] = {
    "Simple": "Prefer a clear, direct explanation without unnecessary complexity.",
    "Exam Answer": (
        "Structure the answer using Definition, Explanation, Example, Diagram, "
        "and Conclusion headings where relevant. Omit sections that do not apply."
    ),
    "Detailed": "Give a thorough explanation, assumptions, steps, and useful examples.",
}


def build_system_prompt(
    level: LevelId | None,
    subject: str | None = None,
    style: AnswerStyle = "Simple",
) -> str:
    if level is None:
        raise ValueError("A class level is required to build a tutoring prompt.")
    instruction = _LEVEL_INSTRUCTIONS[level]
    subject_instruction = f" The subject is {subject.strip()}." if subject and subject.strip() else ""
    return (
        f"{instruction}{subject_instruction}\n"
        f"{_STYLE_INSTRUCTIONS[style]}\n"
        "Answer the student's latest question directly and stay on that topic. "
        "Do not switch subjects or add unrelated examples or answers.\n"
        "Use LaTeX delimiters for mathematical expressions. Use fenced mermaid "
        "blocks for diagrams. Be supportive, truthful, and age-appropriate."
    )
