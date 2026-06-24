/**
 * Seed clearly-labeled PREVIEW traces for the five instrumented repos into
 * Datadog LLM Observability, so they appear in the AgentOps dashboard's "By App"
 * breakdown and trace list immediately -- before those repos are deployed with
 * Datadog enabled.
 *
 * Each repo is instrumented (see deliverables/datadog-llm-obs/) to emit Datadog
 * LLM Obs spans with `ml_app` set to the repo name. This script sends one
 * representative trace per repo using that same ml_app, tagged
 * `source:instrumentation-preview` (plus `sample:true`, `env:demo`) so the
 * preview rows are obviously synthetic and easy to filter out once real traffic
 * arrives. Real traces from the running, instrumented apps carry the same
 * ml_app, so they land in the same dashboard buckets.
 *
 * This writes ONLY clearly-labeled sample data; the live dashboard path stays
 * strictly read-only. Ingested spans take ~30s to become searchable via the
 * Export API. Datadog cannot delete ingested spans -- they age out of the query
 * window (~30d).
 *
 * Run: pnpm --filter @workspace/scripts run seed:repo-traces
 */

const SITE = process.env.DATADOG_SITE;
const API_KEY = process.env.DATADOG_API_KEY;

if (!SITE || !API_KEY) {
  console.error("DATADOG_SITE and DATADOG_API_KEY must be set to seed preview traces.");
  process.exit(1);
}

const SAMPLE_TAGS = ["sample:true", "env:demo", "source:instrumentation-preview"];

interface SampleSpan {
  name: string;
  kind: "agent" | "workflow" | "llm" | "tool" | "task";
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  status?: "ok" | "error";
  input?: string;
  output?: string;
}

interface RepoRun {
  /** Repo name -- the ml_app the instrumented repo emits and the dashboard groups by. */
  mlApp: string;
  spans: SampleSpan[];
}

// Approximate USD price per 1K tokens (input / output) by model, used to attach a
// realistic estimated_total_cost to LLM spans. Unknown models fall back to a
// small default so a cost is always present.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 0.005, out: 0.015 },
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "claude-3-5-sonnet": { in: 0.003, out: 0.015 },
  "deepseek-v3": { in: 0.0009, out: 0.0009 },
  "llama-3-3-70b": { in: 0.0009, out: 0.0009 },
};

function estimatedCostMicros(s: SampleSpan): number {
  if (!s.model) return 0;
  const price = MODEL_PRICING[s.model] ?? { in: 0.001, out: 0.002 };
  const inTok = s.inputTokens ?? 0;
  const outTok = s.outputTokens ?? 0;
  const usd = (inTok / 1000) * price.in + (outTok / 1000) * price.out;
  return Math.round(usd * 1_000_000);
}

