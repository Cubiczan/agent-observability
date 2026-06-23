import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../app";

// --- Datadog credentials are required by readConfig(); set fakes for tests. ---
process.env.DATADOG_SITE = "datadoghq.test";
process.env.DATADOG_API_KEY = "fake-api-key";
process.env.DATADOG_APP_KEY = "fake-app-key";

// realFetch is used to call our own server; the global fetch is stubbed so the
// route's Datadog call returns canned data instead of hitting the network.
const realFetch = globalThis.fetch;

// What the stubbed Datadog endpoint should return for the next route call.
let nextDatadog: () => Response = () =>
  new Response(JSON.stringify({ data: [] }), { status: 200 });

globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  // Only intercept the Datadog Export API; let everything else hit the network
  // (the test never relies on that path, but it keeps the stub honest).
  if (u.includes("/api/v2/llm-obs/")) {
    return nextDatadog();
  }
  return realFetch(u, init);
}) as typeof fetch;

interface TraceListResponse {
  noData: boolean;
  spans: Array<{ spanId: string; kind: string }>;
}

interface TraceSummaryResponse {
  noData: boolean;
  spanCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
}

async function getJson<T>(url: string): Promise<{ status: number; body: T }> {
  const res = await realFetch(url);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

function spanIds(body: TraceListResponse): string[] {
  return body.spans.map((s) => s.spanId);
}

function datadogSpans(
  spans: Array<Record<string, unknown>>,
  status = 200,
): () => Response {
  return () =>
    new Response(
      JSON.stringify({ data: spans.map((attributes, i) => ({ id: `e${i}`, attributes })) }),
      { status, headers: { "Content-Type": "application/json" } },
    );
}

function noIndexError(): Response {
  return new Response(
    JSON.stringify({ errors: [{ detail: "No valid indexes specified" }] }),
    { status: 500 },
  );
}

const SAMPLE = [
  {
    span_id: "s1",
    name: "gpt call",
    span_kind: "llm",
    model_name: "gpt-4o",
    model_provider: "openai",
    status: "ok",
    ml_app: "support-bot",
    duration: 1_000_000, // 1 ms
    metrics: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  },
  {
    span_id: "s2",
    name: "planner step",
    span_kind: "agent",
    model_name: null,
    model_provider: null,
    status: "error",
    ml_app: "support-bot",
    duration: 3_000_000, // 3 ms
    metrics: { input_tokens: 20, output_tokens: 0, total_tokens: 20 },
  },
  {
    span_id: "s3",
    name: "claude call",
    span_kind: "llm",
    model_name: "claude-3",
    model_provider: "anthropic",
    status: "ok",
    ml_app: "billing-agent",
    duration: 2_000_000, // 2 ms
    metrics: { input_tokens: 30, output_tokens: 10, total_tokens: 40 },
  },
];

describe("traces routes", () => {
  let server: Server;
  let base: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        base = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    nextDatadog = datadogSpans(SAMPLE);
  });

  test("GET /traces returns all spans when no filters are given", async () => {
    const { status, body } = await getJson<TraceListResponse>(`${base}/traces`);
    assert.equal(status, 200);
    assert.equal(body.noData, false);
    assert.equal(body.spans.length, 3);
  });

  test("GET /traces?kind=llm filters by span kind", async () => {
    const { body } = await getJson<TraceListResponse>(`${base}/traces?kind=llm`);
    assert.equal(body.spans.length, 2);
    assert.ok(body.spans.every((s) => s.kind === "llm"));
  });

  test("GET /traces?q matches name, model, provider, kind and mlApp", async () => {
    // model match
    assert.deepEqual(
      spanIds((await getJson<TraceListResponse>(`${base}/traces?q=claude`)).body),
      ["s3"],
    );

    // provider match
    assert.deepEqual(
      spanIds((await getJson<TraceListResponse>(`${base}/traces?q=openai`)).body),
      ["s1"],
    );

    // mlApp match
    assert.deepEqual(
      spanIds((await getJson<TraceListResponse>(`${base}/traces?q=billing`)).body),
      ["s3"],
    );

    // kind match (free text, case-insensitive): s2 matches via its kind
    // ("agent") and s3 via its mlApp ("billing-agent").
    assert.deepEqual(
      spanIds((await getJson<TraceListResponse>(`${base}/traces?q=AGENT`)).body),
      ["s2", "s3"],
    );

    // name match
    assert.deepEqual(
      spanIds((await getJson<TraceListResponse>(`${base}/traces?q=planner`)).body),
      ["s2"],
    );
  });

  test("GET /traces combines kind and q filters", async () => {
    // Only s1 is both kind=llm AND matches "support" (ml_app support-bot).
    const { body } = await getJson<TraceListResponse>(`${base}/traces?kind=llm&q=support`);
    assert.deepEqual(spanIds(body), ["s1"]);
  });

  test("GET /traces/summary aggregates counts, tokens and average latency", async () => {
    const { body } = await getJson<TraceSummaryResponse>(`${base}/traces/summary`);
    assert.equal(body.noData, false);
    assert.equal(body.spanCount, 3);
    assert.equal(body.errorCount, 1);
    assert.equal(body.inputTokens, 60);
    assert.equal(body.outputTokens, 15);
    assert.equal(body.totalTokens, 75);
    // (1 + 3 + 2) ms / 3 spans = 2 ms average.
    assert.equal(body.avgLatencyMs, 2);
  });

  test("GET /traces/summary respects filters", async () => {
    const { body } = await getJson<TraceSummaryResponse>(`${base}/traces/summary?kind=llm`);
    assert.equal(body.spanCount, 2);
    assert.equal(body.errorCount, 0);
    assert.equal(body.inputTokens, 40);
    assert.equal(body.outputTokens, 15);
    assert.equal(body.totalTokens, 55);
    // (1 + 2) ms / 2 spans = 1.5 ms average.
    assert.equal(body.avgLatencyMs, 1.5);
  });

  test("GET /traces passes through Datadog's empty-org no-data state", async () => {
    nextDatadog = noIndexError;
    const { body } = await getJson<TraceListResponse>(`${base}/traces`);
    assert.equal(body.noData, true);
    assert.deepEqual(body.spans, []);
  });

  test("GET /traces/summary reports zeroed aggregates when there is no data", async () => {
    nextDatadog = noIndexError;
    const { body } = await getJson<TraceSummaryResponse>(`${base}/traces/summary`);
    assert.equal(body.noData, true);
    assert.equal(body.spanCount, 0);
    assert.equal(body.avgLatencyMs, 0);
  });
});
