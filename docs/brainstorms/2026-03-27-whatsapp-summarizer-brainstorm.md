# Brainstorm: WhatsApp Conversation Summarizer CLI

**Date:** 2026-03-27
**Status:** Complete

## What We're Building

A **Node.js CLI tool** that connects to your WhatsApp account (via whatsapp-web.js + QR code) and summarizes conversations using a **local LLM running on Ollama**. You run a command like:

```bash
summarize --chat "Family Group" --last 50
summarize --chat "Work Team" --since 2h
summarize --chat "John" --from 2026-03-25
summarize --chat "Family Group" --unread
```

The summary prints to your terminal and is automatically copied to your clipboard.

## Why This Approach

- **whatsapp-web.js** gives full programmatic access to WhatsApp messages without needing a Business account — just scan a QR code once
- **Ollama** keeps everything local and free — no API keys, no data leaving your machine, no usage costs
- **CLI** is the simplest interface to build and use — no GUI complexity, fast to invoke, scriptable
- **Node.js** is the natural fit since whatsapp-web.js is a Node library

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| WhatsApp access | whatsapp-web.js | QR-code auth, no Business account needed, full message access |
| LLM provider | Ollama (local) | Free, private, no API keys, data stays on machine |
| Interface | CLI | Fast, simple, no GUI overhead |
| Language | JavaScript (Node.js) | Same ecosystem as whatsapp-web.js |
| Output | Terminal + clipboard | Immediate visibility + easy to paste elsewhere |
| Scope options | All four (N messages, N hours, since date, unread) | Maximum flexibility for the user |
| Session | Background daemon | Instant commands, no reconnect delay |
| Ollama model | qwen3:8b (configurable via --model) | Best general-purpose model available locally, good at summarization |
| Summary format | Bullet points | Easy to scan quickly |

## Proposed Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   CLI        │────▶│  WhatsApp Client  │────▶│  Message     │
│  (commander) │     │  (whatsapp-web.js)│     │  Fetcher     │
└─────────────┘     └──────────────────┘     └──────┬──────┘
                                                     │
                                                     ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Clipboard   │◀────│  Summarizer       │◀────│  Formatter   │
│  + Terminal  │     │  (Ollama API)     │     │  (messages)  │
└─────────────┘     └──────────────────┘     └─────────────┘
```

**Core components:**
1. **CLI parser** — parse commands and flags (e.g., `commander` or `yargs`)
2. **WhatsApp client** — connect via whatsapp-web.js, maintain session, fetch messages
3. **Message formatter** — filter messages by scope (time/count/unread), format for LLM input
4. **Summarizer** — send formatted messages to Ollama, get summary back
5. **Output** — print to terminal + copy to clipboard (e.g., `clipboardy`)

## Key Dependencies

- `whatsapp-web.js` — WhatsApp Web client
- `qrcode-terminal` — display QR code in terminal for auth
- `commander` or `yargs` — CLI argument parsing
- `clipboardy` — cross-platform clipboard access
- Ollama running locally with a model (e.g., llama3, mistral)

## Resolved Questions

1. **Session persistence** — Background daemon. Stays connected so commands are instant.
2. **Which Ollama model** — Default to qwen3:8b (best general-purpose model on hand), configurable via `--model` flag.
3. **Summary style** — Bullet points for easy scanning.
