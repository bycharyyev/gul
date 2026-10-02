// ---- Admin: performance page (GET /admin/performance). Aggregates only, no personal data. ----

export type PerfPeriod = "5m" | "1h" | "24h" | "7d";

export interface PerfBucketDto {
  t: string;
  requests: number;
  rps: number;
  avgMs: number;
  /** Estimated from a latency histogram. */
  p95Ms: number;
  errors5xx: number;
}

export interface PerformanceOverviewDto {
  generatedAt: string;
  requests: {
    period: PerfPeriod;
    bucketSeconds: number;
    totals: {
      requests: number;
      rps: number;
      avgMs: number;
      p95Ms: number;
      p99Ms: number;
      status2xx: number;
      status3xx: number;
      status4xx: number;
      status5xx: number;
      status429: number;
    };
    series: PerfBucketDto[];
  } | null;
  /** HyperLogLog estimates of distinct signed-in users. */
  users: { online5m: number; active1h: number; active24h: number } | null;
  cache: {
    days: number;
    hit: number;
    miss: number;
    ratio: number | null;
    groups: Record<string, { hit: number; miss: number; ratio: number | null }>;
  };
  nodes: Array<{
    label: string;
    role: string;
    cpuPercent: number;
    memUsedMb: number;
    memTotalMb: number;
    load1: number;
    processRssMb: number;
    uptimeS: number;
    reportedAt: string;
  }>;
  database: {
    connections: number;
    activeConnections: number;
    maxConnections: number;
    replicas: Array<{ state: string; lagSeconds: number | null }>;
  } | null;
  queues: Array<{ name: string; waiting: number | null; active: number | null; delayed: number | null; failed: number | null }>;
  stuckOrders: { paidOver10m: number; processingOver30m: number };
}
