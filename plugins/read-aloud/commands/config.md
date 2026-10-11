---
description: Show or change read-aloud settings (rate, voice, max length)
allowed-tools: Read, Write, Bash(say:*), Bash(espeak-ng:*)
---
The user wants to change read-aloud settings: $ARGUMENTS

Settings live in `~/.claude/read-aloud.json` with these keys:
- `rate` — words per minute (default 200)
- `voice` — force a voice name (macOS: run `say -v ?` to list; Linux: `espeak-ng --voices`)
- `arabicVoice` — macOS voice used when a reply is mostly Arabic (default "Majed")
- `maxChars` — truncate replies longer than this (default 1800)

Read the current file if it exists, apply the requested change, write it back as valid JSON, and confirm in one line. If no arguments were given, show the current settings. Changes take effect on the next reply, no restart needed.
