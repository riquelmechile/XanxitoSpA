# Customer Support

Triage, investigate and resolve customer requests while preserving evidence and escalation boundaries.

## Trigger

Use when the current Work matches one of this skill's indexed triggers/scopes and the skill is installed for the deployment Company.

## Procedure

1. Read the current Work, Company state and only the evidence needed for the objective.
2. Confirm required capabilities are available under active authority and budget; a skill never grants either.
3. Execute the smallest reversible steps first. External or financial side effects must pass the normal capability/authority boundary.
4. Record structured evidence and outcome references, not raw secrets or unbounded conversation.
5. Verify the success condition and settle the Work. Feed verified BusinessOutcome evidence to the relevant CorporateGene when institutional learning is justified.

## Required semantic capabilities

- `email.read`
- `email.search`
- `email.reply`
- `data.query`
- `data.write`
- `notification.send`

## Boundaries

- Company-scoped only.
- No credentials or secret material in skill memory.
- Do not bypass human-reserved actions, legal/KYC/MFA boundaries, grants or BudgetEnvelope controls.
- If the process repeatedly differs from this reusable definition, prefer a Company-local AutoSkill/SkillGene rather than mutating the global skill silently.
