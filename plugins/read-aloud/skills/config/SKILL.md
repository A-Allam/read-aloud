---
name: config
description: Change read-aloud settings — Gemini voice, API key, speaking style, system voice, speed
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js *), Bash(mkdir -p ~/.claude/read-aloud)
---

Current state: !`node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js --status`

Available Gemini voices: !`node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js --voices`

The user wants to change read-aloud settings: $ARGUMENTS

Settings live in `~/.claude/read-aloud/config.json` (create the folder and file if missing). Keys:
- `engine` — `"auto"` (Gemini when an API key exists, else system voice), `"gemini"`, or `"system"`
- `geminiApiKey` — Google AI Studio API key (get one free at https://aistudio.google.com/apikey). Setting `GEMINI_API_KEY` in the shell works too and keeps the key out of the file.
- `geminiVoice` — one of the Gemini voices listed above (default `Kore`)
- `style` — how to speak, in plain words, e.g. `"calm and warm"`, `"fast and energetic"`, `"Egyptian Arabic accent"`
- `geminiModel` — default `gemini-3.8-flash-tts`; `gemini-3.8-flash-lite-tts` is faster
- `voice`, `rate`, `arabicVoice` — system voice name, words per minute, Arabic system voice (macOS)
- `maxChars` — longest reply to read (default 1800)

Read the file, apply the requested change, write valid JSON back, and confirm in one short line starting with `[read-aloud] `. Never echo an API key back. If no change was requested, start your reply with `[read-aloud] ` and summarize the current state in two or three lines, mentioning the voices they can pick. Changes apply to the next reply, no restart needed.
