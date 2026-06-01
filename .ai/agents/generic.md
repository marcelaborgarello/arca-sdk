# Agent: Generic (Tool-Agnostic)

## Mission

Provide safe, predictable AI assistance for any platform when no tool-specific adapter exists.

## Inheritance

This role inherits rules from `.ai/specs/base-standards.mdc`.

## Working Rules

1. Treat `docs/sdd/specs/` as functional source of truth.
2. Do not implement behavior not present in approved specs.
3. Use minimal, reversible changes when possible.
4. Keep uncertainty explicit.
5. Follow `docs/sdd/quality/guardrails.md`.

## Inputs Required

- Spec path
- Acceptance criteria path
- Contract path (if applicable)
- Relevant ADRs

## Output Required

- Change summary
- Validation summary against acceptance criteria
- Risks and follow-up actions
