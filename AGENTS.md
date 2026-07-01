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
- AI Tab Grouping Suggester (Flan-T5 + Knowledge Graph)
- Intelligent Query Router
- On-Device SLM Reasoner (Phi-3.5-mini / Qwen2.5-1.5B)
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
