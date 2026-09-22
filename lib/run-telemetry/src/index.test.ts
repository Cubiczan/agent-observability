import assert from "node:assert/strict";
import { test } from "node:test";
import { createRunTelemetry, type RunTelemetryEvent } from "./index.ts";

test("records a complete stage event with run and lineage context", async () => {
  const events: RunTelemetryEvent[] = [];
  const telemetry = createRunTelemetry({
    run_id: "run-123",
    dataset: "customers",
    now: (() => {
      let value = 100;
      return () => (value += 25);
    })(),
    sink: (event) => events.push(event),
  });

  await telemetry.withStage("validate", () => "ok", {
    input_hash: "sha256:abc",
    row_count: 42,
    quality_status: "pass",
    findings_count: 2,
    lineage_links: [{ type: "source", uri: "s3://raw/customers.csv" }],
  });

  assert.deepEqual(events, [
    {
      run_id: "run-123",
      dataset: "customers",
      stage: "validate",
      input_hash: "sha256:abc",
      row_count: 42,
      quality_status: "pass",
      duration: 25,
      findings_count: 2,
      lineage_links: [{ type: "source", uri: "s3://raw/customers.csv" }],
    },
  ]);
});

test("emits a failed stage event and preserves the operation error", async () => {
  const events: RunTelemetryEvent[] = [];
  const telemetry = createRunTelemetry({
    run_id: "run-456",
    dataset: "orders",
    sink: (event) => events.push(event),
  });
  const error = new Error("bad input");

  await assert.rejects(
    telemetry.withStage("load", () => {
      throw error;
    }),
    error,
  );
  assert.equal(events[0]?.quality_status, "fail");
  assert.equal(events[0]?.findings_count, 1);
});

test("defaults findings and lineage while allowing a generated run id", async () => {
  const events: RunTelemetryEvent[] = [];
  const telemetry = createRunTelemetry({ dataset: "events", sink: (event) => events.push(event) });

  await telemetry.record("extract", { row_count: 3 });

  assert.match(telemetry.run_id, /^run-|^[0-9a-f-]{36}$/);
  assert.equal(events[0]?.findings_count, 0);
  assert.deepEqual(events[0]?.lineage_links, []);
});