// One representative trace per repo, reflecting its real architecture.
const RUNS: RepoRun[] = [
  {
    mlApp: "meshcfo",
    spans: [
      {
        name: "cfo-os.run",
        kind: "agent",
        durationMs: 11800,
        input: "Build a Q3 capital allocation case across the three business units",
        output: "Recommended reallocating 8% of opex toward the data platform",
      },
      {
        name: "crew.kickoff",
        kind: "workflow",
        durationMs: 9200,
        input: "Coordinate finance, forecast and investment agents",
        output: "3 agents completed; consensus reached on allocation",
      },
      {
        name: "openai.chat.completion",
        kind: "llm",
        model: "gpt-4o",
        provider: "openai",
        inputTokens: 5200,
        outputTokens: 1300,
        durationMs: 5100,
        input: "Draft capital allocation recommendations from the unit forecasts",
        output: "Shift 8% of opex to the data platform; defer the EMEA hire plan...",
      },
      {
        name: "forecast.tool",
        kind: "tool",
        durationMs: 320,
        input: "{ units: 3, horizon: 'Q3' }",
        output: "{ baseGrowth: 0.06, downside: -0.02 }",
      },
    ],
  },
  {
    mlApp: "council-tower",
    spans: [
      {
        name: "council.deliberate",
        kind: "agent",
        durationMs: 14200,
        input: "Should Apple acquire NVIDIA? (finance domain)",
        output: "Council verdict: No -- antitrust risk outweighs strategic upside",
      },
      {
        name: "advocate.argue",
        kind: "llm",
        model: "gpt-4o",
        provider: "openai",
        inputTokens: 2600,
        outputTokens: 700,
        durationMs: 3400,
        input: "Argue in favor of the acquisition",
        output: "Vertical integration of accelerators would lock in supply...",
      },
      {
        name: "skeptic.rebut",
        kind: "llm",
        model: "gpt-4o",
        provider: "openai",
        inputTokens: 2700,
        outputTokens: 720,
        durationMs: 3500,
        input: "Rebut the acquisition case",
        output: "Regulators would block it on antitrust grounds in three markets...",
      },
      {
        name: "judge.synthesize",
        kind: "llm",
        model: "gpt-4o-mini",
        provider: "openai",
        inputTokens: 3100,
        outputTokens: 520,
        durationMs: 2600,
        input: "Weigh both sides and render a verdict",
        output: "On balance the antitrust risk is decisive: recommend against.",
      },
    ],
  },
  {
    mlApp: "scientific-consensus-engine",
    spans: [
      {
        name: "consensus.run",
        kind: "agent",
        durationMs: 16700,
        input: "TRAF2 mediates CAR-T resistance via NF-kB signaling leading to IL-6 secretion",
        output: "Consensus: partially supported (4/6 agents); IL-6 link needs more evidence",
      },
      {
        name: "debate.round",
        kind: "workflow",
        durationMs: 12100,
        input: "Run multi-agent debate over the hypothesis with retrieved literature",
        output: "2 rounds; converged with one dissent on the IL-6 mechanism",
      },
      {
        name: "nebius.chat.completion",
        kind: "llm",
        model: "deepseek-v3",
        provider: "nebius",
        inputTokens: 6100,
        outputTokens: 1400,
        durationMs: 6300,
        input: "Critique the hypothesis against the retrieved abstracts",
        output: "The NF-kB axis is well supported; the IL-6 secretion step is weaker...",
      },
      {
        name: "search_pubmed",
        kind: "tool",
        durationMs: 540,
        input: "{ query: 'TRAF2 CAR-T NF-kB IL-6' }",
        output: "{ results: 14 }",
      },
    ],
  },
  {
    mlApp: "consensus-hardening-protocol",
    spans: [
      {
        name: "chp.orchestrate",
        kind: "agent",
        durationMs: 13400,
        input: "Harden the proposed treasury rebalancing decision before commit",
        output: "Decision passed R0 gate and triangulation; promoted to COMMITTED",
      },
      {
        name: "triangulation.run",
        kind: "workflow",
        durationMs: 9800,
        input: "Cross-validate the proposal with three independent guards",
        output: "3/3 guards agree within tolerance",
      },
      {
        name: "openai.chat.completion",
        kind: "llm",
        model: "gpt-4o",
        provider: "openai",
        inputTokens: 4300,
        outputTokens: 980,
        durationMs: 4700,
        input: "Validate the financial assumptions behind the rebalancing",
        output: "Assumptions are internally consistent; flag the FX sensitivity...",
      },
      {
        name: "r0_gate",
        kind: "tool",
        durationMs: 410,
        input: "{ proposalId: 'prop-q3-rebal' }",
        output: "{ passed: true, violations: [] }",
      },
    ],
  },
  {
    mlApp: "strata",
    spans: [
      {
        name: "strata.deliver",
        kind: "agent",
        durationMs: 15200,
        input: "Author and grade the 90-day maturity roadmap deliverable",
        output: "Draft authored and graded B+; two sections flagged for revision",
      },
      {
        name: "anthropic.messages",
        kind: "llm",
        model: "claude-3-5-sonnet",
        provider: "anthropic",
        inputTokens: 4800,
        outputTokens: 1600,
        durationMs: 6100,
        input: "Author the phased roadmap from the maturity heatmap",
        output: "Phase 1 (0-30d): close the observability gap; Phase 2 (30-60d)...",
      },
      {
        name: "openai.chat.completion",
        kind: "llm",
        model: "gpt-4o",
        provider: "openai",
        inputTokens: 3900,
        outputTokens: 720,
        durationMs: 3800,
        input: "Grade the authored deliverable against the rubric",
        output: "Score B+: strong sequencing, weak on measurable success criteria.",
      },
    ],
  },
];

