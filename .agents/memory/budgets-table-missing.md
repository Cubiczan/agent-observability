---
name: budgets table missing / drizzle push truncate trap
description: Why new tables can silently fail to be created on this repo, and the safe fix
---

# Symptom
Dashboard shows only skeleton loaders; api-server logs `error: relation "budgets" does not exist` and `/api/departments` (and other budget-joined routes) return 500. Frontend looks like "no token numbers" even though the data exists.

# Root cause
`drizzle-kit push` (the project's `db push` reconciliation) is interactive. When the schema diff includes adding a UNIQUE constraint/index to an already-populated table (e.g. `usage_events.external_id`), drizzle prompts "Do you want to truncate?" and **blocks on stdin**. In the non-TTY post-merge/setup environment it aborts, which skips ALL remaining statements — including `CREATE TABLE budgets`. So a brand-new table never gets created.

# Safe fix
Do NOT re-run `db push` and do NOT accept the truncate (it would wipe usage_events). Create the missing table with direct idempotent DDL matching the Drizzle schema in `lib/db/src/schema/index.ts`. For budgets that is:
- table `budgets` (serial id, department_id text NOT NULL -> departments(id), model_id text -> models(id), amount numeric(14,2) NOT NULL, created_at/updated_at timestamptz NOT NULL default now())
- partial unique index `budgets_dept_wide_idx` ON (department_id) WHERE model_id IS NULL
- partial unique index `budgets_dept_model_idx` ON (department_id, model_id) WHERE model_id IS NOT NULL

**Why:** direct DDL is stateless-compatible with drizzle push (push compares live DB to schema), so once the table matches, push treats it as a no-op.

**How to apply:** when any route 500s with `relation "<x>" does not exist`, suspect the push-truncate trap; hand-create the table from the schema rather than running push. The same gap will exist on a fresh/production DB until the push is run successfully (without truncating).
