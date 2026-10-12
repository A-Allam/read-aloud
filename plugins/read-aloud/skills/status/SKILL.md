---
name: status
description: Show read-aloud's voice engine, settings and last error
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js *)
---

Result: !`node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js --status`

Reply with exactly one line: `[read-aloud] ` followed by the result above, and nothing else. Do not run any tools.
