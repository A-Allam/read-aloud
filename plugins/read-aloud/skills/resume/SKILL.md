---
name: resume
description: Resume a paused reply
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js *)
---

Result: !`node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js --resume`

Reply with exactly one line: `[read-aloud] ` followed by the result above, and nothing else. Do not run any tools.
