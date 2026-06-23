---
name: drizzle-kit push interactive prompt
description: Why `db push` fails non-interactively when adding a unique/not-null constraint to a populated table, and how to get past it.
---

# drizzle-kit push needs a TTY when constraining a populated table

When `pnpm --filter @workspace/db run push` adds a **unique** (or not-null)
constraint to a table that already has rows, drizzle-kit prints an interactive
"Do you want to truncate <table>?" prompt. In this environment stdin is not a
TTY, so it errors with `Interactive prompts require a TTY terminal`. The
`push-force` script does **not** help — `--force` skips the *data-loss
confirmation*, not this truncate prompt.

**Why:** adding a unique constraint to existing data could fail on duplicates, so
drizzle-kit asks to truncate first; that prompt can't be answered headlessly.

**How to apply:** manually empty the table first, then push runs clean:
`psql "$DATABASE_URL" -c "TRUNCATE <table>;"` then re-run `db run push`. Safe ONLY
when you're about to reload that data anyway (e.g. via the ingest `--reset` path).

**Caution / related:** truncating is destructive — never do it to a populated table
whose data you can't reload (e.g. `usage_events`). Worse, when this prompt aborts a
push, it also silently skips creating *other* new tables in the same diff (e.g.
`budgets`), causing later `relation "..." does not exist` 500s. In that case do NOT
truncate — hand-create the missing table from the schema. See
[budgets-table-missing.md](budgets-table-missing.md).
