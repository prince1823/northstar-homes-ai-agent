"""Post-conversation analytics extraction via a second LLM pass."""

import json

from .llm import chat_completion
from .prompt import ANALYTICS_PROMPT


def _transcript_text(history: list[dict]) -> str:
    lines = []
    for turn in history:
        role = "Customer" if turn["role"] == "user" else "Riya (AI agent)"
        lines.append(f"{role}: {turn['content']}")
    return "\n".join(lines)


async def generate_analytics(
    history: list[dict],
    api_key: str | None = None,
    model: str | None = None,
) -> dict:
    transcript = _transcript_text(history)
    messages = [
        {"role": "system", "content": ANALYTICS_PROMPT},
        {"role": "user", "content": f"Transcript:\n\n{transcript}"},
    ]
    raw = await chat_completion(
        messages, temperature=0.0, max_tokens=600, api_key=api_key, model=model
    )

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {
            "error": "Failed to parse analytics JSON from model output.",
            "raw_output": raw,
        }
