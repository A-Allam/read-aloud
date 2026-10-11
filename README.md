# read-aloud 🔊

A Claude Code plugin that **reads every reply aloud** using the voice already on your machine. Send a prompt, look away, and listen.

- **Zero dependencies** — runs on the Node that ships with Claude Code
- **Uses the OS voice** — macOS `say`, Linux `espeak-ng`, Windows SAPI
- **Never blocks** — runs in the background; a new reply interrupts the old one
- **Speech-friendly** — strips markdown, says "code block" instead of reading code, reads filenames instead of full paths
- **Arabic-aware** — mostly-Arabic replies switch to an Arabic voice automatically

## Install

Inside any Claude Code session:

```
/plugin marketplace add A-Allam/read-aloud
/plugin install read-aloud@aliallam
```

Or from your shell:

```bash
claude plugin marketplace add A-Allam/read-aloud
claude plugin install read-aloud@aliallam
```

Restart Claude Code. The next reply is read aloud.

**Linux only:** install a voice engine first — `sudo apt install espeak-ng` (or `brew install espeak-ng`, `pacman -S espeak-ng`). macOS and Windows need nothing.

## Commands

| Command | What it does |
| :-- | :-- |
| `/read-aloud:mute` | Stop reading aloud (until unmuted) |
| `/read-aloud:unmute` | Resume |
| `/read-aloud:config faster` | Change rate, voice, or max length in plain words |

Mute also works from outside Claude: `touch ~/.claude/read-aloud.mute` / `rm ~/.claude/read-aloud.mute`.

## Settings

Optional file at `~/.claude/read-aloud.json`:

```json
{
  "rate": 200,
  "voice": "Samantha",
  "arabicVoice": "Majed",
  "maxChars": 1800
}
```

| Key | Default | Notes |
| :-- | :-- | :-- |
| `rate` | `200` | Words per minute |
| `voice` | OS default | macOS: `say -v ?` lists voices · Linux: `espeak-ng --voices` · Windows: installed SAPI voice name |
| `arabicVoice` | `Majed` | macOS voice used when a reply is mostly Arabic |
| `maxChars` | `1800` | Longer replies are cut at a sentence boundary with "response truncated" |

Environment variables `CLAUDE_SPEAK_RATE`, `CLAUDE_SPEAK_VOICE`, `CLAUDE_SPEAK_MAX` override the file. Changes apply on the next reply — no restart.

## How it works

Claude Code fires a `Stop` hook when a reply finishes and passes the final text as `last_assistant_message`. This plugin registers one async command hook on that event: [`scripts/speak.js`](plugins/read-aloud/scripts/speak.js) cleans the markdown and hands the text to the system TTS, detached, so the terminal is never waiting on audio.

Nothing is sent anywhere. The text never leaves your machine.

## Want a better voice?

The built-in voices are fine for skimming; for something nicer, `speak()` in `speak.js` is the one place to swap in [Piper](https://github.com/rhasspy/piper), `edge-tts`, or an API voice. PRs welcome.

## License

MIT
