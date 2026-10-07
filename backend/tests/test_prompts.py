from app.services.prompts import build_system_prompt


def test_prompt_adapts_to_class_levels():
    primary = build_system_prompt("c1-5")
    senior = build_system_prompt("c11-12")
    graduate = build_system_prompt("grad")

    assert "Classes 1–5" in primary
    assert "stories" in primary
    assert "derivations" in senior
    assert "vectors" in graduate
    assert primary != senior != graduate


def test_prompt_includes_subject_and_exam_style():
    prompt = build_system_prompt("c9-10", "Physics", "Exam Answer")

    assert "Physics" in prompt
    assert "Definition, Explanation, Example, Diagram" in prompt
