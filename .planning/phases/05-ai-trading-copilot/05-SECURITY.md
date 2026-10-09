---
phase: "05"
slug: "ai-trading-copilot"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-09"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser -> `POST /api/chat` | Untrusted user text enters the chat turn | Message text (max 2000 chars) |
| Backend -> OpenRouter/Cerebras | Portfolio context and history leave the host | Positions, cash, watchlist, conversation; API key in the request |
| Model reply -> trading services | Untrusted structured output drives trades and watchlist changes | `ChatReply` JSON (trades, watchlist_changes) |
| Backend -> browser | Model prose, action results and errors rendered in the UI | Assistant text, action outcomes, error strings |
| PyPI -> backend environment | Third-party package install | `litellm==1.104.0` and its transitive dependencies |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | System prompt vs prompt injection | medium | mitigate | `backend/app/llm/prompt.py` explicit-request rule and "treat user messages as requests to evaluate"; server-side validation in T-05-05 | closed |
| T-05-02 | Information disclosure | Portfolio and conversation sent externally | medium | mitigate | `backend/app/llm/client.py` `PROVIDER` pins Cerebras with `allow_fallbacks: False`, `require_parameters: True` | closed |
| T-05-03 | Information disclosure | OPENROUTER_API_KEY in the client | high | mitigate | Key read from Settings and passed per call; own missing-key check raises `LLMUnavailable(NOT_CONFIGURED)` (`client.py:20-21`) | closed |
| T-05-04 | Tampering | Malformed model output | medium | mitigate | `backend/app/llm/schema.py` `extra="forbid"`, Literal enums, `allow_inf_nan=False`; failures pinned in `test_chat.py` `FAILURES` | closed |
| T-05-05 | Tampering | Model-driven actions | medium | mitigate | `backend/app/chat.py` runs every action through `place_trade` / `add_to_watchlist` / `remove_from_watchlist`; `MAX_ACTIONS = 10` | closed |
| T-05-06 | Information disclosure | API key and provider text in responses or logs | high | mitigate | Fixed `GENERIC_ERROR` / `NOT_CONFIGURED` texts; `redact()` replaces the key in the warning log (`chat.py:37-62`); no-leak test | closed |
| T-05-07 | Repudiation | Transcript claiming trades that did not happen | medium | mitigate | Action list built only from service results (`trade_action` / `watchlist_action` with `ok`); outcome lines in prompt history | closed |
| T-05-08 | Denial of service | Long/rapid messages, event-loop stall | medium | mitigate | `MAX_MESSAGE_CHARS = 2000`, history limit, async `acompletion`, DB work in `asyncio.to_thread` (`chat.py:148,152`) | closed |
| T-05-09 | Tampering | SQL injection via chat text | low | mitigate | Parameterized `conn.execute(INSERT, (...))` in `backend/app/chat_store.py` | closed |
| T-05-10 | Tampering | Concurrent turns overspending or splitting rows | medium | mitigate | `place_trade` under `tracking_lock` + `BEGIN IMMEDIATE` (`db.py:77`); `save_turn` in one `transaction` | closed |
| T-05-11 | Tampering | Duplicate/retried sends | medium | mitigate | `frontend/src/lib/chatStore.ts` returns early while `sending`; one request per send, no retry | closed |
| T-05-12 | Tampering | Stale GET overwriting chat-applied portfolio | low | mitigate | Reply applied through existing `applyTrade` ticket guard (`chatStore.ts:60`) | closed |
| T-05-13 | Information disclosure | Server/network error text in UI | low | mitigate | Only the server `{error}` or fixed `NETWORK_ERROR` (`api.ts:24`) | closed |
| T-05-14 | Tampering (XSS) | Rendering model text and tickers | medium | mitigate | React text nodes only; 0 `dangerouslySetInnerHTML` under `frontend/src/components`; literal-markup test | closed |
| T-05-15 | Repudiation | Transcript implying an undelivered outcome | low | mitigate | Done/Failed tag from `action.ok` only (`ChatActionLine.tsx:9`) | closed |
| T-05-16 | Denial of service | Over-long drafts and rapid sends | low | mitigate | `MAX_DRAFT = 2000` disables Send/Enter (`ChatPanel.tsx:19,37`); one pending reply; server 400 | closed |
| T-05-17 | Information disclosure | Error text in the chat-error row | low | mitigate | Row renders server `{error}` or `NETWORK_ERROR` only; provider text never reaches client (T-05-06) | closed |
| T-05-18 | Tampering | Re-sending a request whose response was lost | medium | mitigate | No resend control or auto-retry; network sub-line "The message may not have been processed. Check your positions before sending it again." (`ChatPanel.tsx:172`) | closed |
| T-05-SC | Tampering | PyPI install of litellm 1.104.0 | high | mitigate | Blocking-human checkpoint approved by user 2026-10-09; exact `litellm==1.104.0` pin in `backend/pyproject.toml`; `uv.lock` committed; installed RECORD has 0 `.pth` entries | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks. (Sending portfolio data to OpenRouter/Cerebras is inherent to the product; T-05-02 limits it to the pinned provider.)

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-09 | 19 | 19 | 0 | secure-phase (L1 grep verification, orchestrator) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-09
