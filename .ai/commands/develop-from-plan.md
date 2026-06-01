# Command: Develop From Plan

Implement using an approved plan and spec.

## Inputs

- User story folder path (contains `plan.md`, `spec.md`, `acceptance-criteria.md`, `contracts/`)
- `plan.md` must have `status: approved` or `status: in-progress`

## Files Created or Updated

This command creates or updates the following files inside the user story folder:

- `traceability.md` — links each requirement to code, tests, and PR references
- `changelog.md` — records changes made to the spec during implementation

It also updates:

- `plan.md` — sets `status: in-progress` if not already

## Output

- Minimal implementation aligned to plan tasks
- Test updates aligned to acceptance criteria
- Traceability updates (`traceability.md`)
- Changelog updates (`changelog.md`)
- Update `plan.md` status to `in-progress` if not already

## Rules

- Do not change behavior beyond spec scope.
- If scope drift is needed, stop and request spec/plan update.
- Use templates from `docs/sdd/specs/templates/` for traceability and changelog structure.
