import os
from pathlib import Path
from typing import TypeVar
from pydantic import BaseModel
from openai import OpenAI

T = TypeVar("T", bound=BaseModel)

TASK_MODELS: dict[str, str] = {
    "tutor":   "anthropic/claude-opus-5",
    "rubric":  "anthropic/claude-opus-5",
    "outline": "anthropic/claude-opus-5",
    "ocr":     "google/gemini-flash-1.5",
}

_FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures" / "llm"
_client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
    base_url="https://openrouter.ai/api/v1",
    max_retries=2,
)


class LLMDeclined(Exception):
    pass


def _model_for(task: str) -> str:
    return TASK_MODELS.get(task, "openai/gpt-4o")


def chat(task: str, messages: list[dict]) -> str:
    if os.getenv("LLM_FIXTURES") == "1":
        fixture = _FIXTURES_DIR / f"{task}.txt"
        if fixture.exists():
            return fixture.read_text()
        raise FileNotFoundError(f"fixture missing: {fixture}")

    model = _model_for(task)
    resp = _client.chat.completions.create(
        model=model,
        messages=messages,
        timeout=60,
    )
    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise LLMDeclined("model returned empty content")
    return content


def parse(task: str, prompt: str, schema: type[T]) -> T:
    if os.getenv("LLM_FIXTURES") == "1":
        fixture = _FIXTURES_DIR / f"{task}.json"
        if fixture.exists():
            return schema.model_validate_json(fixture.read_text())
        raise FileNotFoundError(f"fixture missing: {fixture}")

    model = _model_for(task)
    schema_json = schema.model_json_schema()

    def _call(messages):
        return _client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": schema_json, "strict": True}},
            timeout=60,
        )

    messages = [{"role": "user", "content": prompt}]
    resp = _call(messages)
    content = resp.choices[0].message.content if resp.choices else None
    if not content:
        raise LLMDeclined("model returned empty content")

    try:
        return schema.model_validate_json(content)
    except Exception as e:
        messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user", "content": f"Your response failed validation: {e}. Reply with valid JSON only."})
        resp2 = _call(messages)
        content2 = resp2.choices[0].message.content if resp2.choices else None
        if not content2:
            raise LLMDeclined("model declined on retry")
        return schema.model_validate_json(content2)
