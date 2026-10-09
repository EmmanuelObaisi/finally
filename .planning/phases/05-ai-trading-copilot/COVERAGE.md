# API Coverage — LiteLLM -> OpenRouter -> Cerebras (chat completions)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Surface: `litellm.acompletion` against `openrouter/openai/gpt-oss-120b`, routed to Cerebras (plan 05-01 `backend/app/llm/client.py`). The API coverage detector returned `detected: false` for this phase's text (no verb-noun proximity hit), but the phase integrates an external LLM service, so the matrix is produced anyway.

| capability | decision | reason |
|---|---|---|
| Async completion (`acompletion`) | INTEGRATE | |
| Messages with system, user and assistant roles | INTEGRATE | |
| Structured output via `response_format` with a Pydantic model (strict json_schema) | INTEGRATE | |
| `reasoning_effort` ("low") | INTEGRATE | |
| OpenRouter provider routing through `extra_body` (`order`, `allow_fallbacks`, `require_parameters`) | INTEGRATE | |
| Request `timeout` (30 s) | INTEGRATE | |
| `num_retries` (0) | INTEGRATE | |
| `max_tokens` (2000) | INTEGRATE | |
| Explicit per-call `api_key` | INTEGRATE | |
| Exception mapping (Timeout, Authentication, NotFound, connection errors) to a graceful assistant reply | INTEGRATE | |
| Installed-dependency capability check (`supports_response_schema`) in tests | INTEGRATE | |
| OpenRouter generation record (`/api/v1/generation`) to confirm the serving provider | INTEGRATE | only in the manual live smoke script, not in the product path |
| Token streaming (`stream=True`) | OPT-OUT | out of scope per REQUIREMENTS and CONTEXT: Cerebras is fast and a loading indicator suffices |
| Tool or function calling (`tools`, `tool_choice`) | OPT-OUT | out of scope per REQUIREMENTS and CONTEXT: one structured-output call per turn, no tool-calling loop |
| `response_format` json_object (non-strict JSON mode) | OPT-OUT | strict json_schema is used because it enforces the reply shape |
| LiteLLM Router and model-level `fallbacks` | OPT-OUT | D-05 strict Cerebras pinning: an outage must become the graceful assistant error, never a silent reroute |
| Sampling parameters (`temperature`, `top_p`, `seed`, `stop`, penalties, `logprobs`) | OPT-OUT | provider defaults suffice for a low-effort reasoning call; determinism is provided by mock mode; tracked for tuning only if replies prove inconsistent |
| Multiple completions (`n`) | OPT-OUT | one reply per turn |
| Client-side response caching (`caching`) | OPT-OUT | the portfolio context changes every turn, so a cached answer would be stale; provider-side prompt caching already applies automatically |
| Cost and usage tracking (`completion_cost`, usage fields) | OPT-OUT | single-user demo on fake money; no billing surface in the product |
| Reasoning content exposure (`reasoning_content`) | OPT-OUT | the product shows concise answers only |
| Multimodal input (images, audio) and embeddings | OPT-OUT | the product is text-only |
| Request metadata and end-user id (`user`, `metadata`) | OPT-OUT | single hardcoded user, no abuse tracking needed |
