from openai import OpenAI

from app.config import settings

client = OpenAI(
    base_url=settings.omniroute_base_url,
    api_key=settings.omniroute_api_key or "not-configured",
)
models = {
    "teacher": settings.model_teacher,
    "practice": settings.model_practice,
    "reasoning": settings.model_reasoning,
    "multimodal": settings.model_multimodal,
    "json": settings.model_json,
}

for role, model in models.items():
    if not model.strip():
        print(f"{role}: SKIPPED (no model configured)")
        continue
    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=60,
            messages=[{"role": "user", "content": "Reply with only: OK"}],
        )
        answer = response.choices[0].message.content or ""
        print(f"{role} ({model}) -> {answer.strip()}")
    except Exception as error:
        print(f"{role} ({model}) FAILED: {error}")
