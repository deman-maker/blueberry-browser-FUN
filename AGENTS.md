## Mima AI Governance

This repository is monitored by [Mima AI Governance](https://governance.mima.ai).

Before shipping any code that calls an AI/LLM provider:
1. Ensure the system is registered: `mima list-systems`
2. Push attestation: `mima push human_oversight --system <system_name> --reviewer your@email.com`
3. Check gate status: `mima gates check`

<!-- mima:unregistered-systems -->
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

<!-- /mima:unregistered-systems -->

<!-- mima:missing-controls -->
Missing controls:
- AI directly executes browser actions (close tabs, create groups, pin tabs, create workspaces) without any confirmation dialog or undo prompt shown to the user before execution — the action takes effect immediately upon tool call completion.
- No user-visible disclosure that messages (including page screenshots and full page text) are transmitted to a third-party LLM API; no consent mechanism is present in the code.
- The system prompt instructs the model to open Google Search tabs for any question it cannot answer (weather, news, facts), meaning external browsing is silently triggered by the AI without user confirmation.
<!-- /mima:missing-controls -->

Run `mima posture` to see the full compliance picture.

<!-- /mima:unregistered-systems -->

<!-- mima:missing-controls -->
Missing controls:
- No confirmation dialog or undo prompt is shown to the user before destructive actions (e.g., closing tabs) are executed from the chat interface — add a confirmation step for any irreversible tab action.
- Page text and screenshots are sent to a third-party LLM API (Google/OpenAI/Anthropic) without any explicit user consent notice or data-minimisation control — add a disclosure and opt-in before page content is transmitted.
- No rate-limiting or guardrail prevents the assistant from executing arbitrarily large bulk operations (e.g., closing all tabs) in a single LLM turn — add a per-operation limit and user confirmation threshold.
<!-- /mima:missing-controls -->

Run `mima posture` to see the full compliance picture.

<!-- /mima:unregistered-systems -->

<!-- mima:missing-controls -->
Missing controls:
- AI-initiated tab actions (close, pin, group, create) are executed immediately without a confirmation dialog or undo prompt presented before execution — the user has no pre-execution review gate.
- Page screenshots and full page text are sent to a third-party LLM API (Google/Anthropic/OpenAI) without explicit per-session user consent or disclosure in the UI.
- No rate-limiting or scope restriction prevents the assistant from closing all open tabs in a single tool call.
<!-- /mima:missing-controls -->

Run `mima posture` to see the full compliance picture.
