# Command: Create Spec

Create an initial spec draft for a new user story using the project template.

## Inputs

- User story folder path (e.g., `docs/sdd/specs/user-stories/US-0001-my-feature`)
- Problem statement
- Desired outcome
- Constraints
- Non-goals

## Files Generated

This command creates the following file inside the user story folder:

- `spec.md` — initial draft using `docs/sdd/specs/templates/spec-template.md`

## Output

- A complete `spec.md` with all template sections filled:
  - Context, Problem Statement, Goals, Non-Goals, Business Rules, Functional Requirements, Edge Cases, Dependencies, Risks
- Initial `status: draft` in frontmatter
- Do not include implementation details
- List potential risks and dependencies
- Flag any missing information as questions for the human to resolve

## Rules

- Use `docs/sdd/specs/templates/spec-template.md` as the base structure.
- Do not generate acceptance criteria, risk matrix, or contracts — those come from `/enrich-user-story`.
- Keep the spec focused on _what_ and _why_, never _how_.
- If the project profile exists (`.ai/project-profile.md`), use it for domain context.
