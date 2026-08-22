"""Thin wrapper around the OpenRouter chat completions API."""

import os

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    pass


async def chat_completion(
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 400,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    """Send a chat completion request to OpenRouter and return the reply text.

    `api_key`/`model` let a caller bring their own OpenRouter key/model for this
    one request (e.g. from the Settings panel in the UI); falling back to the
    server's own .env values when not provided. The key is never stored — it's
    only used for this single outbound request.
    """
    api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise LLMError(
            "No OpenRouter API key configured. Add one in the app's Settings panel, "
            "or set OPENROUTER_API_KEY in backend/.env."
        )
    model = model or os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_SITE_URL", "http://localhost:5173"),
        "X-Title": "Northstar Homes AI Sales Agent",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)

    if resp.status_code != 200:
        raise LLMError(f"OpenRouter request failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise LLMError(f"Unexpected OpenRouter response shape: {data}") from exc
