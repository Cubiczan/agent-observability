export type QualityStatus = "pass" | "warn" | "fail" | "unknown" | (string & {});

export type LineageLink = {
  type: string;
  uri: string;
  label?: string;
};

export type RunTelemetryEvent = {
  run_id: string;
  dataset: string;
  stage: string;
  input_hash?: string;
  row_count?: number;
  quality_status?: QualityStatus;
  duration: number;
  findings_count: number;
  lineage_links: LineageLink[];
};

export type StageTelemetry = {
  input_hash?: string;
  row_count?: number;
  quality_status?: QualityStatus;
  findings_count?: number;
  lineage_links?: LineageLink[];
};

export type TelemetrySink = (event: RunTelemetryEvent) => unknown | Promise<unknown>;

export type RunTelemetryOptions = {
  dataset: string;
  run_id?: string;
  sink: TelemetrySink;
  now?: () => number;
};

export type RunTelemetry = {
  run_id: string;
  record(stage: string, details: StageTelemetry): Promise<RunTelemetryEvent>;
  withStage<T>(
    stage: string,
    operation: () => T | Promise<T>,
    details?:
      | StageTelemetry
      | ((result: T) => StageTelemetry | Promise<StageTelemetry>),
  ): Promise<T>;
};

function newRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createRunTelemetry(options: RunTelemetryOptions): RunTelemetry {
  const run_id = options.run_id ?? newRunId();
  const now = options.now ?? (() => Date.now());

  async function record(
    stage: string,
    details: StageTelemetry,
    duration = 0,
  ): Promise<RunTelemetryEvent> {
    const event: RunTelemetryEvent = {
      run_id,
      dataset: options.dataset,
      stage,
      ...details,
      duration,
      findings_count: details.findings_count ?? 0,
      lineage_links: details.lineage_links ?? [],
    };
    await options.sink(event);
    return event;
  }

  async function withStage<T>(
    stage: string,
    operation: () => T | Promise<T>,
    details: StageTelemetry | ((result: T) => StageTelemetry | Promise<StageTelemetry>) = {},
  ): Promise<T> {
    const started = now();
    try {
      const result = await operation();
      const resolved = typeof details === "function" ? await details(result) : details;
      await record(stage, resolved, Math.max(0, now() - started));
      return result;
    } catch (error) {
      await record(
        stage,
        {
          ...(typeof details === "function" ? {} : details),
          quality_status: "fail",
          findings_count:
            typeof details === "function" ? 1 : (details.findings_count ?? 1),
        },
        Math.max(0, now() - started),
      );
      throw error;
    }
  }

  return { run_id, record, withStage };
}
