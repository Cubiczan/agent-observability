---
name: Datadog LLM Obs preview seeding
description: Rules for seeding synthetic Datadog LLM Observability spans so they match real SDK output and render correctly in the AgentOps dashboard.
---

# Seeding synthetic Datadog LLM Obs spans

When generating preview/synthetic LLM Obs spans (e.g. the repo-traces seeder) to make
apps appear in the dashboard before real deployment:

- **Root span `parent_id` must be the string `"undefined"`, NOT `null` or omitted.**
  That is the literal sentinel Datadog's real LLM Obs SDK emits for root spans. The
  dashboard's `computeDepths` (web `src/lib/timeline.ts`) treats any `parent_id` that
  is not an actual span id in the trace as a depth-0 root, so `"undefined"` resolves
  correctly. Do **not** "fix" it to `null`.
  **Why:** preview spans must be byte-compatible with real instrumented traffic so
  they land in identical `ml_app` buckets and render identically; diverging the root
  sentinel breaks that guarantee.

- `estimated_total_cost` is in **micro-USD** (reader divides by 1e6). Always attach a
  cost so cost-by-model isn't blank.

- Endpoints differ: **ingest** = `POST /api/intake/llm-obs/v1/trace/spans` with
  `data.type:"span"`; **search/export** = `POST /api/v2/llm-obs/v1/spans/events/search`
  with `data.type:"spans"`. The `/api/unstable/...` search path returns nothing here.

- Group key the dashboard buckets by is `ml_app`. Tag synthetic data
  `source:instrumentation-preview` (+ `sample:true`, `env:demo`) so it is filterable
  with `-source:instrumentation-preview`. Datadog cannot delete ingested spans — they
  age out (~30d), so re-running the seeder adds duplicates rather than replacing.
