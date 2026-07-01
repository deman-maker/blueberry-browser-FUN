## Mima AI Governance

This repository is monitored by [Mima AI Governance](https://governance.mima.ai).

Before shipping any code that calls an AI/LLM provider:
1. Ensure the system is registered: `mima list-systems`
2. Push attestation: `mima push human_oversight --system <system_name> --reviewer your@email.com`
3. Check gate status: `mima gates check`

<!-- mima:unregistered-systems -->
Currently unregistered systems detected in this repo:
- Browser Sidebar Chat Assistant
- Natural Language Tab Command Service
- AI Tab Grouping Suggester (Flan-T5-Small + Knowledge Graph)
- Intelligent Query Router
- On-Device SLM Reasoning Engine (Phi-3.5-mini / Qwen2.5-1.5B)
<!-- /mima:unregistered-systems -->

<!-- mima:missing-controls -->
Missing controls:
- Tab management actions (close, pin, group, create) are executed immediately upon AI tool call with no confirmation dialog or undo prompt shown to the user before execution — add a confirmation step before destructive actions like closing multiple tabs.
- No rate limiting or abuse prevention on the IPC 'sidebar-chat-message' handler — a malicious renderer could flood the LLM endpoint.
- Screenshots and full page text (potentially containing passwords, PII, or sensitive content) are sent to a third-party LLM API without user consent disclosure or opt-out mechanism.
<!-- /mima:missing-controls -->

Run `mima posture` to see the full compliance picture.
