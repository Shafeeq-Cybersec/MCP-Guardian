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
- **Open the SOC console** (`/overview`, `/threats`, `/graph`, `/analytics`) →
  full security analyst workspace, updating live via WebSockets.

---

## Key Features

### 🛡️ Real-Time Security Firewall
- **Bidirectional inspection**: checks inbound prompts and outbound tool responses before execution.
- **8 Security Detectors**:
  1. `PromptInjectionDetector`: Hybrid heuristic + cosine similarity Jailbreak & role-override detector.
  2. `ToolPoisoningDetector`: Scans for hidden directives, HTML comments, and zero-width Unicode characters.
  3. `PIIDetector`: Redacts emails, credit cards (Luhn validated), SSNs, and API keys.
  4. `ToxicityDetector`: Scans for threats, harassment, and slurs.
  5. `EncodedPayloadDetector`: Entropy analysis and decode-context checking for Base64, hex, and URL payloads.
  6. `PolicyEngine`: Declarative rules enforcing organization policies.
  7. `SchemaAnomalyDetector`: Inspects payload size, nesting depth, and prototype keys (`__proto__`).
  8. `AttackChainDetector`: Session-aware correlation engine tracking multi-tool attack sequences across calls.

---

## Architecture

```
User Prompt → Guardian (Inbound) → AI Agent → Sandboxed MCP Tool → Guardian (Outbound) → Response
```

### Folder Structure

```
MCP-Guardian/
├── dashboard/        # Next.js 16 - marketing, auth, AI chat, SOC dashboard
├── backend/          # FastAPI - detection engine, chat orchestrator, auth, simulator
├── mcp-servers/
│   └── filesystem/   # real, sandboxed MCP server (isolated venv)
├── sandbox/          # files exposed to the MCP server
├── scripts/          # setup, start, smoke_test
├── docker-compose.yml
└── .github/workflows/ci.yml
```

---

## Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv .venv

# Windows PowerShell:
.venv\Scripts\Activate.ps1

# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## Testing

Run the full pytest suite:

```bash
cd backend
python -m pytest tests/
```

Run the end-to-end smoke test (backend running):

```bash
python scripts/smoke_test.py
```

---

## Status

✅ **Fully implemented and tested.**  
Team **Mutex** (RH-0045) — RUSH HOUR 24, National Engineering Challenge  
Panimalar Engineering College — Cyber Security Track