function randId(): string {
  // Decimal numeric string, matching the IDs Datadog's LLM Obs SDK emits.
  let s = "";
  for (let i = 0; i < 18; i++) s += Math.floor(Math.random() * 10);
  return s.replace(/^0+/, "") || "1";
}

// Build the ingestion payload for a single repo run: one trace whose spans all
// chain under the root agent span, attributed to the repo's ml_app.
function buildRunBody(run: RepoRun, runIndex: number, runCount: number) {
  const nowNs = Date.now() * 1_000_000;
  const traceId = randId();
  let parentId = "undefined";

  const spans = run.spans.map((s, i) => {
    const runOffsetNs = (runCount - runIndex) * 60 * 60 * 1_000_000_000;
    const spanOffsetNs = (run.spans.length - i) * 5 * 1_000_000_000;
    const startNs = nowNs - runOffsetNs - spanOffsetNs;
    const durationNs = Math.round(s.durationMs * 1_000_000);
    const inputTokens = s.inputTokens ?? 0;
    const outputTokens = s.outputTokens ?? 0;
    const meta: Record<string, unknown> =
      s.kind === "llm"
        ? {
            kind: s.kind,
            input: { messages: [{ role: "user", content: s.input ?? "" }] },
            output: { messages: [{ role: "assistant", content: s.output ?? "" }] },
          }
        : {
            kind: s.kind,
            input: { value: s.input ?? "" },
            output: { value: s.output ?? "" },
          };
    if (s.model) meta.model_name = s.model;
    if (s.provider) meta.model_provider = s.provider;
    const span: Record<string, unknown> = {
      parent_id: parentId,
      trace_id: traceId,
      span_id: randId(),
      name: s.name,
      start_ns: startNs,
      duration: durationNs,
      status: s.status ?? "ok",
      meta,
      metrics: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        estimated_total_cost: estimatedCostMicros(s),
      },
    };
    if (i === 0) parentId = String(span.span_id);
    return span;
  });

  return {
    data: {
      type: "span",
      attributes: {
        ml_app: run.mlApp,
        tags: SAMPLE_TAGS,
        spans,
      },
    },
  };
}

async function sendRun(run: RepoRun, body: unknown): Promise<number> {
  const url = `https://api.${SITE}/api/intake/llm-obs/v1/trace/spans`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "DD-API-KEY": API_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status !== 202 && !res.ok) {
    console.error(`Datadog ingestion failed for ml_app ${run.mlApp} (HTTP ${res.status}): ${text}`);
    process.exit(1);
  }
  return res.status;
}

async function main() {
  let totalSpans = 0;
  for (let i = 0; i < RUNS.length; i++) {
    const run = RUNS[i];
    const body = buildRunBody(run, i, RUNS.length);
    const status = await sendRun(run, body);
    totalSpans += run.spans.length;
    console.log(`Sent ${run.spans.length} spans for ml_app="${run.mlApp}" (HTTP ${status})`);
  }
  console.log(
    `\nDone. Sent ${totalSpans} preview spans across ${RUNS.length} repos. ` +
      "They become searchable in ~30s. Filter them out with -source:instrumentation-preview.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
