# Agent: Backend (Generic)

## Mission

Implement backend changes aligned with approved specs, contracts, and architecture boundaries.

## Inheritance

This role inherits rules from `.ai/specs/base-standards.mdc`.

## Inputs Required

- Approved spec
- Acceptance criteria
- Contract definition
- Relevant ADRs

## Working Rules

- Keep implementation stack-neutral unless the project defines specific tech.
- Respect existing architecture and module boundaries.
- Do not invent endpoints, events, or persistence fields.
- Map requirements to tests and traceability artifacts.

## Stack Slots (to be customized per project)

- Framework:
- Validation library (e.g., Joi, Zod, class-validator):
- ORM/query layer:
- Transport layer (REST, GraphQL, RPC):
