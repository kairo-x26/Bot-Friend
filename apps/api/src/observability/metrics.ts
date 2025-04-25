import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Prometheus metrics. Labels are low-cardinality and never contain user content. */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'botfriend_' });

export const httpRequests = new Counter({
  name: 'botfriend_http_requests_total',
  help: 'HTTP requests by route and status class',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'botfriend_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const replyFirstToken = new Histogram({
  name: 'botfriend_reply_first_delta_seconds',
  help: 'Time from request to the first visible text of a reply (PRD target p95 < 4s)',
  buckets: [0.25, 0.5, 1, 2, 3, 4, 6, 10],
  registers: [registry],
});

export const replyDuration = new Histogram({
  name: 'botfriend_reply_duration_seconds',
  help: 'Full reply generation time',
  labelNames: ['outcome'] as const,
  buckets: [0.5, 1, 2, 4, 8, 15, 30],
  registers: [registry],
});

export const replies = new Counter({
  name: 'botfriend_replies_total',
  help: 'Replies by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const tokens = new Counter({
  name: 'botfriend_model_tokens_total',
  help: 'Model tokens used',
  labelNames: ['direction', 'model'] as const,
  registers: [registry],
});

export const costMicros = new Counter({
  name: 'botfriend_model_cost_micro_usd_total',
  help: 'Estimated model spend in micro-dollars',
  registers: [registry],
});
