<div align="center">

# 🛡️ MCP Guardian

### Real-Time Bidirectional Security Firewall for AI Agents

An AI assistant you can actually watch defend itself. Guardian sits inline
between the user, the AI, and its tools - inspecting **every message and every
tool response** in real time. Prompt injection, tool poisoning, and data leaks
are scored, explained, and stopped **before the model ever consumes them**.

`OpenAI-grade chat` × `Microsoft Defender XDR` - the whole security pipeline,
visible in the conversation.

</div>

---

## The idea

The moment an AI agent can call tools, every message becomes executable. A single
poisoned document or a cleverly worded prompt can turn an assistant into an insider
threat - and traditional WAFs never see it.

MCP Guardian makes the defense **the demo**. You chat with a real assistant; when
it calls a tool, you watch Guardian intercept the response, inspect it, and render a
verdict - all as a live, scrollable timeline inside the chat. Ask it to read a
poisoned document and you see the tool succeed, the threat get caught, and the AI
refuse - with the malicious lines isolated in a sanitized preview.

## What you can do in 60 seconds

- **Chat** with the assistant (`/chat`) - streams real replies (Groq) and calls real tools.
- **Read a clean document** → watch the full pipeline end in a green `ALLOW`.
- **Read a poisoned document** → the tool succeeds, Guardian catches the embedded
  injection, and blocks the response with **evidence** (the exact indicator, its line,
  and a confidence level) plus a **sanitized preview** showing the threat isolated.
- **Upload your own file** → it's read through the real MCP tool and inspected live.
- **Try to jailbreak it** → blocked on the way *in*, before any tool runs.
- Flip to the **SOC dashboard** (`/overview`) for the fleet-wide view.

## Detection engine

Seven detectors run concurrently on every message, fused into one verdict:

| Category | Verdict range | Engine |
| --- | --- | --- |
| Prompt Injection | up to `BLOCK` | heuristic + optional MiniLM embeddings |
| Tool Poisoning | up to `BLOCK` | hidden-directive / structural analysis |
| PII Leakage | `SANITIZE` → `BLOCK` | Luhn-checked regex + optional Presidio NER |
| Toxicity / Harassment | `SANITIZE` → `BLOCK` | lexicon (harassment, slurs, sexual) + optional Detoxify |
| Policy Violation | `QUARANTINE` | declarative rule engine |
| Encoded Payload | `QUARANTINE` → `BLOCK` | entropy + base64/hex/url decoding (IOC-aware) |
| Schema Anomaly | `SANITIZE` | JSON-schema drift & control-key detection |

Every verdict carries a **risk score (0–100)**, a **threat category**, an
**explanation**, **evidence**, a **recommended action**, and a final verdict:
`ALLOW · SANITIZE · QUARANTINE · BLOCK`.

### Hybrid detection (fast + smart)

Heuristics are the always-on floor - **sub-millisecond, deterministic, offline,
and impossible to prompt-inject**. When they're inconclusive, Guardian escalates to
an **LLM semantic classifier** (Groq) for a second opinion that catches novel
phrasing the lexicons miss (e.g. a roleplay jailbreak, or keyword-free harassment).
The classifier can only *add* risk - it can escalate a verdict but never talk the
system down from a heuristic block.

## Architecture

```
                         ┌──────────── MCP GUARDIAN ────────────┐
  User ─▶ AI assistant ─▶│  inbound inspect                     │
          (Groq)         │        │                             │
                         │        ▼                             │
                         │  tool call ─▶ real MCP server ──────▶│─▶ sandboxed
                         │        │        (stdio JSON-RPC)      │   filesystem
                         │        ▼                             │
                         │  OUTBOUND inspect ◀── tool response ─│◀─ (poisoned?)
                         │        │                             │
                         │  7 detectors → aggregate → verdict   │
                         │  (+ LLM escalation when unsure)      │
                         │        │                             │
                         │        ▼  ALLOW / SANITIZE /         │
  User ◀── AI reply ◀────│    QUARANTINE / BLOCK                │
                         └──────────────────────────────────────┘
```

The engine **degrades gracefully**: heuristics need zero ML dependencies and upgrade
automatically if Presidio / Detoxify / embeddings are installed. The LLM (replies +
hybrid detection) uses **Groq → deterministic** fallback, so nothing is ever blocked
on an optional service.

