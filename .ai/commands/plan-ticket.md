# Command: Plan Ticket

Create an execution plan from an approved spec.

## Inputs

- Approved spec path
- Acceptance criteria path
- Human-validated contract path
- Risk matrix path
- Relevant ADRs

## Files Generated

This command creates the following files inside the user story folder:

- `plan.md` — execution plan with tasks, verification steps, and risk mitigations
- `test-plan.md` — test cases mapped to acceptance criteria (AC → TC)

## Output

- `plan.md` using `docs/sdd/specs/templates/plan-template.md` with `status: pending`
- `test-plan.md` using `docs/sdd/specs/templates/test-plan-template.md` with AC → TC mapping
- Ordered, checkable tasks
- Verification steps per task
- Risk notes and mitigation tasks for all `Medium`/`High` risks

## Rules

- No implementation yet.
- Keep plan aligned to acceptance criteria.
- Every AC must have at least one mapped test case in `test-plan.md`.