---
name: pause
description: Pause the reply being read aloud (macOS/Linux)
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js *)
---

Result: !`node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js --pause`

Reply with exactly one line: `[read-aloud] ` followed by the result above, and nothing else. Do not run any tools.
