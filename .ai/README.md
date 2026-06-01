# AI Operating Layer

This directory standardizes AI behavior across tools while remaining stack-agnostic.

## Components

- `specs/base-standards.mdc`: single source of truth for common AI behavior.
- `agents/`: role-specific guidance.
- `commands/`: workflow templates (`create-spec -> enrich -> plan -> implement -> review`).
- `adapters/`: tool-specific instruction bridges.
- `lessons/`: reusable learnings from previous tasks.

## Usage Rules

1. Load `.ai/specs/base-standards.mdc` first.
2. Always start from an approved spec.
3. Choose the appropriate agent for the task.
4. Use `commands/` as the default flow.
5. Record reusable learnings in `lessons/lessons.md`.
