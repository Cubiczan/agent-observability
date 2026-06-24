# Datadog LLM Observability — instrumentation for 5 repos

This directory contains ready-to-apply patches that add **Datadog LLM
Observability** to five repos in the `icohangar-ops` account, plus notes on how
their traces surface in the AgentOps dashboard.

| Repo | LLM stack | Instrumented entrypoint(s) | `ml_app` |
|---|---|---|---|
| `meshcfo` | CrewAI + openai-agents | `cme.cli` (existing `_maybe_init_observability` hook) | `meshcfo` |
| `council-tower` | OpenAI | `task.py` | `council-tower` |
| `scientific-consensus-engine` | OpenAI (Nebius) | `nebius_client.py` (shared client) | `scientific-consensus-engine` |
| `consensus-hardening-protocol` | shares `cme` (OpenAI) | `cme.cli`, `chp_superserve.py` | `consensus-hardening-protocol` |
| `strata` | Anthropic + OpenAI | `cli.py`, `streamlit_app.py` | `strata` |

## What each patch does

1. Adds an `observability.py` bootstrap module that enables Datadog LLM
   Observability in **agentless mode** (no Datadog Agent needed). Datadog's SDK
   auto-instruments the OpenAI / Anthropic / CrewAI / openai-agents libraries,
   so no per-call code changes are required.
2. Calls `init_observability("<repo>")` as early as possible at startup.
3. Adds `ddtrace>=2.8` to the repo's dependencies.

The bootstrap is a **no-op unless `DD_LLMOBS_ENABLED` is set**, so local dev,
tests and CI are unaffected. It also degrades gracefully (logs a warning, never
crashes) if `ddtrace` isn't installed.

> Note: `meshcfo` already shipped a `_maybe_init_observability()` hook (gated by
> `AGENTOPS_ENABLED`, which defaults to true) that imported a `cme.observability`
> module that never existed. The patch provides that module, wired to Datadog,
> with the `tags=[...]` signature the hook expects. To keep activation
> unconditional and consistent with the other four repos, the patch **also** adds
> an explicit `init_observability("meshcfo")` call at startup — so meshcfo turns
> on with the `DD_*` env vars alone, regardless of `AGENTOPS_ENABLED`.

## How to apply

In each repo's working tree:

```bash
git apply /path/to/<repo>.patch
# review, then commit on a branch and open a PR
```

## Required environment (per repo, in deployment)

```bash
DD_LLMOBS_ENABLED=1
DD_API_KEY=<your Datadog API key>
DD_SITE=us5.datadoghq.com          # must match the Datadog org the dashboard reads
DD_LLMOBS_ML_APP=<app name>        # optional; defaults to the repo name above
```

Then run the app normally. Spans become searchable via Datadog's Export API in
~30s.

## How they appear in the AgentOps dashboard

The dashboard reads LLM Obs spans through Datadog's Export API and groups them by
`ml_app` in the **Traces → By App** breakdown, with full per-trace waterfalls and
cost-by-model. Because each repo emits its own `ml_app`, it shows up as its own
app with no dashboard changes required.

- **Department attribution is optional.** The breakdown maps `ml_app → agent →
  employee → department` via the org directory. Since these repo names aren't in
  the directory, they bucket under **(unattributed)** in the *By Department*
  view. To attribute them, add matching agent entries to
  `scripts/data/directory.json`.

## Seeing it before deployment (preview data)

To verify the wiring end-to-end before the repos are deployed with Datadog
enabled, a preview seeder ships one representative, clearly-labeled trace per
repo using the same `ml_app`:

```bash
pnpm --filter @workspace/scripts run seed:repo-traces
```

Preview spans are tagged `source:instrumentation-preview` (plus `sample:true`,
`env:demo`) so they're obvious and filterable. Real traces from the running,
instrumented apps carry the same `ml_app` and land in the same buckets. Filter
previews out with `-source:instrumentation-preview`. (Datadog can't delete
ingested spans; they age out of the query window in ~30 days.)
