---
name: stop
description: Stop reading aloud right now
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js *)
---

Result: !`node ${CLAUDE_PLUGIN_ROOT}/scripts/speak.js --stop`

Reply with exactly one line: `[read-aloud] ` followed by the result above, and nothing else. Do not run any tools.
