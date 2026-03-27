---
title: "feat: WhatsApp Conversation Summarizer CLI"
type: feat
status: active
date: 2026-03-27
origin: docs/brainstorms/2026-03-27-whatsapp-summarizer-brainstorm.md
---

# feat: WhatsApp Conversation Summarizer CLI

## Overview

A Node.js CLI tool (`wasumm`) that connects to WhatsApp via whatsapp-web.js, fetches conversation messages, and summarizes them locally using Ollama (qwen3:8b). MVP connects on each command invocation (no daemon). Summaries are bullet-point format, printed to terminal and copied to clipboard.

```bash
wasumm summarize "Family Group" --last 50
wasumm summarize "Work Team" --since 2h
wasumm summarize "John" --from 2026-03-25
wasumm summarize "Family Group" --unread
wasumm chats                    # list available chats
```

(see brainstorm: docs/brainstorms/2026-03-27-whatsapp-summarizer-brainstorm.md)

## Problem Statement / Motivation

Catching up on busy WhatsApp group chats is time-consuming. There's no built-in way to get a quick summary of what happened. A CLI tool that produces bullet-point summaries on demand — using a local LLM for privacy — solves this without relying on cloud APIs or sharing message data externally.

## Proposed Solution

### Architecture (MVP — No Daemon)

```
CLI (commander.js)
  |
  |-- wasumm chats ---------> Initialize WhatsApp client
  |                             -> Restore session (or QR scan)
  |                             -> getChats() -> display list -> disconnect
  |
  |-- wasumm summarize -----> Initialize WhatsApp client
       "Chat" --last 50        -> Restore session (or QR scan)
                                -> Find chat by name (case-insensitive)
                                -> fetchMessages({ limit: 50 })
                                -> Filter text-only messages
                                -> Format for LLM
                                -> Send to Ollama /api/chat
                                -> Print summary to terminal
                                -> Copy to clipboard
                                -> Disconnect
```

Each command starts the WhatsApp client, restores the persisted session (no QR scan needed after first time), does its work, and disconnects. This adds ~5-10s startup overhead but keeps the architecture dead simple.

### Project Structure

```
whatsappSummerizerLLM/
├── package.json
├── .gitignore
├── bin/
│   └── wasumm.js              # CLI entry point (#!/usr/bin/env node)
├── src/
│   ├── cli.js                 # Commander command definitions
│   ├── whatsapp.js            # WhatsApp client: connect, getChats, fetchMessages
│   ├── formatter.js           # Format messages into LLM prompt
│   ├── summarizer.js          # Call Ollama API, return summary
│   ├── output.js              # Print to terminal + copy to clipboard
│   └── config.js              # Load/save config from ~/.wasumm/config.json
├── .wwebjs_auth/              # WhatsApp session data (gitignored)
└── docs/
    ├── brainstorms/
    └── plans/
```

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `whatsapp-web.js` | WhatsApp Web client via Puppeteer |
| `qrcode-terminal` | Display QR code in terminal for first-time auth |
| `commander` | CLI argument parsing |
| `ollama` | Official Ollama JS SDK |
| `clipboardy` | Cross-platform clipboard access |

## Technical Considerations

### WhatsApp Session Persistence

- Use `LocalAuth` strategy with `clientId: 'wasumm'` and `dataPath: '.wwebjs_auth/'`
- After first QR scan, session restores automatically on subsequent runs
- Handle `auth_failure` event: clear session, prompt for re-scan
- Handle session expiration: detect and prompt user to run `wasumm auth` to re-scan QR
- Set `qrMaxRetries: 3` before giving up

### Chat Name Resolution

- **Case-insensitive substring match** on chat name
- If multiple chats match: display all matches and ask user to be more specific
- If no match: show error with closest matches (Levenshtein or simple substring suggestions)
- The `chats` command helps users discover exact names

### Message Handling

- **Text messages only** for MVP (filter `message.type === 'chat'`)
- Include sender name for group chats: `[Alice] Hey everyone...`
- Include timestamp: `[2026-03-27 14:30] [Alice] Hey everyone...`
- Skip system messages (member joined/left, encryption notices)
- Skip media messages, reactions, stickers, deleted messages

### Ollama Integration

