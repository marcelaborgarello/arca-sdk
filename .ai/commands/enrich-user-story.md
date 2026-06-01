# Command: Enrich User Story

You are refining an existing user story before planning.

## Inputs

- User story folder path (must contain `spec.md` from `/create-spec`)
- Additional business context (optional)
- Additional constraints and non-goals (optional)
- Risk profile hint (optional): `low`, `medium`, or `high`

## Files Updated

- `spec.md` — refined with improved context, goals, business rules, edge cases

## Files Generated

- `acceptance-criteria.md` — testable AC statements in Given/When/Then format
- `risk-matrix.md` — initial risk assessment (max 5 risks, with mitigation hints for Medium/High)
- `contracts/` draft — AI-generated contract proposal (for example `contracts/openapi.yaml`) to be human-validated before planning

## Output

1. Refined `spec.md` (updated in place)
2. Acceptance criteria draft
3. Initial risk matrix draft (max 5 risks, with mitigation hints for Medium/High)
4. Initial contract draft in `contracts/` aligned to the refined spec and AC
5. Edge cases identified and added to spec
6. Risks and assumptions
7. Missing information questions for the human to resolve

## Rules

- Do not propose implementation details.
- Keep output spec-oriented and testable.
- Use templates from `docs/sdd/specs/templates/` for new files.
- Read the existing `spec.md` first — refine it, do not recreate it from scratch.
- Treat contract generation as a proposal: create a draft that is explicit about assumptions and mark unresolved points for human validation.
- Keep risk output proportional to complexity: for simple CRUDL-like stories, produce 1-3 risks; if no material risk is found, include one explicit "no material risk" row with rationale.