## What's real vs. simulated (we're honest about this)

| Component | Status |
| --- | --- |
| Detection engine, risk scoring, verdicts | **Real** |
| Auth (JWT + bcrypt) | **Real** |
| `read_document` / `list_documents` tools | **Real** - a genuine sandboxed MCP server (official SDK, stdio JSON-RPC) |
| Uploaded-document inspection | **Real** - your file is read through the MCP tool |
| Chat replies + hybrid detection (with a Groq key) | **Real LLM** |
| `web_search` / `send_notification` tools | **Simulated** - clearly labeled; output still runs through the real engine |
| SOC dashboard's ambient fleet traffic | **Simulated** - a traffic generator so the dashboard looks alive (the chat's live rail shows only *your* real activity) |

## Stack

**Frontend** - Next.js 16 · React 19 · TypeScript · Tailwind v4 · Framer Motion · Recharts · Radix UI
**Backend** - FastAPI · Python 3.12 · Server-Sent Events · WebSockets · JWT · Groq · (optional) Presidio / Detoxify / embeddings / Redis / Ollama
**Tooling** - official MCP Python SDK (isolated venv) · Docker · GitHub Actions

---

## Quick start

```powershell
# Windows / PowerShell
./scripts/setup.ps1     # backend venv, MCP-server venv, dashboard deps, env files
./scripts/start.ps1     # launches backend + dashboard
```

```bash
# macOS / Linux
./scripts/setup.sh
./scripts/start.sh
```

Then open **http://localhost:5173/chat**. Log in with the demo account or click
**Continue with demo access**:

```
email:    demo@mcpguardian.dev
password: guardian
```

> **Optional but recommended:** paste a free [Groq](https://console.groq.com) key
> into `backend/.env` as `GUARDIAN_GROQ_API_KEY=...` for real streaming LLM replies
> and the hybrid detection tier. Without it, everything still works (deterministic
> replies, heuristics-only detection). `backend/.env` is gitignored.

### With Docker

```bash
docker compose up --build      # dashboard :5173 · API/docs :8000/docs
# pass a key:  GUARDIAN_GROQ_API_KEY=gsk_... docker compose up --build
```

### Smoke test

```bash
python scripts/smoke_test.py   # asserts key verdicts against the running backend
```

## The three-minute demo

See **[DEMO.md](DEMO.md)** for the judge walkthrough. TL;DR - open a fresh chat and
click the suggestion chips left to right: clean read (`ALLOW`), poisoned read
(`BLOCK` with evidence + sanitized preview), then a jailbreak (`BLOCK` before any
tool runs). The right-hand rail's counters climb from zero as you go.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Status + detector capabilities |
| `POST` | `/api/inspect` | Inspect one message (the inline firewall call) |
| `POST` | `/api/chat/turn` | Stream one agent turn (SSE) - the chat pipeline |
| `GET` | `/api/chat/capabilities` | LLM provider + available tools |
| `POST` | `/api/mcp/call` · `GET /api/mcp/tools` · `/status` | Call the real sandboxed MCP tool |
| `POST` | `/api/auth/login` · `/register` | Authentication |
| `GET` | `/api/events` · `/api/stats` · `/api/reports/*` | Telemetry & reporting (JWT) |
| `WS` | `/ws/stream` | Live event stream |

Full interactive docs at **`/docs`** (Swagger UI).

## Testing

```bash
cd backend && ./.venv/Scripts/python -m pytest -q     # 68 tests (engine, API, chat, MCP, evidence)
cd dashboard && npx tsc --noEmit                       # type-check
```

## Project layout

```
mcp-guardian/
├── dashboard/        # Next.js 16 - marketing, auth, AI chat (primary), SOC dashboard
├── backend/          # FastAPI - detection engine, chat orchestrator, auth, simulator
├── mcp-servers/
│   └── filesystem/   # a real, sandboxed MCP server (isolated venv)
├── sandbox/          # the only files the MCP server can read (incl. a poisoned demo doc)
├── scripts/          # setup, start, smoke_test
├── docker-compose.yml
└── .github/workflows/ci.yml
```

---

<div align="center">
Built for the RUSH HOUR 24 National Hackathon.
</div>
