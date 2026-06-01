# Command: Review Ticket

Review implementation against source artifacts.

## Inputs

- Spec path
- Acceptance criteria path
- Plan path
- Risk matrix path
- Traceability path
- Test plan path
- PR diff or changed files

## Output

- Findings ordered by severity
- Gaps against acceptance criteria
- AC to test case coverage gaps
- Risk mitigation gaps (High risks without implemented mitigation)
- Contract or architecture mismatches
- Final recommendation

## Rules

- Prioritize risk and regressions.
- Do not approve if critical criteria are unverified.
- Verify that all High-priority risks have corresponding mitigations in the implementation.
- Verify that every AC has at least one linked and passing test case.
