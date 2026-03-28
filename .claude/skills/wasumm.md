---
name: wasumm
description: Summarize WhatsApp conversations using the wasumm CLI tool. Trigger on "summarize whatsapp", "whatsapp summary", "wasumm", or references to summarizing a chat.
user-invocable: true
---

# WhatsApp Conversation Summarizer

Run the `wasumm` CLI tool to summarize WhatsApp conversations.

## Working Directory

Always run commands from the **project root** (wherever this repo was cloned). Use `pwd` if unsure.

## Commands

### Summarize a chat

Parse the user's request to determine the chat name and scope, then run:

```bash
node bin/wasumm.js summarize "<chat_name>" <scope_flag>
```

**Scope flags** (use only one):
- `--last <N>` — last N messages
- `--since <duration>` — e.g., `2h`, `1d`
- `--from <YYYY-MM-DD>` — since a specific date
- `--unread` — unread messages only
- *(no flag)* — defaults to unread, fallback to last 20

**Optional flags:**
- `--model <name>` — override model (e.g., `gpt-4o`, `llama3`)
- `--provider <name>` — override provider (`ollama`, `openai`, `anthropic`)

### List chats

If the user asks to see their chats or you need to find a chat name:

```bash
node bin/wasumm.js chats --limit 20
```

### Re-authenticate

If WhatsApp session expires:

```bash
node bin/wasumm.js auth
```

## Interpreting User Requests

Map natural language to commands:

| User says | Command |
|-----------|---------|
| "summarize my Family Group chat" | `summarize "Family Group"` |
| "what happened in Work Team last 2 hours" | `summarize "Work Team" --since 2h` |
| "catch me up on John's messages" | `summarize "John" --unread` |
| "summarize last 100 messages in Game Dev" | `summarize "Game Dev" --last 100` |
| "what did I miss today in the group?" | `summarize "<group name>" --since 1d` |
| "show my whatsapp chats" | `chats --limit 20` |

## Important Notes

- Commands take 30-60 seconds (WhatsApp connection + LLM summarization) — use `timeout: 180000`
- If a QR code is needed, tell the user to run it in their own terminal with the `!` prefix
- The summary is automatically copied to clipboard after display
- Chat names support case-insensitive partial matching
