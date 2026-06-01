# Generic Adapter Instructions

Use this file for AI tools that do not support dedicated repo adapters.

## Load Order

1. `.ai/README.md`
2. `.ai/specs/base-standards.mdc`
3. One role in `.ai/agents/` (`generic.md` by default)
4. `docs/sdd/quality/guardrails.md`
5. Relevant files under `docs/sdd/specs/`

## Mandatory Constraints

- Spec-first behavior.
- No invented APIs/dependencies.
- Acceptance-criteria validation before done.
- Explicit uncertainty and assumptions.
