import os
from openai import OpenAI
c = OpenAI(base_url="http://localhost:20128/v1", api_key=os.getenv("OMNIROUTE_API_KEY", "not-configured"))
for m in ["eduai-teacher", "eduai-reasoning", "eduai-vision", "eduai-json"]:
    try:
        r = c.chat.completions.create(
            model=m, max_tokens=60,
            messages=[{"role": "user", "content": "Reply with only: OK"}])
        print(m, "->", r.choices[0].message.content.strip())
    except Exception as e:
        print(m, "FAILED:", e)