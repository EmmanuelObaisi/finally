# Phase 5: AI Trading Copilot - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 05-ai-trading-copilot
**Areas discussed:** Copilot autonomy, Provider pinning, Action limits, Mock mode rules

---

## Copilot autonomy

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit ask or agreement | Trades only when the user asks or agrees; questions/hypotheticals get no trades | ✓ |
| Can act on own judgement | FinAlly may rebalance/trim on its own | |

| Option | Description | Selected |
|--------|-------------|----------|
| Suggest, change on request | Suggests tickers; changes watchlist only on request/agreement | ✓ |
| Add freely, remove on request | Adds tickers it mentions without asking | |
| Full proactive | Adds and removes whenever it sees fit | |

| Option | Description | Selected |
|--------|-------------|----------|
| Model converts to shares | Dollar/fraction requests become a share quantity; server validates | ✓ |
| Shares only, ask otherwise | Proposes a share count and waits for a yes | |

| Option | Description | Selected |
|--------|-------------|----------|
| Text says submitting, lines show result | One LLM call; action lines carry the real outcome | ✓ |
| Second call to summarise results | Second LLM call after execution | |

**User's choice:** all recommended options.

---

## Provider pinning

| Option | Description | Selected |
|--------|-------------|----------|
| Strict Cerebras only | order + allow_fallbacks false + require_parameters true | ✓ |
| Prefer Cerebras, allow fallback | Skill's order-only block | |

| Option | Description | Selected |
|--------|-------------|----------|
| 30 s, no retries | Hard bound matching UI copy | ✓ |
| 15 s, one retry | Faster failover | |
| 60 s, no retries | More patient; UI copy would change | |

**User's choice:** recommended options.

---

## Action limits

| Option | Description | Selected |
|--------|-------------|----------|
| 10 trades + 10 watchlist | Matches the UI-SPEC's 20-line design | ✓ |
| 5 trades + 5 watchlist | Tighter | |
| No cap | Unbounded | |

| Option | Description | Selected |
|--------|-------------|----------|
| Report as failed lines | Over-cap actions shown as Failed | ✓ |
| Drop silently | Extras ignored | |

| Option | Description | Selected |
|--------|-------------|----------|
| Each runs independently | Per-action transactions and results | ✓ |
| All-or-nothing | New multi-trade transaction | |

**User's choice:** recommended options.

---

## Mock mode rules

| Option | Description | Selected |
|--------|-------------|----------|
| Failure keywords first | malformed > broke > add/remove > buy > sell > plain | ✓ |
| Combine all matches | Multiple actions per mock reply | |

| Option | Description | Selected |
|--------|-------------|----------|
| Replace only the LLM call | Real parse/execute/persist path | ✓ |
| Canned response at the route | Skips the real path | |

| Option | Description | Selected |
|--------|-------------|----------|
| 1 AAPL; broke = 1,000,000 AAPL | Fixed quantities | ✓ |
| Parse quantity/ticker from text | Flexible, more code | |

**User's choice:** recommended options.

---

## Claude's Discretion

- System prompt wording beyond the autonomy rules; persona tone.
- Module layout, over-cap error text, history-suffix formatting.

## Deferred Ideas

None.
