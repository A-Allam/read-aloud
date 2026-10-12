# read-aloud 🔊

A Claude Code plugin that **reads every reply aloud**. Send a prompt, look away, and listen.

- **Natural voices** — Gemini voices from Google AI Studio (Kore, Puck, Charon, Sulafat… 30 voices), with Egyptian and Standard Arabic support
- **Works with no setup** — without an API key it uses your computer's built-in voice
- **Full control** — read on demand, stop, pause, resume, mute
- **Never blocks** — runs in the background; a new reply replaces the old one
- **Speech-friendly** — skips code blocks, strips markdown, says filenames instead of full paths
- **Zero dependencies** — runs on the Node that ships with Claude Code

## Install

Inside Claude Code, run these **one at a time**:

```
/plugin marketplace add A-Allam/read-aloud
```
```
/plugin install read-aloud@aliallam
```

Then restart Claude Code (or run `/reload-plugins`). The next reply is read aloud.

> If the add step fails on a machine without a GitHub SSH key, use `https://github.com/A-Allam/read-aloud.git` instead.

## Use Gemini voices (recommended)

1. Get a free API key at **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**.
2. Give it to the plugin — any one of these:
   - the install dialog asks for it (or run `/plugin configure read-aloud@aliallam`)
   - add `export GEMINI_API_KEY=your-key` to `~/.zshrc` / `~/.bashrc`
   - run `/read-aloud:config set my gemini key to …`
3. Pick a voice and style: `/read-aloud:config use Sulafat, calm and warm`

Run `/read-aloud:status` to check which voice engine is active and see the last error, if any. If Gemini fails (no network, bad key, quota), it falls back to the system voice automatically.

## Commands

| Command | What it does |
| :-- | :-- |
| `/read-aloud:read` | Read the last reply aloud (works even when muted) |
| `/read-aloud:stop` | Stop reading now |
| `/read-aloud:pause` | Pause (macOS / Linux) |
| `/read-aloud:resume` | Continue from where it paused |
| `/read-aloud:mute` | Stop auto-reading — replies are still saved for `/read-aloud:read` |
| `/read-aloud:unmute` | Auto-read every reply again |
| `/read-aloud:status` | Voice engine, settings, last error |
| `/read-aloud:config …` | Change voice, style, speed, key — in plain words |

**Read only when you ask:** run `/read-aloud:mute` once, then `/read-aloud:read` whenever you want to hear a reply.

Replaying a reply with `/read-aloud:read` reuses the saved audio, so it doesn't cost another Gemini call.

## Settings

`~/.claude/read-aloud/config.json` (all optional):

```json
{
  "engine": "auto",
  "geminiVoice": "Kore",
  "style": "Natural and relaxed, like a colleague explaining their work",
  "geminiModel": "gemini-3.8-flash-tts",
  "voice": null,
  "rate": 200,
  "arabicVoice": "Majed",
  "maxChars": 1800
}
```

| Key | Default | Notes |
| :-- | :-- | :-- |
| `engine` | `auto` | `auto` = Gemini when a key is set, else system voice · `gemini` · `system` |
| `geminiVoice` | `Kore` | Any of the 30 Gemini voices — `/read-aloud:config` lists them |
| `style` | natural, relaxed | How to speak, in plain words: `"fast and energetic"`, `"Egyptian Arabic accent"` |
| `geminiModel` | `gemini-3.8-flash-tts` | `gemini-3.8-flash-lite-tts` starts faster |
| `geminiApiKey` | — | Prefer the `GEMINI_API_KEY` env var so the key isn't in a file |
| `voice` / `rate` | OS default / 200 | System voice name and words per minute |
| `arabicVoice` | `Majed` | macOS system voice for mostly-Arabic replies |
| `maxChars` | `1800` | Longer replies are cut at a sentence boundary |

## Requirements

- **macOS:** nothing extra.
- **Windows:** nothing extra (pause isn't supported on Windows).
- **Linux:** a player for Gemini audio (`paplay`, `aplay`, `pw-play` or `ffplay`) and `espeak-ng` for the fallback voice: `sudo apt install espeak-ng pulseaudio-utils`.

## Privacy

With the system voice, nothing leaves your machine. With Gemini, each reply's text (after code blocks are removed) is sent to Google's Gemini API to generate the audio.

## How it works

Claude Code fires a `Stop` hook when a reply finishes, with the final text as `last_assistant_message`. [`scripts/speak.js`](plugins/read-aloud/scripts/speak.js) cleans the markdown, saves it, and starts a background worker that fetches Gemini audio (or uses the OS voice) and plays it. The worker runs in its own process group, which is how stop, pause and resume work.

## License

MIT