- Use `ollama` npm package with `/api/chat` endpoint
- Default model: `qwen3:8b` (configurable via `--model` flag or config file)
- Set `temperature: 0.3` for consistent summaries
- **System prompt:**
  ```
  You are a WhatsApp conversation summarizer. Summarize the following conversation
  as concise bullet points. For group chats, mention who said what when relevant.
  Focus on key topics, decisions, and action items. Respond in the same language
  as the majority of messages.
  ```
- **Context window handling:** Estimate tokens (~4 chars/token). If messages exceed ~6000 tokens, truncate oldest messages and warn the user. Chunked summarization deferred to v2.
- **Timeout:** 60 second timeout on Ollama calls. Show spinner during generation.
- **Pre-flight check:** Verify Ollama is running (`GET http://localhost:11434/`) and model is available before attempting summarization. Show clear error with fix instructions if not.

### Scope Flag Behavior

| Flag | Behavior |
|------|----------|
| `--last N` | Fetch last N messages |
| `--since Nh\|Nd` | Fetch messages from the last N hours/days |
| `--from YYYY-MM-DD` | Fetch messages since a specific date |
| `--unread` | Fetch unread messages only |
| *(no flag)* | Default to `--unread`, fallback to `--last 20` if none unread |
| *(multiple flags)* | Error: "Please specify only one scope flag" |

### Configuration File

Located at `~/.wasumm/config.json`:

```json
{
  "model": "qwen3:8b",
  "ollamaHost": "http://localhost:11434",
  "defaultScope": "unread"
}
```

Flags override config values. Config is optional — sensible defaults work without it.

### Output

- Print summary to stdout with a header: `Summary of "Chat Name" (last 50 messages):`
- Copy full summary to clipboard via `clipboardy`
- If clipboard fails (headless/SSH), warn but don't error — terminal output still works
- Show message count and time range in the header

### Security & Privacy

- Messages are never written to disk (processed in memory only)
- `.wwebjs_auth/` contains sensitive session data — must be in `.gitignore`
- Ollama runs locally — no data leaves the machine
- Warn in README: whatsapp-web.js is unofficial; accounts risk being banned (low risk for personal use)

## Acceptance Criteria

### Core Functionality
- [x] `wasumm chats` — lists available WhatsApp chats with names
- [x] `wasumm summarize "Chat Name" --last N` — summarizes last N messages
- [x] `wasumm summarize "Chat Name" --since Nh` — summarizes messages from last N hours
- [x] `wasumm summarize "Chat Name" --since Nd` — summarizes messages from last N days
- [x] `wasumm summarize "Chat Name" --from YYYY-MM-DD` — summarizes since a date
- [x] `wasumm summarize "Chat Name" --unread` — summarizes unread messages
- [x] `wasumm summarize "Chat Name"` (no flag) — defaults to unread, fallback to last 20
- [x] Summary output is bullet-point format
- [x] Summary is printed to terminal AND copied to clipboard
- [x] `--model` flag overrides default Ollama model

### Setup & Auth
- [x] First run displays QR code in terminal for WhatsApp auth
- [x] Subsequent runs restore session without QR scan
- [x] `wasumm auth` command to re-authenticate (re-scan QR)
- [x] Session data persists in `.wwebjs_auth/` (gitignored)

