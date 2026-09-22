# Run telemetry

`@workspace/run-telemetry` is a destination-neutral hook for instrumenting data
pipeline runs. It emits one normalized event per stage through a caller-provided
async sink; the sink can write to a warehouse, log stream, or observability API.
It does not require Datadog, PostgreSQL, or a dashboard.

```ts
import { createRunTelemetry } from "@workspace/run-telemetry";

const telemetry = createRunTelemetry({
  dataset: "customer_features",
  run_id: process.env.RUN_ID,
  sink: (event) => fetch("https://telemetry.example/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  }),
});

await telemetry.withStage("quality_check", () => checkRows(rows), {
  input_hash: "sha256:...",
  row_count: rows.length,
  quality_status: "pass",
  findings_count: 0,
  lineage_links: [{ type: "upstream", uri: "s3://raw/customer.csv" }],
});
```

Each event contains `run_id`, `dataset`, `stage`, `duration` (milliseconds),
`findings_count`, and `lineage_links`. `input_hash`, `row_count`, and
`quality_status` are optional because some stages do not have a row-oriented
input or quality result. A failed operation emits a `quality_status: "fail"`
event, then rethrows the original error. Sink errors are not swallowed.