### Error Handling
- [x] Clear error if Ollama is not running, with instructions to start it
- [x] Clear error if specified model is not pulled, with `ollama pull` command
- [x] Clear error if chat name not found, with suggestions
- [x] Clear error if multiple chats match, listing all matches
- [x] Clear error if multiple scope flags provided
- [x] Graceful handling if clipboard is unavailable (warn, don't crash)
- [x] Timeout after 60s on Ollama calls with clear message
- [x] Handle WhatsApp session expiration with re-auth instructions

### Project Setup
- [x] `package.json` with proper metadata and `bin` field for global install
- [x] `.gitignore` covering node_modules, .wwebjs_auth, .wwebjs_cache
- [x] Works on Windows 11 (primary platform)

## Implementation Phases

### Phase 1: Project Scaffolding & WhatsApp Connection
**Files:** `package.json`, `.gitignore`, `bin/wasumm.js`, `src/cli.js`, `src/whatsapp.js`

1. Initialize npm project with dependencies
2. Set up commander CLI with `chats` and `summarize` subcommands
3. Implement WhatsApp client with LocalAuth session persistence
4. Implement QR code display for first-time auth
5. Implement `wasumm chats` command (list chats)
6. Implement chat name resolution (case-insensitive substring match)

**Verify:** Run `wasumm chats` — should display QR on first run, list chats on subsequent runs.

### Phase 2: Message Fetching & Formatting
**Files:** `src/whatsapp.js` (extend), `src/formatter.js`

1. Implement message fetching with all four scope options (--last, --since, --from, --unread)
2. Filter to text-only messages
3. Format messages as `[timestamp] [sender] message` for group chats
4. Format messages as `[timestamp] message` for 1:1 chats
5. Handle default scope (no flag → unread → last 20)
6. Validate conflicting flags

**Verify:** Run `wasumm summarize "Chat" --last 10` and inspect formatted output (add a `--dry-run` or `--verbose` flag for debugging).

### Phase 3: Ollama Summarization & Output
**Files:** `src/summarizer.js`, `src/output.js`, `src/config.js`

1. Implement Ollama pre-flight check (server running, model available)
2. Implement summarization with system prompt and streaming
3. Implement token estimation and truncation warning
4. Implement terminal output with header (chat name, scope, message count)
5. Implement clipboard copy with graceful fallback
6. Implement config file loading (~/.wasumm/config.json)
7. Wire everything together in the `summarize` command action

**Verify:** Run `wasumm summarize "Chat" --last 20` end-to-end — should print bullet-point summary and copy to clipboard.

### Phase 4: Polish & Error Handling
**Files:** all src files

1. Add spinner/progress indicator during WhatsApp connection and Ollama generation
2. Implement all error cases (Ollama down, model missing, chat not found, etc.)
3. Add `wasumm auth` command for re-authentication
4. Add `--model` flag support
5. Test on Windows 11
6. Add `.gitignore` entries

**Verify:** Test each error case manually. Verify clipboard works on Windows.

## Dependencies & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| whatsapp-web.js session instability | Auth failures, need to re-scan QR | Handle `disconnected` and `auth_failure` events; `wasumm auth` command |
| WhatsApp account ban | Permanent loss of account access | Low risk for personal use; document in README |
| Ollama model context window exceeded | Truncated/poor summaries | Token estimation + truncation warning; chunking in v2 |
| whatsapp-web.js Puppeteer memory usage | High RAM on each command | Accept for MVP; daemon architecture in v2 solves this |
| Clipboard unavailable in some environments | Feature partially broken | Graceful fallback: warn and continue with terminal-only output |

## Future Considerations (v2)

- **Background daemon** — keep WhatsApp connected for instant commands (see brainstorm)
- **Chunked summarization** — summarize in chunks then summarize summaries for large message sets
- **More message types** — include image captions, voice note transcriptions
- **Output to file** — `--output file.txt` flag
- **Fuzzy chat matching** — Levenshtein distance for typo tolerance
- **Streaming output** — stream summary tokens to terminal in real-time
- **Multiple chat summary** — summarize all unread chats at once

## Sources & References

### Origin
- **Brainstorm document:** [docs/brainstorms/2026-03-27-whatsapp-summarizer-brainstorm.md](../brainstorms/2026-03-27-whatsapp-summarizer-brainstorm.md) — Key decisions carried forward: whatsapp-web.js for access, Ollama (qwen3:8b) for local LLM, CLI interface, bullet-point output to terminal + clipboard

### Institutional Learnings (from rzts project)
- **Session persistence:** Don't use in-memory storage for session data; use persistent filesystem storage
- **LLM integration:** Wrap Ollama calls with timeout/circuit-breaker pattern for graceful degradation
- **Security:** Place user context in XML delimiters in user turn, sanitize LLM output
- **Daemon patterns:** Use HTTP localhost for IPC (cross-platform), PID files for process management

### External References
- [whatsapp-web.js docs](https://wwebjs.dev/) — authentication, message fetching, chat API
- [Ollama JS SDK](https://github.com/ollama/ollama-js) — chat API, streaming, model management
- [Commander.js](https://github.com/tj/commander.js) — CLI argument parsing
